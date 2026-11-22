/**
 * audio/EqualizerTab.jsx
 * Independent 10-Band Graphic Equalizer Interface.
 */

import { useState } from 'react';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { EQ_BAND_LABELS } from '../../audio/constants';
import { EQ_PRESETS } from '../../audio/presets';

export function EqualizerTab() {
  const {
    eqSettings,
    customPresets,
    setEqBand,
    applyEqPreset,
    saveCustomEqPreset,
    resetEq,
    toggleEqualizer,
  } = useAudioEngineContext();

  const [customName, setCustomName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  const bands = eqSettings.bands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const allPresets = [...EQ_PRESETS, ...customPresets];

  const handleSave = () => {
    if (!customName.trim()) return;
    saveCustomEqPreset(customName);
    setCustomName('');
    setShowSaveModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Equalizer Master Card ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Advanced 10-Band Graphic Equalizer</span>
            <span style={{ fontSize: '0.75rem', color: eqSettings.eqEnabled ? '#67f0b7' : '#a9b1aa' }}>
              ({eqSettings.eqEnabled ? 'Active' : 'Bypassed'})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="dsp-toggle"
              role="switch"
              aria-checked={eqSettings.eqEnabled}
              onClick={() => toggleEqualizer()}
              style={{ background: eqSettings.eqEnabled ? '#1db954' : 'rgba(255,255,255,0.2)' }}
            >
              <span className="dsp-toggle-knob" style={{ transform: eqSettings.eqEnabled ? 'translateX(20px)' : 'none' }} />
            </button>
          </div>
        </div>

        {/* ── EQ Presets Bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: '0.8rem', color: '#a9b1aa', fontWeight: 600 }}>Presets:</span>
          {allPresets.map(preset => {
            const isActive = eqSettings.activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyEqPreset(preset.id)}
                style={{
                  background: isActive ? 'rgba(103, 240, 183, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  border: isActive ? '1px solid #67f0b7' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#67f0b7' : '#dfe6de',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {/* ── 10 Sliders Display ── */}
        <div className="dsp-eq-container" style={{ opacity: eqSettings.eqEnabled ? 1 : 0.45 }}>
          {bands.map((gain, idx) => (
            <div key={idx} className="dsp-eq-column">
              <span className="dsp-eq-val">
                {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
              </span>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={gain}
                disabled={!eqSettings.eqEnabled}
                onChange={e => setEqBand(idx, e.target.value)}
                className="dsp-eq-slider-vertical"
              />
              <span className="dsp-eq-freq">{EQ_BAND_LABELS[idx]}</span>
            </div>
          ))}
        </div>

        {/* ── EQ Actions ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <button
            className="dsp-btn-secondary"
            onClick={resetEq}
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
          >
            Reset to Flat
          </button>

          <button
            className="dsp-btn-secondary"
            onClick={() => setShowSaveModal(true)}
            style={{ fontSize: '0.78rem', padding: '6px 14px', borderColor: 'rgba(103, 240, 183, 0.3)' }}
          >
            ✦ Save Current Curve
          </button>
        </div>
      </div>

      {/* Save Modal Dialog */}
      {showSaveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            style={{
              background: '#151918',
              border: '1px solid rgba(103, 240, 183, 0.3)',
              borderRadius: 14,
              padding: 20,
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Save Custom EQ Preset</h4>
            <input
              type="text"
              placeholder="e.g. My Bass Boost"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="dsp-btn-secondary" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button className="dsp-btn-primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
