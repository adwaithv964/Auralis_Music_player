/**
 * audio/AudioSettingsPersistence.js
 *
 * Isolated persistence layer for Phase 3 audio settings.
 *
 * Stores and restores user audio preferences independently of the playback
 * session (SessionPersistence.js). Keeping them separate ensures that audio
 * quality, EQ, and normalization preferences survive across sessions without
 * polluting the playback session key.
 *
 * ─── Persisted data ──────────────────────────────────────────────────────────
 *
 *   auralis:audio-settings
 *   {
 *     eqPreset:                    'flat',      // selected preset name
 *     eqBands:                     [0,0,0,0,0], // manual band gains in dB
 *     playbackRate:                1.0,         // last used playback speed
 *     streamQuality:               'normal',    // 'low'|'normal'|'high'|'lossless'
 *     loudnessNormalizationEnabled: true,       // normalization on/off
 *     savedAt:                     1234567890,  // ms timestamp
 *   }
 *
 * ─── Defaults ────────────────────────────────────────────────────────────────
 *
 *   All fields have safe defaults so the application works correctly on first
 *   launch or after storage is cleared.
 *
 * Usage:
 *   import { audioSettingsPersistence } from './AudioSettingsPersistence';
 *
 *   const settings = audioSettingsPersistence.load();
 *   audioSettingsPersistence.save({ eqPreset: 'bass-boost', eqBands: [...] });
 *   audioSettingsPersistence.clear();
 */

import { audioLogger } from './AudioLogger';
import { EQEvent }     from './EQEvents';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'auralis:audio-settings';

/** Valid playback speed values */
const VALID_SPEEDS = new Set([0.5, 0.75, 1.0, 1.25, 1.5, 2.0]);

/** Valid stream quality values */
const VALID_QUALITIES = new Set(['low', 'normal', 'high', 'lossless']);

/** Valid preset names — extended as new presets are added to EQEngine */
const VALID_PRESETS = new Set([
  'flat', 'bass-boost', 'vocal', 'electronic', 'classical', 'devotional', 'loudness',
]);

/** Number of EQ bands */
const BAND_COUNT = 5;

/** Safe gain bounds matching EQChain */
const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = +12;

// ─── Default settings ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} AudioSettings
 * @property {string}   eqPreset                    - Selected preset name
 * @property {number[]} eqBands                     - 5-element gain array (dB)
 * @property {number}   playbackRate                - Playback speed multiplier
 * @property {string}   streamQuality               - Stream quality tier
 * @property {boolean}  loudnessNormalizationEnabled - Whether normalization is active
 * @property {number}   [savedAt]                   - Timestamp when saved
 */

/** @returns {AudioSettings} */
function defaultSettings() {
  return {
    eqPreset:                    'flat',
    eqBands:                     [0, 0, 0, 0, 0],
    playbackRate:                1.0,
    streamQuality:               'normal',
    loudnessNormalizationEnabled: true,
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate and sanitize a loaded settings object.
 * Returns a valid settings object, or null if irrecoverably corrupt.
 *
 * @param {*} raw
 * @returns {AudioSettings|null}
 */
function validateSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const defaults = defaultSettings();
  const out      = { ...defaults };

  // eqPreset
  if (typeof raw.eqPreset === 'string' && VALID_PRESETS.has(raw.eqPreset)) {
    out.eqPreset = raw.eqPreset;
  }

  // eqBands — must be array of exactly BAND_COUNT numbers in safe range
  if (
    Array.isArray(raw.eqBands) &&
    raw.eqBands.length === BAND_COUNT &&
    raw.eqBands.every(v => typeof v === 'number' && !isNaN(v) && v >= MIN_GAIN_DB && v <= MAX_GAIN_DB)
  ) {
    out.eqBands = raw.eqBands.map(v => Number(v));
  }

  // playbackRate
  if (typeof raw.playbackRate === 'number' && VALID_SPEEDS.has(raw.playbackRate)) {
    out.playbackRate = raw.playbackRate;
  }

  // streamQuality
  if (typeof raw.streamQuality === 'string' && VALID_QUALITIES.has(raw.streamQuality)) {
    out.streamQuality = raw.streamQuality;
  }

  // loudnessNormalizationEnabled
  if (typeof raw.loudnessNormalizationEnabled === 'boolean') {
    out.loudnessNormalizationEnabled = raw.loudnessNormalizationEnabled;
  }

  return out;
}

// ─── AudioSettingsPersistence class ──────────────────────────────────────────

class AudioSettingsPersistence {
  constructor() {
    /** @type {AudioSettings|null} — cached in memory after first load */
    this._cached = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load audio settings from localStorage.
   *
   * Returns the saved settings if valid, or defaults if missing / corrupt.
   * Results are cached so repeated calls incur no I/O.
   *
   * @returns {AudioSettings}
   */
  load() {
    if (this._cached) return { ...this._cached };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        audioLogger.log('audio-settings', 'No saved audio settings — using defaults');
        this._cached = defaultSettings();
        return { ...this._cached };
      }

      const parsed   = JSON.parse(raw);
      const settings = validateSettings(parsed);

      if (!settings) {
        audioLogger.warn(EQEvent.SETTINGS_CORRUPTED, 'Audio settings corrupted — resetting to defaults');
        this._clear();
        this._cached = defaultSettings();
        return { ...this._cached };
      }

      this._cached = settings;
      audioLogger.info(EQEvent.SETTINGS_RESTORED, 'Audio settings loaded', {
        preset:  settings.eqPreset,
        quality: settings.streamQuality,
        rate:    settings.playbackRate,
      });

      return { ...this._cached };

    } catch (err) {
      audioLogger.error('audio-settings', 'Failed to load audio settings', err);
      this._cached = defaultSettings();
      return { ...this._cached };
    }
  }

  /**
   * Persist a partial or complete settings object.
   * Merges the patch into the current cached settings before writing.
   *
   * @param {Partial<AudioSettings>} patch
   */
  save(patch) {
    try {
      // Ensure we have a base to merge into
      if (!this._cached) this.load();

      const merged = { ...this._cached, ...patch };
      const validated = validateSettings(merged);

      if (!validated) {
        audioLogger.warn('audio-settings', 'save() rejected — patch produced invalid settings', patch);
        return;
      }

      validated.savedAt = Date.now();
      this._cached      = validated;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      audioLogger.log(EQEvent.SETTINGS_SAVED, 'Audio settings saved');

    } catch (err) {
      audioLogger.error('audio-settings', 'Failed to save audio settings', err);
    }
  }

  /**
   * Return the current in-memory settings without hitting localStorage.
   * Returns defaults if not yet loaded.
   *
   * @returns {AudioSettings}
   */
  getCurrent() {
    if (!this._cached) return this.load();
    return { ...this._cached };
  }

  /**
   * Clear saved settings from localStorage and reset the in-memory cache.
   */
  clear() {
    this._clear();
    this._cached = defaultSettings();
    audioLogger.log('audio-settings', 'Audio settings cleared — reset to defaults');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* localStorage unavailable */ }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const audioSettingsPersistence = new AudioSettingsPersistence();

// Re-export the typedef for consumers
export { defaultSettings, VALID_SPEEDS, VALID_QUALITIES, VALID_PRESETS };
