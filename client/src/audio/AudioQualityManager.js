/**
 * audio/AudioQualityManager.js
 *
 * Phase 3 Audio Quality Manager for the Auralis music player.
 *
 * Manages the user's stream quality preference and decorates stream URLs with
 * the appropriate quality parameter before they are loaded into the audio element.
 *
 * ─── Quality tiers ───────────────────────────────────────────────────────────
 *
 *   low      — ~96 kbps  (reduced bandwidth, mobile-friendly)
 *   normal   — ~160 kbps (default; balanced quality and data usage)
 *   high     — ~320 kbps (high fidelity)
 *   lossless — FLAC / original quality (where the backend supports it)
 *
 * ─── URL decoration ──────────────────────────────────────────────────────────
 *
 *   The manager appends ?quality=<tier> to stream URLs. The backend/CDN
 *   interprets the parameter to serve the appropriate quality variant.
 *   If the URL already contains a query string the parameter is appended
 *   with & instead of ?.
 *
 * ─── Fallback behaviour ──────────────────────────────────────────────────────
 *
 *   If an unsupported quality value is set, it is silently ignored and the
 *   previous (valid) value is retained. This ensures no playback interruption.
 *
 * Usage:
 *   import { audioQualityManager } from './AudioQualityManager';
 *
 *   audioQualityManager.init();                    // restore persisted preference
 *   const url = audioQualityManager.decorateUrl(rawStreamUrl);
 *   audioQualityManager.setQuality('high');
 *   const tier = audioQualityManager.getQuality(); // 'high'
 */

import { audioSettingsPersistence, VALID_QUALITIES } from './AudioSettingsPersistence';
import { audioLogger }                               from './AudioLogger';
import { EQEvent }                                   from './EQEvents';
import { usePlayerStore }                            from '../store/playerStore';

// ─── AudioQualityManager class ────────────────────────────────────────────────

class AudioQualityManager {
  constructor() {
    // ── Singleton guard ─────────────────────────────────────────────────────
    if (AudioQualityManager._instance) {
      return AudioQualityManager._instance;
    }
    AudioQualityManager._instance = this;

    /** @type {string} Current quality tier */
    this._quality = 'normal';

    /** @type {boolean} Whether init() has been called */
    this._initialized = false;

    audioLogger.log('quality', 'AudioQualityManager singleton created');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Restore the persisted quality preference.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const settings = audioSettingsPersistence.load();
      const tier     = settings.streamQuality;

      if (VALID_QUALITIES.has(tier)) {
        this._quality = tier;
        audioLogger.info('quality', `Quality preference restored: ${tier}`);
      } else {
        audioLogger.warn('quality', `Invalid persisted quality "${tier}" — using "normal"`);
        this._quality = 'normal';
      }

      this._syncStore();

    } catch (err) {
      audioLogger.error('quality', 'Failed to restore quality preference', err);
      this._quality = 'normal';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Quality management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the stream quality preference.
   *
   * Change takes effect on the next track load — the currently playing track
   * is not re-fetched to avoid interruption.
   *
   * @param {string} tier - 'low' | 'normal' | 'high' | 'lossless'
   * @returns {boolean} true if accepted, false if invalid
   */
  setQuality(tier) {
    if (!VALID_QUALITIES.has(tier)) {
      audioLogger.warn(EQEvent.INVALID_EQ_VALUE, `setQuality: unsupported tier "${tier}"`);
      return false;
    }

    if (tier === this._quality) {
      audioLogger.log('quality', `Quality already set to "${tier}" — no-op`);
      return true;
    }

    const previous  = this._quality;
    this._quality   = tier;

    this._syncStore();
    audioSettingsPersistence.save({ streamQuality: tier });

    audioLogger.info(EQEvent.QUALITY_CHANGED, `Stream quality: ${previous} → ${tier}`);
    return true;
  }

  /**
   * Return the current quality tier.
   * @returns {string}
   */
  getQuality() {
    return this._quality;
  }

  /**
   * Return all valid quality tiers (for building UI pickers).
   * @returns {string[]}
   */
  getAvailableQualities() {
    return [...VALID_QUALITIES];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — URL decoration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Append the current quality parameter to a stream URL.
   *
   * The backend interprets ?quality=<tier> to serve the appropriate variant.
   * If the URL is empty, null, or not a string, it is returned unchanged.
   *
   * @param {string} url - Raw stream URL from StreamResolver
   * @returns {string} Decorated URL
   */
  decorateUrl(url) {
    if (!url || typeof url !== 'string') return url;

    try {
      // Only decorate URLs that look like HTTP streams
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return url;
      }

      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}quality=${encodeURIComponent(this._quality)}`;

    } catch (err) {
      audioLogger.warn('quality', 'decorateUrl failed — returning original URL', err);
      return url;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _syncStore() {
    try {
      const store = usePlayerStore.getState();
      if (typeof store.setStreamQuality === 'function') {
        store.setStreamQuality(this._quality);
      }
    } catch (err) {
      audioLogger.warn('quality', 'Failed to sync quality to store', err);
    }
  }
}

// ─── Singleton guard ──────────────────────────────────────────────────────────
AudioQualityManager._instance = null;

// ─── Export singleton ─────────────────────────────────────────────────────────
/**
 * The global AudioQualityManager singleton.
 * Import and use this directly — never call `new AudioQualityManager()` elsewhere.
 */
export const audioQualityManager = new AudioQualityManager();
