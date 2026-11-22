/**
 * lyrics/LyricsEngine.js
 *
 * Central singleton orchestrator for the Auralis Lyrics Engine (Phase 4).
 *
 * ─── Responsibilities ─────────────────────────────────────────────────────────
 *
 *   1. Load lyrics for the current song via the provider chain
 *   2. Parse raw content via LyricsParser
 *   3. Cache results in memory (LyricsCache) and IndexedDB (LyricsStorage)
 *   4. Drive lyric synchronization via LyricsSync (requestAnimationFrame)
 *   5. Maintain the lyricsStore as the single source of truth for React
 *   6. Handle translation and romanized lyric layers
 *   7. Expose explicit public API for PlaybackEngine integration
 *   8. Never interfere with audio playback
 *
 * ─── Integration approach (dual mode) ────────────────────────────────────────
 *
 *   Event-driven (automatic):
 *     - Subscribes to audioEngine.primaryAudio DOM events:
 *         play, pause, seeked, ratechange, ended, loadstart
 *     - Subscribes to usePlayerStore for currentSong changes
 *     This ensures lyrics synchronize correctly in all playback scenarios
 *     without requiring PlaybackEngine modifications.
 *
 *   Explicit API (deterministic):
 *     - loadLyrics(song)    — called by PlaybackEngine.playSong()
 *     - clearLyrics()       — called by PlaybackEngine.stop() / clearQueue()
 *     - onSongChanged(song) — called by PlaybackEngine on track transitions
 *     - onPlaybackStarted() — called when play() succeeds
 *     - onPlaybackPaused()  — called by PlaybackEngine.pause()
 *     - onSeeked(seconds)   — called when user seeks
 *     These explicit hooks make the engine deterministic for crossfade,
 *     queue-advance, session restore, and future radio / autoplay modes.
 *
 * ─── Resolution pipeline (per song) ──────────────────────────────────────────
 *
 *   1. In-memory LyricsCache  → hit → skip to step 5
 *   2. IndexedDB LyricsStorage → hit → skip to step 5
 *   3. LyricsProviderManager.resolve(song) → provider chain
 *   4. Store in LyricsCache + LyricsStorage (async, non-blocking)
 *   5. lyricsParser.parseAuto(raw) → ParsedLyrics
 *   6. Write state to lyricsStore
 *   7. Start LyricsSync loop (synchronized type only)
 *
 * ─── Singleton export ─────────────────────────────────────────────────────────
 *
 *   import { lyricsEngine } from './LyricsEngine';
 *   lyricsEngine.loadLyrics(song);
 *
 * ─── PlaybackEngine integration example ──────────────────────────────────────
 *
 *   // In PlaybackEngine._executePlaySong(), after stream resolves:
 *   import { lyricsEngine } from '../lyrics/LyricsEngine';
 *   lyricsEngine.onSongChanged(song);
 *
 *   // In PlaybackEngine.pause():
 *   lyricsEngine.onPlaybackPaused();
 *
 *   // In PlaybackEngine.resume():
 *   lyricsEngine.onPlaybackStarted();
 */

import { audioEngine }            from '../audio/AudioEngine';
import { audioLogger }            from '../audio/AudioLogger';
import { AudioEvent }             from '../audio/AudioEvents';
import { usePlayerStore }         from '../store/playerStore';
import { useLyricsStore }         from '../store/lyricsStore';
import { lyricsParser }           from './LyricsParser';
import { lyricsCache, LyricsCache as _LyricsCache } from './LyricsCache';
import { lyricsStorage }          from './LyricsStorage';
import { lyricsProviderManager }  from './LyricsProvider';
import { LyricsSync }             from './LyricsSync';
import { LyricsEvent }            from './LyricsEvents';

// ─── JSDoc types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LyricLine
 * @property {number}   time          - Playback position in seconds (float); -1 for plain
 * @property {string}   text          - Display text (trimmed, UTF-8)
 * @property {string}   [translation] - Parallel translation (injected post-parse)
 * @property {string}   [romanized]   - Romanized text (injected post-parse)
 */

/**
 * @typedef {Object} LyricsMetadata
 * @property {string|null} artist
 * @property {string|null} title
 * @property {string|null} album
 * @property {string|null} by
 * @property {number}      offset - ms offset (already applied to line times)
 * @property {string|null} length
 */

/**
 * @typedef {Object} ParsedLyrics
 * @property {'synchronized'|'plain'|'instrumental'} type
 * @property {LyricLine[]}   lines
 * @property {LyricsMetadata} metadata
 * @property {string|null}   raw
 */

// ─── LyricsEngine class ───────────────────────────────────────────────────────

class LyricsEngine {
  constructor() {
    // ── Singleton guard ───────────────────────────────────────────────────────
    if (LyricsEngine._instance) {
      return LyricsEngine._instance;
    }
    LyricsEngine._instance = this;

    // ── Internal state ────────────────────────────────────────────────────────

    /**
     * The song ID that is currently being loaded or has been loaded.
     * Used as a stale-load guard — if the song changes mid-resolution,
     * we discard the result.
     * @type {string|null}
     */
    this._loadingSongId = null;

    /**
     * In-flight load promise — prevents duplicate concurrent resolutions
     * for the same song.
     * @type {Promise<void>|null}
     */
    this._loadPromise = null;

    /**
     * LyricsSync instance — one per session; reused across songs.
     * @type {LyricsSync}
     */
    this._sync = new LyricsSync();

    /**
     * Zustand store subscription unsubscribe function.
     * @type {Function|null}
     */
    this._storeUnsub = null;

    /**
     * Bound audio event handlers (stored for precise removal).
     */
    this._onAudioPlay     = this._handlePlay.bind(this);
    this._onAudioPause    = this._handlePause.bind(this);
    this._onAudioSeeked   = this._handleSeeked.bind(this);
    this._onAudioEnded    = this._handleEnded.bind(this);
    this._onAudioLoadStart = this._handleLoadStart.bind(this);

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    this._attachAudioListeners();
    this._subscribeToStore();

    audioLogger.info('lyrics-engine', 'LyricsEngine singleton initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Explicit integration (called by PlaybackEngine)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Primary entry point: load lyrics for a specific song.
   *
   * Called explicitly by PlaybackEngine.playSong() after stream resolution.
   * Also triggered automatically by the Zustand currentSong subscription as
   * a resilience fallback.
   *
   * @param {Object} song - Song object from playerStore.currentSong
   * @returns {Promise<void>}
   */
  async loadLyrics(song) {
    if (!this._isValidSong(song)) {
      audioLogger.log('lyrics-engine', 'loadLyrics() — invalid or null song, clearing');
      this.clearLyrics();
      return;
    }

    const songId = song.id;

    // Deduplication: if we're already loading this exact song, wait for it
    if (this._loadingSongId === songId && this._loadPromise) {
      audioLogger.log('lyrics-engine', `loadLyrics() — already loading "${song.title}", coalescing`);
      return this._loadPromise;
    }

    this._loadingSongId = songId;
    this._loadPromise   = this._executeLoad(song);

    return this._loadPromise;
  }

  /**
   * Clear all lyrics state and stop synchronization.
   * Called by PlaybackEngine.stop() / clearQueue() / queue advance.
   */
  clearLyrics() {
    this._sync.stop();
    this._loadingSongId = null;
    this._loadPromise   = null;
    useLyricsStore.getState().clearLyrics();
    audioLogger.log(LyricsEvent.LYRICS_CLEARED, 'Lyrics cleared');
  }

  /**
   * Notify the engine that the song has changed.
   *
   * Equivalent to loadLyrics(song), but named to match the explicit
   * PlaybackEngine notification API contract. Call this from
   * PlaybackEngine._executePlaySong() after the stream URL is resolved.
   *
   * @param {Object} song
   * @returns {Promise<void>}
   */
  onSongChanged(song) {
    audioLogger.log('lyrics-engine', `onSongChanged: "${song?.title}"`);
    // Clear sync immediately so stale lyrics don't show during load
    this._sync.stop();
    return this.loadLyrics(song);
  }

  /**
   * Notify the engine that playback has started (play / resume).
   * Restarts the sync loop if lyrics are already loaded.
   */
  onPlaybackStarted() {
    const store = useLyricsStore.getState();
    if (store.parsedLyrics?.type === 'synchronized') {
      this._startSync(store.parsedLyrics);
    }
  }

  /**
   * Notify the engine that playback has been paused.
   * Stops the rAF loop while preserving current line position.
   */
  onPlaybackPaused() {
    this._sync.stop();
  }

  /**
   * Notify the engine that the user has seeked to a new position.
   * Snaps the active lyric line immediately without waiting for rAF.
   *
   * @param {number} seconds - New playhead position in seconds
   */
  onSeeked(seconds) {
    this._sync.seek(seconds);
  }

  /**
   * Inject a translation layer into the currently loaded lyrics.
   *
   * Translations share the same timestamps as the original lyrics.
   * Each element in the translationLines array corresponds to the same
   * index in parsedLyrics.lines.
   *
   * @param {string[]} translationLines - Array of translated strings (parallel to lines[])
   * @param {string}   [language]       - BCP-47 language tag (e.g. 'en', 'hi')
   */
  setTranslation(translationLines, language = null) {
    if (!Array.isArray(translationLines)) return;
    useLyricsStore.getState().updateTranslation(translationLines, language);
    audioLogger.info(LyricsEvent.TRANSLATION_LOADED, `Translation loaded (${translationLines.length} lines, lang: ${language})`);
  }

  /**
   * Inject a romanized layer into the currently loaded lyrics.
   *
   * @param {string[]} romanizedLines - Array of romanized strings (parallel to lines[])
   */
  setRomanized(romanizedLines) {
    if (!Array.isArray(romanizedLines)) return;
    useLyricsStore.getState().updateRomanization(romanizedLines);
    audioLogger.info(LyricsEvent.ROMANIZED_LOADED, `Romanized lyrics loaded (${romanizedLines.length} lines)`);
  }

  /**
   * Register a custom lyrics provider.
   * Delegates to lyricsProviderManager.registerProvider().
   *
   * @param {import('./LyricsProvider').BaseLyricsProvider} provider
   */
  registerProvider(provider) {
    lyricsProviderManager.registerProvider(provider);
  }

  /**
   * Clean up all listeners and timers.
   * Call only when the app is being fully torn down.
   */
  destroy() {
    this._sync.destroy();
    this._detachAudioListeners();
    if (this._storeUnsub) {
      this._storeUnsub();
      this._storeUnsub = null;
    }
    audioLogger.info('lyrics-engine', 'LyricsEngine destroyed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Resolution pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Full lyrics resolution and synchronization startup pipeline.
   * @private
   */
  async _executeLoad(song) {
    const songId = song.id;
    const store  = useLyricsStore.getState();

    // Mark loading
    store.setLoading(true);
    store.clearLyrics(); // clear previous song's lyrics immediately
    this._sync.stop();

    try {
      // ── Step 1: In-memory cache ──────────────────────────────────────────
      const cacheKey = _LyricsCache.buildKey(songId);
      let parsed     = lyricsCache.get(cacheKey);

      if (parsed) {
        audioLogger.info(LyricsEvent.CACHE_HIT, `Memory cache hit: "${song.title}"`);
        return this._finalizeLyrics(song, parsed, 'memory-cache');
      }

      // ── Step 2: IndexedDB offline storage ───────────────────────────────
      const stored = await lyricsStorage.load(songId);
      if (stored) {
        // Warm the memory cache too
        lyricsCache.set(cacheKey, stored);
        return this._finalizeLyrics(song, stored, 'offline-storage');
      }

      // ── Stale check: has song changed since we started? ─────────────────
      if (!this._isCurrentSong(songId)) return;

      // ── Step 3: Provider chain ───────────────────────────────────────────
      const payload = await lyricsProviderManager.resolve(song);

      // Stale check after async network call
      if (!this._isCurrentSong(songId)) return;

      // ── Step 4: Parse ────────────────────────────────────────────────────
      if (payload.type === 'instrumental' || !payload.raw) {
        parsed = lyricsParser.emptyResult('instrumental', null);
      } else {
        try {
          parsed = lyricsParser.parseAuto(payload.raw);
        } catch (parseErr) {
          audioLogger.error(LyricsEvent.PARSE_ERROR, 'Parse failed — marking instrumental', parseErr);
          parsed = lyricsParser.emptyResult('instrumental', payload.raw);
        }
      }

      // ── Step 5: Persist (non-blocking) ──────────────────────────────────
      if (parsed.type !== 'instrumental') {
        lyricsCache.set(cacheKey, parsed);
        lyricsStorage.save(songId, parsed).catch(() => {}); // fire-and-forget
      }

      // ── Step 6: Finalize ─────────────────────────────────────────────────
      await this._finalizeLyrics(song, parsed, payload.provider);

    } catch (err) {
      if (!this._isCurrentSong(songId)) return; // lost the race — ignore
      audioLogger.error('lyrics-engine', 'Lyrics load pipeline failed', err);
      store.setLoading(false);
      // Do not throw — music playback must never be interrupted
    }
  }

  /**
   * Write final state to the store and start sync if applicable.
   * @private
   */
  _finalizeLyrics(song, parsed, provider) {
    // Stale guard
    if (!this._isCurrentSong(song.id)) return;

    const store = useLyricsStore.getState();

    const isInstrumental = parsed.type === 'instrumental';
    const hasLyrics      = !isInstrumental && parsed.lines.length > 0;

    store.setLyrics({
      lyrics:         parsed.raw,
      parsedLyrics:   parsed,
      hasLyrics,
      isInstrumental,
      isLoading:      false,
      provider,
      lastUpdated:    new Date().toISOString(),
      language:       null, // provider may set this in future
    });

    if (isInstrumental) {
      audioLogger.info(LyricsEvent.INSTRUMENTAL_DETECTED, `Instrumental track: "${song.title}" — sync skipped`);
      return;
    }

    audioLogger.info(LyricsEvent.LYRICS_LOADED, `Lyrics finalized: "${song.title}" (${parsed.type}, ${parsed.lines.length} lines, via ${provider})`);

    // Start sync only if audio is currently playing
    const audioEl = audioEngine?.primaryAudio;
    if (audioEl && !audioEl.paused && !audioEl.ended) {
      this._startSync(parsed);
    }
  }

  /**
   * Start or restart the sync loop.
   * @private
   */
  _startSync(parsedLyrics) {
    const audioEl = audioEngine?.primaryAudio;
    if (!audioEl) return;

    this._sync.stop(); // ensure no stale loop

    this._sync.start(audioEl, parsedLyrics, ({ activeIndex, activeLine, nextLine }) => {
      useLyricsStore.getState().setActiveLine({ activeIndex, activeLine, nextLine });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Audio event handlers
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _handlePlay() {
    const store = useLyricsStore.getState();
    if (store.parsedLyrics?.type === 'synchronized' && store.hasLyrics) {
      this._startSync(store.parsedLyrics);
    }
  }

  /** @private */
  _handlePause() {
    this._sync.stop();
  }

  /** @private */
  _handleSeeked() {
    const audioEl = audioEngine?.primaryAudio;
    if (audioEl) {
      this._sync.seek(audioEl.currentTime);
    }
  }

  /** @private */
  _handleEnded() {
    this._sync.stop();
  }

  /**
   * Called when a new source begins loading (loadstart).
   * Clear stale lyrics immediately so old lines don't flash.
   * @private
   */
  _handleLoadStart() {
    // Only clear if we don't already have a load in progress for a known song
    // (prevents clearing when AudioEngine just re-loads the same src after stall)
    const currentSong = usePlayerStore.getState().currentSong;
    if (!currentSong || currentSong.id !== this._loadingSongId) {
      this._sync.stop();
      useLyricsStore.getState().clearLyrics();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Listener management
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _attachAudioListeners() {
    const el = audioEngine?.primaryAudio;
    if (!el) return;
    el.addEventListener(AudioEvent.PLAY,       this._onAudioPlay);
    el.addEventListener(AudioEvent.PAUSE,      this._onAudioPause);
    el.addEventListener(AudioEvent.SEEKED,     this._onAudioSeeked);
    el.addEventListener(AudioEvent.ENDED,      this._onAudioEnded);
    el.addEventListener(AudioEvent.LOAD_START, this._onAudioLoadStart);
  }

  /** @private */
  _detachAudioListeners() {
    const el = audioEngine?.primaryAudio;
    if (!el) return;
    el.removeEventListener(AudioEvent.PLAY,       this._onAudioPlay);
    el.removeEventListener(AudioEvent.PAUSE,      this._onAudioPause);
    el.removeEventListener(AudioEvent.SEEKED,     this._onAudioSeeked);
    el.removeEventListener(AudioEvent.ENDED,      this._onAudioEnded);
    el.removeEventListener(AudioEvent.LOAD_START, this._onAudioLoadStart);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Zustand subscription
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to playerStore.currentSong changes as a resilience fallback.
   * This catches song changes that happen through any code path, not just
   * explicit PlaybackEngine notifications.
   * @private
   */
  _subscribeToStore() {
    this._storeUnsub = usePlayerStore.subscribe(
      (state) => state.currentSong,
      (currentSong, prevSong) => {
        // Only react to actual song changes (id change), not metadata-only updates
        if (!currentSong) {
          this.clearLyrics();
          return;
        }

        if (currentSong.id !== prevSong?.id) {
          audioLogger.log('lyrics-engine', `Store subscription: song changed to "${currentSong.title}"`);
          // Only trigger if not already loading this song via explicit API
          if (currentSong.id !== this._loadingSongId) {
            this.onSongChanged(currentSong);
          }
        }
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Guards
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _isValidSong(song) {
    return !!(song && song.id && (song.title || song.name));
  }

  /**
   * Returns true if songId still matches the most recently requested load.
   * Used to discard stale async results after a song change mid-resolution.
   * @private
   */
  _isCurrentSong(songId) {
    return this._loadingSongId === songId;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const lyricsEngine = new LyricsEngine();
