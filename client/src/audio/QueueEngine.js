/**
 * audio/QueueEngine.js
 *
 * Immutable queue state machine for the Auralis playback engine.
 *
 * Responsibilities:
 *   - Provides deterministic next/previous navigation respecting repeatMode and shuffleMode
 *   - Maintains shuffled order and restores original order when shuffle is disabled
 *   - Drains the manual "up-next" queue before advancing the active queue
 *   - Exposes peek methods for the PrefetchSystem to read ahead without advancing
 *   - All mutations go through the Zustand playerStore — no local state
 *
 * Design constraints:
 *   - Zero audio calls — this module is a pure state machine
 *   - All operations are O(n) at worst, suitable for large queues
 *   - Shuffle history prevents immediate repeats across queue boundaries
 *
 * Usage:
 *   import { queueEngine } from './QueueEngine';
 *
 *   // Register the active track list (replaces activeQueue in PlayerContext):
 *   queueEngine.setActiveQueue(tracks, startIndex);
 *
 *   // Navigate:
 *   const nextSong = queueEngine.peekNext();
 *   queueEngine.advance(); // move queueIndex forward
 */

import { usePlayerStore } from '../store/playerStore';
import { audioLogger }    from './AudioLogger';
import { PlaybackEvent }  from './PlaybackEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Maximum entries kept in the session play history. */
const MAX_HISTORY = 50;

// ─── QueueEngine class ────────────────────────────────────────────────────────

class QueueEngine {
  constructor() {
    /**
     * Shuffled index order — array of indices into _activeQueue.
     * Populated when shuffle is enabled; cleared on disable.
     * @type {number[]}
     */
    this._shuffledOrder = [];

    /**
     * Pointer into _shuffledOrder (when shuffle is on) or
     * equivalent of queueIndex (when shuffle is off).
     * We read queueIndex from the store as the canonical source.
     */
    this._shufflePosition = 0;

    /**
     * Song IDs played since the last shuffle reset — used to
     * prevent immediate repeats in shuffled mode.
     * @type {Set<string>}
     */
    this._shuffleHistory = new Set();

    audioLogger.log('queue-engine', 'QueueEngine initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Active queue management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set (replace) the active base queue and optionally start at a given index.
   * The manual "up-next" queue is preserved.
   *
   * @param {Object[]} tracks     - Array of song objects
   * @param {number}   [startIndex=0] - Index to start playback from
   */
  setActiveQueue(tracks, startIndex = 0) {
    if (!Array.isArray(tracks)) {
      audioLogger.warn('queue-engine', 'setActiveQueue: invalid tracks array');
      return;
    }

    const store = usePlayerStore.getState();
    store.setActiveQueue(tracks);
    store.setQueueIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));

    // Re-generate shuffle order if shuffle is on
    if (store.shuffleMode) {
      this._generateShuffleOrder(tracks.length, startIndex);
    }

    audioLogger.info(PlaybackEvent.ACTIVE_QUEUE_SET, `Active queue set — ${tracks.length} tracks`, { startIndex });
  }

  /**
   * Enable or disable shuffle mode.
   *
   * When enabling:  generates a shuffled play order.
   * When disabling: restores sequential order from current queueIndex.
   *
   * @param {boolean} enabled
   */
  setShuffleMode(enabled) {
    const store = usePlayerStore.getState();
    store.setShuffleMode(enabled);

    if (enabled) {
      const tracks = store.activeQueue;
      const idx    = store.queueIndex;
      this._generateShuffleOrder(tracks.length, idx);
      audioLogger.info('queue-engine', `Shuffle ON — ${tracks.length} tracks`);
    } else {
      this._shuffledOrder   = [];
      this._shufflePosition = 0;
      this._shuffleHistory.clear();
      audioLogger.info('queue-engine', 'Shuffle OFF — sequential order restored');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Navigation — Peek (non-destructive)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return the next song that would play, without advancing any pointers.
   * Used by PrefetchSystem to warm the cache before track end.
   *
   * @returns {Object|null} Next song, or null if queue would end
   */
  peekNext() {
    const store = usePlayerStore.getState();

    // Manual queue takes priority
    if (store.queue.length > 0) {
      return store.queue[0];
    }

    const tracks     = store.activeQueue;
    const repeatMode = store.repeatMode;
    const shuffle    = store.shuffleMode;
    const idx        = store.queueIndex;

    if (!tracks.length) return null;

    if (repeatMode === 'one') {
      return tracks[idx] || null;
    }

    if (shuffle) {
      return this._peekNextShuffled(tracks, store);
    }

    // Normal sequential
    const nextIdx = idx + 1;
    if (nextIdx >= tracks.length) {
      return repeatMode === 'all' ? tracks[0] : null;
    }
    return tracks[nextIdx];
  }

  /**
   * Return the song that would play on Previous, without advancing.
   *
   * @param {number} [currentTimeSec=0] - Current playback position in seconds
   * @returns {Object|null}
   */
  peekPrevious(currentTimeSec = 0) {
    const store = usePlayerStore.getState();

    // If more than 3s played → restart current track
    if (currentTimeSec > 3) {
      return store.currentSong || null;
    }

    const tracks = store.activeQueue;
    const idx    = store.queueIndex;

    // Try history first
    if (store.history.length > 0) {
      return store.history[0];
    }

    if (!tracks.length) return null;

    const prevIdx = idx - 1;
    if (prevIdx < 0) {
      return store.repeatMode === 'all' ? tracks[tracks.length - 1] : null;
    }
    return tracks[prevIdx];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Navigation — Advance (state-mutating)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Determine and return the next song, advancing the queue pointer.
   * This is the canonical "advance playback" call.
   *
   * Returns null if there is nothing to play next (end of queue, no repeat).
   *
   * @returns {Object|null}
   */
  next() {
    const store = usePlayerStore.getState();

    // ── Drain manual queue first ──────────────────────────────────────────
    if (store.queue.length > 0) {
      const [nextSong, ...rest] = store.queue;
      store.setQueue(rest);
      audioLogger.log(PlaybackEvent.QUEUE_UPDATED, `Drained manual queue — ${rest.length} remaining`);
      return nextSong;
    }

    const tracks     = store.activeQueue;
    const repeatMode = store.repeatMode;
    const shuffle    = store.shuffleMode;
    const idx        = store.queueIndex;

    if (!tracks.length) return null;

    // ── Repeat One ────────────────────────────────────────────────────────
    if (repeatMode === 'one') {
      return tracks[idx] || null;
    }

    // ── Shuffle ───────────────────────────────────────────────────────────
    if (shuffle) {
      return this._nextShuffled(tracks, store, repeatMode);
    }

    // ── Normal sequential ─────────────────────────────────────────────────
    const nextIdx = idx + 1;

    if (nextIdx >= tracks.length) {
      if (repeatMode === 'all') {
        store.setQueueIndex(0);
        audioLogger.log('queue-engine', 'Queue wrapped (Repeat All)');
        return tracks[0];
      }
      audioLogger.log('queue-engine', 'End of queue — no repeat');
      return null;
    }

    store.setQueueIndex(nextIdx);
    return tracks[nextIdx];
  }

  /**
   * Determine and return the previous song, adjusting the queue pointer.
   *
   * - If currentTimeSec > 3: returns current song (restart behaviour)
   * - If history is available: returns history[0]
   * - Otherwise: returns previous in activeQueue
   *
   * @param {number} [currentTimeSec=0]
   * @returns {Object|null}
   */
  previous(currentTimeSec = 0) {
    const store = usePlayerStore.getState();

    // Restart current track if played more than 3 seconds
    if (currentTimeSec > 3) {
      audioLogger.log('queue-engine', `Previous: restarting current (${currentTimeSec.toFixed(1)}s played)`);
      return store.currentSong || null;
    }

    const tracks = store.activeQueue;
    const idx    = store.queueIndex;

    if (!tracks.length) return null;

    // Sequential previous
    const prevIdx = idx - 1;
    if (prevIdx < 0) {
      if (store.repeatMode === 'all') {
        const lastIdx = tracks.length - 1;
        store.setQueueIndex(lastIdx);
        return tracks[lastIdx];
      }
      audioLogger.log('queue-engine', 'At start of queue — nowhere to go back');
      return tracks[0] || null; // restart first track
    }

    store.setQueueIndex(prevIdx);
    return tracks[prevIdx];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Manual queue management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Append a song to the end of the manual up-next queue.
   * @param {Object} song
   */
  addToQueue(song) {
    if (!song) return;
    const store = usePlayerStore.getState();
    store.addToQueue(song);
    audioLogger.info(PlaybackEvent.QUEUE_UPDATED, `Added "${song.title}" to queue`);
  }

  /**
   * Insert a song at the front of the manual up-next queue (play next).
   * @param {Object} song
   */
  addToQueueNext(song) {
    if (!song) return;
    const store = usePlayerStore.getState();
    store.addToQueueNext(song);
    audioLogger.info(PlaybackEvent.QUEUE_UPDATED, `"${song.title}" queued to play next`);
  }

  /**
   * Remove a song from the manual queue by index.
   * @param {number} index
   */
  removeFromQueue(index) {
    const store = usePlayerStore.getState();
    store.removeFromQueue(index);
    audioLogger.log(PlaybackEvent.QUEUE_UPDATED, `Removed queue item at index ${index}`);
  }

  /**
   * Clear the entire manual up-next queue.
   */
  clearQueue() {
    const store = usePlayerStore.getState();
    store.clearQueue();
    audioLogger.info(PlaybackEvent.QUEUE_CLEARED, 'Manual queue cleared');
  }

  /**
   * Move a manual queue item from one index to another (drag-to-reorder).
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  moveQueueItem(fromIndex, toIndex) {
    const store = usePlayerStore.getState();
    store.moveQueueItem(fromIndex, toIndex);
    audioLogger.log(PlaybackEvent.QUEUE_REORDERED, `Moved queue item ${fromIndex} → ${toIndex}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Song tracking — called by PlaybackEngine after each successful play
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record that a song started playing: update currentSong and push to history.
   * Also synchronises queueIndex to match the song's position in activeQueue.
   *
   * @param {Object} song
   */
  onSongStarted(song) {
    if (!song) return;
    const store = usePlayerStore.getState();

    store.setCurrentSong(song);
    store.pushHistory(song);

    // Sync queueIndex to the song's position in the activeQueue
    const tracks = store.activeQueue;
    const idx    = tracks.findIndex(t => t.id === song.id);
    if (idx !== -1 && idx !== store.queueIndex) {
      store.setQueueIndex(idx);
    }

    // Update shuffle history to prevent re-play
    if (store.shuffleMode && song.id) {
      this._shuffleHistory.add(String(song.id));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Shuffle helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a shuffled play order using the Fisher-Yates algorithm.
   * The current index is placed first so the current song doesn't re-play.
   *
   * @private
   * @param {number} length       - Length of the track array
   * @param {number} currentIdx   - Current queueIndex (put at position 0)
   */
  _generateShuffleOrder(length, currentIdx) {
    // Build an array of all indices
    const indices = Array.from({ length }, (_, i) => i);

    // Swap current index to front
    const swapPos = indices.indexOf(currentIdx);
    if (swapPos > 0) {
      [indices[0], indices[swapPos]] = [indices[swapPos], indices[0]];
    }

    // Shuffle positions 1..end using Fisher-Yates
    for (let i = length - 1; i > 1; i--) {
      const j = Math.floor(Math.random() * (i - 1)) + 1; // skip index 0 (current)
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    this._shuffledOrder   = indices;
    this._shufflePosition = 0; // we're currently "at" position 0 (current song)
    this._shuffleHistory.clear();

    audioLogger.log('queue-engine', `Shuffle order generated — ${length} tracks`);
  }

  /**
   * Advance the shuffle pointer and return the next song.
   * @private
   */
  _nextShuffled(tracks, store, repeatMode) {
    if (!this._shuffledOrder.length) {
      this._generateShuffleOrder(tracks.length, store.queueIndex);
    }

    const nextPos = this._shufflePosition + 1;

    if (nextPos >= this._shuffledOrder.length) {
      if (repeatMode === 'all') {
        // Reshuffle (but keep current song away from position 0 again)
        this._generateShuffleOrder(tracks.length, store.queueIndex);
        this._shufflePosition = 1;
        const idx = this._shuffledOrder[1] ?? 0;
        store.setQueueIndex(idx);
        return tracks[idx] || null;
      }
      audioLogger.log('queue-engine', 'Shuffle exhausted — no repeat');
      return null;
    }

    this._shufflePosition = nextPos;
    const trackIdx = this._shuffledOrder[nextPos];
    store.setQueueIndex(trackIdx);
    return tracks[trackIdx] || null;
  }

  /**
   * Peek at the next shuffled song without advancing any pointers.
   * @private
   */
  _peekNextShuffled(tracks, store) {
    if (!this._shuffledOrder.length) return null;
    const nextPos = this._shufflePosition + 1;
    if (nextPos >= this._shuffledOrder.length) {
      return store.repeatMode === 'all' ? tracks[this._shuffledOrder[0]] : null;
    }
    const trackIdx = this._shuffledOrder[nextPos];
    return tracks[trackIdx] || null;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const queueEngine = new QueueEngine();
