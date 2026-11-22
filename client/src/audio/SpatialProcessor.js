/**
 * audio/SpatialProcessor.js
 * Professional Stereo and Headphone Spatial Virtualization Engine.
 * 
 * Features:
 *   1. Mid-Side (M/S) Matrix Encoder and Decoder with variable stereo width.
 *   2. Mono-Centered Low Bass: High-passes the Side channel (140 Hz) so deep sub-bass
 *      remains 100% focused in the center Mid channel, eliminating phase cancellation.
 *   3. Bauer / Linkwitz Crossfeed: Simulates acoustic crosstalk of speakers for headphones,
 *      reducing listener fatigue from hard-panned stereo recordings.
 *   4. Binaural Early Reflections: Dual decorrelated delay lines (12 ms & 16 ms) with 4.5 kHz
 *      head-shadow lowpass damping to create an out-of-head 3D soundstage.
 *   5. Real-time Mono Compatibility Protection.
 */

export class SpatialProcessor {
  constructor(audioCtx) {
    this.ctx = audioCtx;

    this.inputNode = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // ── 1. Channel Splitter (Left & Right) ─────────────────────────
    this.splitter = audioCtx.createChannelSplitter(2);
    this.inputNode.connect(this.splitter);

    // ── 2. Mid-Side Matrix ─────────────────────────────────────────
    // Mid = 0.5 * (Left + Right)
    this.midLeftGain  = audioCtx.createGain();
    this.midRightGain = audioCtx.createGain();
    this.midLeftGain.gain.value  = 0.5;
    this.midRightGain.gain.value = 0.5;

    this.midSum = audioCtx.createGain();
    this.midLeftGain.connect(this.midSum);
    this.midRightGain.connect(this.midSum);

    // Side = 0.5 * (Left - Right)
    this.sideLeftGain  = audioCtx.createGain();
    this.sideRightGain = audioCtx.createGain();
    this.sideLeftGain.gain.value  = 0.5;
    this.sideRightGain.gain.value = -0.5;

    this.sideSum = audioCtx.createGain();
    this.sideLeftGain.connect(this.sideSum);
    this.sideRightGain.connect(this.sideSum);

    // Mono Bass Centering: High-pass the Side channel at 140 Hz
    this.sideBassFilter = audioCtx.createBiquadFilter();
    this.sideBassFilter.type = 'highpass';
    this.sideBassFilter.frequency.value = 140;
    this.sideBassFilter.Q.value = 0.707;
    this.sideSum.connect(this.sideBassFilter);

    // Width Controls on Mid & Side
    this.midWidthGain  = audioCtx.createGain();
    this.sideWidthGain = audioCtx.createGain();
    this.midWidthGain.gain.value  = 1.0;
    this.sideWidthGain.gain.value = 1.0;

    this.midSum.connect(this.midWidthGain);
    this.sideBassFilter.connect(this.sideWidthGain);

    // M/S Decoder:
    // Left'  = Mid + Side
    // Right' = Mid - Side
    this.msDecodedLeft  = audioCtx.createGain();
    this.msDecodedRight = audioCtx.createGain();

    // Mid connects to both with +1.0
    this.midWidthGain.connect(this.msDecodedLeft);
    this.midWidthGain.connect(this.msDecodedRight);

    // Side connects to Left with +1.0, Right with -1.0
    this.sideToLeftGain = audioCtx.createGain();
    this.sideToLeftGain.gain.value = 1.0;
    this.sideToRightGain = audioCtx.createGain();
    this.sideToRightGain.gain.value = -1.0;

    this.sideWidthGain.connect(this.sideToLeftGain);
    this.sideWidthGain.connect(this.sideToRightGain);
    this.sideToLeftGain.connect(this.msDecodedLeft);
    this.sideToRightGain.connect(this.msDecodedRight);

    // Connect Splitter to Mid-Side Inputs
    this.splitter.connect(this.midLeftGain,  0);
    this.splitter.connect(this.midRightGain, 1);
    this.splitter.connect(this.sideLeftGain,  0);
    this.splitter.connect(this.sideRightGain, 1);

    // ── 3. Bauer / Linkwitz Headphone Crossfeed ───────────────────
    // Left -> lowpass (700 Hz) -> delay (280 µs) -> Right
    // Right -> lowpass (700 Hz) -> delay (280 µs) -> Left
    this.crossfeedLowpassL = audioCtx.createBiquadFilter();
    this.crossfeedLowpassR = audioCtx.createBiquadFilter();
    this.crossfeedLowpassL.type = 'lowpass';
    this.crossfeedLowpassR.type = 'lowpass';
    this.crossfeedLowpassL.frequency.value = 700;
    this.crossfeedLowpassR.frequency.value = 700;
    this.crossfeedLowpassL.Q.value = 0.5;
    this.crossfeedLowpassR.Q.value = 0.5;

    this.crossfeedDelayL = audioCtx.createDelay(0.01);
    this.crossfeedDelayR = audioCtx.createDelay(0.01);
    this.crossfeedDelayL.delayTime.value = 0.00028; // 280 microseconds ITD
    this.crossfeedDelayR.delayTime.value = 0.00028;

    this.crossfeedGainLtoR = audioCtx.createGain();
    this.crossfeedGainRtoL = audioCtx.createGain();
    this.crossfeedGainLtoR.gain.value = 0.0;
    this.crossfeedGainRtoL.gain.value = 0.0;

    this.msDecodedLeft.connect(this.crossfeedLowpassL);
    this.crossfeedLowpassL.connect(this.crossfeedDelayL);
    this.crossfeedDelayL.connect(this.crossfeedGainLtoR);

    this.msDecodedRight.connect(this.crossfeedLowpassR);
    this.crossfeedLowpassR.connect(this.crossfeedDelayR);
    this.crossfeedDelayR.connect(this.crossfeedGainRtoL);

    // ── 4. Binaural Early Reflections (Headphone Spatializer) ────
    this.reflDelayL = audioCtx.createDelay(0.05);
    this.reflDelayR = audioCtx.createDelay(0.05);
    this.reflDelayL.delayTime.value = 0.013; // 13ms reflection
    this.reflDelayR.delayTime.value = 0.018; // 18ms reflection

    this.reflFilterL = audioCtx.createBiquadFilter();
    this.reflFilterR = audioCtx.createBiquadFilter();
    this.reflFilterL.type = 'lowpass';
    this.reflFilterR.type = 'lowpass';
    this.reflFilterL.frequency.value = 4500;
    this.reflFilterR.frequency.value = 4500;

    this.reflGainL = audioCtx.createGain();
    this.reflGainR = audioCtx.createGain();
    this.reflGainL.gain.value = 0.0;
    this.reflGainR.gain.value = 0.0;

    this.msDecodedLeft.connect(this.reflDelayL);
    this.reflDelayL.connect(this.reflFilterL);
    this.reflFilterL.connect(this.reflGainL);

    this.msDecodedRight.connect(this.reflDelayR);
    this.reflDelayR.connect(this.reflFilterR);
    this.reflFilterR.connect(this.reflGainR);

    // ── 5. Channel Merger (Summed Stereo Out) ──────────────────────
    this.finalLeftSummer  = audioCtx.createGain();
    this.finalRightSummer = audioCtx.createGain();

    this.msDecodedLeft.connect(this.finalLeftSummer);
    this.crossfeedGainRtoL.connect(this.finalLeftSummer);
    this.reflGainR.connect(this.finalLeftSummer); // subtle cross-reflection

    this.msDecodedRight.connect(this.finalRightSummer);
    this.crossfeedGainLtoR.connect(this.finalRightSummer);
    this.reflGainL.connect(this.finalRightSummer);

    this.merger = audioCtx.createChannelMerger(2);
    this.finalLeftSummer.connect(this.merger, 0, 0);
    this.finalRightSummer.connect(this.merger, 0, 1);

    this.merger.connect(this.outputNode);
  }

  updateParameters(settings, intensityMult = 1.0, deviceOffsets = {}) {
    const t = this.ctx.currentTime;
    const rampTime = 0.040;

    const mode = settings.spatialMode || 'stereo';
    let baseWidth = (settings.stereoWidth ?? 1.0) + (deviceOffsets.stereoWidth ?? 0) - 1.0;
    let crossfeedLevel = (settings.crossfeedAmount ?? 0.3) + (deviceOffsets.crossfeedAmount ?? 0);
    let reflectionLevel = (settings.spatialDepth ?? 0.35);

    // Mode-specific parameter mappings
    switch (mode) {
      case 'stereo':
        // Pure unadulterated stereo
        baseWidth = 1.0;
        crossfeedLevel = 0.0;
        reflectionLevel = 0.0;
        break;

      case 'wide':
        // Mid-Side widening with mono-centered bass
        baseWidth = Math.max(1.1, (settings.stereoWidth || 1.25) * intensityMult);
        crossfeedLevel = 0.05;
        reflectionLevel = 0.1;
        break;

      case 'headphone_spatial':
        // Out-of-head listening with gentle crossfeed & reflections
        baseWidth = 1.15;
        crossfeedLevel = Math.max(0.2, (settings.crossfeedAmount || 0.35) * intensityMult);
        reflectionLevel = Math.max(0.15, (settings.spatialDepth || 0.3) * intensityMult);
        break;

      case 'crossfeed':
        // Bauer ear-fatigue reduction mode
        baseWidth = 1.0;
        crossfeedLevel = Math.max(0.35, (settings.crossfeedAmount || 0.45) * intensityMult);
        reflectionLevel = 0.0;
        break;

      case 'cinematic':
        // Wide immersive stage with dialog focus
        baseWidth = Math.max(1.3, (settings.stereoWidth || 1.4) * intensityMult);
        crossfeedLevel = 0.25;
        reflectionLevel = Math.max(0.25, (settings.spatialDepth || 0.5) * intensityMult);
        break;

      case 'speaker':
        // Acoustic compensation for physical speakers
        baseWidth = Math.min(1.05, settings.stereoWidth || 1.0);
        crossfeedLevel = 0.0;
        reflectionLevel = 0.05;
        break;

      default:
        baseWidth = 1.0;
        crossfeedLevel = 0.0;
        reflectionLevel = 0.0;
    }

    // Apply M/S Width
    // Side gain controls stereo spread; Mid gain is slightly lowered on extra-wide to preserve headroom
    const sideGain = Math.max(0.0, Math.min(1.8, baseWidth));
    const midGain  = baseWidth > 1.2 ? Math.max(0.85, 1.0 - (baseWidth - 1.0) * 0.15) : 1.0;

    this.midWidthGain.gain.setTargetAtTime(midGain, t, rampTime);
    this.sideWidthGain.gain.setTargetAtTime(sideGain, t, rampTime);

    // Apply Crossfeed
    const safeCrossfeed = Math.max(0.0, Math.min(0.55, crossfeedLevel));
    this.crossfeedGainLtoR.gain.setTargetAtTime(safeCrossfeed * 0.42, t, rampTime);
    this.crossfeedGainRtoL.gain.setTargetAtTime(safeCrossfeed * 0.42, t, rampTime);

    // Apply Early Reflections
    const safeRefl = Math.max(0.0, Math.min(0.35, reflectionLevel));
    this.reflGainL.gain.setTargetAtTime(safeRefl * 0.22, t, rampTime);
    this.reflGainR.gain.setTargetAtTime(safeRefl * 0.22, t, rampTime);
  }
}
