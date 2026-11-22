/**
 * audio/SpatialTab.jsx
 * Spatial Audio & Headphone Virtualization Studio.
 */

import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { SPATIAL_MODES } from '../../audio/constants';

export function SpatialTab() {
  const { dspSettings, updateDsp } = useAudioEngineContext();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Spatial Mode Selector ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Spatial Audio & Staging Modes</span>
          <span style={{ fontSize: '0.78rem', color: '#67f0b7' }}>
            Current: {SPATIAL_MODES[dspSettings.spatialMode]?.label}
          </span>
        </div>

        <div className="dsp-profile-grid">
          {Object.values(SPATIAL_MODES).map(mode => {
            const isActive = dspSettings.spatialMode === mode.id;
            return (
              <div
                key={mode.id}
                className={`dsp-profile-card${isActive ? ' active' : ''}`}
                onClick={() => updateDsp({ spatialMode: mode.id })}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="dsp-profile-name">{mode.label}</span>
                  {isActive && <span style={{ color: '#67f0b7' }}>✓</span>}
                </div>
                <span className="dsp-profile-desc">{mode.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Spatial Parameters ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Stereo Field & Binaural Controls</span>
        </div>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Stereo Width (Mid-Side Matrix)</span>
              <span className="dsp-control-val">{Math.round((dspSettings.stereoWidth ?? 1.0) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.8"
              step="0.05"
              value={dspSettings.stereoWidth ?? 1.0}
              onChange={e => updateDsp({ stereoWidth: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">0% Mono → 100% Original → 180% Extra-Wide (Bass remains centered)</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Bauer Crossfeed Intensity</span>
              <span className="dsp-control-val">{Math.round((dspSettings.crossfeedAmount ?? 0.35) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.8"
              step="0.05"
              value={dspSettings.crossfeedAmount ?? 0.35}
              onChange={e => updateDsp({ crossfeedAmount: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Reduces ear fatigue on headphones by gently cross-feeding low-mids</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Binaural Room Depth & Reflections</span>
              <span className="dsp-control-val">{Math.round((dspSettings.spatialDepth ?? 0.4) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.8"
              step="0.05"
              value={dspSettings.spatialDepth ?? 0.4}
              onChange={e => updateDsp({ spatialDepth: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Early acoustic reflection diffusion for natural out-of-head listening</span>
          </div>
        </div>
      </div>

      {/* ── Technical Accuracy Notice ── */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        fontSize: '0.78rem',
        color: '#a9b1aa',
        lineHeight: 1.45,
      }}>
        <strong style={{ color: '#f5f7ef' }}>Acoustic Accuracy Notice:</strong> Auralis Spatial Audio utilizes real-time Mid-Side psychoacoustic widening, Bauer crossfeed filtering, and interaural time difference (ITD) early reflections. This is an intelligent browser stereo virtualization engine designed to prevent ear fatigue and expand soundstage. It does not claim Dolby Atmos certification or multi-channel hardware decoding.
      </div>
    </div>
  );
}
