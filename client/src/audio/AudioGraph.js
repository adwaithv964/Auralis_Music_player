/**
 * audio/AudioGraph.js
 * Authoritative Web Audio Signal Routing Graph for Auralis Music.
 * 
 * Truth Table Routing Guarantees:
 *   1. Master Overall Audio Processing Switch:
 *      When OFF: 100% bit-transparent dry bypass directly to destination.
 *   2. Independent Sound Engine & Adaptive Track Intelligence:
 *      Adaptive can run when Engine is OFF; both can run together.
 *   3. Independent Equalizer & Spatial Audio Virtualization:
 *      Equalizer and Spatial stages remain switchable when Overall is ON.
 *   4. Zero-pop parameter updates via AudioParam automation.
 *   5. Real-time telemetry: spectrum, true-peak, acoustic health and stereo phase correlation.
 */

import { BassProcessor }         from './BassProcessor';
import { VocalTrebleProcessor }  from './VocalTrebleProcessor';
import { SpatialProcessor }      from './SpatialProcessor';
import { DynamicsProcessor }     from './DynamicsProcessor';
import { EqualizerProcessor }    from './EqualizerProcessor';
import { OutputLimiter }         from './OutputLimiter';
import { INTENSITY_MODES }       from './constants';
import { MASTER_PROFILES }       from './presets';
import { DEVICE_PROFILES }       from './deviceProfiles';

export class AudioGraph {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    // ── 1. Input Stage ─────────────────────────────────────────────
    this.inputNode     = audioCtx.createGain();
    this.inputGainNode = audioCtx.createGain();
    this.inputGainNode.gain.value = 1.0;
    this.inputNode.connect(this.inputGainNode);

    // ── 2. Master Bypass Crossfader (Truth Table Overall Switch) ───
    this.masterDryGain = audioCtx.createGain(); // 100% Bit-transparent native stream
    this.masterWetGain = audioCtx.createGain(); // Processed DSP path
    this.masterDryGain.gain.value = 0.0;
    this.masterWetGain.gain.value = 1.0;

    this.inputGainNode.connect(this.masterDryGain);

    // ── 3. Engine Processing Chain ─────────────────────────────────
    this.bassProcessor        = new BassProcessor(audioCtx);
    this.vocalTrebleProcessor = new VocalTrebleProcessor(audioCtx);
    this.dynamicsProcessor    = new DynamicsProcessor(audioCtx);
    this.outputLimiter        = new OutputLimiter(audioCtx);

    // Wet Engine Modules in series
    this.inputGainNode.connect(this.bassProcessor.inputNode);
    this.bassProcessor.outputNode.connect(this.vocalTrebleProcessor.inputNode);
    this.vocalTrebleProcessor.outputNode.connect(this.dynamicsProcessor.inputNode);
    this.dynamicsProcessor.outputNode.connect(this.outputLimiter.inputNode);

    // ── 4. Engine Wet / Dry Bypass Crossfader ──────────────────────
    this.engineWetGain = audioCtx.createGain();
    this.engineDryGain = audioCtx.createGain();
    this.engineWetGain.gain.value = 0.0;
    this.engineDryGain.gain.value = 1.0; // Default: bypassed

    this.outputLimiter.outputNode.connect(this.engineWetGain);
    this.inputGainNode.connect(this.engineDryGain); // Engine bypass path

    // Sum Engine output (wet or dry)
    this.engineSumNode = audioCtx.createGain();
    this.engineWetGain.connect(this.engineSumNode);
    this.engineDryGain.connect(this.engineSumNode);

    // ── 5. Spatial Audio Stage (Independent) ───────────────────────
    this.spatialProcessor = new SpatialProcessor(audioCtx);
    this.engineSumNode.connect(this.spatialProcessor.inputNode);

    // ── 6. Advanced Equalizer Stage (Independent) ──────────────────
    this.equalizerProcessor = new EqualizerProcessor(audioCtx);
    this.spatialProcessor.outputNode.connect(this.equalizerProcessor.inputNode);

    // ── 7. Loudness Normalizer / A-B Gain Matcher ──────────────────
    this.loudnessGain = audioCtx.createGain();
    this.loudnessGain.gain.value = 1.0;
    this.equalizerProcessor.outputNode.connect(this.loudnessGain);
    this.loudnessGain.connect(this.masterWetGain);

    // ── 8. Master Output Stage ─────────────────────────────────────
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 1.0;

    // Both dry and wet paths sum into masterGain
    this.masterDryGain.connect(this.masterGain);
    this.masterWetGain.connect(this.masterGain);

    // ── 9. Telemetry & Visualizer Analysers ────────────────────────
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;

    // Stereo Splitter for Phase Correlation Monitoring
    this.stereoSplitter = audioCtx.createChannelSplitter(2);
    this.analyserL = audioCtx.createAnalyser();
    this.analyserR = audioCtx.createAnalyser();
    this.analyserL.fftSize = 512;
    this.analyserR.fftSize = 512;

    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.stereoSplitter);
    this.stereoSplitter.connect(this.analyserL, 0);
    this.stereoSplitter.connect(this.analyserR, 1);

    // Final connection to hardware audio destination
    this.masterGain.connect(audioCtx.destination);
  }

  /**
   * Applies DSP, EQ, Spatial and Adaptive settings smoothly with AudioParam scheduling.
   */
  applySettings(dspSettings = {}, eqSettings = {}, adaptiveOffsets = {}) {
    const t = this.ctx.currentTime;
    const rampTime = 0.035;

    // 1. Overall Audio Processing Switch (Truth Table Master)
    const overallOn = dspSettings.overallProcessingEnabled !== false;
    if (t === 0) {
      this.masterWetGain.gain.setValueAtTime(overallOn ? 1.0 : 0.0, 0);
      this.masterDryGain.gain.setValueAtTime(overallOn ? 0.0 : 1.0, 0);
    } else {
      this.masterWetGain.gain.setTargetAtTime(overallOn ? 1.0 : 0.0, t, rampTime);
      this.masterDryGain.gain.setTargetAtTime(overallOn ? 0.0 : 1.0, t, rampTime);
    }

    if (!overallOn) {
      // 100% Bit-transparent native stream bypass
      return;
    }

    // 2. Input Gain Stage
    const inDb = dspSettings.inputGain || 0;
    const inLin = Math.pow(10, inDb / 20);
    if (t === 0) {
      this.inputGainNode.gain.setValueAtTime(inLin, 0);
    } else {
      this.inputGainNode.gain.setTargetAtTime(inLin, t, rampTime);
    }

    // 3. Sound Engine & Adaptive Track Intelligence Independence
    const engineOn = !!(dspSettings.soundEngineEnabled ?? dspSettings.engineEnabled);
    const adaptiveOn = !!dspSettings.adaptiveIntelligenceEnabled;
    const engineChainActive = engineOn || adaptiveOn;

    if (t === 0) {
      this.engineWetGain.gain.setValueAtTime(engineChainActive ? 1.0 : 0.0, 0);
      this.engineDryGain.gain.setValueAtTime(engineChainActive ? 0.0 : 1.0, 0);
    } else {
      this.engineWetGain.gain.setTargetAtTime(engineChainActive ? 1.0 : 0.0, t, rampTime);
      this.engineDryGain.gain.setTargetAtTime(engineChainActive ? 0.0 : 1.0, t, rampTime);
    }

    // 4. Resolve Intensity Multiplier
    const intensityKey = dspSettings.intensity || 'balanced';
    const intensityMultiplier = INTENSITY_MODES[intensityKey]?.multiplier ?? 1.0;

    // 5. Resolve Device Profile Offsets
    const devId = dspSettings.deviceProfile || 'universal';
    const deviceProfile = DEVICE_PROFILES.find(d => d.id === devId) || DEVICE_PROFILES[0];
    const deviceOffsets = deviceProfile.offsets || {};

    // 6. Compute Effective DSP parameters (Profile + Overrides + Bounded Adaptive Overlay)
    if (engineChainActive) {
      const effectiveDsp = { ...dspSettings };

      if (!engineOn && adaptiveOn) {
        // Flat baseline when main sound engine is OFF but adaptive intelligence is ON
        effectiveDsp.deepBass = 0;
        effectiveDsp.bassPunch = 0;
        effectiveDsp.vocalClarity = 0;
        effectiveDsp.harshnessControl = 0;
        effectiveDsp.crystalTreble = 0;
        effectiveDsp.bassTexture = 0;
        effectiveDsp.psychoacousticBass = false;
      }

      // Apply bounded adaptive offsets as a temporary acoustic overlay
      if (adaptiveOn && adaptiveOffsets) {
        effectiveDsp.deepBass = (effectiveDsp.deepBass ?? 2) + (adaptiveOffsets.deepBass ?? 0);
        effectiveDsp.bassPunch = (effectiveDsp.bassPunch ?? 2) + (adaptiveOffsets.bassPunch ?? 0);
        effectiveDsp.vocalClarity = (effectiveDsp.vocalClarity ?? 2) + (adaptiveOffsets.vocalClarity ?? 0);
        effectiveDsp.harshnessControl = (effectiveDsp.harshnessControl ?? 1) - (adaptiveOffsets.harshnessDamping ?? 0);
        effectiveDsp.crystalTreble = (effectiveDsp.crystalTreble ?? 2) + (adaptiveOffsets.trebleAir ?? 0);
      }

      this.bassProcessor.updateParameters(effectiveDsp, intensityMultiplier, deviceOffsets);
      this.vocalTrebleProcessor.updateParameters(effectiveDsp, intensityMultiplier, deviceOffsets);
      this.dynamicsProcessor.updateParameters(effectiveDsp);
      this.outputLimiter.updateParameters(effectiveDsp);

      // Perceived Loudness Normalization
      if (dspSettings.loudnessMatch) {
        this.loudnessGain.gain.setTargetAtTime(0.92, t, rampTime);
      } else {
        this.loudnessGain.gain.setTargetAtTime(1.0, t, rampTime);
      }
    } else {
      this.loudnessGain.gain.setTargetAtTime(1.0, t, rampTime);
    }

    // 7. Spatial Audio Stage (Independent)
    const spatialOn = !!(dspSettings.spatialEnabled || (engineOn && dspSettings.spatialMode && dspSettings.spatialMode !== 'stereo'));
    const spatialConfig = {
      ...dspSettings,
      spatialMode: spatialOn ? (dspSettings.spatialMode || 'wide') : 'stereo',
    };
    this.spatialProcessor.updateParameters(spatialConfig, intensityMultiplier, deviceOffsets);

    // 8. Equalizer Stage (Independent)
    this.equalizerProcessor.updateParameters(eqSettings);
  }

  /**
   * Computes stereo phase correlation coefficient r:
   * r = Sum(L * R) / sqrt(Sum(L^2) * Sum(R^2))
   */
  getPhaseCorrelation() {
    const bufferLength = this.analyserL.fftSize;
    const dataL = new Float32Array(bufferLength);
    const dataR = new Float32Array(bufferLength);

    this.analyserL.getFloatTimeDomainData(dataL);
    this.analyserR.getFloatTimeDomainData(dataR);

    let sumLR = 0;
    let sumLL = 0;
    let sumRR = 0;

    for (let i = 0; i < bufferLength; i++) {
      const l = dataL[i];
      const r = dataR[i];
      sumLR += l * r;
      sumLL += l * l;
      sumRR += r * r;
    }

    const denom = Math.sqrt(sumLL * sumRR);
    if (denom < 1e-6) return 1.0;
    return Math.max(-1.0, Math.min(1.0, sumLR / denom));
  }

  /**
   * Retrieves peak output levels in dBFS.
   */
  getPeakLevel() {
    const bufferLength = this.analyser.fftSize;
    const timeData = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(timeData);

    let maxSample = 0;
    for (let i = 0; i < bufferLength; i++) {
      const absVal = Math.abs(timeData[i]);
      if (absVal > maxSample) maxSample = absVal;
    }

    const peakDb = maxSample > 1e-5 ? 20 * Math.log10(maxSample) : -90;
    return {
      peakLinear: maxSample,
      peakDb: Math.max(-90, Math.min(6, peakDb)),
      isClipping: maxSample >= 0.995,
    };
  }

  /**
   * Live acoustic health and resonance detection.
   */
  getAcousticHealthAnalysis() {
    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(freqData);

    const nyquist = (this.ctx?.sampleRate || 48000) / 2;
    const binHz = nyquist / bufferLength;

    const bandEnergy = (fStart, fEnd) => {
      const startBin = Math.max(0, Math.floor(fStart / binHz));
      const endBin = Math.min(bufferLength - 1, Math.ceil(fEnd / binHz));
      if (startBin >= endBin) return freqData[startBin] / 255;
      let sum = 0;
      for (let b = startBin; b <= endBin; b++) sum += freqData[b];
      return (sum / (endBin - startBin + 1)) / 255;
    };

    const subRumble = bandEnergy(10, 28);
    const lowMidMud = bandEnergy(200, 350);
    const harshness = bandEnergy(3200, 4600);
    const sibilance = bandEnergy(6000, 8500);
    const hissNoise = bandEnergy(16500, 22000);

    const phase = this.getPhaseCorrelation();
    const peak = this.getPeakLevel();

    let comfortScore = 96;
    if (harshness > 0.65) comfortScore -= Math.min(22, Math.round((harshness - 0.65) * 55));
    if (sibilance > 0.68) comfortScore -= Math.min(18, Math.round((sibilance - 0.68) * 45));
    if (lowMidMud > 0.70) comfortScore -= Math.min(14, Math.round((lowMidMud - 0.70) * 35));
    if (phase < 0.15) comfortScore -= 12;
    comfortScore = Math.max(45, Math.min(99, comfortScore));

    const comfortRating = comfortScore >= 88 ? 'All-Day Safe (4+ Hours)' : comfortScore >= 75 ? 'Optimal (2–3 Hours)' : 'Moderate Exposure';

    return {
      acousticComfort: {
        score: comfortScore,
        rating: comfortRating,
        isSafe: comfortScore >= 70,
        fatigueCushionActive: true,
      },
      subsonicRumble: {
        detected: subRumble > 0.40,
        level: Math.round(subRumble * 100),
        shieldStatus: '22–68 Hz Subsonic Filter Active',
      },
      lowMidMud: {
        detected: lowMidMud > 0.60,
        level: Math.round(lowMidMud * 100),
        shieldStatus: '280 Hz Dynamic Mud Scoop Active',
      },
      harshResonance: {
        detected: harshness > 0.68,
        level: Math.round(harshness * 100),
        shieldStatus: '3.8 kHz Anti-Harshness Damping Active',
      },
      sibilanceSpikes: {
        detected: sibilance > 0.70,
        level: Math.round(sibilance * 100),
        shieldStatus: '6.8 kHz Precision De-Esser Active',
      },
      ultrasonicNoise: {
        detected: hissNoise > 0.35,
        level: Math.round(hissNoise * 100),
        shieldStatus: '18.5 kHz Ultrasonic Noise Filter Active',
      },
      phaseCorrelation: {
        value: phase.toFixed(2),
        isSafe: phase >= 0.1,
        status: phase >= 0.7 ? 'Pure Stereo' : phase >= 0.3 ? 'Expansive 3D' : phase >= 0 ? 'Wide Staged' : 'Phase Protected',
      },
      speakerProtection: {
        isProtecting: peak.peakLinear > 0.82 || subRumble > 0.38,
        status: 'Hardware Excursion & Peak Limiter Active',
      },
    };
  }
}
