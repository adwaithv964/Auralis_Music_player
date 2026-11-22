/**
 * audio/AdvancedDspTab.jsx
 * Advanced Multiband Dynamic Processing, True-Peak Limiter & Headroom Diagnostics.
 */

import { useAudioEngineContext } from '../../audio/AudioEngineContext';

export function AdvancedDspTab() {
  const { dspSettings, updateDsp, getTelemetry } = useAudioEngineContext();
  const telemetry = getTelemetry();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Multiband Dynamics ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>5-Band Multiband Dynamic Processing</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dspSettings.multibandEnabled !== false}
              onChange={e => updateDsp({ multibandEnabled: e.target.checked })}
            />
            <span>Enable Multiband Stage</span>
          </label>
        </div>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Dynamic Range Preservation</span>
              <span className="dsp-control-val">{dspSettings.dynamicRangePreservation ? 'Active (Hi-Fi)' : 'Aggressive'}</span>
            </div>
            <button
              className={`dsp-btn-secondary${dspSettings.dynamicRangePreservation ? ' active' : ''}`}
              onClick={() => updateDsp({ dynamicRangePreservation: !dspSettings.dynamicRangePreservation })}
              style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center' }}
            >
              {dspSettings.dynamicRangePreservation ? '✓ Gentle 1.4:1 Musical Ratio' : '⚡ High Density Punch'}
            </button>
            <span className="dsp-control-hint">Prevents pumping artifacts and preserves natural symphonic transients</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Low-Band Peak Containment</span>
              <span className="dsp-control-val">{(dspSettings.bassCompression ?? 2.5).toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="5.5"
              step="0.5"
              value={dspSettings.bassCompression ?? 2.5}
              onChange={e => updateDsp({ bassCompression: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Fast attack sub-bass containment preventing driver over-excursion</span>
          </div>
        </div>
      </div>

      {/* ── True-Peak Limiter & Headroom ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>True-Peak-Aware Output Limiter & Headroom</span>
        </div>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Output Limiter Ceiling</span>
              <span className="dsp-control-val">{(dspSettings.outputCeiling ?? -1.0).toFixed(1)} dBTP</span>
            </div>
            <input
              type="range"
              min="-3.0"
              max="-0.1"
              step="0.1"
              value={dspSettings.outputCeiling ?? -1.0}
              onChange={e => updateDsp({ outputCeiling: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Safe brickwall ceiling preventing DAC inter-sample clipping</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Input Gain Staging</span>
              <span className="dsp-control-val">{(dspSettings.inputGain ?? 0.0).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-6.0"
              max="3.0"
              step="0.5"
              value={dspSettings.inputGain ?? 0.0}
              onChange={e => updateDsp({ inputGain: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Pre-gain headroom allocation into the DSP pipeline</span>
          </div>
        </div>
      </div>

      {/* ── Speaker Hardware Protection & Custom Boost Safety ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Speaker Hardware Protection & Custom Value Guard</span>
          <span style={{ fontSize: '0.75rem', color: '#67f0b7', fontWeight: 600 }}>Active Safety</span>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#a9b1aa', lineHeight: 1.45 }}>
          Intelligent safety shield that automatically guards against speaker voice-coil burnout,
          mechanical cone flutter, and digital inter-stage clipping when extreme custom EQ or DSP values are dialed in.
        </p>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Speaker Excursion & Cone Protection</span>
              <span className="dsp-control-val">{dspSettings.speakerProtection !== false ? 'ENABLED' : 'BYPASS'}</span>
            </div>
            <button
              className={`dsp-btn-secondary${dspSettings.speakerProtection !== false ? ' active' : ''}`}
              onClick={() => updateDsp({ speakerProtection: dspSettings.speakerProtection === false })}
              style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center' }}
            >
              {dspSettings.speakerProtection !== false ? '🛡️ Speaker Safety Shield: ACTIVE' : '⚠️ Unprotected Excursion'}
            </button>
            <span className="dsp-control-hint">Stops inaudible sub-sonic cone flutter and protects laptop/mobile speakers</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Auto-Headroom Anti-Clip Guard</span>
              <span className="dsp-control-val">{dspSettings.autoHeadroomProtection !== false ? 'ACTIVE' : 'OFF'}</span>
            </div>
            <button
              className={`dsp-btn-secondary${dspSettings.autoHeadroomProtection !== false ? ' active' : ''}`}
              onClick={() => updateDsp({ autoHeadroomProtection: dspSettings.autoHeadroomProtection === false })}
              style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center' }}
            >
              {dspSettings.autoHeadroomProtection !== false ? '⚡ Auto-Gain Scaler: ON' : 'Off (May Clip on +12 dB EQ)'}
            </button>
            <span className="dsp-control-hint">Automatically scales digital headroom if you set extreme +12 dB custom EQ boosts</span>
          </div>
        </div>
      </div>

      {/* ── Real-time Telemetry Status ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Real-time Audio Engine Diagnostics</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
          fontFamily: 'monospace',
          fontSize: '0.8rem',
        }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
            <span style={{ color: '#a9b1aa', display: 'block' }}>AudioContext State</span>
            <strong style={{ color: '#67f0b7', fontSize: '0.95rem' }}>{telemetry.state.toUpperCase()}</strong>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
            <span style={{ color: '#a9b1aa', display: 'block' }}>DAC Sample Rate</span>
            <strong style={{ color: '#67f0b7', fontSize: '0.95rem' }}>{telemetry.sampleRate} Hz</strong>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
            <span style={{ color: '#a9b1aa', display: 'block' }}>Output Peak Level</span>
            <strong style={{ color: telemetry.isClipping ? '#ff4d4d' : '#67f0b7', fontSize: '0.95rem' }}>
              {telemetry.peakDb.toFixed(1)} dBFS
            </strong>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
            <span style={{ color: '#a9b1aa', display: 'block' }}>Phase Correlation</span>
            <strong style={{ color: telemetry.phaseCorrelation >= 0 ? '#67f0b7' : '#ff4d4d', fontSize: '0.95rem' }}>
              {telemetry.phaseCorrelation >= 0 ? '+' : ''}{telemetry.phaseCorrelation.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
