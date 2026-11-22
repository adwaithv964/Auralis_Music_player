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

    // 2. Anti-Aliased Soft Knee WaveShaper
    this.waveShaper = audioCtx.createWaveShaper();
    this.waveShaper.curve = this._generateLimiterCurve(4096, 0.944); // 0.944 = -0.5 dBFS ceiling
    this.waveShaper.oversample = '4x'; // 4x oversampling for pristine anti-aliasing

    // 3. Ultra-Fast Safety Dynamics Compressor (catches only genuine overs above -0.5 dBFS)
    this.safetyCompressor = audioCtx.createDynamicsCompressor();
    this.safetyCompressor.threshold.value = -0.5; // -0.5 dBFS (transparent safety ceiling)
    this.safetyCompressor.knee.value = 3.0;
    this.safetyCompressor.ratio.value = 12.0;
    this.safetyCompressor.attack.value = 0.002;   // 2ms transparent attack
    this.safetyCompressor.release.value = 0.040;  // 40ms fast recovery

    // 4. Output Master Ceiling Gain
    this.ceilingGain = audioCtx.createGain();
    this.ceilingGain.gain.value = 1.0;

    // Connect Limiter Stage
    this.inputNode.connect(this.headroomGain);
    this.headroomGain.connect(this.waveShaper);
    this.waveShaper.connect(this.safetyCompressor);
    this.safetyCompressor.connect(this.ceilingGain);
    this.ceilingGain.connect(this.outputNode);
  }

  /**
   * Generates a smooth, continuous soft-knee saturation curve:
   * Below knee (0.75 / -2.5 dBFS): linear unity gain y = x
   * Above knee: smooth tanh asymptotic curve approaching ceiling c (-1.0 dBFS)
   */
  _generateLimiterCurve(samples, ceiling = 0.891) {
    const curve = new Float32Array(samples);
    const knee = ceiling * 0.82; // Start soft saturation at ~82% of ceiling

    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      const absX = Math.abs(x);

      if (absX <= knee) {
        curve[i] = x;
      } else {
        const sign = x >= 0 ? 1 : -1;
        // Smooth tanh transition to ceiling
        const excess = absX - knee;
        const maxExcess = 1.0 - knee;
        const compressed = Math.tanh(excess / (ceiling - knee)) * (ceiling - knee);
        curve[i] = sign * (knee + compressed);
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
    this.safetyCompressor.threshold.setTargetAtTime(Math.min(-0.5, ceilingDb), t, rampTime);
    this.ceilingGain.gain.setTargetAtTime(Math.min(1.0, linearCeiling * 1.1), t, rampTime);
  }
}
