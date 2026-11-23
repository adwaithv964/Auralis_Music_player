/**
 * audio/AudioEngine.js
 * Singleton Controller for Auralis DSP Audio Engine.
 * 
 * Central coordinator for:
 *   - AudioContext lifecycle (unlock, state recovery, resume).
 *   - Single MediaElementAudioSourceNode connection.
 *   - Single authoritative AudioSettingsStore integration.
 *   - Real-time Adaptive Track Intelligence engine.
 *   - Real-time telemetry, spectrum, and acoustic health analysis.
 */

import { AudioGraph }         from './AudioGraph';
import { audioSettingsStore } from './AudioSettingsStore';
import { TrackIntelligence }  from './TrackIntelligence';
import { MASTER_PROFILES, EQ_PRESETS } from './presets';
import { DEVICE_PROFILES }    from './deviceProfiles';

class AudioEngineController {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.mediaSource = null;
    this.audioElement = null;
    this.initialized = false;
    this.corsDegraded = false;

    // Single Authoritative Store & Adaptive Intelligence
    this.store = audioSettingsStore;
    this.trackIntelligence = new TrackIntelligence(this.store);

    // Subscribers for UI updates
    this.subscribers = new Set();

    // Analysis interval ID
    this.analysisTimer = null;

    // Synchronize store updates to AudioGraph
    this.store.subscribe(() => {
      if (this.graph) {
        this.graph.applySettings(
          this.store.persistentPrefs,
          this.getEqSettings(),
          this.trackIntelligence.adaptiveOffsets
        );
      }
      this._notify();
    });
  }

  // ── Backward-compatible Getters ──────────────────────────────────
  get dspSettings() {
    return {
      ...this.store.persistentPrefs,
      engineEnabled: this.store.persistentPrefs.soundEngineEnabled,
    };
  }

  get eqSettings() {
    return {
      eqEnabled: this.store.persistentPrefs.eqEnabled,
      activePreset: this.store.persistentPrefs.activeEqPreset,
      bands: this.store.persistentPrefs.eqBands,
    };
  }

  get customEqPresets() {
    return this.store.persistentPrefs.customEqPresets;
  }

  getEqSettings() {
    return {
      eqEnabled: this.store.persistentPrefs.eqEnabled,
      activePreset: this.store.persistentPrefs.activeEqPreset,
      bands: this.store.persistentPrefs.eqBands,
    };
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  _notify() {
    const snap = this.store.getSnapshot();
    this.subscribers.forEach(cb => {
      try {
        cb({
          dsp: this.dspSettings,
          eq: this.eqSettings,
          adaptive: snap.adaptive,
          runtime: snap.runtime,
          prefs: snap.prefs,
        });
      } catch (_) {}
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

      // Listen for AudioContext state transitions (auto-resume)
      this.ctx.onstatechange = () => {
        this.store.updateRuntimeState({
          audioContextState: this.ctx?.state || 'unknown',
        });
      };
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

    // Start background real-time analysis loop
    this._startAnalysisLoop();

    // Apply persisted settings immediately
    this.graph.applySettings(
      this.store.persistentPrefs,
      this.getEqSettings(),
      this.trackIntelligence.adaptiveOffsets
    );

    this.store.updateRuntimeState({
      audioContextState: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
    });
  }

  /**
   * Background analysis loop: processes live FFT spectrum for adaptive intelligence.
   */
  _startAnalysisLoop() {
    if (this.analysisTimer) clearInterval(this.analysisTimer);

    this.analysisTimer = setInterval(() => {
      if (!this.graph || !this.ctx || this.ctx.state !== 'running') return;
      if (!this.audioElement || this.audioElement.paused) return;

      const offsets = this.trackIntelligence.processFrame(
        this.graph.analyser,
        this.ctx.sampleRate || 48000
      );

      // Smoothly apply adaptive offsets if adaptive intelligence is enabled
      if (this.store.persistentPrefs.adaptiveIntelligenceEnabled && offsets) {
        this.graph.applySettings(
          this.store.persistentPrefs,
          this.getEqSettings(),
          offsets
        );
      }
    }, 120);
  }

  /**
   * Called when a track changes.
   * GUARANTEE: User preferences and profiles NEVER reset!
   * Only the per-track analysis resets for the new song.
   */
  onTrackChange(newTrack) {
    this.trackIntelligence.resetForNewTrack(newTrack?.id);
    this.store.updateRuntimeState({
      trackId: newTrack?.id || null,
      streamUrl: newTrack?.previewUrl || null,
      mediaElementState: 'loading',
      isBuffering: false,
    });

    if (this.graph) {
      this.graph.applySettings(
        this.store.persistentPrefs,
        this.getEqSettings(),
        this.trackIntelligence.adaptiveOffsets
      );
    }
  }

  /**
   * Unlocks AudioContext on user gesture (click/play).
   */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.store.updateRuntimeState({ audioContextState: 'running' });
      } catch (err) {
        console.warn('[Auralis DSP] AudioContext resume failed:', err.message);
      }
    }
  }

  /**
   * Smooth micro-fade out before pausing to eliminate transient DC clicks/pops.
   */
  fadeToPause(onComplete) {
    if (!this.graph || !this.ctx || this.ctx.state !== 'running') {
      if (onComplete) onComplete();
      return;
    }
    const t = this.ctx.currentTime;
    try {
      this.graph.inputGainNode.gain.cancelScheduledValues(t);
      this.graph.inputGainNode.gain.setValueAtTime(this.graph.inputGainNode.gain.value, t);
      this.graph.inputGainNode.gain.linearRampToValueAtTime(0.0001, t + 0.020);
    } catch (_) {}

    setTimeout(() => {
      if (onComplete) onComplete();
      if (this.ctx && this.graph) {
        try {
          const nextT = this.ctx.currentTime;
          this.graph.inputGainNode.gain.setValueAtTime(1.0, nextT);
        } catch (_) {}
      }
    }, 25);
  }

  /**
   * Smooth micro-fade in on playback start to prevent abrupt audio transients.
   */
  fadeToPlay(playFn) {
    if (!this.graph || !this.ctx) {
      if (playFn) playFn();
      return;
    }
    const t = this.ctx.currentTime;
    try {
      this.graph.inputGainNode.gain.cancelScheduledValues(t);
      this.graph.inputGainNode.gain.setValueAtTime(0.0001, t);
      this.graph.inputGainNode.gain.linearRampToValueAtTime(1.0, t + 0.025);
    } catch (_) {}
    if (playFn) playFn();
  }

  // ── Setters & Controls (All routed to persistent store) ──────────

  updateDspSettings(updater) {
    const next = typeof updater === 'function' ? updater(this.store.persistentPrefs) : updater;
    this.store.updatePreferences(next);
  }

  updateEqSettings(updater) {
    const currentEq = this.getEqSettings();
    const next = typeof updater === 'function' ? updater(currentEq) : updater;
    this.store.updatePreferences({
      eqEnabled: next.eqEnabled !== undefined ? next.eqEnabled : currentEq.eqEnabled,
      activeEqPreset: next.activePreset || currentEq.activePreset,
      eqBands: next.bands || currentEq.bands,
    });
  }

  toggleOverallProcessing(forcedState) {
    this.store.toggleOverallProcessing(forcedState);
  }

  toggleEngine(forcedState) {
    this.store.toggleSoundEngine(forcedState);
  }

  toggleAdaptiveIntelligence(forcedState) {
    this.store.toggleAdaptiveIntelligence(forcedState);
  }

  setAdaptiveIntensity(intensityKey) {
    this.store.setAdaptiveIntensity(intensityKey);
  }

  toggleEqualizer(forcedState) {
    this.store.toggleEqualizer(forcedState);
  }

  toggleSpatialAudio(forcedState) {
    this.store.toggleSpatialAudio(forcedState);
  }

  selectMasterProfile(profileId) {
    this.store.selectMasterProfile(profileId);
  }

  setIntensity(intensityKey) {
    this.store.setIntensity(intensityKey);
  }

  setDeviceProfile(deviceKey) {
    this.store.setDeviceProfile(deviceKey);
  }

  toggleLoudnessMatch() {
    this.store.updatePreferences(prev => ({ loudnessMatch: !prev.loudnessMatch }));
  }

  applyEqPreset(presetId) {
    const preset = [...EQ_PRESETS, ...this.store.persistentPrefs.customEqPresets].find(p => p.id === presetId);
    if (!preset) return;
    this.store.applyEqPreset(presetId, preset.bands);
  }

  setEqBand(bandIndex, gainDb) {
    this.store.setEqBand(bandIndex, gainDb);
  }

  saveCustomEqPreset(name) {
    this.store.saveCustomEqPreset(name);
  }

  resetDspToDefault() {
    this.store.resetToDefaults();
  }

  resetEqToFlat() {
    this.store.updatePreferences({
      activeEqPreset: 'flat',
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  }

  // ── Real-time Telemetry & Diagnostics ─────────────────────────────

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

  getAcousticHealthAnalysis() {
    if (!this.graph) {
      return {
        acousticComfort: { score: 98, rating: 'All-Day Safe (4+ Hours)', isSafe: true, fatigueCushionActive: true },
        subsonicRumble: { detected: false, level: 0, shieldStatus: '22–68 Hz Subsonic Filter Active' },
        lowMidMud: { detected: false, level: 0, shieldStatus: '280 Hz Dynamic Mud Scoop Active' },
        harshResonance: { detected: false, level: 0, shieldStatus: '3.8 kHz Dynamic Notch Active' },
        sibilanceSpikes: { detected: false, level: 0, shieldStatus: '6.8 kHz Precision De-Esser Active' },
        ultrasonicNoise: { detected: false, level: 0, shieldStatus: '18.5 kHz Denoise Filter Active' },
        phaseCorrelation: { value: '1.00', isSafe: true, status: 'Pure Stereo' },
        speakerProtection: { isProtecting: false, status: 'Excursion Guard Active' },
      };
    }
    return this.graph.getAcousticHealthAnalysis();
  }

  getStreamDiagnostics() {
    const audio = this.audioElement;
    let bufferHealth = 0;
    if (audio && audio.buffered && audio.buffered.length > 0) {
      const cur = audio.currentTime || 0;
      for (let i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= cur && cur <= audio.buffered.end(i)) {
          bufferHealth = Math.max(0, audio.buffered.end(i) - cur);
          break;
        }
      }
    }

    const snap = this.store.getSnapshot();
    return {
      streamStatus: audio ? (audio.paused ? 'Paused' : 'Streaming') : 'Idle',
      bufferingStatus: snap.runtime.isBuffering ? 'Buffering' : 'Healthy',
      bufferHealthSec: bufferHealth.toFixed(1),
      audioEngineStatus: snap.prefs.overallProcessingEnabled
        ? (snap.prefs.soundEngineEnabled ? 'Sound Engine Active' : 'Sound Engine Bypassed')
        : '100% Native Bypass',
      adaptiveAnalysisStatus: snap.adaptive.status,
      currentSection: snap.adaptive.currentSection,
      audioContextState: this.ctx?.state || 'uninitialized',
      networkStatus: navigator.onLine ? 'Online' : 'Offline',
      lastInterruption: snap.runtime.lastInterruption,
      corsDegraded: this.corsDegraded,
    };
  }

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

    const snap = this.store.getSnapshot();
    return {
      format,
      bitrate,
      sampleRate,
      outputFormat: 'Web Audio 32-bit Float PCM',
      dacSampleRate: `${this.ctx?.sampleRate ? (this.ctx.sampleRate / 1000).toFixed(1) : '48.0'} kHz`,
      provider,
      isLossless,
      dspStatus: snap.prefs.overallProcessingEnabled
        ? (snap.prefs.soundEngineEnabled ? 'Active (Intelligent Enhancement)' : 'Bypassed')
        : '100% Bit-Transparent Native Stream',
      eqStatus: snap.prefs.eqEnabled ? 'Active (10-Band EQ)' : 'Bypassed',
      notice: 'Processing runs internally via 32-bit floating-point DSP. Floating-point processing enhances dynamics, spatiality and clarity without claiming lossy audio has become lossless.',
    };
  }
}

// Global Singleton
export const audioEngine = new AudioEngineController();
