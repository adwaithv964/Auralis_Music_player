/**
 * audio/TrackIntelligence.js
 * Auralis Adaptive Track Intelligence Engine.
 * 
 * Performs non-blocking real-time FFT frequency binning and musical behavior estimation:
 *   - Sub-bass (20–60 Hz), Mid-bass (60–160 Hz), Low-mid mud (160–400 Hz),
 *     Vocal-presence (800–2500 Hz), Treble/Air (3.5–16 kHz).
 *   - RMS energy, crest factor, spectral centroid, spectral flux.
 *   - Approximate heuristic section detection (Intro, Quiet, Vocal-Dominant, Bass-Heavy, Chorus, Acoustic, Outro).
 *   - Bounded DSP parameter overlay (max ±2.5 dB) applied smoothly via AudioParam automation.
 * 
 * GUARANTEE: Never overwrites saved user profile preferences.
 */

export class TrackIntelligence {
  constructor(audioSettingsStore) {
    this.store = audioSettingsStore;
    this.sampleCount = 0;
    this.analysisStartTime = 0;
    this.previousSpectrum = null;

    // Smoothed acoustic metrics (Exponential Moving Average)
    this.metrics = {
      subBassEnergy: 0.35,
      midBassEnergy: 0.40,
      lowMidMudEnergy: 0.30,
      vocalEnergy: 0.45,
      trebleEnergy: 0.38,
      spectralCentroid: 2400,
      spectralFlux: 0.15,
      rms: 0.25,
      crestFactor: 3.0,
    };

    // Estimated musical section
    this.currentSection = 'Intro';
    this.sectionConfidence = 0.85;

    // Bounded offsets (dB)
    this.adaptiveOffsets = {
      deepBass: 0.0,
      bassPunch: 0.0,
      lowMidMudCut: 0.0,
      vocalClarity: 0.0,
      harshnessDamping: 0.0,
      trebleAir: 0.0,
      dynamicCompression: 0.0,
    };

    // Smoothing factor (0.12 = slow, silky transitions)
    this.alpha = 0.12;
  }

  /**
   * Resets analysis counters for a newly loaded song.
   */
  resetForNewTrack(trackId = null) {
    this.sampleCount = 0;
    this.analysisStartTime = Date.now();
    this.previousSpectrum = null;
    this.currentSection = 'Intro';
    this.sectionConfidence = 0.85;

    this.adaptiveOffsets = {
      deepBass: 0.0,
      bassPunch: 0.0,
      lowMidMudCut: 0.0,
      vocalClarity: 0.0,
      harshnessDamping: 0.0,
      trebleAir: 0.0,
      dynamicCompression: 0.0,
    };

    if (this.store) {
      this.store.resetTrackAdaptiveState(trackId);
    }
  }

  /**
   * Analyzes an FFT frame from an active AnalyserNode during playback.
   */
  processFrame(analyserNode, sampleRate = 48000) {
    if (!analyserNode) return this.adaptiveOffsets;

    const fftSize = analyserNode.frequencyBinCount;
    const freqData = new Uint8Array(fftSize);
    analyserNode.getByteFrequencyData(freqData);

    const timeData = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(timeData);

    // Check if audio is playing or silent
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = Math.abs(timeData[i]);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    if (rms < 0.005) {
      // Silence — do not adapt on dead space
      return this.adaptiveOffsets;
    }

    const crestFactor = peak > 0.001 ? Math.min(10, peak / (rms + 1e-4)) : 3.0;

    const nyquist = sampleRate / 2;
    const binHz = nyquist / fftSize;

    const getEnergyInRange = (fStart, fEnd) => {
      const startBin = Math.max(0, Math.floor(fStart / binHz));
      const endBin = Math.min(fftSize - 1, Math.ceil(fEnd / binHz));
      if (startBin >= endBin) return freqData[startBin] / 255;
      let sum = 0;
      for (let b = startBin; b <= endBin; b++) sum += freqData[b];
      return (sum / (endBin - startBin + 1)) / 255;
    };

    const subBass = getEnergyInRange(20, 60);
    const midBass = getEnergyInRange(60, 160);
    const lowMidMud = getEnergyInRange(160, 400);
    const vocalMid = getEnergyInRange(800, 2500);
    const trebleAir = getEnergyInRange(3500, 16000);

    // Spectral Centroid (weighted center of mass of spectrum)
    let num = 0;
    let den = 0;
    for (let b = 0; b < fftSize; b++) {
      const mag = freqData[b];
      const freq = b * binHz;
      num += freq * mag;
      den += mag;
    }
    const spectralCentroid = den > 0 ? num / den : 2400;

    // Spectral Flux (rate of spectral change)
    let flux = 0;
    if (this.previousSpectrum) {
      for (let b = 0; b < fftSize; b++) {
        const diff = (freqData[b] - this.previousSpectrum[b]) / 255;
        if (diff > 0) flux += diff;
      }
      flux /= fftSize;
    }
    this.previousSpectrum = new Uint8Array(freqData);

    // Update smoothed metrics with exponential moving average
    const a = this.alpha;
    this.metrics.subBassEnergy    = (1 - a) * this.metrics.subBassEnergy + a * subBass;
    this.metrics.midBassEnergy    = (1 - a) * this.metrics.midBassEnergy + a * midBass;
    this.metrics.lowMidMudEnergy  = (1 - a) * this.metrics.lowMidMudEnergy + a * lowMidMud;
    this.metrics.vocalEnergy      = (1 - a) * this.metrics.vocalEnergy + a * vocalMid;
    this.metrics.trebleEnergy     = (1 - a) * this.metrics.trebleEnergy + a * trebleAir;
    this.metrics.spectralCentroid = (1 - a) * this.metrics.spectralCentroid + a * spectralCentroid;
    this.metrics.spectralFlux     = (1 - a) * this.metrics.spectralFlux + a * flux;
    this.metrics.rms              = (1 - a) * this.metrics.rms + a * rms;
    this.metrics.crestFactor      = (1 - a) * this.metrics.crestFactor + a * crestFactor;

    this.sampleCount++;

    // Classify song section and compute bounded offsets
    this._classifySection();
    this._calculateAdaptiveOffsets();

    // Determine status string
    let status = 'Adaptation Disabled';
    const prefs = this.store ? this.store.persistentPrefs : { adaptiveIntelligenceEnabled: true };
    if (prefs.adaptiveIntelligenceEnabled) {
      if (this.sampleCount < 15) {
        status = 'Analyzing Track';
      } else if (this.sampleCount < 30) {
        status = 'Track Analysis Ready';
      } else {
        status = 'Adaptive Processing Active';
      }
    }

    // Push live snapshot to store
    if (this.store && this.sampleCount % 5 === 0) {
      this.store.updateAdaptiveState({
        status,
        currentSection: this.currentSection,
        sectionConfidence: this.sectionConfidence,
        analysis: { ...this.metrics },
        adaptiveOffsets: { ...this.adaptiveOffsets },
      });
    }

    return this.adaptiveOffsets;
  }

  /**
   * Heuristic musical behavior classification based on spectral profile and dynamics.
   * Acknowledged as estimated musical behavior rather than semantic ground truth.
   */
  _classifySection() {
    const { subBassEnergy, midBassEnergy, lowMidMudEnergy, vocalEnergy, trebleEnergy, rms, crestFactor } = this.metrics;

    if (this.sampleCount < 12) {
      this.currentSection = 'Intro';
      this.sectionConfidence = 0.85;
      return;
    }

    if (rms < 0.08) {
      this.currentSection = 'Quiet/Breakdown';
      this.sectionConfidence = 0.88;
    } else if (subBassEnergy > 0.62 || (midBassEnergy > 0.58 && subBassEnergy > 0.48)) {
      this.currentSection = 'Bass-Heavy Section';
      this.sectionConfidence = 0.82;
    } else if (vocalEnergy > 0.52 && lowMidMudEnergy < 0.45 && subBassEnergy < 0.50) {
      this.currentSection = 'Vocal-Dominant';
      this.sectionConfidence = 0.84;
    } else if (rms > 0.45 && trebleEnergy > 0.48 && subBassEnergy > 0.45) {
      this.currentSection = 'High-Energy / Chorus';
      this.sectionConfidence = 0.80;
    } else if (crestFactor > 4.5 && rms < 0.25) {
      this.currentSection = 'Acoustic / Instrumental';
      this.sectionConfidence = 0.78;
    } else if (this.sampleCount > 120 && rms < 0.12) {
      this.currentSection = 'Outro';
      this.sectionConfidence = 0.82;
    } else {
      this.currentSection = 'Steady Groove';
      this.sectionConfidence = 0.75;
    }
  }

  /**
   * Calculates bounded DSP offsets based on detected characteristics and user intensity setting.
   * Max offset is strictly bounded to ±2.5 dB.
   */
  _calculateAdaptiveOffsets() {
    const prefs = this.store ? this.store.persistentPrefs : { adaptiveIntensity: 'balanced' };
    const intensityKey = prefs.adaptiveIntensity || 'balanced';

    // Scale factor based on user choice
    const scale = intensityKey === 'subtle' ? 0.55
                : intensityKey === 'powerful' || intensityKey === 'dynamic' ? 1.35
                : intensityKey === 'advanced' ? 1.70
                : 1.00; // balanced

    const { subBassEnergy, midBassEnergy, lowMidMudEnergy, vocalEnergy, trebleEnergy, spectralCentroid } = this.metrics;

    let deepBassOff = 0;
    let bassPunchOff = 0;
    let mudCutOff = 0;
    let vocalClarityOff = 0;
    let harshnessDampingOff = 0;
    let trebleAirOff = 0;
    let dynamicCompOff = 0;

    // 1. Bass Balance: If track is boomy/bass-heavy, scoop mud and cushion sub-bass
    if (subBassEnergy > 0.58) {
      deepBassOff -= (subBassEnergy - 0.58) * 4.0; // gentle negative offset
      mudCutOff -= (lowMidMudEnergy > 0.35 ? (lowMidMudEnergy - 0.35) * 3.5 : 0.8);
    } else if (subBassEnergy < 0.28) {
      // Bass-light track: gently lift low-end
      deepBassOff += (0.28 - subBassEnergy) * 3.5;
      bassPunchOff += 0.8;
    }

    // 2. Vocal Clarity: Bring presence forward when vocals are prominent, or if low-mid mud is masking them
    if (vocalEnergy > 0.45) {
      vocalClarityOff += 1.2;
    } else if (lowMidMudEnergy > 0.48) {
      mudCutOff -= 1.4;
      vocalClarityOff += 0.9;
    }

    // 3. Treble & Harshness: Tame shrill or sibilant tracks; add silky air to dull tracks
    if (spectralCentroid > 3400 || trebleEnergy > 0.55) {
      harshnessDampingOff -= 1.6; // damp screech
    } else if (spectralCentroid < 1600 && trebleEnergy < 0.25) {
      trebleAirOff += 1.2; // add gentle sparkle
    }

    // 4. Section-specific dynamic adaptation
    if (this.currentSection === 'Bass-Heavy Section') {
      mudCutOff -= 0.8;
      dynamicCompOff = 0.5; // slight peak containment
    } else if (this.currentSection === 'Vocal-Dominant') {
      vocalClarityOff += 0.6;
      deepBassOff = Math.min(0, deepBassOff); // prevent bass overwhelm
    } else if (this.currentSection === 'Quiet/Breakdown') {
      dynamicCompOff = -0.5; // zero squash, let natural decay ring out
    }

    // Clamp all offsets to strict safety boundaries: [-2.5 dB, +2.5 dB]
    const clamp = (val) => Math.max(-2.5, Math.min(2.5, val * scale));

    this.adaptiveOffsets = {
      deepBass: clamp(deepBassOff),
      bassPunch: clamp(bassPunchOff),
      lowMidMudCut: clamp(mudCutOff),
      vocalClarity: clamp(vocalClarityOff),
      harshnessDamping: clamp(harshnessDampingOff),
      trebleAir: clamp(trebleAirOff),
      dynamicCompression: clamp(dynamicCompOff),
    };
  }
}
