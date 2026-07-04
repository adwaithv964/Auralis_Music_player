/**
 * store/playerStore.js
 *
 * Centralized Zustand store for all audio playback state.
 *
 * Design principles:
 *   - Pure state only — zero audio logic lives here.
 *   - The AudioEngine singleton writes to this store after every audio event.
 *   - React components subscribe to slices via usePlayerStore(selector) to
 *     avoid unnecessary re-renders.
 *   - Actions are lean setters; business logic stays in AudioEngine or
 *     PlayerContext.
 *
 * Usage (in a component):
 *   import { usePlayerStore } from '../store/playerStore';
 *
 *   // Subscribe to a single field — no re-render unless it changes
 *   const isPlaying = usePlayerStore(s => s.isPlaying);
 *
 *   // Subscribe to an action
 *   const setVolume = usePlayerStore(s => s.setVolume);
 *
 * Usage (outside React — e.g. in AudioEngine):
 *   import { usePlayerStore } from '../store/playerStore';
 *   const state = usePlayerStore.getState();
 *   state.setPlaying(true);
 */

import { create } from 'zustand';

// ─── RepeatMode type ──────────────────────────────────────────────────────────
/**
 * @typedef {'none'|'one'|'all'} RepeatMode
 */

// ─── Store shape ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PlayerState
 *
 * ── Track / queue ─────────────────────────────────────────────────────────────
 * @property {Object|null}   currentSong      - Currently loaded track object
 * @property {Object[]}      queue            - Manual "up next" queue
 * @property {Object[]}      history          - Recently played track list
 * @property {Object[]}      activeQueue      - Base track list for queue navigation (Phase 2)
 * @property {number}        queueIndex       - Current position in activeQueue (Phase 2)
 *
 * ── Playback status ───────────────────────────────────────────────────────────
 * @property {boolean}       isPlaying        - True while audio is playing
 * @property {boolean}       isBuffering      - True while the audio element is waiting
 * @property {boolean}       isPaused         - True when playback is explicitly paused (Phase 2)
 * @property {boolean}       isMuted          - True when muted
 *
 * ── Timing ────────────────────────────────────────────────────────────────────
 * @property {number}        progress         - Playback progress 0–100 (%)
 * @property {number}        elapsed          - Current position in seconds (floored)
 * @property {number}        duration         - Track duration in seconds (floored)
 * @property {number|null}   pendingSeekSec   - Position to seek to after track loads (Phase 2)
 *
 * ── Audio settings ────────────────────────────────────────────────────────────
 * @property {number}        volume           - Master volume 0.0–1.0
 * @property {number}        playbackRate     - Playback speed (default 1.0)
 * @property {number}        crossfadeSeconds - Crossfade duration in seconds (Phase 2, default 0)
 *
 * ── Phase 3: Equalizer & Audio Quality ─────────────────────────────────────────
 * @property {string}        eqPreset         - Active EQ preset id ('flat', 'bass-boost', etc.)
 * @property {number[]}      eqBands          - Current 5-band EQ gains in dB
 * @property {string}        streamQuality    - Stream quality tier ('low'|'normal'|'high'|'lossless')
 * @property {boolean}       loudnessNormalizationEnabled - Whether loudness normalization is active
 *
 * ── Playback modes ────────────────────────────────────────────────────────────
 * @property {RepeatMode}    repeatMode       - 'none' | 'one' | 'all'
 * @property {boolean}       shuffleMode      - True when shuffle is active
 *
 * ── Engine status ─────────────────────────────────────────────────────────────
 * @property {boolean}       audioReady       - True when Web Audio pipeline is live
 * @property {boolean}       initialized      - True after the first pipeline init
 *
 * ── Actions ───────────────────────────────────────────────────────────────────
 * @property {Function}      setCurrentSong
 * @property {Function}      setQueue
 * @property {Function}      addToQueue
 * @property {Function}      addToQueueNext
 * @property {Function}      removeFromQueue
 * @property {Function}      clearQueue
 * @property {Function}      moveQueueItem
 * @property {Function}      setHistory
 * @property {Function}      pushHistory
 * @property {Function}      setActiveQueue
 * @property {Function}      setQueueIndex
 * @property {Function}      setPlaying
 * @property {Function}      setBuffering
 * @property {Function}      setMuted
 * @property {Function}      setIsPaused
 * @property {Function}      setProgress
 * @property {Function}      setElapsed
 * @property {Function}      setDuration
 * @property {Function}      setPendingSeekSec
 * @property {Function}      setVolume
 * @property {Function}      setPlaybackRate
 * @property {Function}      setCrossfadeSeconds
 * @property {Function}      setEQPreset
 * @property {Function}      setEQBands
 * @property {Function}      setStreamQuality
 * @property {Function}      setLoudnessNormalizationEnabled
 * @property {Function}      setRepeatMode
 * @property {Function}      setShuffleMode
 * @property {Function}      setAudioReady
 * @property {Function}      setInitialized
 * @property {Function}      resetPlaybackState
 */

export const usePlayerStore = create((set, get) => ({
  // ── Track / queue ───────────────────────────────────────────────────────────
  currentSong:  null,
  queue:        [],
  history:      [],
  activeQueue:  [],   // Phase 2: base track list for navigation
  queueIndex:   0,    // Phase 2: current position in activeQueue

  // ── Playback status ─────────────────────────────────────────────────────────
  isPlaying:    false,
  isBuffering:  false,
  isPaused:     false, // Phase 2: distinct from !isPlaying
  isMuted:      false,

  // ── Timing ──────────────────────────────────────────────────────────────────
  progress:       0,    // 0–100
  elapsed:        0,    // seconds
  duration:       0,    // seconds
  pendingSeekSec: null, // Phase 2: position to seek after track loads (session restore)

  // ── Audio settings ───────────────────────────────────────────────────────────
  volume:           0.62, // Matches DEFAULT_PREFS.volume / 100
  playbackRate:     1.0,
  crossfadeSeconds: 0,    // Phase 2: reserved for future crossfade implementation

  // ── Phase 3: Equalizer & Audio Quality ─────────────────────────────────────
  eqPreset:                    'flat',       // Active EQ preset id
  eqBands:                     [0, 0, 0, 0, 0], // Current 5-band gains (dB)
  streamQuality:               'normal',    // Stream quality tier
  loudnessNormalizationEnabled: true,       // Loudness normalization toggle

  // ── Playback modes ───────────────────────────────────────────────────────────
  repeatMode:   'none',  // 'none' | 'one' | 'all'
  shuffleMode:  false,

  // ── Engine status ────────────────────────────────────────────────────────────
  audioReady:   false,
  initialized:  false,

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Track / queue ───────────────────────────────────────────────────────────

  /** Replace the current song. Pass null to clear. */
  setCurrentSong: (song) => set({ currentSong: song }),

  /** Replace the entire manual up-next queue. */
  setQueue: (queue) => set({ queue: Array.isArray(queue) ? queue : [] }),

  /** Append a track to the end of the manual up-next queue. */
  addToQueue: (track) => set((state) => ({
    queue: [...state.queue, track],
  })),

  /**
   * Insert a track immediately at the front of the manual up-next queue
   * (play next, Phase 2).
   */
  addToQueueNext: (track) => set((state) => ({
    queue: [track, ...state.queue],
  })),

  /** Remove a track from the manual queue by index. */
  removeFromQueue: (index) => set((state) => ({
    queue: state.queue.filter((_, i) => i !== index),
  })),

  /** Clear the entire manual up-next queue. */
  clearQueue: () => set({ queue: [] }),

  /**
   * Phase 2: Move a manual queue item from one index to another.
   * Immutable splice — safe for drag-to-reorder.
   */
  moveQueueItem: (from, to) => set((state) => {
    const q = [...state.queue];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length) return {};
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    return { queue: q };
  }),

  /** Replace the history list. */
  setHistory: (history) => set({ history: Array.isArray(history) ? history : [] }),

  /**
   * Prepend a track to history, deduplicate by id, cap at 50 entries.
   * @param {Object} track
   */
  pushHistory: (track) => set((state) => {
    if (!track?.id) return {};
    const filtered = state.history.filter(h => h.id !== track.id);
    return { history: [track, ...filtered].slice(0, 50) };
  }),

  // ── Active queue (Phase 2) ──────────────────────────────────────────────────

  /**
   * Replace the active (base) queue — the list used for sequential / shuffle
   * navigation. Distinct from the manual up-next queue.
   */
  setActiveQueue: (activeQueue) => set({
    activeQueue: Array.isArray(activeQueue) ? activeQueue : [],
  }),

  /**
   * Update the current position pointer within the active queue.
   * @param {number} index
   */
  setQueueIndex: (queueIndex) => set({ queueIndex: Math.max(0, queueIndex) }),

  // ── Playback status ─────────────────────────────────────────────────────────

  setPlaying:   (isPlaying)   => set({ isPlaying }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setMuted:     (isMuted)     => set({ isMuted }),

  /** Phase 2: set the explicit pause flag (distinct from !isPlaying mid-load) */
  setIsPaused: (isPaused) => set({ isPaused }),

  // ── Timing ──────────────────────────────────────────────────────────────────

  setProgress: (progress) => set({ progress }),
  setElapsed:  (elapsed)  => set({ elapsed }),
  setDuration: (duration) => set({ duration }),

  /**
   * Phase 2: store a playback position to apply after the track loads.
   * Used by session restore so position is applied without autoplaying.
   * @param {number|null} positionSec
   */
  setPendingSeekSec: (pendingSeekSec) => set({ pendingSeekSec }),

  // ── Audio settings ───────────────────────────────────────────────────────────

  /** @param {number} volume - 0.0 to 1.0 */
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

  /** @param {number} rate - e.g. 0.5, 1.0, 1.5, 2.0 */
  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  /**
   * Phase 2: set the crossfade duration in seconds.
   * 0 = disabled; > 0 = crossfade (requires future CrossfadeEngine).
   * @param {number} seconds
   */
  setCrossfadeSeconds: (crossfadeSeconds) => set({
    crossfadeSeconds: Math.max(0, crossfadeSeconds),
  }),

  // ── Phase 3: Equalizer & Audio Quality ────────────────────────────────────

  /**
   * Set the active EQ preset id.
   * @param {string} eqPreset - e.g. 'flat', 'bass-boost', 'custom'
   */
  setEQPreset: (eqPreset) => set({ eqPreset: typeof eqPreset === 'string' ? eqPreset : 'flat' }),

  /**
   * Replace the 5-band EQ gains array (immutable).
   * @param {number[]} eqBands - Array of exactly 5 dB values
   */
  setEQBands: (eqBands) => set({
    eqBands: Array.isArray(eqBands) && eqBands.length === 5
      ? [...eqBands]
      : [0, 0, 0, 0, 0],
  }),

  /**
   * Set the stream quality tier.
   * @param {string} streamQuality - 'low' | 'normal' | 'high' | 'lossless'
   */
  setStreamQuality: (streamQuality) => set({ streamQuality }),

  /**
   * Toggle loudness normalization on or off.
   * @param {boolean} loudnessNormalizationEnabled
   */
  setLoudnessNormalizationEnabled: (loudnessNormalizationEnabled) => set({ loudnessNormalizationEnabled }),

  // ── Playback modes ───────────────────────────────────────────────────────────

  /** @param {RepeatMode} mode */
  setRepeatMode:  (repeatMode)  => set({ repeatMode }),

  setShuffleMode: (shuffleMode) => set({ shuffleMode }),

  // ── Engine status ────────────────────────────────────────────────────────────

  setAudioReady:  (audioReady)  => set({ audioReady }),
  setInitialized: (initialized) => set({ initialized }),

  // ── Compound reset ───────────────────────────────────────────────────────────

  /**
   * Reset all transient playback state when a new track is loaded.
   * Preserves volume, rates, mode settings, queue state, and active queue.
   */
  resetPlaybackState: () => set({
    isPlaying:      false,
    isBuffering:    false,
    isPaused:       false,
    progress:       0,
    elapsed:        0,
    duration:       0,
    pendingSeekSec: null,
  }),
}));
