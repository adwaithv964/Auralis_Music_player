/**
 * audio/VocalTrebleProcessor.js
 * Dedicated Vocal Clarity and Crystal-Clear Treble Engine.
 * 
 * Provides:
 *   1. Intelligibility peaking filter (2.2 kHz)
 *   2. Vocal presence filter (3.2 kHz)
 *   3. Nasal resonance notch filter (820 Hz)
 *   4. Harshness damping filter (3.8 kHz)
 *   5. Vocal body warmth filter (450 Hz)
 *   6. Crystal treble detail peaking filter (7.2 kHz)
 *   7. High-shelf air & sparkle filter (12 kHz)
 *   8. Dynamic de-esser filter (6.8 kHz)
 */

export class VocalTrebleProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    // 1. Vocal Warmth & Chest Resonance (450 Hz)
    this.vocalWarmthFilter = audioCtx.createBiquadFilter();
    this.vocalWarmthFilter.type = 'peaking';
    this.vocalWarmthFilter.frequency.value = 450;
    this.vocalWarmthFilter.Q.value = 1.1;
    this.vocalWarmthFilter.gain.value = 0;

    // 2. Nasal Resonance Notch / Dip (820 Hz - reduces boxiness)
    this.nasalNotchFilter = audioCtx.createBiquadFilter();
    this.nasalNotchFilter.type = 'peaking';
    this.nasalNotchFilter.frequency.value = 820;
    this.nasalNotchFilter.Q.value = 2.2;
    this.nasalNotchFilter.gain.value = 0;

    // 3. Vocal Intelligibility & Clarity (2.2 kHz)
    this.vocalClarityFilter = audioCtx.createBiquadFilter();
    this.vocalClarityFilter.type = 'peaking';
    this.vocalClarityFilter.frequency.value = 2200;
    this.vocalClarityFilter.Q.value = 1.2;
    this.vocalClarityFilter.gain.value = 0;

    // 4. Vocal Presence (3.2 kHz)
    this.vocalPresenceFilter = audioCtx.createBiquadFilter();
    this.vocalPresenceFilter.type = 'peaking';
    this.vocalPresenceFilter.frequency.value = 3200;
    this.vocalPresenceFilter.Q.value = 1.3;
    this.vocalPresenceFilter.gain.value = 0;

    // 5. Harshness Damping (3.8 kHz - prevents screech/ear fatigue)
    this.harshnessFilter = audioCtx.createBiquadFilter();
    this.harshnessFilter.type = 'peaking';
    this.harshnessFilter.frequency.value = 3800;
    this.harshnessFilter.Q.value = 1.8;
    this.harshnessFilter.gain.value = 0;

    // 6. De-Esser / Sibilance Damping (6.8 kHz)
    this.deEsserFilter = audioCtx.createBiquadFilter();
    this.deEsserFilter.type = 'peaking';
    this.deEsserFilter.frequency.value = 6800;
    this.deEsserFilter.Q.value = 2.5;
    this.deEsserFilter.gain.value = 0;

    // 7. Treble Detail & Transient Definition (7.2 kHz)
    this.trebleDetailFilter = audioCtx.createBiquadFilter();
    this.trebleDetailFilter.type = 'peaking';
    this.trebleDetailFilter.frequency.value = 7200;
    this.trebleDetailFilter.Q.value = 1.4;
    this.trebleDetailFilter.gain.value = 0;

    // 8. Air & Sparkle High-Shelf (12.0 kHz)
    this.airShelfFilter = audioCtx.createBiquadFilter();
    this.airShelfFilter.type = 'highshelf';
    this.airShelfFilter.frequency.value = 12000;
    this.airShelfFilter.gain.value = 0;

    // Serial Chain Connection
    this.vocalWarmthFilter.connect(this.nasalNotchFilter);
    this.nasalNotchFilter.connect(this.vocalClarityFilter);
    this.vocalClarityFilter.connect(this.vocalPresenceFilter);
    this.vocalPresenceFilter.connect(this.harshnessFilter);
    this.harshnessFilter.connect(this.deEsserFilter);
    this.deEsserFilter.connect(this.trebleDetailFilter);
    this.trebleDetailFilter.connect(this.airShelfFilter);

    this.inputNode = this.vocalWarmthFilter;
    this.outputNode = this.airShelfFilter;
  }

  updateParameters(settings, intensityMult = 1.0, deviceOffsets = {}) {
    const t = this.ctx.currentTime;
    const rampTime = 0.035;

    // Vocal params
    const clarityGain   = ((settings.vocalClarity ?? 2.0)  + (deviceOffsets.vocalClarity ?? 0)) * intensityMult;
    const presenceGain  = (settings.vocalPresence ?? 1.5) * intensityMult;
    const nasalCut      = (settings.nasalReduction ?? 1.0) * intensityMult;
    const harshnessCut  = ((settings.harshnessControl ?? 1.5) + (deviceOffsets.harshnessControl ?? 0)) * intensityMult;
    const warmthGain    = (settings.vocalWarmth ?? 1.0) * intensityMult;

    // Treble params
    const trebleGain    = (settings.crystalTreble ?? 2.0) * intensityMult;
    const airGain       = ((settings.airSparkle ?? 1.5) + (deviceOffsets.airSparkle ?? 0)) * intensityMult;
    const sibilanceCut  = (settings.sibilanceControl ?? 1.5) * intensityMult;
    const detailGain    = (settings.trebleDetail ?? 1.5) * intensityMult;

    // Apply with clamping
    this.vocalWarmthFilter.gain.setTargetAtTime(Math.max(-4, Math.min(5, warmthGain)), t, rampTime);
    this.nasalNotchFilter.gain.setTargetAtTime(Math.max(-6, Math.min(0, -nasalCut)), t, rampTime);
    this.vocalClarityFilter.gain.setTargetAtTime(Math.max(-6, Math.min(7, clarityGain)), t, rampTime);
    this.vocalPresenceFilter.gain.setTargetAtTime(Math.max(-6, Math.min(6, presenceGain)), t, rampTime);
    this.harshnessFilter.gain.setTargetAtTime(Math.max(-8, Math.min(0, -harshnessCut)), t, rampTime);

    this.deEsserFilter.gain.setTargetAtTime(Math.max(-7, Math.min(0, -sibilanceCut)), t, rampTime);
    this.trebleDetailFilter.gain.setTargetAtTime(Math.max(-4, Math.min(6, detailGain + trebleGain * 0.4)), t, rampTime);
    this.airShelfFilter.gain.setTargetAtTime(Math.max(-6, Math.min(7, airGain + trebleGain * 0.6)), t, rampTime);
  }
}
