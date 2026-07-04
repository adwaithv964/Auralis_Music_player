/**
 * audio/PrefetchSystem.js
 *
 * Gapless playback preparation system for the Auralis playback engine.
 *
 * Behaviour:
 *   1. Monitors primaryAudio timeupdate — watches remaining playback time.
 *   2. When remaining time ≤ PREFETCH_THRESHOLD_SEC:
 *        a. Calls queueEngine.peekNext() to identify the next song.
 *        b. Calls streamResolver.prefetchUrl(nextSong) to warm the URL cache.
 *        c. Loads the resolved URL into audioEngine.secondaryAudio (muted)
 *           so the next track is buffered ahead of time.
 *   3. On the primary track's 'ended' event:
 *        — PlaybackEngine checks if secondaryAudio has a prefetched track ready.
 *        — If yes: gapless instant swap (future crossfade point).
 *        — If no: normal next() call (resolves on demand).
 *   4. Resets all prefetch state after each transition.
 *   5. Cancels prefetch if the manual queue changes or the current song changes.
 *
 * Design constraints:
 *   - Only ONE song is ever preloaded at a time (the immediate next).
 *   - Secondary audio element stays muted at all times.
 *   - Never fires duplicate prefetches for the same song.
 *   - Zero audio calls on the primary element.
 *
 * Usage (called by PlaybackEngine):
 *   import { prefetchSystem } from './PrefetchSystem';
 *   prefetchSystem.attach(audioEngine, streamResolver, queueEngine);
 *   prefetchSystem.arm();     // called after each song starts
 *   prefetchSystem.cancel();  // called when song/queue changes
 *   prefetchSystem.reset();   // called after gapless transition
 */

import { audioLogger }   from './AudioLogger';
import { AudioEvent }    from './AudioEvents';
import { PlaybackEvent } from './PlaybackEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Remaining playback seconds at which prefetch is triggered. */
const PREFETCH_THRESHOLD_SEC = 30;

/** Minimum track duration (seconds) required to enable prefetch.
 *  Very short clips don't benefit from prefetch. */
const MIN_DURATION_FOR_PREFETCH = 20;

// ─── PrefetchSystem class ────────────────────────────────────────────────────

class PrefetchSystem {
  constructor() {
    /** @type {Object|null} AudioEngine singleton */
    this._engine = null;

    /** @type {Object|null} StreamResolver singleton */
    this._resolver = null;

    /** @type {Object|null} QueueEngine singleton */
    this._queueEngine = null;

    /** The song currently loaded into the secondary element (null = none). */
    this._prefetchedSong = null;

    /** Whether a prefetch is currently in progress. */
    this._prefetching = false;

    /** timeupdate listener reference for precise removal. */
    this._onTimeUpdate = null;

    audioLogger.log('prefetch', 'PrefetchSystem initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach to the live engine, resolver and queue engine instances.
   * Called once by PlaybackEngine on startup.
   *
   * @param {Object} engine      - audioEngine singleton
   * @param {Object} resolver    - streamResolver singleton
   * @param {Object} queueEngine - queueEngine singleton
   */
  attach(engine, resolver, queueEngineRef) {
    this._engine      = engine;
    this._resolver    = resolver;
    this._queueEngine = queueEngineRef;
    audioLogger.log('prefetch', 'PrefetchSystem attached');
  }

  /**
   * Arm the prefetch system after a song starts playing.
   * Attaches a timeupdate listener that watches remaining time.
   *
   * Always call arm() after a new song begins.
   */
  arm() {
    if (!this._engine) return;

    // Remove any previous listener before adding a new one
    this._removeTimeUpdateListener();

    this._onTimeUpdate = this._checkPrefetchTrigger.bind(this);
    this._engine.primaryAudio.addEventListener(
      AudioEvent.TIME_UPDATE,
      this._onTimeUpdate,
    );

    audioLogger.log('prefetch', 'Prefetch system armed');
  }

  /**
   * Cancel any in-progress prefetch and disarm the timeupdate listener.
   * Call this whenever the current song or manual queue changes.
   */
  cancel() {
    this._removeTimeUpdateListener();
    this._prefetching = false;

    if (this._prefetchedSong) {
      audioLogger.log(PlaybackEvent.PREFETCH_CANCELLED, `Prefetch cancelled for "${this._prefetchedSong.title}"`);
      this._clearSecondaryAudio();
      this._prefetchedSong = null;
    }
  }

  /**
   * Called by PlaybackEngine after a gapless or normal transition.
   * Clears the secondary element and resets state.
   */
  reset() {
    this._removeTimeUpdateListener();
    this._clearSecondaryAudio();
    this._prefetchedSong = null;
    this._prefetching    = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Query — used by PlaybackEngine on 'ended' event
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return true if the next song is already buffered in the secondary element.
   * @returns {boolean}
   */
  get isReady() {
    if (!this._prefetchedSong || !this._engine) return false;
    const sec = this._engine.secondaryAudio;
    return sec.readyState >= 3; // HAVE_FUTURE_DATA
  }

  /**
   * Return the song currently prefetched in the secondary element, or null.
   * @returns {Object|null}
   */
  get prefetchedSong() {
    return this._prefetchedSong;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Trigger logic
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * timeupdate handler — runs every 250 ms during playback.
   * @private
   */
  _checkPrefetchTrigger() {
    if (!this._engine) return;
    if (this._prefetching || this._prefetchedSong) return; // Already done

    const audio    = this._engine.primaryAudio;
    const duration = audio.duration;
    const current  = audio.currentTime;

    if (!duration || isNaN(duration) || duration < MIN_DURATION_FOR_PREFETCH) return;

    const remaining = duration - current;

    if (remaining <= PREFETCH_THRESHOLD_SEC) {
      this._startPrefetch();
    }
  }

  /**
   * Initiate prefetch for the next song.
   * @private
   */
  async _startPrefetch() {
    if (this._prefetching || !this._queueEngine || !this._resolver) return;

    const nextSong = this._queueEngine.peekNext();
    if (!nextSong) {
      audioLogger.log('prefetch', 'No next song — prefetch skipped');
      return;
    }

    // Don't prefetch the same song twice
    if (this._prefetchedSong?.id === nextSong.id) return;

    this._prefetching = true;
    this._removeTimeUpdateListener(); // Stop monitoring once triggered

    audioLogger.info(PlaybackEvent.PREFETCH_STARTED, `Prefetching "${nextSong.title}"`);

    try {
      const url = await this._resolver.resolve(nextSong);

      // Check that the queue hasn't changed while we were resolving
      if (!this._prefetching) {
        audioLogger.log(PlaybackEvent.PREFETCH_CANCELLED, `Prefetch was cancelled for "${nextSong.title}"`);
        return;
      }

      if (!url) {
        audioLogger.warn(PlaybackEvent.PREFETCH_FAILED, `Could not prefetch "${nextSong.title}" — no URL`);
        this._prefetching = false;
        return;
      }

      // Load into secondary audio (muted, no autoplay)
      this._loadIntoSecondary(url, nextSong);

    } catch (err) {
      audioLogger.warn(PlaybackEvent.PREFETCH_FAILED, `Prefetch error for "${nextSong.title}"`, err);
      this._prefetching = false;
    }
  }

  /**
   * Load a resolved URL into the secondary audio element for buffering.
   * @private
   */
  _loadIntoSecondary(url, song) {
    if (!this._engine) return;

    const secondary = this._engine.secondaryAudio;

    // Ensure secondary is muted and silent
    secondary.muted  = true;
    secondary.volume = 0;

    secondary.src     = url;
    secondary.preload = 'auto';
    secondary.load();

    this._prefetchedSong = song;
    this._prefetching    = false;

    audioLogger.info(PlaybackEvent.PREFETCH_COMPLETED, `"${song.title}" buffered in secondary element`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Cleanup helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _removeTimeUpdateListener() {
    if (this._onTimeUpdate && this._engine) {
      this._engine.primaryAudio.removeEventListener(
        AudioEvent.TIME_UPDATE,
        this._onTimeUpdate,
      );
      this._onTimeUpdate = null;
    }
  }

  /** @private */
  _clearSecondaryAudio() {
    if (!this._engine) return;
    const secondary = this._engine.secondaryAudio;
    try {
      secondary.pause();
      secondary.src     = '';
      secondary.preload = 'none';
    } catch { /* ignore */ }
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const prefetchSystem = new PrefetchSystem();
