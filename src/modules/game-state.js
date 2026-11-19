/**
 * Game state tracker for Car Jam Bot
 * Manages chapter/level progression, lives, and play mode pausing
 */

export const PlayMode = {
  NONSTOP: 'nonstop',
  CHAPTER_LIMIT: 'chapter-limit',
  SAFE: 'safe',
};

export class GameState extends EventTarget {
  constructor() {
    super();
    this._chapter = 1;
    this._level = 1;
    this._lives = 3;
    this._totalMoves = 0;
    this._levelsCompletedThisSession = 0;
    this._chaptersCompletedThisSession = 0;
    this._levelsSinceLastPause = 0;
    this._chaptersSinceLastPause = 0;
    this._playMode = PlayMode.NONSTOP;
    this._chapterTarget = 3;
    this._startTime = null;
    this._previousMoves = []; // Store last N moves for AI context
    this._lastMoveFailed = false;
  }

  // Getters
  get chapter() { return this._chapter; }
  get level() { return this._level; }
  get lives() { return this._lives; }
  get totalMoves() { return this._totalMoves; }
  get playMode() { return this._playMode; }
  get chapterTarget() { return this._chapterTarget; }
  get previousMoves() { return this._previousMoves; }
  get lastMoveFailed() { return this._lastMoveFailed; }
  get startTime() { return this._startTime; }
  get levelsCompletedThisSession() { return this._levelsCompletedThisSession; }
  get chaptersCompletedThisSession() { return this._chaptersCompletedThisSession; }

  // Setters
  set chapter(val) { this._chapter = Math.max(1, val); this._emitChange(); }
  set level(val) { this._level = Math.max(1, val); this._emitChange(); }
  set lives(val) { this._lives = Math.max(0, Math.min(5, val)); this._emitChange(); }
  set playMode(val) { this._playMode = val; }
  set chapterTarget(val) { this._chapterTarget = Math.max(1, val); }
  set lastMoveFailed(val) { this._lastMoveFailed = val; }

  /**
   * Calculate number of levels in a given chapter
   * Chapter 1 = 15, Chapter 2 = 20, Chapter 3 = 25, etc.
   */
  levelsInChapter(chapter) {
    return 15 + (chapter - 1) * 5;
  }

  /**
   * Get current level info string
   */
  getLevelInfoString() {
    const total = this.levelsInChapter(this._chapter);
    return `Chapter ${this._chapter}: Level ${this._level}/${total}`;
  }

  /**
   * Record a move
   */
  recordMove(x, y, reasoning = '') {
    this._totalMoves++;
    this._previousMoves.push({ x, y, reasoning, timestamp: Date.now() });
    // Keep only last 10 moves
    if (this._previousMoves.length > 10) {
      this._previousMoves.shift();
    }
    this._emitChange();
  }

  /**
   * Increment level (called when level is completed)
   * Returns true if chapter boundary was crossed
   */
  incrementLevel() {
    this._levelsCompletedThisSession++;
    this._levelsSinceLastPause++;
    const maxLevels = this.levelsInChapter(this._chapter);
    
    if (this._level >= maxLevels) {
      // Chapter complete!
      this._chaptersCompletedThisSession++;
      this._chaptersSinceLastPause++;
      this._chapter++;
      this._level = 1;
      this._emitChange();
      this.dispatchEvent(new CustomEvent('chapter-complete', {
        detail: { chapter: this._chapter - 1, newChapter: this._chapter }
      }));
      return true;
    } else {
      this._level++;
      this._emitChange();
      this.dispatchEvent(new CustomEvent('level-complete', {
        detail: { chapter: this._chapter, level: this._level - 1 }
      }));
      return false;
    }
  }

  /**
   * Decrement lives (called when level fails)
   * Returns true if lives hit 0
   */
  decrementLives() {
    this._lives = Math.max(0, this._lives - 1);
    this._lastMoveFailed = true;
    this._emitChange();
    this.dispatchEvent(new CustomEvent('life-lost', {
      detail: { lives: this._lives }
    }));
    return this._lives === 0;
  }

  /**
   * Check if the bot should pause based on the current play mode
   * Returns { shouldPause: boolean, reason: string }
   */
  shouldPause() {
    switch (this._playMode) {
      case PlayMode.NONSTOP:
        if (this._lives <= 0) {
          return { shouldPause: true, reason: 'No lives remaining! Wait for lives to regenerate.' };
        }
        return { shouldPause: false, reason: '' };

      case PlayMode.CHAPTER_LIMIT:
        if (this._lives <= 0) {
          return { shouldPause: true, reason: 'No lives remaining!' };
        }
        if (this._chaptersCompletedThisSession >= this._chapterTarget) {
          return {
            shouldPause: true,
            reason: `Completed ${this._chapterTarget} chapter(s) as requested. Click Continue to keep playing.`
          };
        }
        return { shouldPause: false, reason: '' };

      case PlayMode.SAFE:
        if (this._lives <= 0) {
          return { shouldPause: true, reason: 'No lives remaining!' };
        }
        // Pause after completing 1 full chapter
        if (this._chaptersSinceLastPause >= 1) {
          return {
            shouldPause: true,
            reason: `Completed 1 full chapter (Chapter ${this._chapter - 1})! Permission to proceed to Chapter ${this._chapter}?`
          };
        }
        // Pause every 5 levels
        if (this._levelsSinceLastPause >= 5) {
          return {
            shouldPause: true,
            reason: `Completed 5 levels. Permission to continue playing?`
          };
        }
        return { shouldPause: false, reason: '' };

      default:
        return { shouldPause: false, reason: '' };
    }
  }

  /**
   * Reset pause counter (called when user grants permission to continue)
   */
  resetPauseCounter() {
    this._levelsSinceLastPause = 0;
    this._chaptersSinceLastPause = 0;
    if (this._playMode === PlayMode.CHAPTER_LIMIT) {
      this._chaptersCompletedThisSession = 0;
    }
  }

  /**
   * Start a new session
   */
  startSession() {
    this._startTime = Date.now();
    this._levelsCompletedThisSession = 0;
    this._chaptersCompletedThisSession = 0;
    this._levelsSinceLastPause = 0;
    this._chaptersSinceLastPause = 0;
    this._totalMoves = 0;
    this._previousMoves = [];
    this._lastMoveFailed = false;
  }

  /**
   * Get elapsed time string
   */
  getElapsedTime() {
    if (!this._startTime) return '00:00:00';
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
    const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Save state to localStorage
   */
  save() {
    localStorage.setItem('carjam_state', JSON.stringify({
      chapter: this._chapter,
      level: this._level,
      lives: this._lives,
    }));
  }

  /**
   * Load state from localStorage
   */
  load() {
    const saved = localStorage.getItem('carjam_state');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this._chapter = data.chapter || 1;
        this._level = data.level || 1;
        this._lives = data.lives !== undefined ? data.lives : 3;
        this._emitChange();
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('change', {
      detail: {
        chapter: this._chapter,
        level: this._level,
        lives: this._lives,
        totalMoves: this._totalMoves,
      }
    }));
  }
}
