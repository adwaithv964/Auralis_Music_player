/**
 * lyrics/LyricsCache.js
 *
 * In-memory LRU cache with per-entry TTL for the Auralis Lyrics Engine.
 *
 * Design goals:
 *   - O(1) get and set via Map (insertion-order preserves LRU seniority)
 *   - Fixed maximum entry count (MAX_SIZE) — never unbounded
 *   - Per-entry TTL: expired entries are treated as misses and silently evicted
 *   - Keyed by a compound string: `${songId}::${layer}` where layer is one of
 *     'original', 'translation', 'romanized'
 *   - Zero external dependencies
 *
 * Usage:
 *   import { lyricsCache } from './LyricsCache';
 *   lyricsCache.set('song123::original', parsedLyrics);
 *   const cached = lyricsCache.get('song123::original'); // null on miss / expiry
 */

import { audioLogger } from '../audio/AudioLogger';
import { LyricsEvent }  from './LyricsEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Maximum number of entries to hold simultaneously */
const MAX_SIZE = 100;

/** Default time-to-live per entry: 24 hours in milliseconds */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// ─── LyricsCache class ────────────────────────────────────────────────────────

/**
 * @template T
 * @typedef {{ data: T, expiresAt: number }} CacheEntry
 */

class LyricsCache {
  constructor() {
    /**
     * Internal Map — JS Maps preserve insertion order, which gives us LRU
     * eviction simply by deleting and re-inserting on access (move-to-end).
     * @type {Map<string, CacheEntry<*>>}
     */
    this._map = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieve a cached entry by key.
   * Returns null on a cache miss or if the entry has expired.
   *
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      audioLogger.log(LyricsEvent.CACHE_MISS, `Cache miss: ${key}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Expired — evict and report miss
      this._map.delete(key);
      audioLogger.log(LyricsEvent.CACHE_EVICTED, `TTL expired, evicted: ${key}`);
      return null;
    }

    // Move to end of Map (mark as most-recently-used)
    this._map.delete(key);
    this._map.set(key, entry);

    audioLogger.log(LyricsEvent.CACHE_HIT, `Cache hit: ${key}`);
    return entry.data;
  }

  /**
   * Store a value in the cache under the given key.
   * Evicts the least-recently-used entry if the cache is at capacity.
   *
   * @param {string} key
   * @param {*}      data    - Any serialisable value
   * @param {number} [ttlMs] - Override TTL in milliseconds (default: DEFAULT_TTL_MS)
   */
  set(key, data, ttlMs = DEFAULT_TTL_MS) {
    // If key already exists, remove it first so the re-insert moves it to end
    if (this._map.has(key)) {
      this._map.delete(key);
    }

    // Evict the oldest entry (first key in the Map) if at capacity
    if (this._map.size >= MAX_SIZE) {
      const oldestKey = this._map.keys().next().value;
      this._map.delete(oldestKey);
      audioLogger.log(LyricsEvent.CACHE_EVICTED, `LRU evicted: ${oldestKey}`);
    }

    this._map.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });

    audioLogger.log(LyricsEvent.CACHE_STORED, `Cache stored: ${key}`);
  }

  /**
   * Remove a specific entry from the cache.
   * @param {string} key
   * @returns {boolean} True if the key existed and was removed
   */
  invalidate(key) {
    const existed = this._map.delete(key);
    if (existed) {
      audioLogger.log(LyricsEvent.CACHE_EVICTED, `Cache invalidated: ${key}`);
    }
    return existed;
  }

  /**
   * Remove all entries for a given song ID across all layers.
   * @param {string} songId
   */
  invalidateSong(songId) {
    const prefix = `${songId}::`;
    for (const key of this._map.keys()) {
      if (key.startsWith(prefix)) {
        this._map.delete(key);
        audioLogger.log(LyricsEvent.CACHE_EVICTED, `Song cache purged: ${key}`);
      }
    }
  }

  /**
   * Check whether a non-expired entry exists for the given key.
   * Does not count as an access (does not move to end).
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const entry = this._map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clear all cached lyrics.
   */
  clear() {
    const size = this._map.size;
    this._map.clear();
    audioLogger.log(LyricsEvent.CACHE_EVICTED, `All ${size} cache entries cleared`);
  }

  /**
   * Return the number of currently-held (possibly expired) entries.
   * @returns {number}
   */
  get size() {
    return this._map.size;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Compound key helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build a canonical compound cache key.
   * @param {string} songId
   * @param {'original'|'translation'|'romanized'} [layer='original']
   * @returns {string}
   */
  static buildKey(songId, layer = 'original') {
    return `${songId}::${layer}`;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export { LyricsCache };
export const lyricsCache = new LyricsCache();
