/**
 * audio/StreamResolver.js
 *
 * Resilient, multi-stage stream URL resolver for the Auralis playback engine.
 *
 * Resolution priority order:
 *   1. In-memory URL cache (with configurable TTL per source type)
 *   2. Backend /api/saavn/stream endpoint  (primary)
 *   3. Backend /api/youtube/resolve endpoint (fallback)
 *   4. Failure — returns null, never throws
 *
 * Features:
 *   - URL cache keyed by song ID with per-entry TTL
 *   - Exponential backoff retries (3 attempts: 500ms / 1500ms / 4000ms)
 *   - AbortController per in-flight request — cancels stale requests on song change
 *   - cache invalidation for stall recovery (Level 3)
 *   - Fire-and-forget prefetch into cache without blocking playback
 *
 * Usage:
 *   import { streamResolver } from './StreamResolver';
 *
 *   const url = await streamResolver.resolve(song);
 *   if (!url) { // handle failure }
 *
 *   streamResolver.prefetchUrl(nextSong); // warm cache silently
 *   streamResolver.invalidate(songId);   // evict stale entry
 */

import { audioLogger } from './AudioLogger';
import { PlaybackEvent } from './PlaybackEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** TTL for resolved stream URLs in milliseconds.
 *  Saavn/YouTube CDN links typically expire after 6 hours.
 *  We use a conservative 5-hour TTL so we refresh before expiry. */
const STREAM_URL_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

/** Shorter TTL for Audius URLs (stable but good practice to refresh). */
const AUDIUS_URL_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Request timeout for each individual resolution attempt. */
const REQUEST_TIMEOUT_MS = 12_000; // 12 seconds

/** Retry delays between resolution attempts (exponential backoff). */
const RETRY_DELAYS_MS = [500, 1500, 4000];

/** Maximum total resolution attempts per song. */
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 4 total (1 + 3 retries)

// ─── CacheEntry shape ──────────────────────────────────────────────────────────
/**
 * @typedef {{ url: string, resolvedAt: number, ttl: number, sourceType: string }} CacheEntry
 */

// ─── StreamResolver class ─────────────────────────────────────────────────────

class StreamResolver {
  constructor() {
    /**
     * In-memory URL cache.
     * Key: song.id  →  Value: CacheEntry
     * @type {Map<string, CacheEntry>}
     */
    this._cache = new Map();

    /**
     * Active AbortControllers keyed by song.id.
     * Allows cancelling in-flight requests when the song changes.
     * @type {Map<string, AbortController>}
     */
    this._controllers = new Map();

    audioLogger.log('stream-resolver', 'StreamResolver initialised');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve the stream URL for a song, using the multi-stage priority pipeline.
   *
   * @param {Object} song  - Song object ({ id, title, artist, previewUrl, sourceType, … })
   * @returns {Promise<string|null>}  Resolved URL, or null on complete failure.
   */
  async resolve(song) {
    if (!song || !song.id) {
      audioLogger.warn('stream-resolver', 'resolve() called with invalid song', song);
      return null;
    }

    const songId = String(song.id);

    // ── Stage 1: Check in-memory cache ──────────────────────────────────────
    const cached = this._getFromCache(songId);
    if (cached) {
      audioLogger.info(PlaybackEvent.STREAM_CACHE_HIT, `Cache hit for "${song.title}"`, { songId });
      return cached;
    }

    // ── Stage 2: Direct URL (Audius / local / already-resolved) ─────────────
    if (this._isDirectPlayable(song)) {
      const url = song.previewUrl;
      const ttl = (song.sourceType === 'audius' || song.sourceType === 'local')
        ? AUDIUS_URL_TTL_MS
        : STREAM_URL_TTL_MS;
      this._setCache(songId, url, ttl, song.sourceType);
      audioLogger.info(PlaybackEvent.STREAM_RESOLVED, `Direct URL for "${song.title}"`, { sourceType: song.sourceType });
      return url;
    }

    // ── Stage 3: Network resolution (Saavn → YouTube fallback) ──────────────
    audioLogger.info(PlaybackEvent.STREAM_RESOLVING, `Resolving stream for "${song.title}"`, { songId });

    // Cancel any in-flight request for this song
    this._cancelInFlight(songId);

    const controller = new AbortController();
    this._controllers.set(songId, controller);

    try {
      const url = await this._resolveWithRetry(song, controller.signal);

      if (url) {
        this._setCache(songId, url, STREAM_URL_TTL_MS, 'resolved');
        audioLogger.info(PlaybackEvent.STREAM_RESOLVED, `Resolved stream for "${song.title}"`, { url: url.slice(0, 80) });
        return url;
      }

      audioLogger.warn(PlaybackEvent.STREAM_FAILED, `All resolution attempts failed for "${song.title}"`, { songId });
      return null;

    } catch (err) {
      if (err.name === 'AbortError') {
        audioLogger.log('stream-resolver', `Resolution cancelled for "${song.title}" (song changed)`);
      } else {
        audioLogger.error(PlaybackEvent.STREAM_FAILED, `Resolution error for "${song.title}"`, err);
      }
      return null;
    } finally {
      this._controllers.delete(songId);
    }
  }

  /**
   * Fire-and-forget prefetch — resolves and caches a stream URL for the next
   * song without blocking playback. Errors are suppressed silently.
   *
   * @param {Object} song
   */
  prefetchUrl(song) {
    if (!song?.id) return;
    // Don't re-prefetch if already cached
    if (this._getFromCache(String(song.id))) return;

    audioLogger.log(PlaybackEvent.PREFETCH_STARTED, `Prefetching URL for "${song.title}"`);

    this.resolve(song)
      .then(url => {
        if (url) {
          audioLogger.log(PlaybackEvent.PREFETCH_COMPLETED, `Prefetch done for "${song.title}"`);
        } else {
          audioLogger.log(PlaybackEvent.PREFETCH_FAILED, `Prefetch failed for "${song.title}"`);
        }
      })
      .catch(() => {
        // Silently absorbed — prefetch failure is non-critical
        audioLogger.log(PlaybackEvent.PREFETCH_FAILED, `Prefetch error for "${song.title}"`);
      });
  }

  /**
   * Invalidate a cached URL entry.
   * Called by StallRecovery Level 3 to force re-resolution of a stale URL.
   *
   * @param {string} songId
   */
  invalidate(songId) {
    const id = String(songId);
    if (this._cache.has(id)) {
      this._cache.delete(id);
      audioLogger.info(PlaybackEvent.STREAM_CACHE_INVALIDATED, `Cache invalidated for song ${id}`);
    }
    // Also cancel any in-flight request so we start fresh
    this._cancelInFlight(id);
  }

  /**
   * Cancel any in-flight resolution for a specific song.
   * Call this when the user changes track mid-resolution.
   *
   * @param {string} songId
   */
  cancel(songId) {
    this._cancelInFlight(String(songId));
  }

  /**
   * Cancel ALL in-flight resolutions (e.g. on engine destroy).
   */
  cancelAll() {
    this._controllers.forEach((ctrl, id) => {
      try { ctrl.abort(); } catch { /* ignore */ }
      audioLogger.log('stream-resolver', `Cancelled in-flight resolution for song ${id}`);
    });
    this._controllers.clear();
  }

  /**
   * Clear the entire URL cache.
   * Use sparingly — normally prefer per-entry invalidation.
   */
  clearCache() {
    this._cache.clear();
    audioLogger.log('stream-resolver', 'URL cache cleared');
  }

  /**
   * Return the number of entries currently in the cache (for diagnostics).
   * @returns {number}
   */
  get cacheSize() {
    return this._cache.size;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Resolution pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attempt to resolve a stream URL, retrying on failure with exponential backoff.
   *
   * @private
   * @param {Object}      song
   * @param {AbortSignal} signal
   * @returns {Promise<string|null>}
   */
  async _resolveWithRetry(song, signal) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Check if request was cancelled between retries
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      try {
        const url = await this._attemptResolution(song, signal);
        if (url) return url;
      } catch (err) {
        if (err.name === 'AbortError') throw err; // propagate cancellation immediately
        lastError = err;
        audioLogger.warn('stream-resolver', `Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for "${song.title}"`, err.message);
      }

      // Wait before retry (no wait after the last attempt)
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        audioLogger.log('stream-resolver', `Retry in ${delay}ms (attempt ${attempt + 2}/${MAX_ATTEMPTS})`);
        await this._delay(delay, signal);
      }
    }

    if (lastError) audioLogger.error('stream-resolver', 'All resolution attempts exhausted', lastError);
    return null;
  }

  /**
   * Single resolution attempt: try Saavn first, then YouTube fallback.
   *
   * @private
   * @param {Object}      song
   * @param {AbortSignal} signal
   * @returns {Promise<string|null>}
   */
  async _attemptResolution(song, signal) {
    // ── Primary: JioSaavn stream endpoint ─────────────────────────────────
    try {
      const saavnUrl = await this._fetchSaavn(song, signal);
      if (saavnUrl) return saavnUrl;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      audioLogger.log('stream-resolver', `Saavn failed for "${song.title}", trying YouTube fallback`, err.message);
    }

    // ── Fallback: YouTube resolve endpoint ────────────────────────────────
    try {
      const ytUrl = await this._fetchYouTube(song, signal);
      if (ytUrl) return ytUrl;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      audioLogger.log('stream-resolver', `YouTube fallback also failed for "${song.title}"`, err.message);
    }

    return null;
  }

  /**
   * Query the JioSaavn stream backend endpoint.
   *
   * @private
   * @param {Object}      song
   * @param {AbortSignal} signal
   * @returns {Promise<string|null>}
   */
  async _fetchSaavn(song, signal) {
    const params = new URLSearchParams({
      title:  song.title  || '',
      artist: song.artist || '',
    });

    const res = await this._fetchWithTimeout(
      `/api/saavn/stream?${params}`,
      { signal },
    );

    if (res.status === 404) {
      audioLogger.log('stream-resolver', `Saavn: track not found — "${song.title}"`);
      return null; // Not on Saavn — fall through to YouTube
    }

    if (!res.ok) {
      throw new Error(`Saavn responded with ${res.status}`);
    }

    const data = await res.json();
    return data?.streamUrl || null;
  }

  /**
   * Query the YouTube resolve backend endpoint.
   *
   * @private
   * @param {Object}      song
   * @param {AbortSignal} signal
   * @returns {Promise<string|null>}
   */
  async _fetchYouTube(song, signal) {
    const params = new URLSearchParams({
      title:  song.title  || '',
      artist: song.artist || '',
    });

    const res = await this._fetchWithTimeout(
      `/api/youtube/resolve?${params}`,
      { signal },
    );

    if (!res.ok) {
      throw new Error(`YouTube resolve responded with ${res.status}`);
    }

    const data = await res.json();
    return data?.streamUrl || data?.url || null;
  }

  /**
   * fetch() wrapper that enforces a hard timeout via an internal AbortController
   * merged with the caller's AbortSignal.
   *
   * @private
   */
  async _fetchWithTimeout(url, options = {}) {
    const timeoutCtrl = new AbortController();
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS);

    // Combine caller signal + timeout signal
    const combinedSignal = options.signal
      ? this._combinedSignal(options.signal, timeoutCtrl.signal)
      : timeoutCtrl.signal;

    try {
      return await fetch(url, { ...options, signal: combinedSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Return a signal that aborts when EITHER of the two input signals abort.
   * (AbortSignal.any() is not universally available yet, so we polyfill it.)
   *
   * @private
   * @param {AbortSignal} s1
   * @param {AbortSignal} s2
   * @returns {AbortSignal}
   */
  _combinedSignal(s1, s2) {
    // Use native AbortSignal.any() if available (Chrome 116+, Firefox 124+)
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any([s1, s2]);
    }

    // Polyfill: create a new controller and abort it when either signal aborts
    const ctrl = new AbortController();
    const abort = () => ctrl.abort();
    if (s1.aborted || s2.aborted) { ctrl.abort(); return ctrl.signal; }
    s1.addEventListener('abort', abort, { once: true });
    s2.addEventListener('abort', abort, { once: true });
    return ctrl.signal;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Cache helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return a cached URL if it exists and hasn't expired.
   * @private
   * @param {string} songId
   * @returns {string|null}
   */
  _getFromCache(songId) {
    const entry = this._cache.get(songId);
    if (!entry) return null;

    const age = Date.now() - entry.resolvedAt;
    if (age > entry.ttl) {
      this._cache.delete(songId);
      return null;
    }

    return entry.url;
  }

  /**
   * Store a resolved URL in the cache.
   * @private
   */
  _setCache(songId, url, ttl, sourceType = 'unknown') {
    this._cache.set(songId, {
      url,
      resolvedAt: Date.now(),
      ttl,
      sourceType,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check whether a song has a directly playable URL that doesn't need
   * server-side resolution (Audius, local, or already-resolved stream URL).
   *
   * @private
   * @param {Object} song
   * @returns {boolean}
   */
  _isDirectPlayable(song) {
    if (!song.previewUrl) return false;
    const type = song.sourceType;
    // Audius and local files have stable, permanent URLs
    if (type === 'audius' || type === 'local') return true;
    // Already resolved via JioSaavn/YouTube in a previous session or cache
    if (song.ytResolved || song.isFull) return true;
    // iTunes 30s preview URLs are stable
    if (type === 'itunes' && song.previewUrl && !song.previewUrl.includes('youtube')) return true;
    return false;
  }

  /**
   * Cancel an in-flight AbortController for a given song ID.
   * @private
   */
  _cancelInFlight(songId) {
    const ctrl = this._controllers.get(songId);
    if (ctrl) {
      try { ctrl.abort(); } catch { /* ignore */ }
      this._controllers.delete(songId);
    }
  }

  /**
   * Promise-based delay that is cancellable via an AbortSignal.
   * @private
   * @param {number}      ms
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  _delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const timer = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const streamResolver = new StreamResolver();
