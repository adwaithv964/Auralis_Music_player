/**
 * audio/EQChain.js
 *
 * Builds a reusable 5-band parametric equaliser chain from Web Audio API
 * BiquadFilterNodes. The chain is created once per AudioContext and wired
 * between the MediaElementSourceNode and the AnalyserNode.
 *
 * Band layout (standard consumer EQ bands):
 *
 *   Band │ Type       │ Frequency │ Q     │ Purpose
 *   ─────┼────────────┼───────────┼───────┼──────────────────────────────
 *     0  │ lowshelf   │   80 Hz   │  —    │ Bass/sub-bass body
 *     1  │ peaking    │  250 Hz   │  1.0  │ Low-mid warmth / muddiness
 *     2  │ peaking    │ 1000 Hz   │  1.0  │ Midrange presence
 *     3  │ peaking    │ 4000 Hz   │  1.0  │ Upper-mid / clarity
 *     4  │ highshelf  │ 12000 Hz  │  —    │ Air / brightness
 *
 * Usage:
 *   import { createEQChain } from './EQChain';
 *
 *   const eq = createEQChain(audioContext);
 *
 *   // Wire into the node graph:
 *   sourceNode.connect(eq.inputNode);
 *   eq.outputNode.connect(analyserNode);
 *
 *   // Adjust bands at runtime (e.g. from a UI slider):
 *   eq.setBandGain(0, +6);   // +6 dB bass boost
 *   eq.setBandGain(4, -3);   // -3 dB high shelf cut
 *   eq.resetEQ();            // All bands → 0 dB
 */

import { audioLogger } from './AudioLogger';

// ─── Band definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} BandDefinition
 * @property {string} label     - Human-readable band name
 * @property {BiquadFilterType} type - BiquadFilterNode type
 * @property {number} frequency - Centre / shelf frequency in Hz
 * @property {number} [Q]       - Q factor (only for peaking filters)
 * @property {number} defaultGain - Initial gain in dB (always 0 for flat response)
 */

/** @type {BandDefinition[]} */
const BAND_DEFINITIONS = [
  { label: 'Bass',      type: 'lowshelf',  frequency:    80, defaultGain: 0 },
  { label: 'Low-Mid',   type: 'peaking',   frequency:   250, Q: 1.0, defaultGain: 0 },
  { label: 'Mid',       type: 'peaking',   frequency:  1000, Q: 1.0, defaultGain: 0 },
  { label: 'Upper-Mid', type: 'peaking',   frequency:  4000, Q: 1.0, defaultGain: 0 },
  { label: 'Treble',    type: 'highshelf', frequency: 12000, defaultGain: 0 },
];

// ─── Gain clamping ────────────────────────────────────────────────────────────
const MIN_GAIN_DB = -12; // Maximum cut in dB
const MAX_GAIN_DB = +12; // Maximum boost in dB

/**
 * Clamp a gain value to the safe operating range.
 * @param {number} db
 * @returns {number}
 */
function clampGain(db) {
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, db));
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} EQBand
 * @property {number}           index      - Band index (0–4)
 * @property {string}           label      - Human-readable name
 * @property {BiquadFilterNode} node       - The underlying BiquadFilterNode
 * @property {number}           frequency  - Centre / shelf frequency in Hz
 * @property {number}           gainDb     - Current gain value in dB
 */

/**
 * @typedef {Object} EQChain
 * @property {AudioNode}  inputNode    - First node in the chain (connect source here)
 * @property {AudioNode}  outputNode   - Last node in the chain (connect to analyser)
 * @property {EQBand[]}   bands        - Array of the 5 EQ bands
 * @property {Function}   setBandGain  - (bandIndex: number, gainDb: number) => void
 * @property {Function}   getBandGains - () => number[]  — current gains, dB
 * @property {Function}   setAllGains  - (gains: number[]) => void
 * @property {Function}   resetEQ      - () => void — all bands → 0 dB
 * @property {Function}   disconnect   - () => void — tear down the chain
 */

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a 5-band EQ chain wired in series and return a handle to it.
 *
 * The returned `inputNode` / `outputNode` are the connection points;
 * the caller is responsible for wiring them into the larger node graph.
 *
 * @param {AudioContext} audioCtx - The shared Web Audio API context
 * @returns {EQChain}
 * @throws {Error} If audioCtx is null / closed
 */
export function createEQChain(audioCtx) {
  if (!audioCtx || audioCtx.state === 'closed') {
    throw new Error('[EQChain] Cannot create EQ chain — AudioContext is null or closed');
  }

  /** @type {EQBand[]} */
  const bands = BAND_DEFINITIONS.map((def, index) => {
    const node = audioCtx.createBiquadFilter();

    node.type            = def.type;
    node.frequency.value = def.frequency;
    node.gain.value      = def.defaultGain;

    // Q is not applicable to shelf filters — only set for peaking bands
    if (def.Q !== undefined) {
      node.Q.value = def.Q;
    }

    return {
      index,
      label:     def.label,
      node,
      frequency: def.frequency,
      gainDb:    def.defaultGain,
    };
  });

  // Wire bands in series: band[0] → band[1] → … → band[4]
  for (let i = 0; i < bands.length - 1; i++) {
    bands[i].node.connect(bands[i + 1].node);
  }

  audioLogger.info('eq', `EQ chain created (${bands.length} bands)`);

  // ─── EQChain public methods ────────────────────────────────────────────────

  /**
   * Set the gain for a single EQ band.
   * @param {number} bandIndex - 0–4
   * @param {number} gainDb    - Gain in decibels (clamped to ±12 dB)
   */
  function setBandGain(bandIndex, gainDb) {
    if (bandIndex < 0 || bandIndex >= bands.length) {
      audioLogger.warn('eq', `setBandGain: invalid band index ${bandIndex}`);
      return;
    }
    const clamped                  = clampGain(gainDb);
    bands[bandIndex].node.gain.value = clamped;
    bands[bandIndex].gainDb          = clamped;
    audioLogger.log('eq', `Band ${bandIndex} (${bands[bandIndex].label}) gain → ${clamped} dB`);
  }

  /**
   * Return the current gain (dB) for all 5 bands.
   * @returns {number[]}
   */
  function getBandGains() {
    return bands.map(b => b.gainDb);
  }

  /**
   * Set all 5 bands at once from an array of gain values.
   * @param {number[]} gains - Array of exactly 5 dB values
   */
  function setAllGains(gains) {
    if (!Array.isArray(gains) || gains.length !== bands.length) {
      audioLogger.warn('eq', `setAllGains: expected ${bands.length} values, got ${gains?.length}`);
      return;
    }
    gains.forEach((db, i) => setBandGain(i, db));
  }

  /**
   * Reset all bands to 0 dB gain (flat response).
   */
  function resetEQ() {
    bands.forEach((_, i) => setBandGain(i, 0));
    audioLogger.info('eq', 'EQ reset — all bands at 0 dB');
  }

  /**
   * Disconnect all nodes in the chain. Call before discarding the chain.
   */
  function disconnect() {
    try {
      bands.forEach(b => b.node.disconnect());
      audioLogger.log('eq', 'EQ chain disconnected');
    } catch (err) {
      audioLogger.warn('eq', 'EQ chain disconnect error', err);
    }
  }

  return {
    inputNode:   bands[0].node,
    outputNode:  bands[bands.length - 1].node,
    bands,
    setBandGain,
    getBandGains,
    setAllGains,
    resetEQ,
    disconnect,
  };
}

/**
 * Export the band definitions so consumers can build UI from them
 * without hard-coding frequencies / labels.
 */
export { BAND_DEFINITIONS, MIN_GAIN_DB, MAX_GAIN_DB };
