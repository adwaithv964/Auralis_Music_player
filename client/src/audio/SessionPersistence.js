/**
 * audio/SessionPersistence.js
 *
 * Automatic playback session save and restore for the Auralis playback engine.
 *
 * Replaces and extends the ad-hoc localStorage logic previously scattered
 * across PlayerContext.jsx. All persistence operations are consolidated here.
 *
 * ─── Persisted data ──────────────────────────────────────────────────────────
 *
 *   auralis:session  (primary — consolidated key)
 *   {
 *     currentSong:   { ...songSnapshot },
 *     queue:         [...],        // manual up-next queue
 *     activeQueue:   [...],        // base track list (lightweight: id, title, artist only)
 *     queueIndex:    0,
 *     repeatMode:    'none',
 *     shuffleMode:   false,
 *     volume:        0.62,
 *     playbackRate:  1.0,
 *     positionSec:   0,
 *     savedAt:       1234567890,
 *     // Stream URL cache (for instant restore of CDN streams):
 *     streamUrl:     'https://...',
 *     streamSavedAt: 1234567890,
 *   }
 *
 * ─── Session validity ─────────────────────────────────────────────────────────
 *
 *   Session TTL:       24 hours  (configurable)
 *   Stream URL TTL:    90 seconds (YouTube/Saavn CDN links expire quickly)
 *
 * ─── Backward compatibility ──────────────────────────────────────────────────
 *
 *   Legacy keys (auralis:lastTrack, auralis:lastPosition, auralis:streamCache)
 *   are read during migration on first load, then migrated into the new key.
 *   The new consolidated key is always written going forward.
 *
 * ─── Restore behaviour ───────────────────────────────────────────────────────
 *
 *   Do NOT autoplay after restore. Set all state and let the user resume.
 *   Stream URL is usable as previewUrl only if savedAt < 90s ago.
 *
 * Usage:
 *   import { sessionPersistence } from './SessionPersistence';
 *   sessionPersistence.save(store);     // call periodically + on unload
 *   const session = sessionPersistence.restore();  // call on app init
 *   sessionPersistence.clear();
 */

import { audioLogger }   from './AudioLogger';
import { PlaybackEvent } from './PlaybackEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Primary storage key for the consolidated session object. */
const SESSION_KEY = 'auralis:session';

/** Legacy keys — read once for migration, then deprecated. */
const LEGACY_TRACK_KEY  = 'auralis:lastTrack';
const LEGACY_POS_KEY    = 'auralis:lastPosition';
const LEGACY_STREAM_KEY = 'auralis:streamCache';

/** Session validity window: 24 hours. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Stream URL validity window: 90 seconds (CDN links expire fast). */
const STREAM_URL_TTL_MS = 90_000;

/**
 * Maximum number of tracks to persist in activeQueue.
 * Large queues (1000+ tracks) would bloat localStorage.
 */
const MAX_ACTIVE_QUEUE_PERSIST = 200;

/**
 * Maximum number of tracks to persist in the manual up-next queue.
 */
const MAX_QUEUE_PERSIST = 50;

// ─── SessionPersistence class ─────────────────────────────────────────────────

class SessionPersistence {
  constructor() {
    /** Interval handle for periodic saves during playback */
    this._saveInterval = null;

    /** Unload handler reference for precise removal */
    this._onBeforeUnload = null;

    /** Whether legacy keys have been migrated this session */
    this._migrated = false;

    audioLogger.log('session', 'SessionPersistence initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save the current playback session to localStorage.
   * Collects state from the Zustand store + the primary audio element.
   *
   * @param {Object} store        - playerStore.getState()
   * @param {HTMLAudioElement} audio - audioEngine.primaryAudio
   */
  save(store, audio) {
    if (!store) return;

    const positionSec = audio ? Math.floor(audio.currentTime || 0) : 0;

    try {
      const session = {
        // Current track snapshot (lightweight — only what's needed for restore)
        currentSong: store.currentSong ? this._songSnapshot(store.currentSong) : null,

        // Queues — capped to avoid localStorage bloat
        queue: (store.queue || []).slice(0, MAX_QUEUE_PERSIST).map(s => this._songSnapshot(s)),
        activeQueue: (store.activeQueue || []).slice(0, MAX_ACTIVE_QUEUE_PERSIST).map(s => this._songSnapshot(s)),

        // Navigation state
        queueIndex: store.queueIndex ?? 0,

        // Playback modes
        repeatMode:  store.repeatMode  ?? 'none',
        shuffleMode: store.shuffleMode ?? false,

        // Audio settings
        volume:       store.volume       ?? 0.62,
        playbackRate: store.playbackRate ?? 1.0,

        // Position
        positionSec,

        // Timestamp
        savedAt: Date.now(),

        // Stream URL — only save if currently loaded and playing
        ...(this._shouldCacheStream(audio, store.currentSong)
          ? { streamUrl: audio.src, streamSavedAt: Date.now() }
          : {}),
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      audioLogger.log(PlaybackEvent.SESSION_SAVED, `Session saved — pos: ${positionSec}s`);

    } catch (err) {
      // localStorage may be full or unavailable (private browsing)
      audioLogger.warn('session', 'Failed to save session', err);
    }
  }

  /**
   * Restore a saved session from localStorage.
   *
   * @returns {{ session: Object, isValid: boolean, hasLiveStream: boolean } | null}
   *   Returns null if no valid session exists.
   */
  restore() {
    try {
      // ── Try primary key ──────────────────────────────────────────────────
      let raw = localStorage.getItem(SESSION_KEY);

      // ── Fall back to legacy migration ─────────────────────────────────────
      if (!raw) {
        const migrated = this._migrateLegacy();
        if (migrated) raw = JSON.stringify(migrated);
      }

      if (!raw) {
        audioLogger.log(PlaybackEvent.SESSION_SKIPPED, 'No saved session found');
        return null;
      }

      const session = JSON.parse(raw);
      if (!session) return null;

      // ── Validate TTL ──────────────────────────────────────────────────────
      const age = Date.now() - (session.savedAt || 0);
      if (age > SESSION_TTL_MS) {
        audioLogger.info(PlaybackEvent.SESSION_SKIPPED, `Session expired (${Math.floor(age / 3600000)}h old)`);
        this.clear();
        return null;
      }

      // ── Check stream URL freshness ────────────────────────────────────────
      const streamAge = session.streamUrl
        ? Date.now() - (session.streamSavedAt || 0)
        : Infinity;
      const hasLiveStream = streamAge < STREAM_URL_TTL_MS && !!session.streamUrl;

      audioLogger.info(PlaybackEvent.SESSION_RESTORED, `Session restored — ${Math.floor(age / 1000)}s old`, {
        song:         session.currentSong?.title,
        positionSec:  session.positionSec,
        hasLiveStream,
        queueLength:  session.activeQueue?.length ?? 0,
      });

      return { session, isValid: true, hasLiveStream };

    } catch (err) {
      audioLogger.warn('session', 'Failed to restore session', err);
      return null;
    }
  }

  /**
   * Clear the stored session.
   * Called when the user logs out or explicitly clears playback history.
   */
  clear() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_TRACK_KEY);
      localStorage.removeItem(LEGACY_POS_KEY);
      localStorage.removeItem(LEGACY_STREAM_KEY);
      audioLogger.log(PlaybackEvent.SESSION_CLEARED, 'Session cleared');
    } catch { /* ignore */ }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-save management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the periodic auto-save interval and register the beforeunload handler.
   * Call this once when the player is first initialised.
   *
   * @param {Function} getState  - () => { store, audio } — called each interval
   * @param {number}   [intervalMs=5000]
   */
  startAutoSave(getState, intervalMs = 5_000) {
    this.stopAutoSave();

    // Periodic save (every 5 seconds during active playback)
    this._saveInterval = setInterval(() => {
      const { store, audio } = getState();
      if (audio && !audio.paused && store.currentSong) {
        this.save(store, audio);
      }
    }, intervalMs);

    // Save exact position + stream URL immediately before tab closes
    this._onBeforeUnload = () => {
      const { store, audio } = getState();
      this.save(store, audio);
    };

    window.addEventListener('beforeunload', this._onBeforeUnload);

    audioLogger.log('session', `Auto-save started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop the periodic auto-save and remove the beforeunload handler.
   * Call this on engine destroy.
   */
  stopAutoSave() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
      this._saveInterval = null;
    }

    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload);
      this._onBeforeUnload = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build a lightweight song snapshot suitable for storage.
   * Excludes blob URLs and large embedded data.
   * @private
   */
  _songSnapshot(song) {
    if (!song) return null;
    return {
      id:         song.id,
      title:      song.title,
      artist:     song.artist,
      album:      song.album,
      artworkUrl: song.artworkUrl,
      duration:   song.duration,
      genre:      song.genre,
      year:       song.year,
      color:      song.color,
      sourceType: song.sourceType,
      language:   song.language,
      // Include previewUrl only for non-expiring sources
      ...(this._isStableUrl(song) && song.previewUrl ? { previewUrl: song.previewUrl } : {}),
    };
  }

  /**
   * Return true if the song's previewUrl is a stable, non-expiring URL.
   * @private
   */
  _isStableUrl(song) {
    return song.sourceType === 'audius' || song.sourceType === 'local';
  }

  /**
   * Return true if the current audio src should be cached as a stream URL.
   * Only CDN stream URLs that are active and playing are worth caching.
   * @private
   */
  _shouldCacheStream(audio, currentSong) {
    if (!audio || !currentSong) return false;
    const src = audio.src;
    if (!src) return false;
    // Cache YouTube / Saavn CDN URLs and localhost dev streams
    return (
      src.includes('youtube') ||
      src.includes('googlevideo') ||
      src.includes('jiosaavn') ||
      src.includes('saavncdn') ||
      src.includes('localhost')
    );
  }

  /**
   * Attempt to migrate data from the three legacy localStorage keys into
   * the new consolidated session format.
   * @private
   * @returns {Object|null}
   */
  _migrateLegacy() {
    if (this._migrated) return null;
    this._migrated = true;

    try {
      const trackRaw  = localStorage.getItem(LEGACY_TRACK_KEY);
      const posRaw    = localStorage.getItem(LEGACY_POS_KEY);
      const streamRaw = localStorage.getItem(LEGACY_STREAM_KEY);

      if (!trackRaw) return null;

      const track      = JSON.parse(trackRaw);
      const positionSec = posRaw ? parseInt(posRaw, 10) : 0;

      let streamUrl    = null;
      let streamSavedAt = null;

      if (streamRaw) {
        const streamObj = JSON.parse(streamRaw);
        if (streamObj?.url && (Date.now() - (streamObj.savedAt || 0)) < STREAM_URL_TTL_MS) {
          streamUrl    = streamObj.url;
          streamSavedAt = streamObj.savedAt;
        }
      }

      const session = {
        currentSong:  track,
        queue:        [],
        activeQueue:  [],
        queueIndex:   0,
        repeatMode:   'none',
        shuffleMode:  false,
        volume:       0.62,
        playbackRate: 1.0,
        positionSec,
        savedAt:      Date.now(),
        ...(streamUrl ? { streamUrl, streamSavedAt } : {}),
      };

      audioLogger.log('session', 'Legacy session keys migrated to auralis:session');

      // Clean up legacy keys
      localStorage.removeItem(LEGACY_TRACK_KEY);
      localStorage.removeItem(LEGACY_POS_KEY);
      localStorage.removeItem(LEGACY_STREAM_KEY);

      return session;

    } catch (err) {
      audioLogger.warn('session', 'Legacy migration failed', err);
      return null;
    }
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const sessionPersistence = new SessionPersistence();
