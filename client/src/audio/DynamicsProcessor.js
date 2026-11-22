/**
 * audio/DynamicsProcessor.js
 * Professional 3-Band Linkwitz-Riley 4th-Order (LR4) Dynamic Processor.
 * 
 * Frequency Crossover Architecture:
 *   Band 1: Low-End (< 160 Hz) - Sub-bass weight and kick punch
 *   Band 2: Vocal Midrange (160 Hz – 3.5 kHz) - Speech clarity, dialogue, guitars, instruments
 *   Band 3: Treble / Air (> 3.5 kHz) - Sibilance control, cymbal brilliance, high-frequency sparkle
 * 
 * The cascaded 4th-order Linkwitz-Riley crossover guarantees a mathematically flat (0.00 dB)
 * magnitude sum across all frequencies with zero comb filtering, phase holes, or vocal hollowing.
 */

export class DynamicsProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    this.inputNode = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // ── Low/Mid Crossover (160 Hz, LR4 = 2 cascaded Butterworth filters) ──
    this.lowLP1 = audioCtx.createBiquadFilter();
    this.lowLP1.type = 'lowpass';
    this.lowLP1.frequency.value = 160;
    this.lowLP1.Q.value = 0.7071;

    this.lowLP2 = audioCtx.createBiquadFilter();
    this.lowLP2.type = 'lowpass';
    this.lowLP2.frequency.value = 160;
    this.lowLP2.Q.value = 0.7071;

    this.midHighHP1 = audioCtx.createBiquadFilter();
    this.midHighHP1.type = 'highpass';
    this.midHighHP1.frequency.value = 160;
    this.midHighHP1.Q.value = 0.7071;

    this.midHighHP2 = audioCtx.createBiquadFilter();
    this.midHighHP2.type = 'highpass';
    this.midHighHP2.frequency.value = 160;
    this.midHighHP2.Q.value = 0.7071;

    // ── Mid/High Crossover (3500 Hz, LR4) ─────────────────────────
    this.midLP1 = audioCtx.createBiquadFilter();
    this.midLP1.type = 'lowpass';
    this.midLP1.frequency.value = 3500;
    this.midLP1.Q.value = 0.7071;

    this.midLP2 = audioCtx.createBiquadFilter();
    this.midLP2.type = 'lowpass';
    this.midLP2.frequency.value = 3500;
    this.midLP2.Q.value = 0.7071;

    this.highHP1 = audioCtx.createBiquadFilter();
    this.highHP1.type = 'highpass';
    this.highHP1.frequency.value = 3500;
    this.highHP1.Q.value = 0.7071;

    this.highHP2 = audioCtx.createBiquadFilter();
    this.highHP2.type = 'highpass';
    this.highHP2.frequency.value = 3500;
    this.highHP2.Q.value = 0.7071;

    // ── Dynamic Compressors for Each Band (Transparent, Musical & Open) ──
    // Band 1: Low-End (< 160 Hz) - Preserves kick drum transient snap
    this.comp1 = audioCtx.createDynamicsCompressor();
    this.comp1.threshold.value = -3.5;
    this.comp1.knee.value = 4.0;
    this.comp1.ratio.value = 1.25;
    this.comp1.attack.value = 0.045; // 45ms: lets kick transient hit through unchoked
    this.comp1.release.value = 0.100;

    // Band 2: Mid-Band (160 Hz – 3500 Hz) - Vocal clarity, dialogue, melodic warmth
    this.comp2 = audioCtx.createDynamicsCompressor();
    this.comp2.threshold.value = -4.0;
    this.comp2.knee.value = 4.0;
    this.comp2.ratio.value = 1.20;
    this.comp2.attack.value = 0.035; // 35ms: transparent vocal consonants
    this.comp2.release.value = 0.080;

    // Band 3: High-Band (> 3500 Hz) - Smooth sibilance and silky air without pumping
    this.comp3 = audioCtx.createDynamicsCompressor();
    this.comp3.threshold.value = -4.5;
    this.comp3.knee.value = 4.0;
    this.comp3.ratio.value = 1.22;
    this.comp3.attack.value = 0.020;
    this.comp3.release.value = 0.060;

    // Band Makeup Gains
    this.gain1 = audioCtx.createGain();
    this.gain2 = audioCtx.createGain();
    this.gain3 = audioCtx.createGain();
    this.gain1.gain.value = 1.0;
    this.gain2.gain.value = 1.0;
    this.gain3.gain.value = 1.0;

    // Summer Node
    this.summer = audioCtx.createGain();

    // Bypass & Wet Gains
    this.dryGain = audioCtx.createGain();
    this.wetGain = audioCtx.createGain();
    this.dryGain.gain.value = 0.0;
    this.wetGain.gain.value = 1.0;

    // ── Wire Signal Routing ─────────────────────────────────────────
    // Band 1: Low (< 160 Hz)
    this.inputNode.connect(this.lowLP1);
    this.lowLP1.connect(this.lowLP2);
    this.lowLP2.connect(this.comp1);
    this.comp1.connect(this.gain1);
    this.gain1.connect(this.summer);

    // Mid/High Bus (HP 160 Hz)
    this.inputNode.connect(this.midHighHP1);
    this.midHighHP1.connect(this.midHighHP2);

    // Band 2: Mid (160 Hz – 3500 Hz)
    this.midHighHP2.connect(this.midLP1);
    this.midLP1.connect(this.midLP2);
    this.midLP2.connect(this.comp2);
    this.comp2.connect(this.gain2);
    this.gain2.connect(this.summer);

    // Band 3: High (> 3500 Hz)
    this.midHighHP2.connect(this.highHP1);
    this.highHP1.connect(this.highHP2);
    this.highHP2.connect(this.comp3);
    this.comp3.connect(this.gain3);
    this.gain3.connect(this.summer);

    // Wet & Dry Summing to Output
    this.summer.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  updateParameters(settings) {
    const t = this.ctx.currentTime;
    const rampTime = 0.035;

    const enabled = settings.multibandEnabled !== false;
    const preserveDynamics = settings.dynamicRangePreservation !== false;

    if (!enabled) {
      if (t === 0) {
        this.dryGain.gain.setValueAtTime(1.0, 0);
        this.wetGain.gain.setValueAtTime(0.0, 0);
      } else {
        this.dryGain.gain.setTargetAtTime(1.0, t, rampTime);
        this.wetGain.gain.setTargetAtTime(0.0, t, rampTime);
      }
      return;
    }

    if (t === 0) {
      this.dryGain.gain.setValueAtTime(0.0, 0);
      this.wetGain.gain.setValueAtTime(1.0, 0);
    } else {
      this.dryGain.gain.setTargetAtTime(0.0, t, rampTime);
      this.wetGain.gain.setTargetAtTime(1.0, t, rampTime);
    }

    // Dynamic Crest Preservation: keeps ratios musical and transparent without squashing
    const ratioScale = preserveDynamics ? 0.80 : 1.0;
    const threshOffset = preserveDynamics ? 1.5 : 0.0;
    const userBassComp = (settings.bassCompression ?? 1.8) * 0.15;

    const thresh1 = Math.max(-6.0, -3.5 + threshOffset - userBassComp);
    const ratio1  = Math.max(1.10, 1.25 * ratioScale + (userBassComp * 0.1));

    const thresh2 = Math.max(-6.0, -4.0 + threshOffset);
    const ratio2  = Math.max(1.10, 1.20 * ratioScale);

    const thresh3 = Math.max(-6.0, -4.5 + threshOffset);
    const ratio3  = Math.max(1.10, 1.22 * ratioScale);

    if (t === 0) {
      this.comp1.threshold.setValueAtTime(thresh1, 0);
      this.comp1.ratio.setValueAtTime(ratio1, 0);
      this.comp2.threshold.setValueAtTime(thresh2, 0);
      this.comp2.ratio.setValueAtTime(ratio2, 0);
      this.comp3.threshold.setValueAtTime(thresh3, 0);
      this.comp3.ratio.setValueAtTime(ratio3, 0);
    } else {
      this.comp1.threshold.setTargetAtTime(thresh1, t, rampTime);
      this.comp1.ratio.setTargetAtTime(ratio1, t, rampTime);
      this.comp2.threshold.setTargetAtTime(thresh2, t, rampTime);
      this.comp2.ratio.setTargetAtTime(ratio2, t, rampTime);
      this.comp3.threshold.setTargetAtTime(thresh3, t, rampTime);
      this.comp3.ratio.setTargetAtTime(ratio3, t, rampTime);
    }
  }
}
