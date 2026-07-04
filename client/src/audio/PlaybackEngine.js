/**
 * audio/PlaybackEngine.js
 *
 * Central playback orchestration singleton for the Auralis music player.
 *
 * This is the PRIMARY entry point for all playback operations in Phase 2.
 * It coordinates every subsystem introduced in Phase 2:
 *
 *   AudioEngine        — raw audio hardware abstraction (Phase 1)
 *   StreamResolver     — multi-stage URL resolution
 *   QueueEngine        — immutable queue state machine
 *   PrefetchSystem     — gapless playback preparation
 *   StallRecovery      — 3-level network recovery
 *   SessionPersistence — save/restore playback session
 *   MediaSession       — OS transport controls
 *
 * ─── Full execution pipeline (playSong) ──────────────────────────────────────
 *
 *   1. Validate song object
 *   2. Cancel in-flight prefetch + stream resolution for previous song
 *   3. Abort any active stall recovery
 *   4. Resolve stream URL (StreamResolver — cache → Saavn → YouTube)
 *   5. Load URL into primary audio element (AudioEngine.loadTrack)
 *   6. Start playback (AudioEngine.play)
 *   7. Update QueueEngine + store (currentSong, history, queueIndex)
 *   8. Update Media Session metadata + transport handlers
 *   9. Reset + re-arm StallRecovery
 *  10. Reset + re-arm PrefetchSystem
 *  11. Save session to localStorage
 *  12. Log SONG_STARTED
 *
 * ─── Race condition prevention ────────────────────────────────────────────────
 *
 *   _playLock:     chains concurrent playSong() calls so they execute in order
 *   _currentSongId: stale-load guard — ignores URL resolution results for
 *                   songs that are no longer current
 *
 * ─── Singleton export ─────────────────────────────────────────────────────────
 *
 *   import { playbackEngine } from './PlaybackEngine';
 *   await playbackEngine.playSong(song);
 *   playbackEngine.next();
 *   playbackEngine.setRepeatMode('all');
 */

import { audioEngine }          from './AudioEngine';
import { streamResolver }       from './StreamResolver';
import { queueEngine }          from './QueueEngine';
import { prefetchSystem }       from './PrefetchSystem';
import { stallRecovery }        from './StallRecovery';
import { sessionPersistence }   from './SessionPersistence';
import { audioLogger }          from './AudioLogger';
import { AudioEvent }           from './AudioEvents';
import { PlaybackEvent }        from './PlaybackEvents';
import { EQEvent }              from './EQEvents';
import { usePlayerStore }       from '../store/playerStore';
import {
  setMediaSessionMetadata,
  setMediaSessionHandlers,
  setMediaSessionPlaybackState,
} from './MediaSession';

// ─── Phase 3 imports ────────────────────────────────────────────────────────────────────

import { eqEngine }              from './EQEngine';
import { audioQualityManager }   from './AudioQualityManager';
import { loudnessNormalizer }    from './LoudnessNormalizer';
import { audioSettingsPersistence } from './AudioSettingsPersistence';

// ─── PlaybackEngine class ─────────────────────────────────────────────────────

class PlaybackEngine {
  constructor() {
    // ── Singleton guard ───────────────────────────────────────────────────────
    if (PlaybackEngine._instance) {
      return PlaybackEngine._instance;
    }
    PlaybackEngine._instance = this;

    // ── Race condition / stale-load guards ─────────────────────────────────
    /**
     * Queued play promise — chains overlapping playSong() calls.
     * @type {Promise<void>}
     */
    this._playLock = Promise.resolve();

    /**
     * The ID of the song that was most recently requested to play.
     * Used to discard URL resolution results for songs that are no longer current.
     * @type {string|null}
     */
    this._currentSongId = null;

    // ── 'ended' handler (bound ref for precise removal) ────────────────────
    this._onEnded = this._handleEnded.bind(this);

    // ── Initialise subsystems ─────────────────────────────────────────────
    this._initSubsystems();

    audioLogger.info('playback-engine', 'PlaybackEngine singleton initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialisation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wire up all subsystems and register event hooks.
   * @private
   */
  _initSubsystems() {
    // Attach subsystems that need engine references
    stallRecovery.attach(
      audioEngine,
      streamResolver,
      () => usePlayerStore.getState().currentSong,
    );

    prefetchSystem.attach(audioEngine, streamResolver, queueEngine);

    // Register stall recovery delegate on AudioEngine
    // AudioEngine._onStalled will call this when a stall is detected
    audioEngine._stallRecoveryDelegate = () => stallRecovery.onStall();

    // Register a single 'ended' listener on the primary audio element
    // to auto-advance the queue. AudioEngine also fires _onEnded, but we
    // need this separate listener for queue logic.
    audioEngine.primaryAudio.addEventListener(AudioEvent.ENDED, this._onEnded);

    // Start session persistence auto-save
    sessionPersistence.startAutoSave(() => ({
      store: usePlayerStore.getState(),
      audio: audioEngine.primaryAudio,
    }));

    // ── Phase 3: Initialise audio quality and loudness subsystems ────────────────
    // EQEngine.init() is deferred until after the audio pipeline is ready
    // (called from play() on first gesture). audioQualityManager and
    // loudnessNormalizer can be initialised immediately since they only
    // read from localStorage and don't require the AudioContext.
    audioQualityManager.init();
    loudnessNormalizer.init();

    // Restore saved playback speed preference
    try {
      const settings = audioSettingsPersistence.load();
      if (settings.playbackRate && settings.playbackRate !== 1.0) {
        audioEngine.setPlaybackRate(settings.playbackRate);
        audioLogger.info(EQEvent.SPEED_CHANGED, `Speed restored: ${settings.playbackRate}x`);
      }
    } catch (err) {
      audioLogger.warn('playback-engine', 'Failed to restore playback speed', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Primary playback
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Play a specific song through the full execution pipeline.
   *
   * This is the single authoritative entry point for starting playback.
   * All other play paths (next, previous, queue drain) funnel through here.
   *
   * @param {Object} song - Song object with at minimum { id, title, artist, sourceType }
   * @returns {Promise<void>}
   */
  async playSong(song) {
    if (!this._isValidSong(song)) {
      audioLogger.warn('playback-engine', 'playSong() called with invalid song', song);
      return;
    }

    // Chain onto any in-progress play operation to prevent race conditions
    this._playLock = this._playLock.then(() => this._executePlaySong(song)).catch(err => {
      audioLogger.error('playback-engine', 'playSong() pipeline error', err);
    });

    return this._playLock;
  }

  /**
   * Pause playback.
   */
  pause() {
    audioEngine.pause();
    audioLogger.info(PlaybackEvent.SONG_PAUSED, 'Playback paused');
    setMediaSessionPlaybackState('paused');

    // Save position immediately on pause
    sessionPersistence.save(
      usePlayerStore.getState(),
      audioEngine.primaryAudio,
    );
  }

  /**
   * Resume playback (will init Web Audio pipeline if needed).
   * @returns {Promise<void>}
   */
  async resume() {
    await audioEngine.play();
    audioLogger.info(PlaybackEvent.SONG_RESUMED, 'Playback resumed');
    setMediaSessionPlaybackState('playing');
  }

  /**
   * Stop playback and reset position. Does not clear current song.
   */
  stop() {
    audioEngine.pause();
    try { audioEngine.primaryAudio.currentTime = 0; } catch { /* ignore */ }
    usePlayerStore.getState().resetPlaybackState();
    audioLogger.info(PlaybackEvent.SONG_STOPPED, 'Playback stopped');
  }

  /**
   * Seek to a percentage position (0–100).
   * @param {number} percentage
   */
  seek(percentage) {
    audioEngine.seek(percentage);
  }

  /**
   * Seek to an absolute position in seconds.
   * @param {number} seconds
   */
  seekToSeconds(seconds) {
    audioEngine.seekToSeconds(seconds);
  }

  /**
   * Restart the current track from the beginning.
   */
  restart() {
    audioEngine.seekToSeconds(0);
    audioLogger.log('playback-engine', 'Track restarted');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Queue navigation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Advance to the next song.
   * Drains the manual queue first, then follows repeatMode / shuffleMode.
   * @returns {Promise<void>}
   */
  async next() {
    const nextSong = queueEngine.next();

    if (!nextSong) {
      audioLogger.info('playback-engine', 'next(): end of queue, no repeat — stopping');
      this.stop();
      return;
    }

    audioLogger.info(PlaybackEvent.SONG_NEXT, `Next → "${nextSong.title}"`);
    return this.playSong(nextSong);
  }

  /**
   * Go to the previous song (or restart if >3s played).
   * @returns {Promise<void>}
   */
  async previous() {
    const currentTimeSec = audioEngine.primaryAudio.currentTime || 0;
    const prevSong = queueEngine.previous(currentTimeSec);

    if (!prevSong) {
      audioLogger.log('playback-engine', 'previous(): nothing to go back to');
      return;
    }

    // If same song returned (restart behaviour)
    const store = usePlayerStore.getState();
    if (prevSong.id === store.currentSong?.id) {
      this.restart();
      return;
    }

    audioLogger.info(PlaybackEvent.SONG_PREVIOUS, `Previous → "${prevSong.title}"`);
    return this.playSong(prevSong);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Queue management (delegates to QueueEngine)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the active base queue and optionally start playback.
   * @param {Object[]} tracks
   * @param {Object}   [startTrack]  - Track to play first (if null, starts at index 0)
   * @param {number}   [startIndex=0]
   */
  setActiveQueueAndPlay(tracks, startTrack, startIndex = 0) {
    if (!Array.isArray(tracks) || !tracks.length) return;

    // Find start index if startTrack is provided
    const idx = startTrack
      ? Math.max(0, tracks.findIndex(t => t.id === startTrack.id))
      : startIndex;

    queueEngine.setActiveQueue(tracks, idx);
    const songToPlay = startTrack || tracks[idx];
    if (songToPlay) this.playSong(songToPlay);
  }

  /** @param {Object} song */
  addToQueue(song) {
    queueEngine.addToQueue(song);
    // Cancel prefetch — queue changed
    prefetchSystem.cancel();
  }

  /** @param {Object} song */
  addToQueueNext(song) {
    queueEngine.addToQueueNext(song);
    prefetchSystem.cancel();
  }

  /** @param {number} index */
  removeFromQueue(index) {
    queueEngine.removeFromQueue(index);
    prefetchSystem.cancel();
  }

  clearQueue() {
    queueEngine.clearQueue();
    prefetchSystem.cancel();
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  moveQueueItem(from, to) {
    queueEngine.moveQueueItem(from, to);
  }

  /**
   * Non-destructive peek at the next song (for UI display).
   * @returns {Object|null}
   */
  peekNext() {
    return queueEngine.peekNext();
  }

  /**
   * Non-destructive peek at the previous song (for UI display).
   * @returns {Object|null}
   */
  peekPrevious() {
    return queueEngine.peekPrevious(audioEngine.primaryAudio.currentTime || 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Audio settings
  // ═══════════════════════════════════════════════════════════════════════════

  /** @param {number} volume - 0.0 to 1.0 */
  setVolume(volume) {
    audioEngine.setVolume(volume);
  }

  /**
   * Set the playback speed.
   * Supported rates: 0.5, 0.75, 1.0, 1.25, 1.5, 2.0
   * @param {number} rate
   */
  setPlaybackRate(rate) {
    audioEngine.setPlaybackRate(rate);
    // Persist the new speed preference
    audioSettingsPersistence.save({ playbackRate: rate });
    audioLogger.info(EQEvent.SPEED_CHANGED, `Playback speed: ${rate}x`);
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    audioEngine.setMuted(muted);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Phase 3: Equalizer & Audio Quality
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a named EQ preset.
   * @param {string} presetId - e.g. 'flat', 'bass-boost', 'vocal'
   */
  setEQPreset(presetId) {
    // Ensure EQEngine is initialised (safe to call multiple times)
    eqEngine.init();
    eqEngine.applyPreset(presetId);
  }

  /**
   * Set a single EQ band gain.
   * @param {number} bandIndex - 0–4
   * @param {number} gainDb    - ±12 dB
   */
  setEQBand(bandIndex, gainDb) {
    eqEngine.init();
    eqEngine.setBand(bandIndex, gainDb);
  }

  /**
   * Reset all EQ bands to flat (0 dB).
   */
  resetEQ() {
    eqEngine.init();
    eqEngine.resetAll();
  }

  /**
   * Return all available EQ presets (for UI preset pickers).
   * @returns {import('./EQEngine').EQPreset[]}
   */
  getEQPresets() {
    return eqEngine.getPresets();
  }

  /**
   * Set the stream quality preference.
   * Change takes effect on the next track load.
   * @param {string} tier - 'low' | 'normal' | 'high' | 'lossless'
   */
  setStreamQuality(tier) {
    audioQualityManager.setQuality(tier);
  }

  /**
   * Enable or disable loudness normalization.
   * @param {boolean} enabled
   */
  setLoudnessNormalization(enabled) {
    loudnessNormalizer.setEnabled(enabled);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Playback modes
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {'none'|'one'|'all'} mode
   */
  setRepeatMode(mode) {
    usePlayerStore.getState().setRepeatMode(mode);
    // Refresh prefetch when repeat mode changes (queue end behaviour changes)
    prefetchSystem.cancel();
    prefetchSystem.arm();
    audioLogger.info('playback-engine', `Repeat mode: ${mode}`);
  }

  /**
   * @param {boolean} enabled
   */
  setShuffleMode(enabled) {
    queueEngine.setShuffleMode(enabled);
    // Re-arm prefetch — shuffled next may differ
    prefetchSystem.cancel();
    prefetchSystem.arm();
    audioLogger.info('playback-engine', `Shuffle: ${enabled ? 'ON' : 'OFF'}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Session
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Restore a saved session on app startup.
   *
   * Populates store state and arms the engine for manual user resume.
   * Does NOT autoplay.
   *
   * @returns {Object|null} The restored song, or null if nothing to restore.
   */
  restoreSession() {
    const result = sessionPersistence.restore();
    if (!result) return null;

    const { session, hasLiveStream } = result;
    const store = usePlayerStore.getState();

    // Restore playback modes
    if (session.repeatMode)        store.setRepeatMode(session.repeatMode);
    if (session.shuffleMode != null) store.setShuffleMode(session.shuffleMode);

    // Restore audio settings
    if (session.volume != null) {
      store.setVolume(session.volume);
      audioEngine.setVolume(session.volume);
    }
    if (session.playbackRate != null) {
      store.setPlaybackRate(session.playbackRate);
      audioEngine.setPlaybackRate(session.playbackRate);
    }

    // Restore queue state
    if (Array.isArray(session.activeQueue) && session.activeQueue.length) {
      store.setActiveQueue(session.activeQueue);
      store.setQueueIndex(session.queueIndex ?? 0);
    }
    if (Array.isArray(session.queue) && session.queue.length) {
      store.setQueue(session.queue);
    }

    // Restore current song
    if (session.currentSong) {
      // If stream URL is fresh, attach it so the user can resume instantly
      const songToRestore = hasLiveStream
        ? { ...session.currentSong, previewUrl: session.streamUrl, ytResolved: true, isFull: true }
        : { ...session.currentSong };

      store.setCurrentSong(songToRestore);

      // Update Media Session with track metadata (but don't play)
      this._updateMediaSession(songToRestore);

      // Save restore position as a pending seek marker
      if (session.positionSec > 2) {
        store.setPendingSeekSec(session.positionSec);
      }

      audioLogger.info(PlaybackEvent.SESSION_RESTORED, `Restored "${songToRestore.title}" at ${session.positionSec}s`);
      return songToRestore;
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Tear down the entire playback engine.
   * Intended for testing / dev HMR — in production the singleton lives forever.
   */
  destroy() {
    audioLogger.info('playback-engine', 'PlaybackEngine.destroy() called');

    // Remove our 'ended' listener
    audioEngine.primaryAudio.removeEventListener(AudioEvent.ENDED, this._onEnded);

    // Stop subsystems
    prefetchSystem.cancel();
    stallRecovery.abort();
    sessionPersistence.stopAutoSave();
    streamResolver.cancelAll();

    // Tear down the underlying audio engine
    audioEngine.destroy();

    PlaybackEngine._instance = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Core pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The actual play pipeline — runs inside the _playLock chain.
   * @private
   */
  async _executePlaySong(song) {
    const songId = String(song.id);

    // ── Step 1: Cancel previous in-flight operations ───────────────────────
    if (this._currentSongId && this._currentSongId !== songId) {
      streamResolver.cancel(this._currentSongId);
    }
    prefetchSystem.cancel();
    stallRecovery.abort();

    this._currentSongId = songId;

    audioLogger.info('playback-engine', `▶ Playing "${song.title}"`, {
      id:         songId,
      sourceType: song.sourceType,
    });

    // ── Step 2: Resolve stream URL ────────────────────────────────────────
    let streamUrl = await streamResolver.resolve(song);

    // Stale-load guard — abort if the user already changed songs
    if (this._currentSongId !== songId) {
      audioLogger.log('playback-engine', `Stale load discarded for "${song.title}"`);
      return;
    }

    if (!streamUrl) {
      audioLogger.error('playback-engine', `Cannot play "${song.title}" — stream resolution failed`);
      usePlayerStore.getState().setCurrentSong({
        ...song,
        unavailable: true,
        previewUrl: '',
      });
      return;
    }

    // ── Phase 3: Decorate URL with quality parameter ──────────────────────────
    streamUrl = audioQualityManager.decorateUrl(streamUrl);

    // ── Step 3: Load into primary audio element ──────────────────────────────
    audioEngine.loadTrack(streamUrl);

    // ── Step 4: Start playback ────────────────────────────────────────────────────
    await audioEngine.play();

    // ── Phase 3: Ensure EQ engine is initialised (pipeline is now ready) ─────
    eqEngine.init();

    // Stale-load guard — check again after async play()
    if (this._currentSongId !== songId) return;

    // ── Step 5: Update queue + store ──────────────────────────────────────
    queueEngine.onSongStarted(song);
    usePlayerStore.getState().setCurrentSong(song);

    // ── Step 6: Apply any pending seek position (from session restore) ─────
    this._applyPendingSeek();

    // ── Step 7: Update Media Session ─────────────────────────────────────────
    this._updateMediaSession(song);

    // ── Phase 3: Apply loudness normalization for this track ─────────────────
    loudnessNormalizer.applyForSong(song);

    // ── Step 8: Reset + re-arm stall recovery ─────────────────────────────
    stallRecovery.reset();

    // ── Step 9: Reset + re-arm prefetch ───────────────────────────────────
    prefetchSystem.reset();
    prefetchSystem.arm();

    // ── Step 10: Save session ─────────────────────────────────────────────
    sessionPersistence.save(
      usePlayerStore.getState(),
      audioEngine.primaryAudio,
    );

    audioLogger.info(PlaybackEvent.SONG_STARTED, `"${song.title}" — playback started`, {
      id:     songId,
      artist: song.artist,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Event handlers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle the primary audio element's 'ended' event.
   * Auto-advances the queue according to repeatMode / shuffleMode.
   * @private
   */
  _handleEnded() {
    audioLogger.info(PlaybackEvent.SONG_ENDED, 'Track ended — auto-advancing');
    this.next().catch(err => {
      audioLogger.error('playback-engine', 'Auto-advance failed', err);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Media Session
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update OS media session metadata and bind transport handlers.
   * @private
   */
  _updateMediaSession(song) {
    try {
      setMediaSessionMetadata({
        title:      song.title      || '',
        artist:     song.artist     || '',
        album:      song.album      || '',
        artworkUrl: song.image?.[0]?.link || song.artworkUrl || song.image || '',
      });

      setMediaSessionHandlers({
        onPlay:     () => this.resume(),
        onPause:    () => this.pause(),
        onNext:     () => this.next(),
        onPrev:     () => this.previous(),
        onSeekTo:   (details) => {
          if (details?.seekTime != null) this.seekToSeconds(details.seekTime);
        },
        onSeekFwd:  (details) => {
          const skip = details?.seekOffset || 10;
          this.seekToSeconds((audioEngine.primaryAudio.currentTime || 0) + skip);
        },
        onSeekBwd:  (details) => {
          const skip = details?.seekOffset || 10;
          this.seekToSeconds(Math.max(0, (audioEngine.primaryAudio.currentTime || 0) - skip));
        },
      });

      audioLogger.log(EQEvent.MEDIA_SESSION_UPDATED, `Media Session updated: "${song.title}"`);
    } catch (err) {
      audioLogger.warn(EQEvent.MEDIA_SESSION_ERROR, 'Media Session update failed (non-fatal)', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a pending seek position stored in the player store (e.g. from session restore).
   * Clears the pending marker after use.
   * @private
   */
  _applyPendingSeek() {
    const store = usePlayerStore.getState();
    const pendingSec = store.pendingSeekSec;
    if (!pendingSec || pendingSec <= 2) {
      store.setPendingSeekSec(null);
      return;
    }

    const audio = audioEngine.primaryAudio;

    const doSeek = () => {
      try { audio.currentTime = pendingSec; } catch { /* ignore */ }
      store.setPendingSeekSec(null);
    };

    // If metadata is already loaded, seek immediately
    if (audio.readyState >= 1) {
      doSeek();
    } else {
      const onMeta = () => {
        audio.removeEventListener('loadedmetadata', onMeta);
        doSeek();
      };
      audio.addEventListener('loadedmetadata', onMeta);
    }
  }

  /**
   * Validate a song object has the minimum required fields.
   * @private
   * @param {*} song
   * @returns {boolean}
   */
  _isValidSong(song) {
    return (
      song != null &&
      typeof song === 'object' &&
      (song.id != null) &&
      (typeof song.title === 'string') &&
      !song.unavailable
    );
  }
}

// ─── Singleton guard ──────────────────────────────────────────────────────────
PlaybackEngine._instance = null;

// ─── Export the single instance ───────────────────────────────────────────────
/**
 * The global PlaybackEngine singleton.
 * Import and use this directly in PlayerContext and hooks.
 * Never call `new PlaybackEngine()` anywhere else.
 */
export const playbackEngine = new PlaybackEngine();
