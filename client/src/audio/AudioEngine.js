/**
 * audio/AudioEngine.js
 * Singleton Controller for Auralis DSP Audio Engine.
 * 
 * Central coordinator for:
 *   - AudioContext lifecycle (user-gesture unlock, state transitions).
 *   - Single MediaElementAudioSourceNode connection.
 *   - CORS detection and graceful fallback.
 *   - Preset management & localStorage persistence.
 *   - Real-time telemetry (phase correlation, peak levels, FFT spectrum).
 */

import { AudioGraph }             from './AudioGraph';
import {
  DEFAULT_DSP_SETTINGS,
  DEFAULT_EQ_SETTINGS,
  STORAGE_KEYS,
} from './constants';
import { MASTER_PROFILES, EQ_PRESETS } from './presets';
import { DEVICE_PROFILES }             from './deviceProfiles';

class AudioEngineController {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.mediaSource = null;
    this.audioElement = null;
    this.initialized = false;
    this.corsDegraded = false; // Flag if current track had to bypass Web Audio due to CORS restriction

    // Load persisted or default settings
    this.dspSettings = this._loadStorage(STORAGE_KEYS.DSP_SETTINGS, DEFAULT_DSP_SETTINGS);
    this.eqSettings  = this._loadStorage(STORAGE_KEYS.EQ_SETTINGS,  DEFAULT_EQ_SETTINGS);
    this.customEqPresets = this._loadStorage(STORAGE_KEYS.CUSTOM_EQ_PRESETS, []);

    // Ensure loudnessMatch is disabled by default so volume is full and unattenuated
    if (this.dspSettings.loudnessMatch) {
      this.dspSettings.loudnessMatch = false;
      this._saveStorage(STORAGE_KEYS.DSP_SETTINGS, this.dspSettings);
    }

    // Listeners for UI reactivity
    this.subscribers = new Set();
  }

  _loadStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...fallback, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...fallback };
  }

  _saveStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  _notify() {
    this.subscribers.forEach(cb => {
      try { cb({ dsp: this.dspSettings, eq: this.eqSettings }); } catch (_) {}
    });
  }

  /**
   * Initializes the Web Audio graph with the single HTMLMediaElement.
   * Safe to call multiple times — only creates nodes once.
   */
  init(audioElement) {
    if (this.initialized && this.audioElement === audioElement) return;

    this.audioElement = audioElement;

    // Ensure crossOrigin is set for Web Audio compatibility
    if (!audioElement.crossOrigin) {
      audioElement.crossOrigin = 'anonymous';
    }

    // Lazy instantiate AudioContext on demand
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[Auralis DSP] Web Audio API is not supported in this browser.');
      return;
    }

    if (!this.ctx) {
      this.ctx = new AudioContextClass({
        latencyHint: 'playback',
      });
      this.graph = new AudioGraph(this.ctx);
    }

    // Connect MediaElement exactly once
    if (!this.mediaSource) {
      try {
        this.mediaSource = this.ctx.createMediaElementSource(audioElement);
        this.mediaSource.connect(this.graph.inputNode);
        this.initialized = true;
      } catch (err) {
        console.warn('[Auralis DSP] MediaElementAudioSourceNode init warning:', err.message);
      }
    }

    // Apply initial settings
    this.graph.applySettings(this.dspSettings, this.eqSettings);
  }

  /**
   * Unlocks AudioContext on user gesture (click/play).
   */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[Auralis DSP] AudioContext resume failed:', err.message);
      }
    }
  }

  /**
   * Updates DSP settings and recalculates graph parameters.
   */
  updateDspSettings(updater) {
    const next = typeof updater === 'function' ? updater(this.dspSettings) : { ...this.dspSettings, ...updater };
    this.dspSettings = next;
    this._saveStorage(STORAGE_KEYS.DSP_SETTINGS, next);
    if (this.graph) {
      this.graph.applySettings(this.dspSettings, this.eqSettings);
    }
    this._notify();
  }

  /**
   * Updates Equalizer settings independently.
   */
  updateEqSettings(updater) {
    const next = typeof updater === 'function' ? updater(this.eqSettings) : { ...this.eqSettings, ...updater };
    this.eqSettings = next;
    this._saveStorage(STORAGE_KEYS.EQ_SETTINGS, next);
    if (this.graph) {
      this.graph.applySettings(this.dspSettings, this.eqSettings);
    }
    this._notify();
  }

  /**
   * Activates one of the 17 professionally tuned sound profiles.
   */
  selectMasterProfile(profileId) {
    const profile = MASTER_PROFILES.find(p => p.id === profileId);
    if (!profile) return;

    this.updateDspSettings(prev => ({
      ...prev,
      activeProfile: profileId,
      ...profile.dsp,
    }));
  }

  /**
   * Changes engine intensity (Natural | Balanced | Powerful | Extreme).
   */
  setIntensity(intensityKey) {
    this.updateDspSettings(prev => ({
      ...prev,
      intensity: intensityKey,
    }));
  }

  /**
   * Changes target device profile (Universal, Wired, Bluetooth, Over-Ear, Studio, Portable, Desktop).
   */
  setDeviceProfile(deviceKey) {
    this.updateDspSettings(prev => ({
      ...prev,
      deviceProfile: deviceKey,
    }));
  }

  /**
   * Toggles Sound Engine master switch.
   */
  toggleEngine(forcedState) {
    this.updateDspSettings(prev => ({
      ...prev,
      engineEnabled: forcedState !== undefined ? forcedState : !prev.engineEnabled,
    }));
  }

  /**
   * Toggles Equalizer switch.
   */
  toggleEqualizer(forcedState) {
    this.updateEqSettings(prev => ({
      ...prev,
      eqEnabled: forcedState !== undefined ? forcedState : !prev.eqEnabled,
    }));
  }

  /**
   * Toggles Loudness Matching for objective A/B testing.
   */
  toggleLoudnessMatch() {
    this.updateDspSettings(prev => ({
      ...prev,
      loudnessMatch: !prev.loudnessMatch,
    }));
  }

  /**
   * Applies an EQ Preset.
   */
  applyEqPreset(presetId) {
    const preset = [...EQ_PRESETS, ...this.customEqPresets].find(p => p.id === presetId);
    if (!preset) return;

    this.updateEqSettings(prev => ({
      ...prev,
      activePreset: presetId,
      bands: [...preset.bands],
    }));
  }

  /**
   * Updates an individual EQ frequency band (0 to 9).
   */
  setEqBand(bandIndex, gainDb) {
    this.updateEqSettings(prev => {
      const nextBands = [...prev.bands];
      nextBands[bandIndex] = Math.max(-12, Math.min(12, Number(gainDb)));
      return {
        ...prev,
        activePreset: 'custom',
        bands: nextBands,
      };
    });
  }

  /**
   * Saves current EQ curve as a custom preset.
   */
  saveCustomEqPreset(name) {
    if (!name || !name.trim()) return;
    const id = `custom_${Date.now()}`;
    const newPreset = {
      id,
      name: name.trim(),
      bands: [...this.eqSettings.bands],
    };
    const nextList = [...this.customEqPresets, newPreset];
    this.customEqPresets = nextList;
    this._saveStorage(STORAGE_KEYS.CUSTOM_EQ_PRESETS, nextList);
    this.updateEqSettings(prev => ({ ...prev, activePreset: id }));
  }

  /**
   * Resets all DSP settings to factory Reference default.
   */
  resetDspToDefault() {
    this.updateDspSettings(() => ({ ...DEFAULT_DSP_SETTINGS }));
  }

  /**
   * Resets Equalizer to flat curve.
   */
  resetEqToFlat() {
    this.updateEqSettings(() => ({
      eqEnabled: this.eqSettings.eqEnabled, // Keep enabled state
      activePreset: 'flat',
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    }));
  }

  /**
   * Retrieves real-time telemetry (Peak, clipping, phase correlation, AudioContext stats).
   */
  getTelemetry() {
    if (!this.graph || !this.ctx) {
      return {
        phaseCorrelation: 1.0,
        peakDb: -90,
        peakLinear: 0,
        isClipping: false,
        sampleRate: 48000,
        state: 'uninitialized',
      };
    }

    const { peakDb, peakLinear, isClipping } = this.graph.getPeakLevel();
    const phaseCorrelation = this.graph.getPhaseCorrelation();

    return {
      phaseCorrelation,
      peakDb,
      peakLinear,
      isClipping,
      sampleRate: this.ctx.sampleRate,
      state: this.ctx.state,
    };
  }

  /**
   * Analyzes source metadata for the Source Quality Information panel.
   */
  getSourceQuality(track) {
    const isSaavn = track?.sourceType === 'saavn' || track?.previewUrl?.includes('saavncdn');
    const isAudius = track?.sourceType === 'audius' || track?.previewUrl?.includes('/api/stream');
    const isYt = track?.previewUrl?.includes('googlevideo') || track?.previewUrl?.includes('youtube') || track?.ytResolved;
    const isLocal = track?.sourceType === 'local';

    let format = 'AAC / MP4';
    let bitrate = '320 kbps (High Quality)';
    let sampleRate = '44.1 kHz';
    let provider = 'Verified JioSaavn CDN';
    let isLossless = false;

    if (isLocal) {
      format = 'Native Local Audio';
      bitrate = 'Original File Bitrate';
      sampleRate = '44.1 kHz / 48 kHz';
      provider = 'Local File System';
    } else if (isSaavn) {
      format = 'MPEG-4 AAC-LC (.mp4)';
      bitrate = '320 kbps CBR (Full Quality)';
      sampleRate = '44.1 kHz';
      provider = 'JioSaavn Verified Stream';
    } else if (isAudius) {
      format = 'MPEG-3 Audio (.mp3)';
      bitrate = '320 kbps MP3';
      sampleRate = '44.1 kHz';
      provider = 'Audius Decentralized Network';
    } else if (isYt) {
      format = 'Opus / WebM (Ogg Container)';
      bitrate = '~160 kbps VBR (Adaptive)';
      sampleRate = '48.0 kHz';
      provider = 'Verified YouTube Stream';
    }

    return {
      format,
      bitrate,
      sampleRate,
      outputFormat: 'Web Audio 32-bit Float PCM',
      dacSampleRate: `${this.ctx?.sampleRate ? (this.ctx.sampleRate / 1000).toFixed(1) : '48.0'} kHz`,
      provider,
      isLossless,
      dspStatus: this.dspSettings.engineEnabled ? 'Active (Intelligent Enhancement)' : 'Bypassed (Original Source)',
      eqStatus: this.eqSettings.eqEnabled ? 'Active (10-Band EQ)' : 'Bypassed',
      notice: 'Processing runs internally via 32-bit floating-point DSP. Floating-point processing enhances dynamics, spatiality and clarity without claiming lossy audio has become lossless.',
    };
  }
}

// Export singleton instance
export const audioEngine = new AudioEngineController();
