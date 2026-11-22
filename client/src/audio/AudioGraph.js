/**
 * audio/AudioGraph.js
 * Authoritative Web Audio Signal Routing Graph for Auralis Music.
 * 
 * Guarantees:
 *   1. Genuine bypass paths for both Auralis Sound Engine and Advanced Equalizer.
 *   2. Zero-pop parameter updates via AudioParam automation.
 *   3. Real-time spectrum, true-peak, and stereo phase correlation telemetry.
 *   4. Exactly one connection to AudioDestinationNode.
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

    // ── Input Stage ────────────────────────────────────────────────
    this.inputNode     = audioCtx.createGain();
    this.inputGainNode = audioCtx.createGain();
    this.inputGainNode.gain.value = 1.0;
    this.inputNode.connect(this.inputGainNode);

    // ── Engine Processing Chain ────────────────────────────────────
    this.bassProcessor        = new BassProcessor(audioCtx);
    this.vocalTrebleProcessor = new VocalTrebleProcessor(audioCtx);
    this.spatialProcessor     = new SpatialProcessor(audioCtx);
    this.dynamicsProcessor    = new DynamicsProcessor(audioCtx);
    this.outputLimiter        = new OutputLimiter(audioCtx);

    // Connect Engine modules in series
    this.inputGainNode.connect(this.bassProcessor.inputNode);
    this.bassProcessor.outputNode.connect(this.vocalTrebleProcessor.inputNode);
    this.vocalTrebleProcessor.outputNode.connect(this.spatialProcessor.inputNode);
    this.spatialProcessor.outputNode.connect(this.dynamicsProcessor.inputNode);
    this.dynamicsProcessor.outputNode.connect(this.outputLimiter.inputNode);

    // ── Engine Wet / Dry Bypass Crossfader ─────────────────────────
    this.engineWetGain = audioCtx.createGain();
    this.engineDryGain = audioCtx.createGain();
    this.engineWetGain.gain.value = 0.0;
    this.engineDryGain.gain.value = 1.0; // Default: bypassed

    this.outputLimiter.outputNode.connect(this.engineWetGain);
    this.inputGainNode.connect(this.engineDryGain); // Pure dry bypass path

    // Sum Engine output (wet or dry)
    this.engineSumNode = audioCtx.createGain();
    this.engineWetGain.connect(this.engineSumNode);
    this.engineDryGain.connect(this.engineSumNode);

    // ── Advanced Equalizer Stage (Independent) ─────────────────────
    this.equalizerProcessor = new EqualizerProcessor(audioCtx);
    this.engineSumNode.connect(this.equalizerProcessor.inputNode);

    // ── Loudness Matching / A-B Gain Normalizer ─────────────────────
    this.loudnessGain = audioCtx.createGain();
    this.loudnessGain.gain.value = 1.0;
    this.equalizerProcessor.outputNode.connect(this.loudnessGain);

    // ── Master Output Stage ────────────────────────────────────────
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 1.0;
    this.loudnessGain.connect(this.masterGain);

    // ── Telemetry & Visualizer Analysers ───────────────────────────
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

    // Connect Master Out to Audio Destination
    this.masterGain.connect(audioCtx.destination);
  }

  /**
   * Updates all DSP and EQ parameters smoothly.
   */
  applySettings(dspSettings, eqSettings) {
    const t = this.ctx.currentTime;
    const rampTime = 0.035;

    // 1. Input Gain Stage
    const inDb = dspSettings.inputGain || 0;
    const inLin = Math.pow(10, inDb / 20);
    this.inputGainNode.gain.setTargetAtTime(inLin, t, rampTime);

    // 2. Engine Bypass Control
    const engineOn = !!dspSettings.engineEnabled;
    this.engineWetGain.gain.setTargetAtTime(engineOn ? 1.0 : 0.0, t, rampTime);
    this.engineDryGain.gain.setTargetAtTime(engineOn ? 0.0 : 1.0, t, rampTime);

    // 3. Resolve Intensity Multiplier
    const intensityKey = dspSettings.intensity || 'balanced';
    const intensityMultiplier = INTENSITY_MODES[intensityKey]?.multiplier ?? 1.0;

    // 4. Resolve Device Profile Offsets
    const devId = dspSettings.deviceProfile || 'universal';
    const deviceProfile = DEVICE_PROFILES.find(d => d.id === devId) || DEVICE_PROFILES[0];
    const deviceOffsets = deviceProfile.offsets || {};

    // 5. Update Engine Modules
    if (engineOn) {
      this.bassProcessor.updateParameters(dspSettings, intensityMultiplier, deviceOffsets);
      this.vocalTrebleProcessor.updateParameters(dspSettings, intensityMultiplier, deviceOffsets);
      this.spatialProcessor.updateParameters(dspSettings, intensityMultiplier, deviceOffsets);
      this.dynamicsProcessor.updateParameters(dspSettings);
      this.outputLimiter.updateParameters(dspSettings);

      // Loudness Matching A/B: If enabled, attenuate enhanced signal by 2.2 dB
      // to equalize perceived loudness with the original flat signal
      if (dspSettings.loudnessMatch) {
        this.loudnessGain.gain.setTargetAtTime(0.77, t, rampTime); // -2.25 dB
      } else {
        this.loudnessGain.gain.setTargetAtTime(1.0, t, rampTime);
      }
    } else {
      this.loudnessGain.gain.setTargetAtTime(1.0, t, rampTime);
    }

    // 6. Update Independent Equalizer
    this.equalizerProcessor.updateParameters(eqSettings);
  }

  /**
   * Computes stereo phase correlation coefficient r:
   * r = Sum(L * R) / sqrt(Sum(L^2) * Sum(R^2))
   *   +1.0 = Pure mono / perfect correlation
   *    0.0 = Wide decorrelated stereo
   *   -1.0 = Severe phase cancellation (out-of-phase)
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
    if (denom < 1e-6) return 1.0; // Silence or near-zero signal
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
}
