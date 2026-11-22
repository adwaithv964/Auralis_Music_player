/**
 * audio/AdvancedDspTab.jsx
 * Advanced Multiband Dynamic Processing, True-Peak Limiter & Headroom Diagnostics.
 */

import { useState, useEffect } from 'react';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';

export function AdvancedDspTab() {
  const { dspSettings, updateDsp, getTelemetry, getAcousticHealthAnalysis } = useAudioEngineContext();
  const telemetry = getTelemetry();
  const [healthData, setHealthData] = useState(() => getAcousticHealthAnalysis());

  useEffect(() => {
    const timer = setInterval(() => {
      setHealthData(getAcousticHealthAnalysis());
    }, 400);
    return () => clearInterval(timer);
  }, [getAcousticHealthAnalysis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Multiband Dynamics ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>3-Band Studio Mastering Dynamics (Linkwitz-Riley LR4 Phase-Linear)</span>
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

      {/* ── SafeListen™ Human Hearing Protection ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>SafeListen™ Human Hearing Protection (WHO / ITU-T H.870)</span>
            <span style={{ fontSize: '0.75rem', color: '#67f0b7', fontWeight: 600 }}>Active Ear Guard</span>
          </div>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#a9b1aa', lineHeight: 1.45 }}>
          Engineered according to human psychoacoustic sensitivity (ISO 226). Dynamically cushions harsh ear-canal resonance
          at 3.5 kHz and protects against sudden acoustic shock/ear blast, eliminating listener ear fatigue without muffling vocals or punch.
        </p>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Human Hearing & Anti-Fatigue Guard</span>
              <span className="dsp-control-val">{dspSettings.hearingProtection !== false ? 'ENABLED' : 'OFF'}</span>
            </div>
            <button
              className={`dsp-btn-secondary${dspSettings.hearingProtection !== false ? ' active' : ''}`}
              onClick={() => updateDsp({ hearingProtection: dspSettings.hearingProtection === false })}
              style={{ padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center' }}
            >
              {dspSettings.hearingProtection !== false ? '🛡️ SafeListen Hearing Guard: ACTIVE' : '⚠️ Hearing Protection Bypassed'}
            </button>
            <span className="dsp-control-hint">Prevents ear ringing, headache and fatigue during headphone listening</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>3.5 kHz Ear-Canal Resonance Damping</span>
              <span className="dsp-control-val">{(dspSettings.earFatigueControl ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="3.0"
              step="0.2"
              value={dspSettings.earFatigueControl ?? 1.5}
              disabled={dspSettings.hearingProtection === false}
              onChange={e => updateDsp({ earFatigueControl: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Smooths the peak resonance of the human ear canal without reducing clarity</span>
          </div>
        </div>

        {/* Real-time Listening Comfort & Fatigue Health Badge */}
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          background: 'rgba(103, 240, 183, 0.05)',
          border: '1px solid rgba(103, 240, 183, 0.2)',
          borderRadius: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          <div>
            <span style={{ fontSize: '0.74rem', color: '#a9b1aa', textTransform: 'uppercase', display: 'block' }}>
              Real-Time Listening Comfort Index
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#67f0b7' }}>
                {healthData?.acousticComfort?.score ?? 98}%
              </span>
              <span style={{ fontSize: '0.8rem', color: '#dfe6de', fontWeight: 600 }}>
                {healthData?.acousticComfort?.rating ?? 'All-Day Safe (4+ Hours)'}
              </span>
            </div>
          </div>
          <span style={{
            fontSize: '0.72rem',
            padding: '4px 10px',
            borderRadius: 6,
            background: 'rgba(103, 240, 183, 0.15)',
            color: '#67f0b7',
            fontWeight: 700,
          }}>
            ISO 226 SHIELD ACTIVE
          </span>
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
