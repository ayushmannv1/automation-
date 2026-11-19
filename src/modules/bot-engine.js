/**
 * Bot Engine - Main automation loop
 * Coordinates ADB, Gemini Vision, and Game State
 */

import { PromptBuilder } from './prompt-builder.js';

const GAME_PACKAGE = 'car.jam.traffic.puzzle.match.parking.escape';
const LOOP_DELAY_MS = 1500;      // Delay between bot iterations
const SCREENSHOT_DELAY_MS = 500; // Delay after a tap before taking next screenshot
const AD_WAIT_MAX_MS = 35000;    // Max wait for ad countdown
const AD_CHECK_INTERVAL_MS = 2000; // Check ad state every 2s

export const BotState = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  WAITING_PERMISSION: 'waiting_permission',
  STOPPED: 'stopped',
};

export class BotEngine extends EventTarget {
  /**
   * @param {import('./adb-manager.js').AdbManager} adbManager
   * @param {import('./gemini-client.js').GeminiClient} geminiClient
   * @param {import('./game-state.js').GameState} gameState
   */
  constructor(adbManager, geminiClient, gameState) {
    super();
    this._adb = adbManager;
    this._gemini = geminiClient;
    this._gameState = gameState;
    this._promptBuilder = new PromptBuilder();
    this._state = BotState.IDLE;
    this._abortController = null;
    this._previousScreenshots = []; // Keep last 2 screenshots as base64
    this._screenSize = { width: 1080, height: 2400 };
    this._consecutiveErrors = 0;
    this._maxConsecutiveErrors = 5;
  }

  get state() { return this._state; }

  _setState(newState) {
    const oldState = this._state;
    this._state = newState;
    this.dispatchEvent(new CustomEvent('state-change', {
      detail: { oldState, newState }
    }));
  }

  _log(level, message) {
    this.dispatchEvent(new CustomEvent('log', {
      detail: { level, message, timestamp: new Date() }
    }));
  }

  async start() {
    if (this._state === BotState.RUNNING) return;
    if (!this._adb.isConnected) {
      throw new Error('Phone not connected');
    }
    if (!this._gemini.apiKey) {
      throw new Error('Gemini API key not set');
    }

    this._abortController = new AbortController();
    this._setState(BotState.RUNNING);
    this._gameState.startSession();
    this._previousScreenshots = [];
    this._consecutiveErrors = 0;

    // Get screen size for coordinate mapping
    try {
      this._screenSize = await this._adb.getScreenSize();
      this._log('info', `Screen size: ${this._screenSize.width}x${this._screenSize.height}`);
    } catch (e) {
      this._log('warning', `Could not get screen size, using default 1080x2400`);
    }

    this._log('success', '🚀 Bot started! Beginning automation loop...');

    // Start the main loop
    this._runLoop();
  }

  pause() {
    if (this._state === BotState.RUNNING) {
      this._setState(BotState.PAUSED);
      this._log('warning', '⏸️ Bot paused by user');
    }
  }

  resume() {
    if (this._state === BotState.PAUSED || this._state === BotState.WAITING_PERMISSION) {
      this._gameState.resetPauseCounter();
      this._setState(BotState.RUNNING);
      this._log('success', '▶️ Bot resumed');
      this._runLoop();
    }
  }

  stop() {
    this._abortController?.abort();
    this._setState(BotState.STOPPED);
    this._log('error', '🛑 Bot stopped by user');
    // Reset to idle after a moment
    setTimeout(() => this._setState(BotState.IDLE), 1000);
  }

  async _runLoop() {
    while (this._state === BotState.RUNNING) {
      try {
        // Check abort
        if (this._abortController?.signal.aborted) break;

        // 1. Take screenshot
        this._log('info', '📸 Taking screenshot...');
        const screenshotData = await this._adb.takeScreenshot();
        const base64 = this._adb.screenshotToBase64(screenshotData);
        const dataUrl = `data:image/png;base64,${base64}`;

        // Emit screenshot for UI preview
        this.dispatchEvent(new CustomEvent('screenshot', {
          detail: { dataUrl, base64 }
        }));

        // Store for history (keep last 2)
        this._previousScreenshots.push(base64);
        if (this._previousScreenshots.length > 2) {
          this._previousScreenshots.shift();
        }

        // 2. Send to Gemini for analysis
        this._log('ai', '🧠 Analyzing with Gemini Vision...');
        const prompt = this._promptBuilder.buildGameAnalysisPrompt({
          chapter: this._gameState.chapter,
          level: this._gameState.level,
          lives: this._gameState.lives,
          previousMoves: this._gameState.previousMoves,
          lastMoveFailed: this._gameState.lastMoveFailed,
        });

        const analysis = await this._gemini.analyzeScreenshots(
          prompt,
          this._previousScreenshots // Send last 2 screenshots
        );

        this._log('ai', `🎯 Screen: ${analysis.screenType} | Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
        this._log('ai', `💭 ${analysis.reasoning}`);

        // Reset error counter on success
        this._consecutiveErrors = 0;

        // 3. Handle different screen types
        await this._handleAnalysis(analysis);

        // 4. Check if should pause (play mode rules)
        const pauseCheck = this._gameState.shouldPause();
        if (pauseCheck.shouldPause) {
          this._setState(BotState.WAITING_PERMISSION);
          this._log('warning', `⏸️ ${pauseCheck.reason}`);
          this.dispatchEvent(new CustomEvent('permission-needed', {
            detail: { reason: pauseCheck.reason }
          }));
          return; // Exit loop, will be resumed by user
        }

        // 5. Delay before next iteration
        await this._delay(LOOP_DELAY_MS);

      } catch (error) {
        this._consecutiveErrors++;
        this._log('error', `❌ Error: ${error.message}`);

        if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
          this._log('error', `💀 Too many consecutive errors (${this._maxConsecutiveErrors}). Stopping.`);
          this.stop();
          return;
        }

        // Wait before retrying
        await this._delay(3000);
      }
    }
  }

  async _handleAnalysis(analysis) {
    switch (analysis.screenType) {
      case 'gameplay':
        await this._handleGameplay(analysis);
        break;

      case 'level_complete':
        await this._handleLevelComplete(analysis);
        break;

      case 'level_failed':
        await this._handleLevelFailed(analysis);
        break;

      case 'ad':
        await this._handleAd(analysis);
        break;

      case 'menu':
        await this._handleMenu(analysis);
        break;

      case 'other':
        await this._handleOther(analysis);
        break;

      default:
        this._log('warning', `Unknown screen type: ${analysis.screenType}`);
        // Try tapping if action is suggested
        if (analysis.action === 'tap' && analysis.tapX && analysis.tapY) {
          await this._executeTap(analysis.tapX, analysis.tapY, 'Unknown screen - following AI suggestion');
        }
    }
  }

  async _handleGameplay(analysis) {
    if (analysis.action === 'tap' && analysis.tapX != null && analysis.tapY != null) {
      this._gameState.lastMoveFailed = false;
      await this._executeTap(analysis.tapX, analysis.tapY, analysis.reasoning);
      await this._delay(SCREENSHOT_DELAY_MS);
    } else if (analysis.action === 'wait') {
      this._log('info', '⏳ Waiting (no valid move detected)...');
      await this._delay(2000);
    } else {
      this._log('warning', '❓ No action suggested for gameplay screen');
    }
  }

  async _handleLevelComplete(analysis) {
    this._log('success', '🎉 Level Complete!');
    const chapterChanged = this._gameState.incrementLevel();
    if (chapterChanged) {
      this._log('success', `🏆 Chapter Complete! Now on Chapter ${this._gameState.chapter}`);
    }
    this._gameState.save();

    // Tap "Next" button if coordinates provided
    if (analysis.tapX != null && analysis.tapY != null) {
      await this._delay(1500);
      await this._executeTap(analysis.tapX, analysis.tapY, 'Tapping Next/Continue');
    } else {
      // Try to tap center-bottom area where "Next" usually is
      const nx = Math.round(this._screenSize.width / 2);
      const ny = Math.round(this._screenSize.height * 0.75);
      await this._delay(1500);
      await this._executeTap(nx, ny, 'Tapping estimated Next button location');
    }
    await this._delay(2000);
  }

  async _handleLevelFailed(analysis) {
    this._log('error', '💔 Level Failed!');
    const outOfLives = this._gameState.decrementLives();
    this._gameState.save();

    if (outOfLives) {
      this._log('error', '💀 No lives remaining! Pausing...');
      this._setState(BotState.WAITING_PERMISSION);
      this.dispatchEvent(new CustomEvent('permission-needed', {
        detail: { reason: 'No lives remaining! Wait for lives to regenerate, then click Continue.' }
      }));
      return;
    }

    // Tap retry button
    if (analysis.tapX != null && analysis.tapY != null) {
      await this._delay(1500);
      await this._executeTap(analysis.tapX, analysis.tapY, 'Tapping Retry');
    } else {
      // Try center area for retry
      const rx = Math.round(this._screenSize.width / 2);
      const ry = Math.round(this._screenSize.height * 0.65);
      await this._delay(1500);
      await this._executeTap(rx, ry, 'Tapping estimated Retry button');
    }
    await this._delay(2000);
  }

  async _handleAd(analysis) {
    this._log('warning', '📺 Ad detected!');

    if (analysis.adInfo?.hasCountdown) {
      const waitSecs = Math.min(analysis.adInfo.countdownSeconds || 5, AD_WAIT_MAX_MS / 1000);
      this._log('info', `⏳ Waiting ${waitSecs}s for ad countdown...`);
      await this._delay(waitSecs * 1000 + 1000); // Wait + 1s buffer

      // Take new screenshot to find close button
      const ssData = await this._adb.takeScreenshot();
      const b64 = this._adb.screenshotToBase64(ssData);
      const adPrompt = this._promptBuilder.buildAdDetectionPrompt();
      const adAnalysis = await this._gemini.analyzeScreenshots(adPrompt, [b64]);

      if (adAnalysis.action === 'tap' && adAnalysis.tapX && adAnalysis.tapY) {
        await this._executeTap(adAnalysis.tapX, adAnalysis.tapY, 'Closing ad');
      } else if (adAnalysis.action === 'back' || adAnalysis.isPlayStore) {
        this._log('info', '📱 Play Store detected, pressing Back...');
        await this._adb.back();
        await this._delay(1000);
        await this._adb.back();
      }
    } else if (analysis.adInfo?.skipButtonLocation) {
      await this._executeTap(
        analysis.adInfo.skipButtonLocation.x,
        analysis.adInfo.skipButtonLocation.y,
        'Tapping Skip on ad'
      );
    } else if (analysis.adInfo?.closeButtonLocation) {
      await this._executeTap(
        analysis.adInfo.closeButtonLocation.x,
        analysis.adInfo.closeButtonLocation.y,
        'Tapping Close on ad'
      );
    } else if (analysis.action === 'back') {
      this._log('info', '📱 Pressing Back to close ad/Play Store...');
      await this._adb.back();
      await this._delay(1000);
    } else if (analysis.action === 'tap' && analysis.tapX && analysis.tapY) {
      await this._executeTap(analysis.tapX, analysis.tapY, 'Closing ad');
    } else {
      // Fallback: try pressing back
      this._log('info', '📱 No close button found, trying Back...');
      await this._adb.back();
    }

    await this._delay(2000);

    // Verify we're back in the game
    const checkSs = await this._adb.takeScreenshot();
    const checkB64 = this._adb.screenshotToBase64(checkSs);
    const checkPrompt = this._promptBuilder.buildAdDetectionPrompt();
    const checkResult = await this._gemini.analyzeScreenshots(checkPrompt, [checkB64]);

    if (checkResult.isAd || checkResult.isPlayStore) {
      this._log('warning', '⚠️ Still on ad/store, trying back + relaunch...');
      await this._adb.back();
      await this._delay(1000);
      await this._adb.launchGame();
      await this._delay(3000);
    }
  }

  async _handleMenu(analysis) {
    this._log('info', '📋 Menu screen detected');
    if (analysis.action === 'tap' && analysis.tapX && analysis.tapY) {
      await this._executeTap(analysis.tapX, analysis.tapY, 'Navigating menu');
    } else {
      // Try to find and tap Play button
      const px = Math.round(this._screenSize.width / 2);
      const py = Math.round(this._screenSize.height * 0.8);
      await this._executeTap(px, py, 'Tapping estimated Play button');
    }
    await this._delay(2000);
  }

  async _handleOther(analysis) {
    this._log('info', '❓ Unknown screen - attempting to dismiss');
    if (analysis.action === 'tap' && analysis.tapX && analysis.tapY) {
      await this._executeTap(analysis.tapX, analysis.tapY, analysis.reasoning);
    } else if (analysis.action === 'back') {
      await this._adb.back();
    } else {
      // Try tapping center to dismiss popups
      const cx = Math.round(this._screenSize.width / 2);
      const cy = Math.round(this._screenSize.height / 2);
      await this._executeTap(cx, cy, 'Tapping center to dismiss');
    }
    await this._delay(1500);
  }

  async _executeTap(x, y, reasoning) {
    let tapX = Number(x);
    let tapY = Number(y);

    // If model outputs normalized (0.0 to 1.0) coordinates
    if (tapX > 0 && tapX <= 1.0 && tapY > 0 && tapY <= 1.0) {
      tapX = Math.round(tapX * this._screenSize.width);
      tapY = Math.round(tapY * this._screenSize.height);
    } else {
      tapX = Math.round(tapX);
      tapY = Math.round(tapY);
    }

    this._log('info', `👆 Tapping (${tapX}, ${tapY}): ${reasoning}`);
    await this._adb.tap(tapX, tapY);
    this._gameState.recordMove(tapX, tapY, reasoning);
    this.dispatchEvent(new CustomEvent('tap', {
      detail: { x: tapX, y: tapY, reasoning }
    }));
  }

  _delay(ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      this._abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      }, { once: true });
    });
  }
}
