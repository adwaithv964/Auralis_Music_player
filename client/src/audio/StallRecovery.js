/**
 * audio/StallRecovery.js
 *
 * Three-level network stall recovery coordinator for the Auralis playback engine.
 *
 * This module augments (but does NOT replace) the basic stall timer already
 * present in AudioEngine._onStalled(). AudioEngine registers a "stallRecovery
 * delegate" so that when a stall is detected, this coordinator takes over with
 * a structured, progressive escalation strategy.
 *
 * ─── Recovery levels ──────────────────────────────────────────────────────────
 *
 *  Level 1 — Lightweight (0–2 s stall):
 *    Try audio.play() immediately. Browser often self-corrects minor
 *    network hiccups this way. Succeeds silently if 'playing' fires within 3 s.
 *
 *  Level 2 — Source reload (3–6 s stall):
 *    Save currentTime → audio.load() → wait for canplay → seek → play.
 *    Handles cases where the HTTP connection was dropped mid-stream.
 *
 *  Level 3 — Fresh stream resolution (6+ s stall):
 *    Invalidate cached stream URL → resolve a new one via StreamResolver →
 *    load new URL → seek → play. Handles expired CDN links.
 *
 * ─── Limits ──────────────────────────────────────────────────────────────────
 *   - MAX_RECOVERY_ATTEMPTS per song: default 3
 *   - Reset on successful new song load
 *   - All attempts logged via audioLogger
 *
 * Usage (called internally by PlaybackEngine):
 *   import { stallRecovery } from './StallRecovery';
 *   stallRecovery.attach(audioEngine, streamResolver, getCurrentSong);
 *   stallRecovery.onStall();   // called by AudioEngine._onStalled delegate
 *   stallRecovery.reset();     // call on new song load
 */

import { audioLogger }   from './AudioLogger';
import { AudioEvent }    from './AudioEvents';
import { PlaybackEvent } from './PlaybackEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** How long to observe a stall before escalating to Level 1. */
const LEVEL1_DELAY_MS = 2_000;

/** How long Level 1 has to resolve before escalating to Level 2. */
const LEVEL1_TIMEOUT_MS = 3_000;

/** How long Level 2 has to resolve before escalating to Level 3. */
const LEVEL2_TIMEOUT_MS = 6_000;

/** Maximum number of recovery attempts per song before giving up. */
const MAX_RECOVERY_ATTEMPTS = 3;

// ─── StallRecovery class ──────────────────────────────────────────────────────

class StallRecovery {
  constructor() {
    /** @type {import('./AudioEngine').AudioEngine|null} */
    this._engine = null;

    /** @type {import('./StreamResolver').StreamResolver|null} */
    this._resolver = null;

    /** @type {Function|null} Returns the currently playing song object */
    this._getCurrentSong = null;

    /** Number of recovery attempts for the current song */
    this._attempts = 0;

    /** Whether a recovery sequence is currently active */
    this._active = false;

    /** Timer handles */
    this._timer1 = null;
    this._timer2 = null;
    this._timer3 = null;

    audioLogger.log('stall-recovery', 'StallRecovery initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach the recovery system to the live engine and resolver instances.
   * Called once by PlaybackEngine after both singletons are available.
   *
   * @param {Object}   engine           - audioEngine singleton
   * @param {Object}   resolver         - streamResolver singleton
   * @param {Function} getCurrentSong   - () => song | null
   */
  attach(engine, resolver, getCurrentSong) {
    this._engine         = engine;
    this._resolver       = resolver;
    this._getCurrentSong = getCurrentSong;
    audioLogger.log('stall-recovery', 'Attached to AudioEngine + StreamResolver');
  }

  /**
   * Reset recovery counters when a new song successfully begins.
   * Must be called by PlaybackEngine on every successful SONG_STARTED event.
   */
  reset() {
    this._attempts = 0;
    this._active   = false;
    this._clearTimers();
  }

  /**
   * Abort any active recovery and clear timers.
   * Called when the user manually changes track mid-recovery.
   */
  abort() {
    if (this._active) {
      audioLogger.log('stall-recovery', 'Recovery aborted (user action)');
    }
    this._active = false;
    this._clearTimers();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Entry point — called when a stall is detected
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Begin the recovery sequence.
   *
   * Should be called by AudioEngine._onStalled() when a stall is detected
   * and the user has not manually paused.
   */
  onStall() {
    if (!this._engine) {
      audioLogger.warn('stall-recovery', 'onStall() called before attach()');
      return;
    }

    // Don't stack recovery sequences
    if (this._active) {
      audioLogger.log('stall-recovery', 'Recovery already active — ignoring stall event');
      return;
    }

    if (this._attempts >= MAX_RECOVERY_ATTEMPTS) {
      audioLogger.error('stall-recovery', `Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached — giving up`);
      audioLogger.error(PlaybackEvent.RECOVERY_FAILED, 'Stall recovery exhausted');
      return;
    }

    const audio = this._engine.primaryAudio;

    // Don't attempt recovery if user has paused
    if (audio.paused) {
      audioLogger.log('stall-recovery', 'Audio is paused — stall ignored');
      return;
    }

    this._attempts++;
    this._active = true;

    audioLogger.warn(PlaybackEvent.RECOVERY_INITIATED, `Stall detected — attempt ${this._attempts}/${MAX_RECOVERY_ATTEMPTS}`);

    // Start with Level 1 after a brief delay
    this._timer1 = setTimeout(() => this._level1(), LEVEL1_DELAY_MS);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Recovery levels
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Level 1 — Lightweight re-play.
   * @private
   */
  async _level1() {
    if (!this._active) return;

    const audio = this._engine.primaryAudio;
    if (audio.paused) { this._active = false; return; }

    audioLogger.info(PlaybackEvent.RECOVERY_LEVEL1, 'Level 1: attempting lightweight recovery (play())');

    try {
      await audio.play();
    } catch {
      // Play may fail if browser restricts it — escalate immediately
    }

    // Give the browser LEVEL1_TIMEOUT_MS to recover on its own
    this._timer2 = setTimeout(() => {
      if (!this._active) return;

      // If playback resumed, we're done
      if (!audio.paused && !audio.ended) {
        audioLogger.info(PlaybackEvent.RECOVERY_SUCCEEDED, 'Level 1 recovery succeeded');
        this._active = false;
        return;
      }

      // Escalate to Level 2
      this._level2();
    }, LEVEL1_TIMEOUT_MS);
  }

  /**
   * Level 2 — Source reload with position restore.
   * @private
   */
  _level2() {
    if (!this._active) return;

    const audio    = this._engine.primaryAudio;
    const stalledSrc  = audio.src;
    const stalledTime = audio.currentTime || 0;

    if (!stalledSrc) {
      audioLogger.warn('stall-recovery', 'Level 2: no src to reload');
      this._active = false;
      return;
    }

    if (audio.paused) { this._active = false; return; }

    audioLogger.info(PlaybackEvent.RECOVERY_LEVEL2, `Level 2: reloading src at ${stalledTime.toFixed(2)}s`);

    const onCanPlay = () => {
      audio.removeEventListener(AudioEvent.CAN_PLAY, onCanPlay);

      if (!this._active) return;

      if (stalledTime > 2) {
        try { audio.currentTime = stalledTime; } catch { /* ignore */ }
      }

      audio.play()
        .then(() => {
          audioLogger.info(PlaybackEvent.RECOVERY_SUCCEEDED, 'Level 2 recovery succeeded');
          this._active = false;
          clearTimeout(this._timer3);
        })
        .catch(() => {
          audioLogger.warn('stall-recovery', 'Level 2 play() failed — escalating to Level 3');
          this._level3();
        });
    };

    audio.addEventListener(AudioEvent.CAN_PLAY, onCanPlay);
    audio.load();

    // If canplay doesn't fire within LEVEL2_TIMEOUT_MS, escalate
    this._timer3 = setTimeout(() => {
      audio.removeEventListener(AudioEvent.CAN_PLAY, onCanPlay);
      if (!this._active) return;
      audioLogger.warn('stall-recovery', 'Level 2 timeout — escalating to Level 3');
      this._level3();
    }, LEVEL2_TIMEOUT_MS);
  }

  /**
   * Level 3 — Fresh stream resolution.
   * Invalidates the cached URL and re-resolves from the network.
   * @private
   */
  async _level3() {
    if (!this._active) return;

    const audio      = this._engine.primaryAudio;
    const stalledTime = audio.currentTime || 0;

    audioLogger.warn(PlaybackEvent.RECOVERY_LEVEL3, `Level 3: invalidating cache + re-resolving stream`);

    const song = this._getCurrentSong?.();
    if (!song) {
      audioLogger.error('stall-recovery', 'Level 3: no current song — cannot re-resolve');
      this._active = false;
      audioLogger.error(PlaybackEvent.RECOVERY_FAILED, 'Level 3 failed — no song');
      return;
    }

    // Invalidate cached URL so resolver fetches a fresh one
    this._resolver.invalidate(String(song.id));

    try {
      const newUrl = await this._resolver.resolve(song);

      if (!this._active) return; // User changed song during resolution

      if (!newUrl) {
        audioLogger.error(PlaybackEvent.RECOVERY_FAILED, `Level 3 failed — no URL resolved for "${song.title}"`);
        this._active = false;
        return;
      }

      // Load the fresh URL
      this._engine.loadTrack(newUrl);

      const onCanPlay = () => {
        audio.removeEventListener(AudioEvent.CAN_PLAY, onCanPlay);

        if (!this._active) return;

        if (stalledTime > 2) {
          try { audio.currentTime = stalledTime; } catch { /* ignore */ }
        }

        audio.play()
          .then(() => {
            audioLogger.info(PlaybackEvent.RECOVERY_SUCCEEDED, 'Level 3 recovery succeeded');
            this._active = false;
          })
          .catch(err => {
            audioLogger.error(PlaybackEvent.RECOVERY_FAILED, 'Level 3 play() failed', err);
            this._active = false;
          });
      };

      audio.addEventListener(AudioEvent.CAN_PLAY, onCanPlay);

    } catch (err) {
      audioLogger.error(PlaybackEvent.RECOVERY_FAILED, 'Level 3 error during re-resolution', err);
      this._active = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _clearTimers() {
    clearTimeout(this._timer1);
    clearTimeout(this._timer2);
    clearTimeout(this._timer3);
    this._timer1 = null;
    this._timer2 = null;
    this._timer3 = null;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const stallRecovery = new StallRecovery();
