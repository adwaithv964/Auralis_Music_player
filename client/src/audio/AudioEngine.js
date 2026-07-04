/**
 * audio/AudioEngine.js
 *
 * The singleton audio engine for Auralis.
 *
 * Responsibilities:
 *   - Owns two HTMLAudioElements (primary + secondary) that persist for the
 *     entire application lifetime — never recreated on navigation.
 *   - Lazily initialises the Web Audio API pipeline on the first user gesture.
 *   - Maintains the full node graph:
 *       MediaElementSource → EQ Chain (5 bands) → AnalyserNode → GainNode → Destination
 *   - Registers all HTMLAudioElement event listeners exactly once and removes
 *     them cleanly on destroy().
 *   - Keeps the Zustand playerStore synchronised after every audio event.
 *   - Exposes a clean imperative API: loadTrack, play, pause, seek, setVolume, etc.
 *   - Integrates with the OS via the Media Session API.
 *   - Never lets uncaught exceptions reach the caller — all errors are caught,
 *     logged, and surfaced only through the store's error state.
 *
 * Singleton usage:
 *   import { audioEngine } from './AudioEngine';
 *   audioEngine.loadTrack(src);
 *   audioEngine.play();
 *
 * The singleton is exported as a default instance. Do NOT call `new AudioEngine()`
 * anywhere else in the codebase.
 */

import { getAudioContext, resumeAudioContext } from './AudioContext';
import { createEQChain }                        from './EQChain';
import { audioLogger }                          from './AudioLogger';
import { AudioEvent, EngineEvent }              from './AudioEvents';
import {
  setMediaSessionMetadata,
  setMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  clearMediaSession,
} from './MediaSession';
import { usePlayerStore } from '../store/playerStore';

// ─── Configuration constants ──────────────────────────────────────────────────

/** FFT size for the AnalyserNode — must be a power of 2 (32–32768).
 *  2048 gives 1024 frequency bins; good balance of resolution and performance. */
const ANALYSER_FFT_SIZE = 2048;

/** Smoothing time constant for the analyser (0 = none, 1 = max smoothing).
 *  0.8 gives a visually pleasant decay without being too sluggish. */
const ANALYSER_SMOOTHING = 0.8;

/** Stall recovery delay in ms — how long to wait before force-reloading a
 *  stalled track. 4000 ms matches the original hook behaviour. */
const STALL_RECOVERY_DELAY_MS = 4000;

// ─── AudioEngine class ────────────────────────────────────────────────────────

class AudioEngine {
  constructor() {
    // ── Guard against accidental multiple instantiation ───────────────────────
    if (AudioEngine._instance) {
      audioLogger.warn('engine', 'AudioEngine already instantiated — returning existing singleton');
      return AudioEngine._instance;
    }
    AudioEngine._instance = this;

    // ── Dual HTMLAudioElements ─────────────────────────────────────────────────
    /**
     * Primary audio element — currently playing source.
     * This ref is exposed so legacy code (PlayerContext) can access it.
     * @type {HTMLAudioElement}
     */
    this.primaryAudio = new Audio();
    this.primaryAudio.preload      = 'auto';
    this.primaryAudio.crossOrigin  = 'anonymous'; // Required for Web Audio API CORS

    /**
     * Secondary audio element — preload / standby for future crossfade / gapless.
     * Silent until explicitly activated by a future crossfade module.
     * @type {HTMLAudioElement}
     */
    this.secondaryAudio = new Audio();
    this.secondaryAudio.preload     = 'auto';
    this.secondaryAudio.volume      = 0;     // Silent until needed
    this.secondaryAudio.crossOrigin = 'anonymous';

    // ── Web Audio API pipeline (null until first user gesture) ────────────────
    /** @type {AudioContext|null} */
    this._audioContext = null;

    /** @type {MediaElementAudioSourceNode|null} Primary source node */
    this._primarySourceNode = null;

    /** @type {import('./EQChain').EQChain|null} */
    this._eqChain = null;

    /** @type {AnalyserNode|null} */
    this._analyserNode = null;

    /** @type {GainNode|null} Master volume node */
    this._gainNode = null;

    // ── Internal state ────────────────────────────────────────────────────────
    /** @type {boolean} Whether the Web Audio pipeline has been initialised */
    this._pipelineReady = false;

    /** @type {boolean} Whether event listeners have been bound */
    this._listenersBound = false;

    /** @type {NodeJS.Timeout|null} Stall recovery timer handle */
    this._stallTimer = null;

    /** @type {string|null} The src currently being loaded (stale-load guard) */
    this._pendingSrc = null;

    /** @type {Uint8Array|null} Reusable buffer for analyser time-domain data */
    this._timeDomainBuffer = null;

    /** @type {Uint8Array|null} Reusable buffer for analyser frequency data */
    this._frequencyBuffer = null;

    // ── Bound event handlers (stored so they can be removed precisely) ────────
    this._handlers = {};

    // ── Phase 2: StallRecovery delegate ───────────────────────────────────────
    /**
     * Optional stall recovery coordinator injected by PlaybackEngine (Phase 2).
     * When set, _onStalled() will delegate to this instead of using the built-in
     * basic timer. The delegate must expose an onStall() method.
     * @type {{ onStall: Function } | null}
     */
    this._stallRecoveryDelegate = null;

    // ── Initialise event listeners immediately ────────────────────────────────
    this._bindEvents();

    audioLogger.info(EngineEvent.INIT, 'AudioEngine singleton initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise (or re-use) the Web Audio API pipeline.
   *
   * Must be called from within a user gesture the first time. Safe to call
   * multiple times — subsequent calls are no-ops if the pipeline is ready.
   *
   * @returns {Promise<boolean>} true if the pipeline is now ready
   */
  async initPipeline() {
    if (this._pipelineReady) {
      // Already up — just make sure the context is running
      await resumeAudioContext();
      return true;
    }

    try {
      // 1. Create / resume AudioContext
      this._audioContext = getAudioContext();
      if (!this._audioContext) {
        audioLogger.warn('engine', 'Web Audio API unavailable — running without pipeline');
        return false;
      }

      await resumeAudioContext();

      // 2. Create MediaElementSourceNode for the primary audio element.
      //    This can only be created once per element — guard against double-init.
      if (!this._primarySourceNode) {
        this._primarySourceNode = this._audioContext.createMediaElementSource(this.primaryAudio);
      }

      // 3. Build EQ chain
      this._eqChain = createEQChain(this._audioContext);

      // 4. Create AnalyserNode
      this._analyserNode                  = this._audioContext.createAnalyser();
      this._analyserNode.fftSize          = ANALYSER_FFT_SIZE;
      this._analyserNode.smoothingTimeConstant = ANALYSER_SMOOTHING;

      // Preallocate reusable data buffers (avoids per-frame allocations)
      const bufSize             = this._analyserNode.frequencyBinCount;
      this._timeDomainBuffer    = new Uint8Array(bufSize);
      this._frequencyBuffer     = new Uint8Array(bufSize);

      // 5. Create master GainNode
      this._gainNode = this._audioContext.createGain();
      this._gainNode.gain.value = usePlayerStore.getState().volume;

      // 6. Wire the graph:
      //    MediaElementSource → EQ.inputNode → EQ.outputNode → Analyser → Gain → Destination
      this._primarySourceNode.connect(this._eqChain.inputNode);
      this._eqChain.outputNode.connect(this._analyserNode);
      this._analyserNode.connect(this._gainNode);
      this._gainNode.connect(this._audioContext.destination);

      this._pipelineReady = true;

      // Update store
      usePlayerStore.getState().setAudioReady(true);
      usePlayerStore.getState().setInitialized(true);

      audioLogger.info(EngineEvent.CONTEXT_CREATED, 'Web Audio pipeline ready', {
        sampleRate: this._audioContext.sampleRate,
        fftSize:    ANALYSER_FFT_SIZE,
      });

      return true;

    } catch (err) {
      audioLogger.error('engine', 'Failed to initialise Web Audio pipeline', err);
      // Fall back to plain HTML audio — the engine still works, just without
      // EQ / waveform data. The user should never see a crash.
      return false;
    }
  }

  // ─── Track loading ──────────────────────────────────────────────────────────

  /**
   * Load a new audio source into the primary audio element.
   *
   * - Pauses any current playback
   * - Resets progress state in the store
   * - Sets the src and triggers load()
   *
   * @param {string} src - Audio URL
   */
  loadTrack(src) {
    if (!src || typeof src !== 'string') {
      audioLogger.warn('engine', 'loadTrack called with invalid src', src);
      return;
    }

    // Skip if the same src is already loaded (metadata-only track update)
    const current = this.primaryAudio.src;
    if (current && (current === src || current.endsWith(src))) {
      audioLogger.log('engine', 'loadTrack: src unchanged — skipping reload');
      return;
    }

    audioLogger.info(EngineEvent.TRACK_LOADED, 'Loading track', src.slice(-80));

    this._pendingSrc = src;

    // Pause and reset store progress
    this.primaryAudio.pause();
    this._updateStore({
      progress:    0,
      elapsed:     0,
      duration:    0,
      isPlaying:   false,
      isBuffering: false,
    });

    clearTimeout(this._stallTimer);

    this.primaryAudio.src = src;
    this.primaryAudio.load();
  }

  // ─── Transport ──────────────────────────────────────────────────────────────

  /**
   * Start or resume playback on the primary audio element.
   * Initialises the Web Audio pipeline on the first call (satisfies the
   * user-gesture requirement for AudioContext creation).
   *
   * @returns {Promise<void>}
   */
  async play() {
    // First play gesture — set up the Web Audio pipeline
    if (!this._pipelineReady) {
      await this.initPipeline();
    } else {
      await resumeAudioContext();
    }

    const audio = this.primaryAudio;

    if (!audio.src) {
      audioLogger.warn('engine', 'play() called with no src loaded');
      return;
    }

    // If still loading, wait for canplay then trigger
    if (audio.readyState < 2) {
      audioLogger.log('engine', 'play() — waiting for canplay');
      const onReady = () => {
        audio.removeEventListener(AudioEvent.CAN_PLAY, onReady);
        audio.play().catch(err => this._handlePlayError(err));
      };
      audio.addEventListener(AudioEvent.CAN_PLAY, onReady);
      return;
    }

    try {
      await audio.play();
      audioLogger.info(EngineEvent.PLAYBACK_START, 'Playback started');
    } catch (err) {
      this._handlePlayError(err);
    }
  }

  /**
   * Pause playback.
   */
  pause() {
    this.primaryAudio.pause();
    audioLogger.info(EngineEvent.PLAYBACK_PAUSE, 'Playback paused');
  }

  /**
   * Seek to a position expressed as a percentage (0–100).
   * @param {number} percentage
   */
  seek(percentage) {
    const audio = this.primaryAudio;
    const dur   = audio.duration;

    if (!dur || isNaN(dur) || !isFinite(dur)) {
      audioLogger.warn('engine', 'seek() — duration not available');
      return;
    }

    const targetSec   = Math.max(0, Math.min(dur, (percentage / 100) * dur));
    audio.currentTime = targetSec;

    audioLogger.info(EngineEvent.SEEK, `Seek to ${targetSec.toFixed(2)}s (${percentage.toFixed(1)}%)`);
  }

  /**
   * Seek to an absolute position in seconds.
   * @param {number} seconds
   */
  seekToSeconds(seconds) {
    const audio = this.primaryAudio;
    const dur   = audio.duration;

    if (!dur || isNaN(dur) || !isFinite(dur)) return;

    audio.currentTime = Math.max(0, Math.min(dur, seconds));
    audioLogger.log('engine', `Seek to ${seconds.toFixed(2)}s (absolute)`);
  }

  // ─── Volume / rate ──────────────────────────────────────────────────────────

  /**
   * Set the master volume.
   * @param {number} volume - 0.0 to 1.0
   */
  setVolume(volume) {
    const clamped = Math.max(0, Math.min(1, volume));

    // Update GainNode if pipeline is ready (provides smoother volume control)
    if (this._gainNode) {
      this._gainNode.gain.value = clamped;
    } else {
      // Fallback to native element volume before pipeline is initialised
      this.primaryAudio.volume = clamped;
    }

    usePlayerStore.getState().setVolume(clamped);
  }

  /**
   * Mute or unmute the primary audio element.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.primaryAudio.muted = muted;
    usePlayerStore.getState().setMuted(muted);
  }

  /**
   * Set the playback rate.
   * @param {number} rate - e.g. 0.5, 1.0, 1.5, 2.0
   */
  setPlaybackRate(rate) {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    this.primaryAudio.playbackRate = clamped;
    usePlayerStore.getState().setPlaybackRate(clamped);
  }

  // ─── Equaliser ─────────────────────────────────────────────────────────────

  /**
   * Set a single EQ band gain.
   * @param {number} bandIndex - 0–4
   * @param {number} gainDb    - ±12 dB
   */
  setEQBand(bandIndex, gainDb) {
    if (!this._eqChain) {
      audioLogger.warn('engine', 'setEQBand called before pipeline initialised');
      return;
    }
    this._eqChain.setBandGain(bandIndex, gainDb);
  }

  /**
   * Set all 5 EQ bands at once.
   * @param {number[]} gains - Array of 5 dB values
   */
  setEQBands(gains) {
    if (!this._eqChain) {
      audioLogger.warn('engine', 'setEQBands called before pipeline initialised');
      return;
    }
    this._eqChain.setAllGains(gains);
  }

  /**
   * Reset all EQ bands to 0 dB.
   */
  resetEQ() {
    this._eqChain?.resetEQ();
  }

  /**
   * Return the current EQ band gains.
   * @returns {number[]} Array of 5 dB values, or empty if not ready.
   */
  getEQBandGains() {
    return this._eqChain?.getBandGains() ?? [];
  }

  // ─── Waveform / Visualisation ───────────────────────────────────────────────

  /**
   * Fill the provided Uint8Array with current time-domain waveform data
   * from the AnalyserNode.
   *
   * Designed for use inside a requestAnimationFrame loop — uses a pre-
   * allocated internal buffer and copies into the caller's array to avoid
   * allocation pressure.
   *
   * @param {Uint8Array} outBuffer - Caller-provided buffer to write into.
   *   Must be sized to analyserNode.frequencyBinCount (= fftSize / 2 = 1024).
   */
  getTimeDomainData(outBuffer) {
    if (!this._analyserNode || !this._timeDomainBuffer) return;
    this._analyserNode.getByteTimeDomainData(this._timeDomainBuffer);
    if (outBuffer instanceof Uint8Array) {
      outBuffer.set(this._timeDomainBuffer.subarray(0, outBuffer.length));
    }
  }

  /**
   * Fill the provided Uint8Array with current frequency-domain data.
   * @param {Uint8Array} outBuffer
   */
  getFrequencyData(outBuffer) {
    if (!this._analyserNode || !this._frequencyBuffer) return;
    this._analyserNode.getByteFrequencyData(this._frequencyBuffer);
    if (outBuffer instanceof Uint8Array) {
      outBuffer.set(this._frequencyBuffer.subarray(0, outBuffer.length));
    }
  }

  /**
   * Return the AnalyserNode directly for advanced consumers that need
   * raw access (e.g. a canvas-based spectrum analyser).
   * @returns {AnalyserNode|null}
   */
  getAnalyserNode() {
    return this._analyserNode;
  }

  /**
   * Return the number of frequency bins available from the analyser.
   * @returns {number}
   */
  get analyserBinCount() {
    return this._analyserNode?.frequencyBinCount ?? 0;
  }

  // ─── Media Session ──────────────────────────────────────────────────────────

  /**
   * Update the OS media session with track metadata and attach transport handlers.
   *
   * @param {{ title: string, artist?: string, album?: string, artworkUrl?: string }} meta
   * @param {{ onNext: Function, onPrev: Function }} handlers
   */
  updateMediaSession(meta, handlers = {}) {
    setMediaSessionMetadata(meta);
    setMediaSessionHandlers({
      onPlay:    () => this.play(),
      onPause:   () => this.pause(),
      onNext:    handlers.onNext  ?? (() => {}),
      onPrev:    handlers.onPrev  ?? (() => {}),
      onSeekTo:  (details) => {
        if (details?.seekTime != null) this.seekToSeconds(details.seekTime);
      },
    });
  }

  // ─── State accessors ────────────────────────────────────────────────────────

  /** @returns {boolean} */
  get isPlaying() {
    return !this.primaryAudio.paused && !this.primaryAudio.ended;
  }

  /** @returns {boolean} */
  get isPipelineReady() {
    return this._pipelineReady;
  }

  /** @returns {EQChain|null} */
  get eqChain() {
    return this._eqChain;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Tear down the engine completely. Intended for testing / HMR only.
   * In production the singleton lives for the application's entire lifetime.
   */
  destroy() {
    audioLogger.info(EngineEvent.DESTROYED, 'AudioEngine.destroy() called');

    clearTimeout(this._stallTimer);

    this._removeEvents();
    clearMediaSession();

    // Pause and clear the audio elements
    try { this.primaryAudio.pause();   this.primaryAudio.src   = ''; } catch { /* ignore */ }
    try { this.secondaryAudio.pause(); this.secondaryAudio.src = ''; } catch { /* ignore */ }

    // Disconnect all nodes
    try { this._primarySourceNode?.disconnect(); } catch { /* ignore */ }
    try { this._eqChain?.disconnect();           } catch { /* ignore */ }
    try { this._analyserNode?.disconnect();      } catch { /* ignore */ }
    try { this._gainNode?.disconnect();          } catch { /* ignore */ }

    this._primarySourceNode = null;
    this._eqChain           = null;
    this._analyserNode      = null;
    this._gainNode          = null;
    this._pipelineReady     = false;

    // Reset store
    usePlayerStore.getState().setAudioReady(false);
    usePlayerStore.getState().setInitialized(false);

    AudioEngine._instance = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Event binding
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register all HTMLAudioElement event listeners on the primary audio element.
   * Stored as bound methods so they can be removed precisely later.
   * Called once during construction.
   * @private
   */
  _bindEvents() {
    if (this._listenersBound) {
      audioLogger.warn('engine', '_bindEvents called more than once — skipping');
      return;
    }

    const audio = this.primaryAudio;

    // Store each handler so _removeEvents() can remove the exact same reference
    this._handlers = {
      onPlay:           this._onPlay.bind(this),
      onPause:          this._onPause.bind(this),
      onEnded:          this._onEnded.bind(this),
      onTimeUpdate:     this._onTimeUpdate.bind(this),
      onDurationChange: this._onDurationChange.bind(this),
      onPlaying:        this._onPlaying.bind(this),
      onWaiting:        this._onWaiting.bind(this),
      onStalled:        this._onStalled.bind(this),
      onSuspend:        this._onSuspend.bind(this),
      onSeeking:        this._onSeeking.bind(this),
      onSeeked:         this._onSeeked.bind(this),
      onVolumeChange:   this._onVolumeChange.bind(this),
      onRateChange:     this._onRateChange.bind(this),
      onError:          this._onError.bind(this),
      onCanPlay:        this._onCanPlay.bind(this),
      onLoadedMetadata: this._onLoadedMetadata.bind(this),
    };

    audio.addEventListener(AudioEvent.PLAY,            this._handlers.onPlay);
    audio.addEventListener(AudioEvent.PAUSE,           this._handlers.onPause);
    audio.addEventListener(AudioEvent.ENDED,           this._handlers.onEnded);
    audio.addEventListener(AudioEvent.TIME_UPDATE,     this._handlers.onTimeUpdate);
    audio.addEventListener(AudioEvent.DURATION_CHANGE, this._handlers.onDurationChange);
    audio.addEventListener(AudioEvent.PLAYING,         this._handlers.onPlaying);
    audio.addEventListener(AudioEvent.WAITING,         this._handlers.onWaiting);
    audio.addEventListener(AudioEvent.STALLED,         this._handlers.onStalled);
    audio.addEventListener(AudioEvent.SUSPEND,         this._handlers.onSuspend);
    audio.addEventListener(AudioEvent.SEEKING,         this._handlers.onSeeking);
    audio.addEventListener(AudioEvent.SEEKED,          this._handlers.onSeeked);
    audio.addEventListener(AudioEvent.VOLUME_CHANGE,   this._handlers.onVolumeChange);
    audio.addEventListener(AudioEvent.RATE_CHANGE,     this._handlers.onRateChange);
    audio.addEventListener(AudioEvent.ERROR,           this._handlers.onError);
    audio.addEventListener(AudioEvent.CAN_PLAY,        this._handlers.onCanPlay);
    audio.addEventListener(AudioEvent.LOADED_METADATA, this._handlers.onLoadedMetadata);

    this._listenersBound = true;
    audioLogger.log(EngineEvent.LISTENERS_BOUND, 'Audio event listeners registered');
  }

  /**
   * Remove all previously bound event listeners from the primary audio element.
   * @private
   */
  _removeEvents() {
    if (!this._listenersBound) return;

    const audio = this.primaryAudio;
    const h     = this._handlers;

    audio.removeEventListener(AudioEvent.PLAY,            h.onPlay);
    audio.removeEventListener(AudioEvent.PAUSE,           h.onPause);
    audio.removeEventListener(AudioEvent.ENDED,           h.onEnded);
    audio.removeEventListener(AudioEvent.TIME_UPDATE,     h.onTimeUpdate);
    audio.removeEventListener(AudioEvent.DURATION_CHANGE, h.onDurationChange);
    audio.removeEventListener(AudioEvent.PLAYING,         h.onPlaying);
    audio.removeEventListener(AudioEvent.WAITING,         h.onWaiting);
    audio.removeEventListener(AudioEvent.STALLED,         h.onStalled);
    audio.removeEventListener(AudioEvent.SUSPEND,         h.onSuspend);
    audio.removeEventListener(AudioEvent.SEEKING,         h.onSeeking);
    audio.removeEventListener(AudioEvent.SEEKED,          h.onSeeked);
    audio.removeEventListener(AudioEvent.VOLUME_CHANGE,   h.onVolumeChange);
    audio.removeEventListener(AudioEvent.RATE_CHANGE,     h.onRateChange);
    audio.removeEventListener(AudioEvent.ERROR,           h.onError);
    audio.removeEventListener(AudioEvent.CAN_PLAY,        h.onCanPlay);
    audio.removeEventListener(AudioEvent.LOADED_METADATA, h.onLoadedMetadata);

    this._handlers       = {};
    this._listenersBound = false;

    audioLogger.log(EngineEvent.LISTENERS_REMOVED, 'Audio event listeners removed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Event handlers
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _onPlay() {
    this._updateStore({ isPlaying: true });
    setMediaSessionPlaybackState('playing');
    audioLogger.log('event', 'play');
  }

  /** @private */
  _onPause() {
    this._updateStore({ isPlaying: false });
    setMediaSessionPlaybackState('paused');
    audioLogger.log('event', 'pause');
  }

  /** @private */
  _onEnded() {
    this._updateStore({ isPlaying: false, progress: 100 });
    setMediaSessionPlaybackState('paused');
    audioLogger.log('event', 'ended');
  }

  /** @private */
  _onTimeUpdate() {
    const audio = this.primaryAudio;
    const dur   = audio.duration;
    const cur   = audio.currentTime || 0;

    const duration = (!isNaN(dur) && isFinite(dur)) ? dur : 0;
    const progress = duration > 0 ? (cur / duration) * 100 : 0;

    this._updateStore({
      elapsed:  Math.floor(cur),
      duration: Math.floor(duration),
      progress,
    });

    // Update Media Session position state for lock-screen progress indicator
    if (duration > 0) {
      setMediaSessionPositionState({
        duration,
        playbackRate: audio.playbackRate,
        position:     cur,
      });
    }
  }

  /** @private */
  _onDurationChange() {
    const audio = this.primaryAudio;
    const dur   = audio.duration;
    if (!isNaN(dur) && isFinite(dur)) {
      this._updateStore({ duration: Math.floor(dur) });
    }
  }

  /** @private */
  _onPlaying() {
    // 'playing' fires when buffering resolves and playback actually starts
    this._updateStore({ isBuffering: false, isPlaying: true });
    clearTimeout(this._stallTimer);
    audioLogger.log(EngineEvent.BUFFERING_END, 'Buffering ended — playing');
  }

  /** @private */
  _onWaiting() {
    this._updateStore({ isBuffering: true });
    audioLogger.log(EngineEvent.BUFFERING, 'Waiting — buffering…');
  }

  /** @private */
  _onStalled() {
    audioLogger.warn(EngineEvent.STALL, 'Network stall detected');

    clearTimeout(this._stallTimer);

    // ── Phase 2: Delegate to StallRecovery if available ──────────────────────
    // The delegate implements the full 3-level recovery sequence.
    if (this._stallRecoveryDelegate && typeof this._stallRecoveryDelegate.onStall === 'function') {
      this._stallRecoveryDelegate.onStall();
      return;
    }

    // ── Fallback: basic built-in recovery (Phase 1 behaviour) ────────────────
    // Give the browser STALL_RECOVERY_DELAY_MS before force-reloading.
    // This path is only taken if PlaybackEngine has not been initialised.
    this._stallTimer = setTimeout(() => {
      const audio = this.primaryAudio;
      if (audio.paused) return; // User paused — don't reload

      const stalledSrc  = audio.src;
      const stalledTime = audio.currentTime || 0;

      audioLogger.warn(EngineEvent.STALL, 'Force-reloading stalled track', stalledSrc.slice(-60));

      const onRecovery = () => {
        audio.removeEventListener(AudioEvent.CAN_PLAY, onRecovery);
        if (stalledTime > 2) {
          try { audio.currentTime = stalledTime; } catch { /* ignore */ }
        }
        audio.play().catch(err => this._handlePlayError(err));
      };

      audio.addEventListener(AudioEvent.CAN_PLAY, onRecovery);
      audio.load();
    }, STALL_RECOVERY_DELAY_MS);
  }

  /** @private */
  _onSuspend() {
    audioLogger.log('event', 'suspend');
  }

  /** @private */
  _onSeeking() {
    audioLogger.log('event', 'seeking');
  }

  /** @private */
  _onSeeked() {
    const cur = this.primaryAudio.currentTime;
    const dur = this.primaryAudio.duration;
    const progress = (dur > 0) ? (cur / dur) * 100 : 0;
    this._updateStore({ elapsed: Math.floor(cur), progress });
    audioLogger.log(EngineEvent.SEEK, `Seeked to ${cur.toFixed(2)}s`);
  }

  /** @private */
  _onVolumeChange() {
    const { volume, muted } = this.primaryAudio;
    this._updateStore({ volume, isMuted: muted });
  }

  /** @private */
  _onRateChange() {
    this._updateStore({ playbackRate: this.primaryAudio.playbackRate });
  }

  /** @private */
  _onCanPlay() {
    // Track is now buffered enough to play — nothing to do in the engine;
    // callers that listen for canplay attach their own one-shot listeners.
    audioLogger.log('event', 'canplay');
  }

  /** @private */
  _onLoadedMetadata() {
    const dur = this.primaryAudio.duration;
    if (!isNaN(dur) && isFinite(dur)) {
      this._updateStore({ duration: Math.floor(dur) });
    }
    audioLogger.log('event', 'loadedmetadata', { duration: dur });
  }

  /** @private */
  _onError(event) {
    const err   = event?.target?.error;
    const code  = err?.code;
    const msg   = err?.message || 'Unknown media error';

    // MediaError codes:
    //   1 = MEDIA_ERR_ABORTED      — fetch aborted by user
    //   2 = MEDIA_ERR_NETWORK      — network error
    //   3 = MEDIA_ERR_DECODE       — decoding error
    //   4 = MEDIA_ERR_SRC_NOT_SUPPORTED — format / URL not supported

    const description = {
      1: 'Fetch aborted',
      2: 'Network error',
      3: 'Decoding error',
      4: 'Source not supported',
    }[code] ?? `Unknown error (code ${code})`;

    audioLogger.error(EngineEvent.ERROR, `Media error: ${description} — ${msg}`, { code, msg });

    this._updateStore({ isPlaying: false, isBuffering: false });
    clearTimeout(this._stallTimer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a play() promise rejection gracefully.
   * @private
   * @param {Error} err
   */
  _handlePlayError(err) {
    if (err?.name === 'AbortError') {
      // Benign — happens when src changes before play() resolves
      audioLogger.log('engine', 'play() aborted (src changed)');
    } else if (err?.name === 'NotAllowedError') {
      audioLogger.warn('engine', 'Autoplay blocked by browser policy', err.message);
    } else {
      audioLogger.error('engine', 'play() failed', err.message);
    }
    this._updateStore({ isPlaying: false });
  }

  /**
   * Batch-update the Zustand player store.
   * Only the keys present in the patch object are updated.
   * @private
   * @param {Partial<import('../store/playerStore').PlayerState>} patch
   */
  _updateStore(patch) {
    const store = usePlayerStore.getState();

    if (patch.isPlaying    !== undefined) store.setPlaying(patch.isPlaying);
    if (patch.isBuffering  !== undefined) store.setBuffering(patch.isBuffering);
    if (patch.isMuted      !== undefined) store.setMuted(patch.isMuted);
    if (patch.progress     !== undefined) store.setProgress(patch.progress);
    if (patch.elapsed      !== undefined) store.setElapsed(patch.elapsed);
    if (patch.duration     !== undefined) store.setDuration(patch.duration);
    if (patch.volume       !== undefined) store.setVolume(patch.volume);
    if (patch.playbackRate !== undefined) store.setPlaybackRate(patch.playbackRate);
  }
}

// ─── Singleton guard ──────────────────────────────────────────────────────────
AudioEngine._instance = null;

// ─── Export the single instance ───────────────────────────────────────────────
/**
 * The global AudioEngine singleton.
 * Import and use this directly — never call `new AudioEngine()`.
 */
export const audioEngine = new AudioEngine();
