/**
 * audio/VocalTrebleProcessor.js
 * Dedicated Vocal Clarity and Crystal-Clear Treble Engine.
 * 
 * Provides:
 *   1. Anti-Mud Low-Mid Scoop filter (280 Hz - declutters vocals from bass)
 *   2. Vocal warmth & chest resonance filter (380 Hz)
 *   3. Nasal resonance notch filter (820 Hz)
 *   4. Vocal intelligibility & speech clarity peaking filter (2.2 kHz)
 *   5. Vocal presence & consonant definition filter (3.2 kHz)
 *   6. Harshness damping filter (3.8 kHz)
 *   7. Precision de-esser filter (6.8 kHz)
 *   8. Crystal treble detail peaking filter (7.5 kHz)
 *   9. High-shelf air & sparkle filter (12 kHz)
 *  10. Ultrasonic denoiser & hiss-cut filter (18.5 kHz)
 */

export class VocalTrebleProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    // 1. Anti-Mud Scoop (280 Hz - removes low-mid boxiness that masks vocals)
    this.mudCutFilter = audioCtx.createBiquadFilter();
    this.mudCutFilter.type = 'peaking';
    this.mudCutFilter.frequency.value = 280;
    this.mudCutFilter.Q.value = 1.3;
    this.mudCutFilter.gain.value = 0;

    // 2. Vocal Warmth & Chest Resonance (380 Hz)
    this.vocalWarmthFilter = audioCtx.createBiquadFilter();
    this.vocalWarmthFilter.type = 'peaking';
    this.vocalWarmthFilter.frequency.value = 380;
    this.vocalWarmthFilter.Q.value = 1.2;
    this.vocalWarmthFilter.gain.value = 0;

    // 3. Nasal Resonance Notch / Dip (820 Hz - reduces boxiness)
    this.nasalNotchFilter = audioCtx.createBiquadFilter();
    this.nasalNotchFilter.type = 'peaking';
    this.nasalNotchFilter.frequency.value = 820;
    this.nasalNotchFilter.Q.value = 2.0;
    this.nasalNotchFilter.gain.value = 0;

    // 4. Vocal Intelligibility & Clarity (2.2 kHz)
    this.vocalClarityFilter = audioCtx.createBiquadFilter();
    this.vocalClarityFilter.type = 'peaking';
    this.vocalClarityFilter.frequency.value = 2200;
    this.vocalClarityFilter.Q.value = 1.3;
    this.vocalClarityFilter.gain.value = 0;

    // 5. Vocal Presence & Consonants (3.2 kHz)
    this.vocalPresenceFilter = audioCtx.createBiquadFilter();
    this.vocalPresenceFilter.type = 'peaking';
    this.vocalPresenceFilter.frequency.value = 3200;
    this.vocalPresenceFilter.Q.value = 1.4;
    this.vocalPresenceFilter.gain.value = 0;

    // 6. Harshness Damping (3.8 kHz - prevents screech/ear fatigue)
    this.harshnessFilter = audioCtx.createBiquadFilter();
    this.harshnessFilter.type = 'peaking';
    this.harshnessFilter.frequency.value = 3800;
    this.harshnessFilter.Q.value = 2.0;
    this.harshnessFilter.gain.value = 0;

    // 7. De-Esser / Sibilance Damping (6.8 kHz)
    this.deEsserFilter = audioCtx.createBiquadFilter();
    this.deEsserFilter.type = 'peaking';
    this.deEsserFilter.frequency.value = 6800;
    this.deEsserFilter.Q.value = 2.8;
    this.deEsserFilter.gain.value = 0;

    // 8. Treble Detail & Transient Definition (7.5 kHz)
    this.trebleDetailFilter = audioCtx.createBiquadFilter();
    this.trebleDetailFilter.type = 'peaking';
    this.trebleDetailFilter.frequency.value = 7500;
    this.trebleDetailFilter.Q.value = 1.4;
    this.trebleDetailFilter.gain.value = 0;

    // 9. Air & Sparkle High-Shelf (12.0 kHz)
    this.airShelfFilter = audioCtx.createBiquadFilter();
    this.airShelfFilter.type = 'highshelf';
    this.airShelfFilter.frequency.value = 12000;
    this.airShelfFilter.gain.value = 0;

    // 10. Ultrasonic Denoise & Anti-Hiss Lowpass (18.5 kHz)
    this.denoiseFilter = audioCtx.createBiquadFilter();
    this.denoiseFilter.type = 'lowpass';
    this.denoiseFilter.frequency.value = 18500;
    this.denoiseFilter.Q.value = 0.707;

    // 11. SafeListen Human Hearing Protection (3.5 kHz ISO 226 Ear Canal Resonance Cushion)
    this.hearingProtectionFilter = audioCtx.createBiquadFilter();
    this.hearingProtectionFilter.type = 'peaking';
    this.hearingProtectionFilter.frequency.value = 3500;
    this.hearingProtectionFilter.Q.value = 1.6;
    this.hearingProtectionFilter.gain.value = 0;

    // Serial Chain Connection
    this.mudCutFilter.connect(this.vocalWarmthFilter);
    this.vocalWarmthFilter.connect(this.nasalNotchFilter);
    this.nasalNotchFilter.connect(this.vocalClarityFilter);
    this.vocalClarityFilter.connect(this.vocalPresenceFilter);
    this.vocalPresenceFilter.connect(this.harshnessFilter);
    this.harshnessFilter.connect(this.hearingProtectionFilter);
    this.hearingProtectionFilter.connect(this.deEsserFilter);
    this.deEsserFilter.connect(this.trebleDetailFilter);
    this.trebleDetailFilter.connect(this.airShelfFilter);
    this.airShelfFilter.connect(this.denoiseFilter);

    this.inputNode = this.mudCutFilter;
    this.outputNode = this.denoiseFilter;
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

    // Anti-mud cut: scales dynamically when bass is boosted or clarity is requested
    // Decouples low-end power from vocal fundamentals (200-350 Hz), preventing muffled or overwhelmed voices
    const bassLevel = (settings.deepBass || 0) + (settings.bassPunch || 0);
    const mudCutDb = Math.min(3.8, 1.2 + (bassLevel * 0.20) + (clarityGain * 0.25));

    // Treble params
    const trebleGain    = (settings.crystalTreble ?? 2.0) * intensityMult;
    const airGain       = ((settings.airSparkle ?? 1.5) + (deviceOffsets.airSparkle ?? 0)) * intensityMult;
    const sibilanceCut  = (settings.sibilanceControl ?? 1.5) * intensityMult;
    const detailGain    = (settings.trebleDetail ?? 1.5) * intensityMult;

    // SafeListen Human Hearing Protection (ISO 226 Ear-Canal Resonance Cushion)
    const isHearingProtected = settings.hearingProtection !== false;
    const userCushion = settings.earFatigueControl !== undefined ? Number(settings.earFatigueControl) : 1.5;
    const hearingFatigueCushion = isHearingProtected ? Math.min(3.5, userCushion * Math.min(1.4, intensityMult)) : 0.0;

    // Apply with smooth transitions (or instantaneous at t=0)
    if (t === 0) {
      this.mudCutFilter.gain.setValueAtTime(-mudCutDb, 0);
      this.vocalWarmthFilter.gain.setValueAtTime(Math.max(-3, Math.min(4, warmthGain)), 0);
      this.nasalNotchFilter.gain.setValueAtTime(Math.max(-6, Math.min(0, -nasalCut)), 0);
      this.vocalClarityFilter.gain.setValueAtTime(Math.max(-4, Math.min(7, clarityGain)), 0);
      this.vocalPresenceFilter.gain.setValueAtTime(Math.max(-4, Math.min(6, presenceGain)), 0);
      this.harshnessFilter.gain.setValueAtTime(Math.max(-8, Math.min(0, -harshnessCut)), 0);
      this.hearingProtectionFilter.gain.setValueAtTime(-hearingFatigueCushion, 0);
      this.deEsserFilter.gain.setValueAtTime(Math.max(-8, Math.min(0, -sibilanceCut * 1.2)), 0);
      this.trebleDetailFilter.gain.setValueAtTime(Math.max(-4, Math.min(5, detailGain + trebleGain * 0.35)), 0);
      this.airShelfFilter.gain.setValueAtTime(Math.max(-4, Math.min(6, airGain + trebleGain * 0.5)), 0);
    } else {
      this.mudCutFilter.gain.setTargetAtTime(-mudCutDb, t, rampTime);
      this.vocalWarmthFilter.gain.setTargetAtTime(Math.max(-3, Math.min(4, warmthGain)), t, rampTime);
      this.nasalNotchFilter.gain.setTargetAtTime(Math.max(-6, Math.min(0, -nasalCut)), t, rampTime);
      this.vocalClarityFilter.gain.setTargetAtTime(Math.max(-4, Math.min(7, clarityGain)), t, rampTime);
      this.vocalPresenceFilter.gain.setTargetAtTime(Math.max(-4, Math.min(6, presenceGain)), t, rampTime);
      this.harshnessFilter.gain.setTargetAtTime(Math.max(-8, Math.min(0, -harshnessCut)), t, rampTime);
      this.hearingProtectionFilter.gain.setTargetAtTime(-hearingFatigueCushion, t, rampTime);
      this.deEsserFilter.gain.setTargetAtTime(Math.max(-8, Math.min(0, -sibilanceCut * 1.2)), t, rampTime);
      this.trebleDetailFilter.gain.setTargetAtTime(Math.max(-4, Math.min(5, detailGain + trebleGain * 0.35)), t, rampTime);
      this.airShelfFilter.gain.setTargetAtTime(Math.max(-4, Math.min(6, airGain + trebleGain * 0.5)), t, rampTime);
    }
  }
}
