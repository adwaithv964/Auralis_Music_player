/**
 * audio/MasterEngineTab.jsx
 * Sound Engine Profile selection, Intensity, True Bass & Vocal/Treble Controls.
 */

import { useState } from 'react';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { MASTER_PROFILES } from '../../audio/presets';
import { INTENSITY_MODES } from '../../audio/constants';

export function MasterEngineTab() {
  const {
    dspSettings,
    updateDsp,
    selectMasterProfile,
    setIntensity,
  } = useAudioEngineContext();

  const [filterCat, setFilterCat] = useState('All');

  const categories = ['All', 'Reference', 'Energetic', 'Bass Focus', 'Vocal', 'Detail', 'Spatial', 'Genre Tuned', 'Regional Film'];

  const filteredProfiles = filterCat === 'All'
    ? MASTER_PROFILES
    : MASTER_PROFILES.filter(p => p.category === filterCat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Active Profile & Intensity ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Intelligent Enhancement Intensity</span>
          <span style={{ fontSize: '0.8rem', color: '#67f0b7' }}>
            Current: {INTENSITY_MODES[dspSettings.intensity]?.label}
          </span>
        </div>
        <div className="dsp-intensity-strip">
          {Object.values(INTENSITY_MODES).map(mode => (
            <button
              key={mode.id}
              className={`dsp-intensity-btn${dspSettings.intensity === mode.id ? ' active' : ''}`}
              onClick={() => setIntensity(mode.id)}
              title={mode.desc}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Master Profiles Selector ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Master Sound Profiles ({MASTER_PROFILES.length} Tuned Signatures)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                style={{
                  background: filterCat === cat ? 'rgba(103, 240, 183, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: filterCat === cat ? '1px solid #67f0b7' : '1px solid rgba(255,255,255,0.08)',
                  color: filterCat === cat ? '#67f0b7' : '#a9b1aa',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="dsp-profile-grid">
          {filteredProfiles.map(p => {
            const isActive = dspSettings.activeProfile === p.id;
            return (
              <div
                key={p.id}
                className={`dsp-profile-card${isActive ? ' active' : ''}`}
                onClick={() => selectMasterProfile(p.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="dsp-profile-name">{p.name}</span>
                  {isActive && <span style={{ color: '#67f0b7', fontSize: '0.8rem' }}>✓</span>}
                </div>
                <span className="dsp-profile-desc">{p.description}</span>
                <span className="dsp-profile-tag">{p.tag}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── True Bass Engine Controls ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>True Bass Engine</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={dspSettings.psychoacousticBass !== false}
                onChange={e => updateDsp({ psychoacousticBass: e.target.checked })}
              />
              <span>Psychoacoustic Harmonics</span>
            </label>
          </div>
        </div>

        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Deep Sub-Bass (45–80 Hz)</span>
              <span className="dsp-control-val">{(dspSettings.deepBass ?? 2).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="10"
              step="0.5"
              value={dspSettings.deepBass ?? 2}
              onChange={e => updateDsp({ deepBass: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Weight and sub-harmonic fullness</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Bass Punch (100–180 Hz)</span>
              <span className="dsp-control-val">{(dspSettings.bassPunch ?? 2.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="9"
              step="0.5"
              value={dspSettings.bassPunch ?? 2.5}
              onChange={e => updateDsp({ bassPunch: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Kick drum impact and bass transient attack</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Bass Texture & Saturation</span>
              <span className="dsp-control-val">{(dspSettings.bassTexture ?? 1.5).toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.25"
              value={dspSettings.bassTexture ?? 1.5}
              onChange={e => updateDsp({ bassTexture: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Harmonic saturation and acoustic warmth</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Bass Intensity Scale</span>
              <span className="dsp-control-val">{(dspSettings.bassIntensity ?? 1.0).toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.8"
              step="0.05"
              value={dspSettings.bassIntensity ?? 1.0}
              onChange={e => updateDsp({ bassIntensity: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Global low-frequency scaling</span>
          </div>
        </div>
      </div>

      {/* ── Vocal & Midrange Processing ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Vocal & Midrange Clarity</span>
        </div>
        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Vocal Clarity (2.2 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.vocalClarity ?? 2).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="7"
              step="0.5"
              value={dspSettings.vocalClarity ?? 2}
              onChange={e => updateDsp({ vocalClarity: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Consonant articulation and lyrical presence</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Nasal Resonance Cut (820 Hz)</span>
              <span className="dsp-control-val">-{(dspSettings.nasalReduction ?? 1).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={dspSettings.nasalReduction ?? 1}
              onChange={e => updateDsp({ nasalReduction: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Dips boxy honk and chest resonance</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Harshness Damping (3.8 kHz)</span>
              <span className="dsp-control-val">-{(dspSettings.harshnessControl ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={dspSettings.harshnessControl ?? 1.5}
              onChange={e => updateDsp({ harshnessControl: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Tames fatigue and shrill overtones</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Vocal Body Warmth (450 Hz)</span>
              <span className="dsp-control-val">{(dspSettings.vocalWarmth ?? 1).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-3"
              max="4"
              step="0.5"
              value={dspSettings.vocalWarmth ?? 1}
              onChange={e => updateDsp({ vocalWarmth: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Natural acoustic resonance</span>
          </div>
        </div>
      </div>

      {/* ── Crystal Treble Controls ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Crystal-Clear Treble</span>
        </div>
        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Air & Sparkle (12 kHz High-Shelf)</span>
              <span className="dsp-control-val">{(dspSettings.airSparkle ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="7"
              step="0.5"
              value={dspSettings.airSparkle ?? 1.5}
              onChange={e => updateDsp({ airSparkle: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Acoustic space, breath, and cymbal shimmer</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Treble Detail (7.2 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.trebleDetail ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="6"
              step="0.5"
              value={dspSettings.trebleDetail ?? 1.5}
              onChange={e => updateDsp({ trebleDetail: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Guitar pick attack and transient clarity</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Sibilance De-Esser (6.8 kHz)</span>
              <span className="dsp-control-val">-{(dspSettings.sibilanceControl ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={dspSettings.sibilanceControl ?? 1.5}
              onChange={e => updateDsp({ sibilanceControl: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Softens sharp 'S' and 'T' consonants</span>
          </div>
        </div>
      </div>
    </div>
  );
}
