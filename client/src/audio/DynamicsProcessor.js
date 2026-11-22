/**
 * audio/DynamicsProcessor.js
 * Professional 5-Band Multiband Dynamic Processor.
 * 
 * Frequency Bands:
 *   1. Sub/Bass:    < 120 Hz
 *   2. Low-Mid:     120 Hz – 500 Hz
 *   3. Midrange:    500 Hz – 2.5 kHz
 *   4. High-Mid:    2.5 kHz – 8.0 kHz
 *   5. Treble:      > 8.0 kHz
 * 
 * Each band features dedicated Linkwitz-Riley crossover filtering and
 * dynamic range compression with transparent attack/release envelopes.
 * Dynamic Range Preservation mode keeps ratios gentle (1.3:1 - 1.8:1) to retain musical punch.
 */

export class DynamicsProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    this.inputNode = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // ── Crossover Filters ──────────────────────────────────────────
    // Band 1: Sub/Bass (< 120 Hz)
    this.band1Filter = audioCtx.createBiquadFilter();
    this.band1Filter.type = 'lowpass';
    this.band1Filter.frequency.value = 120;
    this.band1Filter.Q.value = 0.707;

    // Band 2: Low-Mid (120 Hz - 500 Hz)
    this.band2FilterLP = audioCtx.createBiquadFilter();
    this.band2FilterLP.type = 'lowpass';
    this.band2FilterLP.frequency.value = 500;
    this.band2FilterHP = audioCtx.createBiquadFilter();
    this.band2FilterHP.type = 'highpass';
    this.band2FilterHP.frequency.value = 120;

    // Band 3: Mid (500 Hz - 2500 Hz)
    this.band3FilterLP = audioCtx.createBiquadFilter();
    this.band3FilterLP.type = 'lowpass';
    this.band3FilterLP.frequency.value = 2500;
    this.band3FilterHP = audioCtx.createBiquadFilter();
    this.band3FilterHP.type = 'highpass';
    this.band3FilterHP.frequency.value = 500;

    // Band 4: High-Mid (2500 Hz - 8000 Hz)
    this.band4FilterLP = audioCtx.createBiquadFilter();
    this.band4FilterLP.type = 'lowpass';
    this.band4FilterLP.frequency.value = 8000;
    this.band4FilterHP = audioCtx.createBiquadFilter();
    this.band4FilterHP.type = 'highpass';
    this.band4FilterHP.frequency.value = 2500;

    // Band 5: Treble (> 8000 Hz)
    this.band5Filter = audioCtx.createBiquadFilter();
    this.band5Filter.type = 'highpass';
    this.band5Filter.frequency.value = 8000;
    this.band5Filter.Q.value = 0.707;

    // ── Compressors for each band (Mastering Grade: Transparent, Open & Dynamic) ─
    this.comp1 = audioCtx.createDynamicsCompressor(); // Sub/Bass
    this.comp1.threshold.value = -4.0;
    this.comp1.ratio.value = 1.25;
    this.comp1.attack.value = 0.045; // 45ms: preserves kick drum transient impact
    this.comp1.release.value = 0.120;

    this.comp2 = audioCtx.createDynamicsCompressor(); // Low-Mid
    this.comp2.threshold.value = -5.0;
    this.comp2.ratio.value = 1.20;
    this.comp2.attack.value = 0.035;
    this.comp2.release.value = 0.100;

    this.comp3 = audioCtx.createDynamicsCompressor(); // Mid
    this.comp3.threshold.value = -5.0;
    this.comp3.ratio.value = 1.20;
    this.comp3.attack.value = 0.030;
    this.comp3.release.value = 0.080;

    this.comp4 = audioCtx.createDynamicsCompressor(); // High-Mid
    this.comp4.threshold.value = -5.0;
    this.comp4.ratio.value = 1.20;
    this.comp4.attack.value = 0.025;
    this.comp4.release.value = 0.070;

    this.comp5 = audioCtx.createDynamicsCompressor(); // Treble
    this.comp5.threshold.value = -4.5;
    this.comp5.ratio.value = 1.25;
    this.comp5.attack.value = 0.020;
    this.comp5.release.value = 0.050;

    // Band Makeup Gains
    this.gain1 = audioCtx.createGain();
    this.gain2 = audioCtx.createGain();
    this.gain3 = audioCtx.createGain();
    this.gain4 = audioCtx.createGain();
    this.gain5 = audioCtx.createGain();

    // Summer Node
    this.summer = audioCtx.createGain();

    // Direct Bypass Gain for Multiband (when multibandEnabled is false)
    this.dryGain = audioCtx.createGain();
    this.wetGain = audioCtx.createGain();
    this.dryGain.gain.value = 0.0;
    this.wetGain.gain.value = 1.0;

    // Wire Band 1
    this.inputNode.connect(this.band1Filter);
    this.band1Filter.connect(this.comp1);
    this.comp1.connect(this.gain1);
    this.gain1.connect(this.summer);

    // Wire Band 2
    this.inputNode.connect(this.band2FilterHP);
    this.band2FilterHP.connect(this.band2FilterLP);
    this.band2FilterLP.connect(this.comp2);
    this.comp2.connect(this.gain2);
    this.gain2.connect(this.summer);

    // Wire Band 3
    this.inputNode.connect(this.band3FilterHP);
    this.band3FilterHP.connect(this.band3FilterLP);
    this.band3FilterLP.connect(this.comp3);
    this.comp3.connect(this.gain3);
    this.gain3.connect(this.summer);

    // Wire Band 4
    this.inputNode.connect(this.band4FilterHP);
    this.band4FilterHP.connect(this.band4FilterLP);
    this.band4FilterLP.connect(this.comp4);
    this.comp4.connect(this.gain4);
    this.gain4.connect(this.summer);

    // Wire Band 5
    this.inputNode.connect(this.band5Filter);
    this.band5Filter.connect(this.comp5);
    this.comp5.connect(this.gain5);
    this.gain5.connect(this.summer);

    // Wire Wet/Dry to Output
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
      this.dryGain.gain.setTargetAtTime(1.0, t, rampTime);
      this.wetGain.gain.setTargetAtTime(0.0, t, rampTime);
      return;
    }

    this.dryGain.gain.setTargetAtTime(0.0, t, rampTime);
    this.wetGain.gain.setTargetAtTime(1.0, t, rampTime);

    // Mastering dynamic control: gentle, musical crest preservation without squashing
    const ratioScale = preserveDynamics ? 0.75 : 1.0;
    const threshOffset = preserveDynamics ? 2.0 : 0.0;

    this.comp1.threshold.setTargetAtTime(-4.5 + threshOffset, t, rampTime);
    this.comp1.ratio.setTargetAtTime(Math.max(1.10, 1.30 * ratioScale), t, rampTime);

    this.comp2.threshold.setTargetAtTime(-5.0 + threshOffset, t, rampTime);
    this.comp2.ratio.setTargetAtTime(Math.max(1.10, 1.25 * ratioScale), t, rampTime);

    this.comp3.threshold.setTargetAtTime(-5.0 + threshOffset, t, rampTime);
    this.comp3.ratio.setTargetAtTime(Math.max(1.10, 1.20 * ratioScale), t, rampTime);

    this.comp4.threshold.setTargetAtTime(-5.0 + threshOffset, t, rampTime);
    this.comp4.ratio.setTargetAtTime(Math.max(1.10, 1.25 * ratioScale), t, rampTime);

    this.comp5.threshold.setTargetAtTime(-4.5 + threshOffset, t, rampTime);
    this.comp5.ratio.setTargetAtTime(Math.max(1.10, 1.30 * ratioScale), t, rampTime);
  }
}
