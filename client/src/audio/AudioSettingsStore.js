/**
 * audio/AudioSettingsStore.js
 * Single Authoritative Persistent Store for Auralis DSP Audio Engine.
 * 
 * Strict 3-Tier State Separation:
 *   Tier A: Persistent User Preferences (survives song changes, reloads, page navigation)
 *   Tier B: Runtime Audio State (stream URL, AudioContext state, buffer health, media states)
 *   Tier C: Per-Track Adaptive State (temporary real-time analysis, resets on track transition)
 */

import {
  DEFAULT_DSP_SETTINGS,
  DEFAULT_EQ_SETTINGS,
  STORAGE_KEYS,
  INTENSITY_MODES,
} from './constants';
import { MASTER_PROFILES } from './presets';

const STORE_VERSION_KEY = 'auralis:settings_version';
const CURRENT_VERSION = 2;
const PERSISTENT_STORE_KEY = 'auralis:settings_v2';

export class AudioSettingsStore {
  constructor() {
    this.subscribers = new Set();

    // ── Tier A: Persistent Preferences ────────────────────────────
    this.persistentPrefs = this._loadPersistentPreferences();

    // ── Tier B: Runtime Audio State (Never persisted) ────────────
    this.runtimeAudioState = {
      trackId: null,
      streamUrl: null,
      audioContextState: 'uninitialized',
      mediaElementState: 'idle',
      isBuffering: false,
      bufferHealthSec: 0,
      sampleRate: 48000,
      corsDegraded: false,
      lastInterruption: null, // { time, reason, category, recovered }
      errorHistory: [],
    };

    // ── Tier C: Per-Track Adaptive State (Transient overlay) ──────
    this.perTrackAdaptiveState = this._createDefaultAdaptiveState();
  }

  _createDefaultAdaptiveState() {
    return {
      trackId: null,
      status: this.persistentPrefs.adaptiveIntelligenceEnabled ? 'Analyzing Track' : 'Adaptation Disabled',
      currentSection: 'Intro',
      sectionConfidence: 0.8,
      analysis: {
        subBassEnergy: 0.35,
        midBassEnergy: 0.40,
        lowMidMudEnergy: 0.30,
        vocalEnergy: 0.45,
        trebleEnergy: 0.38,
        spectralCentroid: 2400,
        spectralFlux: 0.15,
        rms: 0.25,
        crestFactor: 3.2,
      },
      // Bounded offsets (dB) that temporarily overlay without mutating saved user profile
      adaptiveOffsets: {
        deepBass: 0.0,
        bassPunch: 0.0,
        lowMidMudCut: 0.0,
        vocalClarity: 0.0,
        harshnessDamping: 0.0,
        trebleAir: 0.0,
        dynamicCompression: 0.0,
      },
      lastUpdated: Date.now(),
    };
  }

  /**
   * Loads and validates persistent settings, performing schema migration if needed.
   */
  _loadPersistentPreferences() {
    const defaultPrefs = {
      schemaVersion: CURRENT_VERSION,
      // Master Controls (Truth Table)
      overallProcessingEnabled: true, // When false, 100% bit-transparent native stream
      soundEngineEnabled: true,       // Sound Engine main switch
      adaptiveIntelligenceEnabled: true, // Adaptive Track Intelligence switch
      adaptiveIntensity: 'balanced',  // subtle | balanced | dynamic | advanced

      // Profiles & Signatures
      activeProfile: 'reference',
      userOverrides: {}, // Any manual slider modifications made by the user
      intensity: 'balanced',
      deviceProfile: 'universal',
      loudnessMatch: false, // Default false for full dynamic punch

      // Equalizer State
      eqEnabled: false,
      activeEqPreset: 'flat',
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      customEqPresets: [],

      // Spatial Audio
      spatialEnabled: false,
      spatialMode: 'wide',
      stereoWidth: 1.30,
      crossfeedAmount: 0.15,
      spatialDepth: 0.35,

      // Bass Engine baseline
      deepBass: DEFAULT_DSP_SETTINGS.deepBass ?? 3.2,
      bassPunch: DEFAULT_DSP_SETTINGS.bassPunch ?? 3.8,
      bassTexture: DEFAULT_DSP_SETTINGS.bassTexture ?? 2.2,
      bassIntensity: DEFAULT_DSP_SETTINGS.bassIntensity ?? 1.15,
      psychoacousticBass: true,
      subSonicFilter: true,

      // Vocal & Midrange baseline
      vocalClarity: DEFAULT_DSP_SETTINGS.vocalClarity ?? 2.2,
      vocalPresence: DEFAULT_DSP_SETTINGS.vocalPresence ?? 1.6,
      nasalReduction: DEFAULT_DSP_SETTINGS.nasalReduction ?? 0.8,
      harshnessControl: DEFAULT_DSP_SETTINGS.harshnessControl ?? 1.0,
      vocalWarmth: DEFAULT_DSP_SETTINGS.vocalWarmth ?? 1.0,

      // Crystal Treble baseline
      crystalTreble: DEFAULT_DSP_SETTINGS.crystalTreble ?? 2.4,
      airSparkle: DEFAULT_DSP_SETTINGS.airSparkle ?? 2.0,
      sibilanceControl: DEFAULT_DSP_SETTINGS.sibilanceControl ?? 1.2,
      trebleDetail: DEFAULT_DSP_SETTINGS.trebleDetail ?? 1.8,

      // Dynamics & Headroom
      multibandEnabled: true,
      dynamicRangePreservation: true,
      bassCompression: 1.8,
      masterPunch: 1.25,

      // Output & Safety
      inputGain: 0.0,
      outputCeiling: -0.5,
      softLimiterEnabled: true,
      speakerProtection: true,
      autoHeadroomProtection: true,
      badFrequencyFilter: true,
      hearingProtection: true,
      earFatigueControl: 1.5,
    };

    try {
      // 1. Try loading v2 store
      const rawV2 = localStorage.getItem(PERSISTENT_STORE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        return {
          ...defaultPrefs,
          ...parsed,
          // Ensure eqBands is strictly a 10-length array of numbers
          eqBands: Array.isArray(parsed.eqBands) && parsed.eqBands.length === 10
            ? parsed.eqBands.map(Number)
            : [...defaultPrefs.eqBands],
          customEqPresets: Array.isArray(parsed.customEqPresets) ? parsed.customEqPresets : [],
          userOverrides: typeof parsed.userOverrides === 'object' && parsed.userOverrides !== null ? parsed.userOverrides : {},
        };
      }

      // 2. Migration from Legacy v1 keys if present
      const rawDsp = localStorage.getItem(STORAGE_KEYS.DSP_SETTINGS);
      const rawEq  = localStorage.getItem(STORAGE_KEYS.EQ_SETTINGS);
      const rawCustom = localStorage.getItem(STORAGE_KEYS.CUSTOM_EQ_PRESETS);

      const migrated = { ...defaultPrefs };
      if (rawDsp) {
        const legacyDsp = JSON.parse(rawDsp);
        Object.assign(migrated, legacyDsp);
        migrated.soundEngineEnabled = legacyDsp.engineEnabled !== undefined ? legacyDsp.engineEnabled : true;
      }
      if (rawEq) {
        const legacyEq = JSON.parse(rawEq);
        migrated.eqEnabled = !!legacyEq.eqEnabled;
        migrated.activeEqPreset = legacyEq.activePreset || 'flat';
        if (Array.isArray(legacyEq.bands) && legacyEq.bands.length === 10) {
          migrated.eqBands = legacyEq.bands.map(Number);
        }
      }
      if (rawCustom) {
        const legacyCustom = JSON.parse(rawCustom);
        if (Array.isArray(legacyCustom)) migrated.customEqPresets = legacyCustom;
      }

      // Save initial migrated v2 payload
      localStorage.setItem(PERSISTENT_STORE_KEY, JSON.stringify(migrated));
      localStorage.setItem(STORE_VERSION_KEY, String(CURRENT_VERSION));
      return migrated;
    } catch (e) {
      console.warn('[AudioSettingsStore] Failed to load persisted settings, falling back to defaults:', e);
      return defaultPrefs;
    }
  }

  _savePersistentPreferences() {
    try {
      localStorage.setItem(PERSISTENT_STORE_KEY, JSON.stringify(this.persistentPrefs));
      localStorage.setItem(STORE_VERSION_KEY, String(CURRENT_VERSION));
    } catch (e) {
      console.error('[AudioSettingsStore] Save failed:', e);
    }
  }

  // ── Subscription System ───────────────────────────────────────────
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const snapshot = this.getSnapshot();
    this.subscribers.forEach(cb => {
      try { cb(snapshot); } catch (e) { console.error('[AudioSettingsStore] Notify error:', e); }
    });
  }

  getSnapshot() {
    return {
      prefs: { ...this.persistentPrefs },
      runtime: { ...this.runtimeAudioState },
      adaptive: { ...this.perTrackAdaptiveState },
    };
  }

  // ── Tier A: Preference Setters (Persistent) ──────────────────────

  /**
   * Updates one or more persistent preferences.
   * NEVER alters runtime or adaptive state.
   */
  updatePreferences(updates) {
    const nextUpdates = typeof updates === 'function' ? updates(this.persistentPrefs) : updates;
    this.persistentPrefs = {
      ...this.persistentPrefs,
      ...nextUpdates,
    };
    this._savePersistentPreferences();
    this.notify();
  }

  /**
   * Updates a user profile override (e.g. user dragged deepBass slider).
   */
  setUserOverride(key, value) {
    const updatedOverrides = {
      ...this.persistentPrefs.userOverrides,
      [key]: value,
    };
    this.persistentPrefs = {
      ...this.persistentPrefs,
      [key]: value,
      userOverrides: updatedOverrides,
    };
    this._savePersistentPreferences();
    this.notify();
  }

  /**
   * Selects a master sound profile.
   * Loads the profile's DSP defaults while preserving EQ, Spatial, Device, and Master switches.
   */
  selectMasterProfile(profileId) {
    const profile = MASTER_PROFILES.find(p => p.id === profileId);
    if (!profile) return;

    this.persistentPrefs = {
      ...this.persistentPrefs,
      activeProfile: profileId,
      userOverrides: {}, // Reset custom overrides when a new signature profile is chosen
      ...profile.dsp,
    };
    this._savePersistentPreferences();
    this.notify();
  }

  setDeviceProfile(deviceKey) {
    this.updatePreferences({ deviceProfile: deviceKey });
  }

  setIntensity(intensityKey) {
    this.updatePreferences({ intensity: intensityKey });
  }

  setAdaptiveIntensity(intensityKey) {
    this.updatePreferences({ adaptiveIntensity: intensityKey });
  }

  toggleOverallProcessing(forcedState) {
    const next = forcedState !== undefined ? forcedState : !this.persistentPrefs.overallProcessingEnabled;
    this.updatePreferences({ overallProcessingEnabled: next });
  }

  toggleSoundEngine(forcedState) {
    const next = forcedState !== undefined ? forcedState : !this.persistentPrefs.soundEngineEnabled;
    this.updatePreferences({ soundEngineEnabled: next });
  }

  toggleAdaptiveIntelligence(forcedState) {
    const next = forcedState !== undefined ? forcedState : !this.persistentPrefs.adaptiveIntelligenceEnabled;
    this.updatePreferences({ adaptiveIntelligenceEnabled: next });
    this.updateAdaptiveState({
      status: next ? 'Analyzing Track' : 'Adaptation Disabled',
    });
  }

  toggleEqualizer(forcedState) {
    const next = forcedState !== undefined ? forcedState : !this.persistentPrefs.eqEnabled;
    this.updatePreferences({ eqEnabled: next });
  }

  toggleSpatialAudio(forcedState) {
    const next = forcedState !== undefined ? forcedState : !this.persistentPrefs.spatialEnabled;
    this.updatePreferences({ spatialEnabled: next });
  }

  setEqBand(bandIndex, gainDb) {
    const nextBands = [...this.persistentPrefs.eqBands];
    nextBands[bandIndex] = Math.max(-12, Math.min(12, Number(gainDb)));
    this.updatePreferences({
      eqBands: nextBands,
      activeEqPreset: 'custom',
    });
  }

  applyEqPreset(presetId, bands) {
    this.updatePreferences({
      activeEqPreset: presetId,
      eqBands: [...bands],
    });
  }

  saveCustomEqPreset(name) {
    if (!name || !name.trim()) return;
    const id = `custom_${Date.now()}`;
    const newPreset = {
      id,
      name: name.trim(),
      bands: [...this.persistentPrefs.eqBands],
    };
    const nextList = [...this.persistentPrefs.customEqPresets, newPreset];
    this.updatePreferences({
      customEqPresets: nextList,
      activeEqPreset: id,
    });
  }

  resetToDefaults() {
    localStorage.removeItem(PERSISTENT_STORE_KEY);
    this.persistentPrefs = this._loadPersistentPreferences();
    this.notify();
  }

  // ── Tier B: Runtime Audio State (Volatile) ────────────────────────

  updateRuntimeState(updates) {
    this.runtimeAudioState = {
      ...this.runtimeAudioState,
      ...updates,
    };
    this.notify();
  }

  recordInterruption(reason, category = 'playback_glitch') {
    const entry = {
      time: new Date().toLocaleTimeString(),
      reason,
      category,
      recovered: false,
    };
    const nextHistory = [entry, ...this.runtimeAudioState.errorHistory].slice(0, 20);
    this.runtimeAudioState = {
      ...this.runtimeAudioState,
      lastInterruption: entry,
      errorHistory: nextHistory,
    };
    this.notify();
  }

  markInterruptionRecovered() {
    if (this.runtimeAudioState.lastInterruption) {
      this.runtimeAudioState.lastInterruption.recovered = true;
      this.notify();
    }
  }

  // ── Tier C: Per-Track Adaptive State (Transient Overlay) ──────────

  updateAdaptiveState(updates) {
    this.perTrackAdaptiveState = {
      ...this.perTrackAdaptiveState,
      ...updates,
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  /**
   * Resets per-track adaptive metrics when a new track starts.
   * GUARANTEE: Never modifies persistent user preferences!
   */
  resetTrackAdaptiveState(newTrackId = null) {
    this.perTrackAdaptiveState = {
      ...this._createDefaultAdaptiveState(),
      trackId: newTrackId,
      status: this.persistentPrefs.adaptiveIntelligenceEnabled ? 'Analyzing Track' : 'Adaptation Disabled',
    };
    this.notify();
  }
}

// Global Singleton
export const audioSettingsStore = new AudioSettingsStore();
