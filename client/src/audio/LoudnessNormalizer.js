/**
 * audio/LoudnessNormalizer.js
 *
 * Phase 3 Loudness Normalization for the Auralis music player.
 *
 * Automatically adjusts per-track playback gain to achieve a consistent
 * perceived loudness across all tracks, targeting the -14 LUFS streaming
 * standard (used by Spotify, Apple Music, YouTube Music).
 *
 * ─── Pipeline position ───────────────────────────────────────────────────────
 *
 *   Source → EQChain → [LoudnessGainNode] → Analyser → MasterGain → Destination
 *
 *   The normalization GainNode sits between the EQ output and the analyser.
 *   It is created by AudioEngine.initPipeline() and accessed here via
 *   AudioEngine.getLoudnessGainNode().
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 *   1. Each song object may carry a `loudnessLufs` field (number, negative).
 *   2. The gain correction is: target - measured  (in dB, then converted to linear)
 *   3. Clamped to ±6 dB to prevent extreme amplification or clipping.
 *   4. Applied via GainNode.gain.setTargetAtTime() for a smooth 100ms ramp,
 *      which prevents any audible click/jump when a new track starts.
 *   5. If metadata is absent or NaN, gain is smoothly set to 1.0 (0 dB, passthrough).
 *
 * ─── Loudness metadata field ─────────────────────────────────────────────────
 *
 *   song.loudnessLufs  — integrated loudness in LUFS (e.g. -12.5, -18.3)
 *
 *   The backend may expose this as part of the song object. If absent, the
 *   normalizer silently disables itself for that track.
 *
 * Usage:
 *   import { loudnessNormalizer } from './LoudnessNormalizer';
 *
 *   loudnessNormalizer.init();                // restore persisted preference
 *   loudnessNormalizer.applyForSong(song);    // call on every track start
 *   loudnessNormalizer.setEnabled(false);     // user toggle
 */

import { audioEngine }              from './AudioEngine';
import { audioSettingsPersistence } from './AudioSettingsPersistence';
import { audioLogger }              from './AudioLogger';
import { EQEvent }                  from './EQEvents';
import { usePlayerStore }           from '../store/playerStore';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Target loudness level in LUFS (streaming standard: -14). */
const TARGET_LUFS = -14;

/**
 * Maximum gain correction in dB (boost or cut).
 * ±6 dB prevents extreme amplification while covering most real-world content.
 */
const MAX_GAIN_CORRECTION_DB = 6;

/**
 * Time constant (seconds) for the GainNode smooth ramp.
 * setTargetAtTime uses an exponential approach: after ~3× this value, gain
 * is ~95% of the way to the target — 0.1s gives a fast but inaudible transition.
 */
const GAIN_RAMP_TIME_CONSTANT = 0.1;

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Convert dB to linear gain.
 * @param {number} db
 * @returns {number}
 */
function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

// ─── LoudnessNormalizer class ─────────────────────────────────────────────────

class LoudnessNormalizer {
  constructor() {
    // ── Singleton guard ─────────────────────────────────────────────────────
    if (LoudnessNormalizer._instance) {
      return LoudnessNormalizer._instance;
    }
    LoudnessNormalizer._instance = this;

    /** @type {boolean} Whether normalization is active */
    this._enabled = true;

    /** @type {boolean} Whether init() has been called */
    this._initialized = false;

    audioLogger.log('loudness', 'LoudnessNormalizer singleton created');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Restore the persisted normalization preference.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const settings   = audioSettingsPersistence.load();
      this._enabled    = settings.loudnessNormalizationEnabled ?? true;

      this._syncStore();
      audioLogger.info('loudness', `Loudness normalization: ${this._enabled ? 'enabled' : 'disabled'}`);

    } catch (err) {
      audioLogger.error('loudness', 'Failed to restore normalization preference', err);
      this._enabled = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Per-track normalization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply loudness normalization gain for a specific track.
   *
   * Call this immediately after a new track starts playing (in
   * PlaybackEngine._executePlaySong, after audioEngine.play() resolves).
   *
   * If normalization is disabled, or the song has no loudness metadata,
   * the gain is smoothly reset to unity (1.0 = 0 dB).
   *
   * @param {Object} song - Song object, optionally with `loudnessLufs` field
   */
  applyForSong(song) {
    const gainNode = this._getGainNode();
    if (!gainNode) {
      audioLogger.log(EQEvent.PIPELINE_UNAVAILABLE, 'Loudness: GainNode not available — skipping normalization');
      return;
    }

    // If normalization is disabled, reset to unity
    if (!this._enabled) {
      this._setGain(gainNode, 1.0, 'normalization disabled');
      audioLogger.log(EQEvent.NORMALIZATION_SKIPPED, 'Normalization disabled — gain reset to 1.0');
      return;
    }

    const measuredLufs = song?.loudnessLufs;

    // Missing or invalid metadata → reset to unity
    if (measuredLufs === undefined || measuredLufs === null || typeof measuredLufs !== 'number' || isNaN(measuredLufs)) {
      this._setGain(gainNode, 1.0, 'no loudness metadata');
      audioLogger.log(EQEvent.NORMALIZATION_SKIPPED, `Normalization skipped for "${song?.title}" — no loudness metadata`);
      return;
    }

    // Compute gain correction
    const correctionDb     = TARGET_LUFS - measuredLufs;
    const clampedDb        = Math.max(-MAX_GAIN_CORRECTION_DB, Math.min(MAX_GAIN_CORRECTION_DB, correctionDb));
    const linearGain       = dbToLinear(clampedDb);

    this._setGain(gainNode, linearGain, `${measuredLufs} LUFS → ${clampedDb.toFixed(2)} dB correction`);

    audioLogger.info(EQEvent.NORMALIZATION_APPLIED, `Loudness normalization applied for "${song?.title}"`, {
      measuredLufs,
      targetLufs:    TARGET_LUFS,
      correctionDb:  clampedDb,
      linearGain:    linearGain.toFixed(4),
      clamped:       Math.abs(correctionDb) > MAX_GAIN_CORRECTION_DB,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Enable / disable
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enable or disable loudness normalization.
   *
   * When disabled, the normalization GainNode is smoothly set to 1.0.
   * When re-enabled, the next call to applyForSong() applies correction.
   *
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') return;
    if (this._enabled === enabled) return;

    this._enabled = enabled;

    // If disabling, immediately reset gain to unity
    if (!enabled) {
      const gainNode = this._getGainNode();
      if (gainNode) {
        this._setGain(gainNode, 1.0, 'normalization disabled by user');
      }
    }

    this._syncStore();
    audioSettingsPersistence.save({ loudnessNormalizationEnabled: enabled });

    audioLogger.info(EQEvent.NORMALIZATION_TOGGLED, `Loudness normalization: ${enabled ? 'ON' : 'OFF'}`);
  }

  /**
   * Return whether normalization is currently enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the loudness GainNode from the AudioEngine.
   * Returns null if the pipeline is not ready.
   * @private
   * @returns {GainNode|null}
   */
  _getGainNode() {
    try {
      if (typeof audioEngine.getLoudnessGainNode === 'function') {
        return audioEngine.getLoudnessGainNode();
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Apply a linear gain value to the GainNode using a smooth exponential ramp.
   * This prevents audible clicks or level jumps.
   *
   * @private
   * @param {GainNode} gainNode
   * @param {number}   linearGain - Target gain value (1.0 = unity)
   * @param {string}   [reason]   - Debug description
   */
  _setGain(gainNode, linearGain, reason = '') {
    try {
      const ctx = gainNode.context;
      if (!ctx || ctx.state === 'closed') return;

      gainNode.gain.setTargetAtTime(
        linearGain,
        ctx.currentTime,
        GAIN_RAMP_TIME_CONSTANT,
      );

      audioLogger.log('loudness', `Gain → ${linearGain.toFixed(4)} (${reason})`);

    } catch (err) {
      // Non-fatal — fall back to direct assignment
      try {
        gainNode.gain.value = linearGain;
      } catch { /* ignore */ }
      audioLogger.warn('loudness', 'setTargetAtTime failed — direct gain fallback', err);
    }
  }

  /**
   * Sync normalization state to the playerStore.
   * @private
   */
  _syncStore() {
    try {
      const store = usePlayerStore.getState();
      if (typeof store.setLoudnessNormalizationEnabled === 'function') {
        store.setLoudnessNormalizationEnabled(this._enabled);
      }
    } catch (err) {
      audioLogger.warn('loudness', 'Failed to sync normalization state to store', err);
    }
  }
}

// ─── Singleton guard ──────────────────────────────────────────────────────────
LoudnessNormalizer._instance = null;

// ─── Export singleton ─────────────────────────────────────────────────────────
/**
 * The global LoudnessNormalizer singleton.
 * Import and use this directly — never call `new LoudnessNormalizer()` elsewhere.
 */
export const loudnessNormalizer = new LoudnessNormalizer();
