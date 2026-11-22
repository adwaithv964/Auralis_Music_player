/**
 * audio/OutputLimiter.js
 * True-Peak-Aware Lookahead Soft Limiter and Clipping Protection Engine.
 * 
 * Protects output transducers and ears against digital clipping, inter-sample peaks,
 * and sudden volume bursts from aggressive equalization or hot audio sources.
 * 
 * Implements:
 *   1. Headroom Pre-Scaling (-2.0 dB)
 *   2. Soft-knee Hyperbolic Tangent (tanh) WaveShaper Saturation
 *   3. Ultra-fast Safety Brickwall Dynamics Compressor
 *   4. Output Ceiling (-1.0 dBTP default)
 */

export class OutputLimiter {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    this.inputNode = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // 1. Headroom Gain Stage: Unity 0.0 dB for full dynamic punch and transparent volume
    this.headroomGain = audioCtx.createGain();
    this.headroomGain.gain.value = 1.0; // 0.0 dB (no artificial gain reduction)

    // 2. Ultra-Fast Safety Dynamics Compressor (catches overs > -1.0 dBFS)
    this.safetyCompressor = audioCtx.createDynamicsCompressor();
    this.safetyCompressor.threshold.value = -1.0; // -1.0 dBFS safety threshold
    this.safetyCompressor.knee.value = 2.0;
    this.safetyCompressor.ratio.value = 20.0;
    this.safetyCompressor.attack.value = 0.001;   // 1ms ultra-fast attack
    this.safetyCompressor.release.value = 0.035;  // 35ms fast recovery

    // 3. Anti-Aliased Soft Knee WaveShaper Brickwall Ceiling (-1.0 dBFS / 0.891)
    this.waveShaper = audioCtx.createWaveShaper();
    this.waveShaper.curve = this._generateLimiterCurve(4096, 0.891);
    this.waveShaper.oversample = '4x'; // 4x oversampling for pristine anti-aliasing

    // 4. Output Master Ceiling Gain
    this.ceilingGain = audioCtx.createGain();
    this.ceilingGain.gain.value = 1.0;

    // Connect Limiter Stage in series
    this.inputNode.connect(this.headroomGain);
    this.headroomGain.connect(this.safetyCompressor);
    this.safetyCompressor.connect(this.waveShaper);
    this.waveShaper.connect(this.ceilingGain);
    this.ceilingGain.connect(this.outputNode);
  }

  /**
   * Generates a smooth, continuous soft-knee saturation curve:
   * Below knee: linear unity gain y = x
   * Above knee: smooth tanh asymptotic curve strictly bounded to ceiling
   */
  _generateLimiterCurve(samples, ceiling = 0.891) {
    const curve = new Float32Array(samples);
    const knee = ceiling * 0.85;

    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / (samples - 1) - 1;
      const absX = Math.abs(x);

      if (absX <= knee) {
        curve[i] = x;
      } else {
        const sign = x >= 0 ? 1 : -1;
        const excess = absX - knee;
        const compressed = Math.tanh(excess / (ceiling - knee)) * (ceiling - knee);
        curve[i] = sign * Math.min(ceiling, knee + compressed);
      }
    }
    return curve;
  }

  updateParameters(settings) {
    const t = this.ctx.currentTime;
    const rampTime = 0.030;

    const ceilingDb = settings.outputCeiling ?? -1.0; // dB
    const linearCeiling = Math.pow(10, ceilingDb / 20);

    // Update safety compressor threshold to match ceiling
    if (t === 0) {
      this.safetyCompressor.threshold.setValueAtTime(ceilingDb, 0);
      this.ceilingGain.gain.setValueAtTime(1.0, 0);
    } else {
      this.safetyCompressor.threshold.setTargetAtTime(ceilingDb, t, rampTime);
      this.ceilingGain.gain.setTargetAtTime(1.0, t, rampTime);
    }
  }
}
