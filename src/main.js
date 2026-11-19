/**
 * Car Jam Bot - Main Entry Point
 * Wires together ADB, Gemini, GameState, and BotEngine with the UI
 */

import './style.css';
import { AdbManager } from './modules/adb-manager.js';
import { GeminiClient } from './modules/gemini-client.js';
import { GameState, PlayMode } from './modules/game-state.js';
import { BotEngine, BotState } from './modules/bot-engine.js';

// ==================== Initialize Modules ====================
const adbManager = new AdbManager();
const geminiClient = new GeminiClient();
const gameState = new GameState();
const botEngine = new BotEngine(adbManager, geminiClient, gameState);

// ==================== DOM Elements ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elements = {
  // Connection
  btnConnect: $('#btn-connect'),
  connectionStatus: $('#connection-status'),
  deviceInfo: $('#device-info'),

  // API Key
  apiKeyInput: $('#api-key'),
  btnToggleKey: $('#btn-toggle-key'),

  // Game State
  currentChapter: $('#current-chapter'),
  currentLevel: $('#current-level'),
  currentLives: $('#current-lives'),
  levelInfo: $('#level-info'),

  // Play Mode
  playModeRadios: $$('input[name="play-mode"]'),
  chapterLimitInput: $('#chapter-limit-input'),
  chapterTarget: $('#chapter-target'),

  // Controls
  btnStart: $('#btn-start'),
  btnPause: $('#btn-pause'),
  btnStop: $('#btn-stop'),

  // Permission
  permissionDialog: $('#permission-dialog'),
  permissionReason: $('#permission-reason'),
  btnContinue: $('#btn-continue'),

  // Preview
  screenshot: $('#screenshot'),
  tapOverlay: $('#tap-overlay'),
  noScreenshot: $('#no-screenshot'),
  screenshotWrapper: $('#screenshot-wrapper'),

  // Stats
  statFps: $('#stat-fps'),
  statMoves: $('#stat-moves'),
  statElapsed: $('#stat-elapsed'),

  // Logs
  logContainer: $('#log-container'),
  btnClearLog: $('#btn-clear-log'),
  toggleAutoscroll: $('#toggle-autoscroll'),
};

// ==================== Logging ====================
function addLog(level, message) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  entry.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;

  elements.logContainer.appendChild(entry);

  // Auto-scroll
  if (elements.toggleAutoscroll.checked) {
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  }

  // Limit log entries
  while (elements.logContainer.children.length > 500) {
    elements.logContainer.removeChild(elements.logContainer.firstChild);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== UI Update Functions ====================
function updateConnectionUI(connected, info = null) {
  if (connected) {
    elements.btnConnect.innerHTML = '<span class="icon">🔌</span> Disconnect';
    elements.btnConnect.classList.add('connected');
    elements.connectionStatus.className = 'status-badge status-connected';
    elements.connectionStatus.textContent = 'Connected';
    if (info) {
      elements.deviceInfo.textContent = `${info.model} (Android ${info.android})`;
      elements.deviceInfo.classList.remove('hidden');
    }
    updateStartButton();
  } else {
    elements.btnConnect.innerHTML = '<span class="icon">🔌</span> Connect Phone (WebUSB)';
    elements.btnConnect.classList.remove('connected');
    elements.connectionStatus.className = 'status-badge status-disconnected';
    elements.connectionStatus.textContent = 'Disconnected';
    elements.deviceInfo.classList.add('hidden');
    elements.deviceInfo.textContent = '';
    updateStartButton();
  }
}

function updateStartButton() {
  const canStart = adbManager.isConnected && geminiClient.apiKey;
  elements.btnStart.disabled = !canStart;
}

function updateControlButtons(state) {
  switch (state) {
    case BotState.IDLE:
    case BotState.STOPPED:
      elements.btnStart.disabled = !(adbManager.isConnected && geminiClient.apiKey);
      elements.btnStart.textContent = '▶️ Start Bot';
      elements.btnPause.disabled = true;
      elements.btnPause.textContent = '⏸️ Pause';
      elements.btnStop.disabled = true;
      elements.permissionDialog.classList.add('hidden');
      break;

    case BotState.RUNNING:
      elements.btnStart.disabled = true;
      elements.btnPause.disabled = false;
      elements.btnPause.textContent = '⏸️ Pause';
      elements.btnStop.disabled = false;
      elements.permissionDialog.classList.add('hidden');
      break;

    case BotState.PAUSED:
      elements.btnStart.disabled = true;
      elements.btnPause.disabled = false;
      elements.btnPause.textContent = '▶️ Resume';
      elements.btnStop.disabled = false;
      break;

    case BotState.WAITING_PERMISSION:
      elements.btnStart.disabled = true;
      elements.btnPause.disabled = true;
      elements.btnStop.disabled = false;
      break;
  }
}

function updateGameStateUI() {
  elements.levelInfo.textContent = gameState.getLevelInfoString();
  elements.currentChapter.value = gameState.chapter;
  elements.currentLevel.value = gameState.level;
  elements.currentLives.value = gameState.lives;
  elements.statMoves.textContent = `🎯 Moves: ${gameState.totalMoves}`;
}

function showPermissionDialog(reason) {
  elements.permissionReason.textContent = reason;
  elements.permissionDialog.classList.remove('hidden');
}

// ==================== Tap Marker Drawing ====================
let tapMarkers = [];

function drawTapMarker(x, y, screenWidth, screenHeight) {
  const canvas = elements.tapOverlay;
  const img = elements.screenshot;

  if (!img.naturalWidth) return;

  // Set canvas size to match image display size
  const rect = img.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Scale coordinates from phone screen to canvas
  const scaleX = rect.width / screenWidth;
  const scaleY = rect.height / screenHeight;
  const cx = x * scaleX;
  const cy = y * scaleY;

  // Add marker
  tapMarkers.push({ x: cx, y: cy, time: Date.now() });

  // Keep only last 5 markers
  if (tapMarkers.length > 5) tapMarkers.shift();

  // Draw all markers
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  tapMarkers.forEach((marker, i) => {
    const age = Date.now() - marker.time;
    const opacity = Math.max(0.2, 1 - age / 10000);
    const isLatest = i === tapMarkers.length - 1;

    // Outer ring
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, isLatest ? 20 : 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
    ctx.lineWidth = isLatest ? 3 : 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, isLatest ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`;
    ctx.fill();

    // Crosshair for latest
    if (isLatest) {
      ctx.beginPath();
      ctx.moveTo(marker.x - 25, marker.y);
      ctx.lineTo(marker.x + 25, marker.y);
      ctx.moveTo(marker.x, marker.y - 25);
      ctx.lineTo(marker.x, marker.y + 25);
      ctx.strokeStyle = `rgba(99, 102, 241, ${opacity * 0.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

// ==================== Timer ====================
let elapsedTimer = null;

function startElapsedTimer() {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    elements.statElapsed.textContent = `⏱️ ${gameState.getElapsedTime()}`;
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

// ==================== Event Handlers ====================

// Connect/Disconnect Phone
elements.btnConnect.addEventListener('click', async () => {
  if (adbManager.isConnected) {
    await adbManager.disconnect();
    return;
  }

  try {
    elements.btnConnect.disabled = true;
    elements.btnConnect.textContent = '⏳ Connecting...';
    addLog('info', '🔌 Requesting USB device...');

    const info = await adbManager.connect();
    addLog('success', `✅ Connected to ${info.model} (Android ${info.android})`);
  } catch (error) {
    addLog('error', `❌ Connection failed: ${error.message}`);
    updateConnectionUI(false);
  } finally {
    elements.btnConnect.disabled = false;
  }
});

// ADB Events
adbManager.addEventListener('connected', (e) => {
  updateConnectionUI(true, e.detail);
});

adbManager.addEventListener('disconnected', () => {
  updateConnectionUI(false);
  if (botEngine.state === BotState.RUNNING) {
    botEngine.stop();
  }
});

// API Key
elements.apiKeyInput.addEventListener('input', () => {
  geminiClient.setApiKey(elements.apiKeyInput.value);
  updateStartButton();
});

elements.btnToggleKey.addEventListener('click', () => {
  const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
  elements.apiKeyInput.type = type;
  elements.btnToggleKey.textContent = type === 'password' ? '👁️' : '🔒';
});

// Game State Inputs
elements.currentChapter.addEventListener('change', () => {
  gameState.chapter = parseInt(elements.currentChapter.value) || 1;
  updateGameStateUI();
});

elements.currentLevel.addEventListener('change', () => {
  gameState.level = parseInt(elements.currentLevel.value) || 1;
  updateGameStateUI();
});

elements.currentLives.addEventListener('change', () => {
  gameState.lives = parseInt(elements.currentLives.value) || 0;
  updateGameStateUI();
});

// Play Mode Selection
elements.playModeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    const mode = document.querySelector('input[name="play-mode"]:checked').value;
    gameState.playMode = mode;

    if (mode === 'chapter-limit') {
      elements.chapterLimitInput.classList.remove('hidden');
    } else {
      elements.chapterLimitInput.classList.add('hidden');
    }
  });
});

elements.chapterTarget.addEventListener('change', () => {
  gameState.chapterTarget = parseInt(elements.chapterTarget.value) || 3;
});

// Control Buttons
elements.btnStart.addEventListener('click', async () => {
  try {
    // Sync game state from inputs
    gameState.chapter = parseInt(elements.currentChapter.value) || 1;
    gameState.level = parseInt(elements.currentLevel.value) || 1;
    gameState.lives = parseInt(elements.currentLives.value) || 3;

    // Set play mode
    const mode = document.querySelector('input[name="play-mode"]:checked').value;
    gameState.playMode = mode;
    if (mode === 'chapter-limit') {
      gameState.chapterTarget = parseInt(elements.chapterTarget.value) || 3;
    }

    await botEngine.start();
    startElapsedTimer();
  } catch (error) {
    addLog('error', `❌ Failed to start: ${error.message}`);
  }
});

elements.btnPause.addEventListener('click', () => {
  if (botEngine.state === BotState.RUNNING) {
    botEngine.pause();
  } else if (botEngine.state === BotState.PAUSED) {
    botEngine.resume();
  }
});

elements.btnStop.addEventListener('click', () => {
  botEngine.stop();
  stopElapsedTimer();
});

elements.btnContinue.addEventListener('click', () => {
  botEngine.resume();
});

// Clear Log
elements.btnClearLog.addEventListener('click', () => {
  elements.logContainer.innerHTML = '';
  addLog('info', '🗑️ Log cleared.');
});

// ==================== Bot Engine Events ====================
botEngine.addEventListener('state-change', (e) => {
  updateControlButtons(e.detail.newState);
  addLog('info', `🔄 Bot state: ${e.detail.newState}`);

  if (e.detail.newState === BotState.IDLE || e.detail.newState === BotState.STOPPED) {
    stopElapsedTimer();
  }
});

botEngine.addEventListener('screenshot', (e) => {
  elements.screenshot.src = e.detail.dataUrl;
  elements.noScreenshot.classList.add('hidden');
  elements.screenshot.classList.remove('hidden');
  elements.statFps.textContent = `📸 ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
});

botEngine.addEventListener('tap', (e) => {
  drawTapMarker(
    e.detail.x,
    e.detail.y,
    botEngine._screenSize?.width || 1080,
    botEngine._screenSize?.height || 2400
  );
});

botEngine.addEventListener('log', (e) => {
  addLog(e.detail.level, e.detail.message);
});

botEngine.addEventListener('permission-needed', (e) => {
  showPermissionDialog(e.detail.reason);
});

// Game State Events
gameState.addEventListener('change', () => {
  updateGameStateUI();
});

gameState.addEventListener('chapter-complete', (e) => {
  addLog('success', `🏆 Chapter ${e.detail.chapter} Complete! Starting Chapter ${e.detail.newChapter}`);
});

gameState.addEventListener('life-lost', (e) => {
  addLog('error', `💔 Life lost! Lives remaining: ${e.detail.lives}`);
});

// ==================== Initialization ====================
function init() {
  // Load saved API key
  const savedKey = geminiClient.loadSavedKey();
  if (savedKey) {
    elements.apiKeyInput.value = savedKey;
    addLog('info', '🔑 Loaded saved API key from localStorage');
  }

  // Load saved game state
  if (gameState.load()) {
    addLog('info', `📊 Loaded saved game state: ${gameState.getLevelInfoString()}`);
  }

  updateGameStateUI();
  updateConnectionUI(false);
  updateControlButtons(BotState.IDLE);

  // Check WebUSB support
  if (!navigator.usb) {
    addLog('error', '⚠️ WebUSB is not supported in this browser. Please use Chrome or Edge.');
    elements.btnConnect.disabled = true;
  } else {
    addLog('info', '✅ WebUSB supported. Ready to connect your phone!');
  }

  addLog('info', '📱 Steps: 1) Enable USB Debugging on phone → 2) Connect via USB → 3) Click "Connect Phone" → 4) Enter Gemini API Key → 5) Start Bot');
}

init();
