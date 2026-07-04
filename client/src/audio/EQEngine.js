/**
 * audio/EQEngine.js
 *
 * Phase 3 Equalizer Engine for the Auralis music player.
 *
 * Responsibilities:
 *   - Maintains the canonical list of EQ presets (extensible without refactoring)
 *   - Delegates all BiquadFilterNode mutations to AudioEngine (never touches nodes
 *     directly — respects the A1 architecture boundary)
 *   - Supports both preset application and manual per-band adjustment
 *   - Provides smooth transitions via AudioEngine's existing setBandGain API
 *   - Persists EQ state through AudioSettingsPersistence
 *   - Restores EQ settings on startup (called by PlaybackEngine._initSubsystems)
 *   - Keeps playerStore in sync after every change
 *
 * Integration:
 *   PlaybackEngine calls eqEngine.init() during _initSubsystems().
 *   UI components call playbackEngine.setEQPreset() / setEQBand() which
 *   delegate here.
 *
 * Processing pipeline:
 *   All EQ changes flow through AudioEngine.setEQBand() / setEQBands() which
 *   mutate the BiquadFilterNodes inside the active EQChain. The nodes are
 *   never recreated — only their .gain.value is updated.
 *
 * Usage:
 *   import { eqEngine } from './EQEngine';
 *
 *   eqEngine.init();                        // call once on startup
 *   eqEngine.applyPreset('bass-boost');
 *   eqEngine.setBand(0, +6);               // manual adjust band 0
 *   eqEngine.resetAll();                   // back to flat
 */

import { audioEngine }              from './AudioEngine';
import { audioSettingsPersistence } from './AudioSettingsPersistence';
import { audioLogger }              from './AudioLogger';
import { EQEvent }                  from './EQEvents';
import { usePlayerStore }           from '../store/playerStore';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of EQ bands — must match EQChain.js BAND_DEFINITIONS length. */
const BAND_COUNT = 5;

/** Safe gain bounds (matching EQChain.js). */
const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = +12;

// ─── EQ Presets ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} EQPreset
 * @property {string}   id     - Machine-readable preset identifier
 * @property {string}   label  - Human-readable display name
 * @property {number[]} bands  - Gain values (dB) for bands [0..4]:
 *                               [80Hz, 250Hz, 1kHz, 4kHz, 12kHz]
 */

/**
 * Built-in EQ presets.
 *
 * Band order: [Bass(80Hz), Low-Mid(250Hz), Mid(1kHz), High-Mid(4kHz), Treble(12kHz)]
 *
 * To add a new preset:
 *   1. Append an entry to this array.
 *   2. Add the preset's id to VALID_PRESETS in AudioSettingsPersistence.js.
 *   No other changes are needed.
 *
 * @type {EQPreset[]}
 */
export const EQ_PRESETS = [
  {
    id:    'flat',
    label: 'Flat',
    bands: [0, 0, 0, 0, 0],
  },
  {
    id:    'bass-boost',
    label: 'Bass Boost',
    bands: [6, 4, 0, -2, -1],
  },
  {
    id:    'vocal',
    label: 'Vocal',
    bands: [-2, 3, 6, 4, 2],
  },
  {
    id:    'electronic',
    label: 'Electronic',
    bands: [5, 3, -2, 3, 4],
  },
  {
    id:    'classical',
    label: 'Classical',
    bands: [4, 0, -2, 2, 5],
  },
  {
    id:    'devotional',
    label: 'Devotional',
    bands: [2, 4, 3, 1, 0],
  },
  {
    id:    'loudness',
    label: 'Loudness',
    bands: [6, 2, -2, 2, 5],
  },
];

/** Fast O(1) preset lookup by id. Built once at module load. */
const PRESET_MAP = new Map(EQ_PRESETS.map(p => [p.id, p]));

// ─── EQEngine class ───────────────────────────────────────────────────────────

class EQEngine {
  constructor() {
    // ── Singleton guard ─────────────────────────────────────────────────────
    if (EQEngine._instance) {
      return EQEngine._instance;
    }
    EQEngine._instance = this;

    /** @type {string} Currently active preset id */
    this._currentPresetId = 'flat';

    /** @type {number[]} Current band gains — always reflects the live filter state */
    this._currentBands = [0, 0, 0, 0, 0];

    /** @type {boolean} Whether init() has been called */
    this._initialized = false;

    audioLogger.log('eq-engine', 'EQEngine singleton created');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Restore persisted EQ settings and apply them to the audio pipeline.
   *
   * Must be called after AudioEngine.initPipeline() has completed so that the
   * BiquadFilterNodes exist. PlaybackEngine calls this from _initSubsystems()
   * after the first user gesture.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const settings = audioSettingsPersistence.load();

      // Restore bands array
      this._currentBands = Array.isArray(settings.eqBands) && settings.eqBands.length === BAND_COUNT
        ? [...settings.eqBands]
        : [0, 0, 0, 0, 0];

      // Restore preset id — check if bands match a known preset
      this._currentPresetId = settings.eqPreset || 'flat';

      // Apply bands to the live pipeline (if ready — safe if not, AudioEngine
      // will guard internally via setEQBands)
      this._applyBandsToEngine(this._currentBands);

      // Sync store
      this._syncStore();

      audioLogger.info(EQEvent.SETTINGS_RESTORED, 'EQ settings restored', {
        preset: this._currentPresetId,
        bands:  this._currentBands,
      });

    } catch (err) {
      audioLogger.error('eq-engine', 'EQ init failed — falling back to flat', err);
      this._currentPresetId = 'flat';
      this._currentBands    = [0, 0, 0, 0, 0];
      this._syncStore();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Presets
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a named preset.
   *
   * All 5 filter gains are updated atomically via AudioEngine.setEQBands().
   * The pipeline is never interrupted.
   *
   * @param {string} presetId - One of the ids from EQ_PRESETS
   */
  applyPreset(presetId) {
    const preset = PRESET_MAP.get(presetId);

    if (!preset) {
      audioLogger.warn(EQEvent.INVALID_EQ_VALUE, `applyPreset: unknown preset "${presetId}"`);
      return;
    }

    this._currentPresetId = preset.id;
    this._currentBands    = [...preset.bands];

    this._applyBandsToEngine(this._currentBands);
    this._syncStore();
    this._persist();

    audioLogger.info(EQEvent.PRESET_CHANGED, `EQ preset → "${preset.label}"`, {
      id:    preset.id,
      bands: preset.bands,
    });
  }

  /**
   * Return the list of all available presets (for building UI pickers).
   * @returns {EQPreset[]}
   */
  getPresets() {
    return EQ_PRESETS;
  }

  /**
   * Return the currently active preset id.
   * @returns {string}
   */
  getCurrentPresetId() {
    return this._currentPresetId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — Manual EQ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Adjust a single EQ band.
   *
   * Immediately updates the live BiquadFilterNode via AudioEngine.
   * When a band is manually adjusted, the preset is set to 'flat' if all
   * bands are zero, otherwise kept with a 'custom' marker in the store
   * (the stored preset id remains the last-applied preset id).
   *
   * @param {number} bandIndex - 0–4
   * @param {number} gainDb    - Target gain in dB (clamped to ±12)
   */
  setBand(bandIndex, gainDb) {
    if (bandIndex < 0 || bandIndex >= BAND_COUNT) {
      audioLogger.warn(EQEvent.INVALID_EQ_VALUE, `setBand: invalid index ${bandIndex}`);
      return;
    }

    if (typeof gainDb !== 'number' || isNaN(gainDb)) {
      audioLogger.warn(EQEvent.INVALID_EQ_VALUE, `setBand: invalid gain value ${gainDb}`);
      return;
    }

    const clamped = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));

    this._currentBands[bandIndex] = clamped;

    // Manual adjustment → derive preset state
    const isFlat = this._currentBands.every(v => v === 0);
    if (isFlat) {
      this._currentPresetId = 'flat';
    } else {
      // Check if the current bands exactly match a known preset
      const matched = this._findMatchingPreset(this._currentBands);
      this._currentPresetId = matched ? matched.id : 'custom';
    }

    audioEngine.setEQBand(bandIndex, clamped);
    this._syncStore();
    this._persist();

    audioLogger.log(EQEvent.BAND_ADJUSTED, `Band ${bandIndex} → ${clamped} dB`, {
      band:   bandIndex,
      gainDb: clamped,
    });
  }

  /**
   * Reset all EQ bands to 0 dB and set preset to Flat.
   */
  resetAll() {
    this._currentPresetId = 'flat';
    this._currentBands    = [0, 0, 0, 0, 0];

    this._applyBandsToEngine(this._currentBands);
    this._syncStore();
    this._persist();

    audioLogger.info(EQEvent.EQ_RESET, 'EQ reset — all bands at 0 dB');
  }

  /**
   * Reset a single band to 0 dB.
   * @param {number} bandIndex - 0–4
   */
  resetBand(bandIndex) {
    this.setBand(bandIndex, 0);
  }

  /**
   * Return the current gain values for all bands.
   * @returns {number[]} Copy of the 5-element gains array
   */
  getBands() {
    return [...this._currentBands];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Push all 5 band gains to AudioEngine in a single call.
   * AudioEngine will guard against pipeline-not-ready internally.
   * @private
   * @param {number[]} bands
   */
  _applyBandsToEngine(bands) {
    try {
      audioEngine.setEQBands(bands);
    } catch (err) {
      audioLogger.error(EQEvent.PIPELINE_UNAVAILABLE, 'Failed to apply bands to engine', err);
    }
  }

  /**
   * Sync the playerStore with the current EQ state.
   * @private
   */
  _syncStore() {
    try {
      const store = usePlayerStore.getState();
      // Actions are added in the playerStore Phase 3 slice
      if (typeof store.setEQPreset === 'function') {
        store.setEQPreset(this._currentPresetId);
      }
      if (typeof store.setEQBands === 'function') {
        store.setEQBands([...this._currentBands]);
      }
    } catch (err) {
      audioLogger.warn('eq-engine', 'Failed to sync EQ state to store', err);
    }
  }

  /**
   * Persist current EQ state to AudioSettingsPersistence.
   * @private
   */
  _persist() {
    audioSettingsPersistence.save({
      eqPreset: this._currentPresetId === 'custom' ? 'flat' : this._currentPresetId,
      eqBands:  [...this._currentBands],
    });
  }

  /**
   * Find a preset whose bands exactly match the given gains.
   * Returns undefined if no exact match.
   * @private
   * @param {number[]} bands
   * @returns {EQPreset|undefined}
   */
  _findMatchingPreset(bands) {
    return EQ_PRESETS.find(p =>
      p.bands.length === bands.length &&
      p.bands.every((v, i) => v === bands[i])
    );
  }
}

// ─── Singleton guard ──────────────────────────────────────────────────────────
EQEngine._instance = null;

// ─── Export singleton ─────────────────────────────────────────────────────────
/**
 * The global EQEngine singleton.
 * Import and use this directly — never call `new EQEngine()` elsewhere.
 */
export const eqEngine = new EQEngine();
