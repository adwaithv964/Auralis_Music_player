/**
 * audio/BassProcessor.js
 * True Bass - Professional Dynamic Bass Processing Engine.
 * 
 * Architecture:
 *   Input
 *     ↓
 *   Subsonic Infrasonic High-Pass Filter (20-25 Hz, Butterworth)
 *     ├────────────────────────────────────────┐ (Main Path)
 *     │                                        ↓
 *     │                           Sub-Bass Shaper (45 Hz Peaking)
 *     │                                        ↓
 *     │                           Deep Bass Resonator (80 Hz Peaking)
 *     │                                        ↓
 *     │                           Mid-Bass Punch Focus (140 Hz Peaking)
 *     │                                        ↓
 *     │                           Low-Band Dynamics Compressor
 *     │                                        ↓
 *     │                                   Main Bass Out
 *     │                                        ↓
 *     └─→ Psychoacoustic Harmonic Generator ──(+)
 *           (Missing Fundamental Synthesis)   Output
 */

export class BassProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    // 1. Infrasonic Sub-Sonic Highpass (cuts inaudible 0-22 Hz power-wasting rumble)
    this.subSonicFilter = audioCtx.createBiquadFilter();
    this.subSonicFilter.type = 'highpass';
    this.subSonicFilter.frequency.value = 22;
    this.subSonicFilter.Q.value = 0.707; // Butterworth

    // 2. Sub-Bass Shaper (focus: 45 Hz)
    this.subBassFilter = audioCtx.createBiquadFilter();
    this.subBassFilter.type = 'peaking';
    this.subBassFilter.frequency.value = 45;
    this.subBassFilter.Q.value = 1.2;
    this.subBassFilter.gain.value = 0;

    // 3. Deep Bass Resonator (focus: 80 Hz)
    this.deepBassFilter = audioCtx.createBiquadFilter();
    this.deepBassFilter.type = 'peaking';
    this.deepBassFilter.frequency.value = 80;
    this.deepBassFilter.Q.value = 1.1;
    this.deepBassFilter.gain.value = 0;

    // 4. Punchy Mid-Bass Focus (focus: 120 Hz - punchy kick drum transient)
    this.midPunchFilter = audioCtx.createBiquadFilter();
    this.midPunchFilter.type = 'peaking';
    this.midPunchFilter.frequency.value = 120;
    this.midPunchFilter.Q.value = 1.35;
    this.midPunchFilter.gain.value = 0;

    // 5. Transparent Bass Dynamic Headroom Guard (prevents clipping without choking transients)
    this.bassCompressor = audioCtx.createDynamicsCompressor();
    this.bassCompressor.threshold.value = -2.5; // Only acts on extreme peaks > -2.5 dBFS
    this.bassCompressor.knee.value = 6;
    this.bassCompressor.ratio.value = 1.25;
    this.bassCompressor.attack.value = 0.040; // 40ms attack: lets natural kick transient punch through
    this.bassCompressor.release.value = 0.080;

    // ── Psychoacoustic Harmonic Bass Generator ────────────────────────
    // Isolates 40-90 Hz fundamentals, generates 2nd/3rd harmonics (80-200 Hz),
    // and blends into the signal for headphones/earphones that lack physical 40 Hz extension.
    this.harmonicPreFilter = audioCtx.createBiquadFilter();
    this.harmonicPreFilter.type = 'bandpass';
    this.harmonicPreFilter.frequency.value = 65;
    this.harmonicPreFilter.Q.value = 1.2;

    this.harmonicWaveShaper = audioCtx.createWaveShaper();
    this.harmonicWaveShaper.curve = this._generateHarmonicCurve(2048);
    this.harmonicWaveShaper.oversample = '2x';

    this.harmonicPostFilter = audioCtx.createBiquadFilter();
    this.harmonicPostFilter.type = 'bandpass';
    this.harmonicPostFilter.frequency.value = 145; // 2nd harmonic target
    this.harmonicPostFilter.Q.value = 1.0;

    this.harmonicGain = audioCtx.createGain();
    this.harmonicGain.gain.value = 0.0;

    // Main Bass Path Output Gain
    this.mainBassGain = audioCtx.createGain();
    this.mainBassGain.gain.value = 1.0;

    // Final Bass Module Summer
    this.outputNode = audioCtx.createGain();
    this.outputNode.gain.value = 1.0;

    // Connect Main Signal Flow
    this.subSonicFilter.connect(this.subBassFilter);
    this.subBassFilter.connect(this.deepBassFilter);
    this.deepBassFilter.connect(this.midPunchFilter);
    this.midPunchFilter.connect(this.bassCompressor);
    this.bassCompressor.connect(this.mainBassGain);
    this.mainBassGain.connect(this.outputNode);

    // Connect Psychoacoustic Harmonic Branch
    this.subSonicFilter.connect(this.harmonicPreFilter);
    this.harmonicPreFilter.connect(this.harmonicWaveShaper);
    this.harmonicWaveShaper.connect(this.harmonicPostFilter);
    this.harmonicPostFilter.connect(this.harmonicGain);
    this.harmonicGain.connect(this.outputNode);

    this.inputNode = this.subSonicFilter;
  }

  /**
   * Generates a smooth, anti-aliased non-linear saturation curve:
   * f(x) = x + 0.35*x^2 - 0.15*x^3
   * The quadratic term produces warm 2nd harmonic excitation,
   * while the cubic term adds subtle punch.
   */
  _generateHarmonicCurve(samples) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Gentle soft-saturation with quadratic harmonic enhancement
      const y = x + 0.35 * (x * x) - 0.15 * (x * x * x);
      curve[i] = Math.max(-1, Math.min(1, y * 0.8));
    }
    return curve;
  }

  /**
   * Apply Bass parameters with smooth exponential ramps to eliminate clicks/pops.
   */
  updateParameters(settings, intensityMult = 1.0, deviceOffsets = {}) {
    const t = this.ctx.currentTime;
    const rampTime = 0.035; // 35ms smooth automation time constant

    const deepGain  = ((settings.deepBass ?? 2.0)  + (deviceOffsets.deepBass ?? 0))  * intensityMult;
    const punchGain = ((settings.bassPunch ?? 2.5) + (deviceOffsets.bassPunch ?? 0)) * intensityMult;
    const intensity = (settings.bassIntensity ?? 1.0);
    const texture   = (settings.bassTexture ?? 1.5) / 5.0; // 0 to 2 scale
    const cutoff    = deviceOffsets.subSonicCutoff ?? (settings.subSonicFilter ? 22 : 10);

    // Sub-Sonic filter
    this.subSonicFilter.frequency.setTargetAtTime(cutoff, t, rampTime);

    // Deep Bass & Sub-Bass: Sculpted so sub-bass provides visceral foundation without muddiness
    const clampedDeep = Math.max(-6, Math.min(8, deepGain * intensity));
    const clampedPunch = Math.max(-6, Math.min(8, punchGain * intensity));

    this.subBassFilter.gain.setTargetAtTime(clampedDeep * 0.45, t, rampTime);
    this.deepBassFilter.gain.setTargetAtTime(clampedDeep * 0.65, t, rampTime);
    this.midPunchFilter.gain.setTargetAtTime(clampedPunch * 0.75, t, rampTime);

    // Transparent peak protection only for high outputs
    const compThresh = Math.max(-4.5, -2.5 - (clampedDeep * 0.15));
    this.bassCompressor.threshold.setTargetAtTime(compThresh, t, rampTime);
    this.bassCompressor.ratio.setTargetAtTime(1.15 + (settings.bassCompression ? 0.15 : 0.0), t, rampTime);

    // Psychoacoustic Bass Generator (Missing Fundamental)
    const useHarmonics = settings.psychoacousticBass && (deviceOffsets.psychoacousticBass !== false);
    const targetHarmonicGain = useHarmonics ? Math.min(0.24, (0.14 + texture * 0.10) * Math.min(1.2, intensityMult)) : 0.0;
    this.harmonicGain.gain.setTargetAtTime(targetHarmonicGain, t, rampTime);
  }
}
