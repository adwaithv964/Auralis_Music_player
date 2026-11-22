/**
 * audio/EqualizerProcessor.js
 * Independent 10-Band Graphic / Parametric Equalizer.
 * 
 * Frequencies: 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz.
 * Independent Bypass: When eqEnabled is false, the signal bypasses all 10 filter
 * stages completely with unity gain (0.0 dB) and zero phase alteration.
 */

import { EQ_FREQUENCIES } from './constants';

export class EqualizerProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    this.inputNode  = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // Wet & Dry bypass switches
    this.wetGain = audioCtx.createGain();
    this.dryGain = audioCtx.createGain();
    this.wetGain.gain.value = 0.0;
    this.dryGain.gain.value = 1.0; // Default bypassed

    // Create the 10 peaking filters in series
    this.filters = EQ_FREQUENCIES.map((freq, index) => {
      const filter = audioCtx.createBiquadFilter();
      if (index === 0) {
        // Lowest band can be a gentle low-shelf or peaking
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.2;
      } else if (index === EQ_FREQUENCIES.length - 1) {
        // Highest band (16 kHz) peaking
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.2;
      } else {
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.414; // Standard 1-octave bandwidth
      }
      filter.gain.value = 0.0;
      return filter;
    });

    // Connect filters in series
    for (let i = 0; i < this.filters.length - 1; ++i) {
      this.filters[i].connect(this.filters[i + 1]);
    }

    // Connect Wet Path: input -> filter[0] -> ... -> filter[9] -> wetGain -> output
    this.inputNode.connect(this.filters[0]);
    this.filters[this.filters.length - 1].connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    // Connect Dry Bypass Path: input -> dryGain -> output
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  updateParameters(eqSettings) {
    const t = this.ctx.currentTime;
    const rampTime = 0.030; // 30ms pop-free transition

    const isEnabled = !!eqSettings.eqEnabled;
    const bands = eqSettings.bands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    // Smooth Wet / Dry crossfade
    this.wetGain.gain.setTargetAtTime(isEnabled ? 1.0 : 0.0, t, rampTime);
    this.dryGain.gain.setTargetAtTime(isEnabled ? 0.0 : 1.0, t, rampTime);

    // Update filter gains (-12 dB to +12 dB clamped)
    this.filters.forEach((filter, idx) => {
      const rawGain = bands[idx] ?? 0;
      const targetGain = Math.max(-12, Math.min(12, rawGain));
      filter.gain.setTargetAtTime(targetGain, t, rampTime);
    });
  }
}
