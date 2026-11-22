/**
 * lyrics/LyricsStorage.js
 *
 * IndexedDB-backed persistent storage for offline lyric caching.
 *
 * Design goals:
 *   - Async, non-blocking — all operations return Promises
 *   - Graceful degradation: if IndexedDB is unavailable (private browsing,
 *     embedded WebView, SSR), all methods silently return null / false
 *   - Schema-versioned blobs: stored objects include a _version field so
 *     future format changes can invalidate stale entries without crashes
 *   - Keyed by songId (string) — one record per track
 *   - Serialises the full ParsedLyrics payload as JSON
 *
 * Database layout:
 *   DB name:       auralis-lyrics
 *   Store name:    lyrics
 *   Key path:      songId   (string — externally provided)
 *   Indexes:       savedAt  (number — for future TTL purging)
 *
 * Usage:
 *   import { lyricsStorage } from './LyricsStorage';
 *   await lyricsStorage.save('track-id', parsedLyricsObject);
 *   const payload = await lyricsStorage.load('track-id');  // null on miss
 */

import { audioLogger } from '../audio/AudioLogger';
import { LyricsEvent }  from './LyricsEvents';

// ─── Configuration ─────────────────────────────────────────────────────────────

const DB_NAME      = 'auralis-lyrics';
const STORE_NAME   = 'lyrics';
const DB_VERSION   = 1;

/**
 * Internal schema version stamped on every stored record.
 * Increment this when the stored payload shape changes to auto-invalidate
 * previously stored records.
 */
const PAYLOAD_VERSION = 1;

// ─── LyricsStorage class ───────────────────────────────────────────────────────

class LyricsStorage {
  constructor() {
    /**
     * Cached database connection promise.
     * Resolves to an IDBDatabase, or null if IndexedDB is unavailable.
     * @type {Promise<IDBDatabase|null>|null}
     */
    this._dbPromise = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Persist parsed lyrics for a track.
   *
   * @param {string} songId
   * @param {import('./LyricsEngine').ParsedLyrics} parsedLyrics
   * @returns {Promise<boolean>} True on success, false on failure
   */
  async save(songId, parsedLyrics) {
    if (!songId || !parsedLyrics) return false;

    try {
      const db = await this._getDB();
      if (!db) return false;

      const record = {
        songId,
        payload:  parsedLyrics,
        _version: PAYLOAD_VERSION,
        savedAt:  Date.now(),
      };

      await this._idbPut(db, record);
      audioLogger.log(LyricsEvent.STORAGE_SAVED, `Lyrics persisted: ${songId}`);
      return true;
    } catch (err) {
      audioLogger.warn(LyricsEvent.STORAGE_ERROR, `Save failed: ${songId}`, err);
      return false;
    }
  }

  /**
   * Load persisted lyrics for a track.
   * Returns null on miss, version mismatch, or any error.
   *
   * @param {string} songId
   * @returns {Promise<import('./LyricsEngine').ParsedLyrics|null>}
   */
  async load(songId) {
    if (!songId) return null;

    try {
      const db = await this._getDB();
      if (!db) return null;

      const record = await this._idbGet(db, songId);

      if (!record) {
        audioLogger.log(LyricsEvent.STORAGE_MISS, `No stored lyrics: ${songId}`);
        return null;
      }

      // Version validation — discard incompatible records
      if (record._version !== PAYLOAD_VERSION) {
        audioLogger.warn(
          LyricsEvent.STORAGE_CORRUPTED,
          `Version mismatch (expected ${PAYLOAD_VERSION}, got ${record._version}) — discarding ${songId}`,
        );
        await this.remove(songId).catch(() => {});
        return null;
      }

      audioLogger.log(LyricsEvent.STORAGE_HIT, `Offline lyrics loaded: ${songId}`);
      return record.payload ?? null;
    } catch (err) {
      audioLogger.warn(LyricsEvent.STORAGE_ERROR, `Load failed: ${songId}`, err);
      return null;
    }
  }

  /**
   * Remove persisted lyrics for a track.
   * @param {string} songId
   * @returns {Promise<boolean>}
   */
  async remove(songId) {
    if (!songId) return false;
    try {
      const db = await this._getDB();
      if (!db) return false;
      await this._idbDelete(db, songId);
      return true;
    } catch (err) {
      audioLogger.warn(LyricsEvent.STORAGE_ERROR, `Remove failed: ${songId}`, err);
      return false;
    }
  }

  /**
   * Clear ALL stored lyrics from IndexedDB.
   * @returns {Promise<boolean>}
   */
  async clear() {
    try {
      const db = await this._getDB();
      if (!db) return false;
      await this._idbClear(db);
      audioLogger.log(LyricsEvent.STORAGE_SAVED, 'All offline lyrics cleared');
      return true;
    } catch (err) {
      audioLogger.warn(LyricsEvent.STORAGE_ERROR, 'Clear failed', err);
      return false;
    }
  }

  /**
   * Check if lyrics are stored for a given song without loading the full payload.
   * @param {string} songId
   * @returns {Promise<boolean>}
   */
  async has(songId) {
    if (!songId) return false;
    try {
      const db = await this._getDB();
      if (!db) return false;
      const record = await this._idbGet(db, songId);
      return !!(record && record._version === PAYLOAD_VERSION);
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — DB lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open (or return cached) IDBDatabase connection.
   * Returns null if IndexedDB is not supported in this environment.
   * @private
   * @returns {Promise<IDBDatabase|null>}
   */
  _getDB() {
    if (this._dbPromise) return this._dbPromise;

    if (typeof indexedDB === 'undefined') {
      audioLogger.warn(LyricsEvent.STORAGE_ERROR, 'IndexedDB not available in this environment');
      this._dbPromise = Promise.resolve(null);
      return this._dbPromise;
    }

    this._dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db    = event.target.result;
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'songId' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        };

        request.onsuccess  = (event) => resolve(event.target.result);
        request.onerror    = (event) => {
          audioLogger.warn(LyricsEvent.STORAGE_ERROR, 'IDB open failed', event.target.error);
          resolve(null);
        };
        request.onblocked  = () => {
          audioLogger.warn(LyricsEvent.STORAGE_ERROR, 'IDB open blocked');
          resolve(null);
        };
      } catch (err) {
        audioLogger.warn(LyricsEvent.STORAGE_ERROR, 'IDB open threw', err);
        resolve(null);
      }
    });

    return this._dbPromise;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — IDB operation wrappers (Promise-ified)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  }

  /** @private */
  _idbPut(db, record) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  /** @private */
  _idbDelete(db, key) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /** @private */
  _idbClear(db) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const lyricsStorage = new LyricsStorage();
