/**
 * lyrics/LyricsSync.js
 *
 * High-performance lyric synchronization engine for the Auralis Music Player.
 *
 * Design goals:
 *   - O(log n) active-line lookup via binary search — no linear scans
 *   - Driven by requestAnimationFrame for smooth, GPU-friendly updates
 *   - Emits only when the active line actually changes — zero redundant callbacks
 *   - Single active loop enforced via boolean guard — no duplicate rAF chains
 *   - Seek-aware: synchronous snap on AudioElement 'seeked' event
 *   - Respects plain / instrumental lyrics: skips loop if no timed lines exist
 *   - Clean lifecycle: start / stop / seek / destroy
 *
 * Integration:
 *   LyricsEngine creates exactly one LyricsSync instance per song and calls:
 *     sync.start(audioEl, parsedLyrics, onLineChange)
 *     sync.stop()
 *     sync.seek(seconds)    // called from 'seeked' listener
 *
 * onLineChange callback signature:
 *   ({
 *     activeIndex: number,
 *     activeLine:  LyricLine | null,
 *     nextLine:    LyricLine | null,
 *   }) => void
 */

import { audioLogger } from '../audio/AudioLogger';
import { LyricsEvent }  from './LyricsEvents';

// ─── LyricsSync class ─────────────────────────────────────────────────────────

class LyricsSync {
  constructor() {
    /** @type {HTMLAudioElement|null} */
    this._audio = null;

    /** @type {import('./LyricsEngine').LyricLine[]} */
    this._lines = [];

    /** @type {((result: SyncResult) => void)|null} */
    this._onLineChange = null;

    /** @type {number} Current confirmed active line index (-1 = before first line) */
    this._activeIndex = -1;

    /** @type {number|null} rAF handle */
    this._rafHandle = null;

    /** @type {boolean} Guard: true while the rAF loop is running */
    this._running = false;

    // Bind to preserve identity for removal
    this._tick = this._tick.bind(this);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the synchronization loop.
   *
   * Safe to call multiple times — a guard prevents duplicate loops.
   *
   * @param {HTMLAudioElement}                   audio         - Live primary audio element
   * @param {import('./LyricsEngine').ParsedLyrics} parsedLyrics - Output of lyricsParser
   * @param {(result: SyncResult) => void}       onLineChange  - Callback on line change
   */
  start(audio, parsedLyrics, onLineChange) {
    if (this._running) {
      audioLogger.log(LyricsEvent.SYNC_DUPLICATE_GUARD, 'LyricsSync.start() called while already running — ignored');
      return;
    }

    // Plain / instrumental lyrics have no timed lines — don't loop
    if (!parsedLyrics || parsedLyrics.type !== 'synchronized' || !parsedLyrics.lines?.length) {
      audioLogger.log(LyricsEvent.SYNC_STARTED, `No timed lines — sync loop not started (type: ${parsedLyrics?.type})`);
      return;
    }

    this._audio        = audio;
    this._lines        = parsedLyrics.lines;
    this._onLineChange = onLineChange;
    this._activeIndex  = -1;
    this._running      = true;

    audioLogger.info(LyricsEvent.SYNC_STARTED, `Sync loop started — ${this._lines.length} lines`);

    // Immediately emit the correct line for current playhead position
    // (handles case where user seeks before start)
    this._emitForTime(audio.currentTime, false);

    this._rafHandle = requestAnimationFrame(this._tick);
  }

  /**
   * Stop the synchronization loop.
   * Safe to call even if the loop is not running.
   */
  stop() {
    if (!this._running) return;

    this._running = false;

    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }

    audioLogger.info(LyricsEvent.SYNC_STOPPED, 'Sync loop stopped');
  }

  /**
   * Immediately snap to the correct lyric line for a new playhead position.
   * Called synchronously from the 'seeked' audio event.
   *
   * @param {number} timeSec - New playhead position in seconds
   */
  seek(timeSec) {
    if (!this._lines.length) return;

    const prev = this._activeIndex;
    this._emitForTime(timeSec, true);

    if (this._activeIndex !== prev) {
      audioLogger.log(LyricsEvent.SYNC_SEEKED, `Seek → line ${this._activeIndex} at ${timeSec.toFixed(2)}s`);
    }
  }

  /**
   * Reset internal state without stopping the loop.
   * Useful when lyrics are updated mid-playback.
   *
   * @param {import('./LyricsEngine').ParsedLyrics} parsedLyrics
   */
  updateLyrics(parsedLyrics) {
    this._lines       = parsedLyrics?.lines ?? [];
    this._activeIndex = -1;
    if (this._audio) {
      this._emitForTime(this._audio.currentTime, false);
    }
  }

  /**
   * Full teardown — call once the engine is destroyed.
   */
  destroy() {
    this.stop();
    this._audio        = null;
    this._lines        = [];
    this._onLineChange = null;
    this._activeIndex  = -1;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — rAF loop
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main rAF tick. Called ~60fps by the browser.
   * @private
   */
  _tick() {
    if (!this._running) return;

    // Guard against detached audio elements or paused state
    if (this._audio && !this._audio.paused && !this._audio.ended) {
      this._emitForTime(this._audio.currentTime, false);
    }

    // Continue loop
    this._rafHandle = requestAnimationFrame(this._tick);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — lookup and emit
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute the active line for the given time and emit the change callback
   * only if the line index has changed.
   *
   * @private
   * @param {number}  timeSec    - Current playhead in seconds
   * @param {boolean} forcEmit   - Emit even if index hasn't changed (e.g. on seek)
   */
  _emitForTime(timeSec, forcEmit) {
    const newIndex = this._findActiveLine(timeSec, this._lines);

    if (newIndex === this._activeIndex && !forcEmit) return;

    this._activeIndex = newIndex;

    if (this._onLineChange) {
      const activeLine = newIndex >= 0 ? this._lines[newIndex] : null;
      const nextLine   = (newIndex + 1 < this._lines.length) ? this._lines[newIndex + 1] : null;

      this._onLineChange({
        activeIndex: newIndex,
        activeLine,
        nextLine,
      });
    }
  }

  /**
   * Binary search: find the index of the last line whose .time ≤ timeSec.
   * Returns -1 if playhead is before the first line.
   *
   * Time complexity: O(log n)
   *
   * @private
   * @param {number}                               timeSec
   * @param {import('./LyricsEngine').LyricLine[]} lines   - Must be sorted ascending by .time
   * @returns {number}
   */
  _findActiveLine(timeSec, lines) {
    if (!lines.length) return -1;

    let lo     = 0;
    let hi     = lines.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1; // unsigned right-shift = Math.floor(avg)
      if (lines[mid].time <= timeSec) {
        result = mid;
        lo     = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return result;
  }
}

/**
 * @typedef {Object} SyncResult
 * @property {number}   activeIndex - Index into parsedLyrics.lines (-1 = before start)
 * @property {import('./LyricsEngine').LyricLine|null} activeLine
 * @property {import('./LyricsEngine').LyricLine|null} nextLine
 */

// ─── Singleton export ──────────────────────────────────────────────────────────
// LyricsEngine creates one instance per song and reuses it.
// Export the class (not an instance) so the engine controls lifecycle.
export { LyricsSync };
