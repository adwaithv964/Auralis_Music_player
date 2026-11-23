/**
 * audio/MasterEngineTab.jsx
 * Sound Engine Profile selection, Adaptive Track Intelligence, Intensity, True Bass & Vocal/Treble Controls.
 */

import { useState } from 'react';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { MASTER_PROFILES } from '../../audio/presets';
import { INTENSITY_MODES } from '../../audio/constants';

export function MasterEngineTab() {
  const {
    dspSettings,
    adaptiveState,
    updateDsp,
    selectMasterProfile,
    setIntensity,
    toggleAdaptiveIntelligence,
    setAdaptiveIntensity,
  } = useAudioEngineContext();

  const [filterCat, setFilterCat] = useState('All');

  const categories = ['All', 'Reference', 'Energetic', 'Bass Focus', 'Vocal', 'Detail', 'Spatial', 'Genre Tuned', 'Regional Film'];

  const filteredProfiles = filterCat === 'All'
    ? MASTER_PROFILES
    : MASTER_PROFILES.filter(p => p.category === filterCat);

  const isAdaptiveOn = dspSettings.adaptiveIntelligenceEnabled !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Adaptive Track Intelligence Card ── */}
      <div className="dsp-card" style={{ border: isAdaptiveOn ? '1px solid rgba(103, 240, 183, 0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
        <div className="dsp-card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🧠 Adaptive Track Intelligence</span>
            <span style={{
              fontSize: '0.68rem',
              padding: '2px 8px',
              borderRadius: 6,
              background: isAdaptiveOn ? 'rgba(103, 240, 183, 0.2)' : 'rgba(255,255,255,0.06)',
              color: isAdaptiveOn ? '#67f0b7' : '#88928a',
              fontWeight: 700,
            }}>
              {adaptiveState?.status || (isAdaptiveOn ? 'Analyzing Track' : 'Adaptation Disabled')}
            </span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: '0.78rem', color: '#a9b1aa' }}>
              {isAdaptiveOn ? 'ACTIVE' : 'OFF'}
            </span>
            <button
              className={`dsp-toggle${isAdaptiveOn ? ' dsp-toggle--on' : ''}`}
              role="switch"
              aria-checked={isAdaptiveOn}
              onClick={() => toggleAdaptiveIntelligence()}
            >
              <span className="dsp-toggle-knob" />
            </button>
          </label>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#a9b1aa', lineHeight: 1.45 }}>
          Auto-identifies real-time song behavior (sub-bass density, low-mid mud, vocal presence, dynamic range) and smoothly applies temporary acoustic offsets without altering your saved sound profile.
        </p>

        {/* Intensity Mode selector for Adaptive Intelligence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: '#a9b1aa' }}>Adaptation Intensity:</span>
            <span style={{ color: '#67f0b7', fontWeight: 600, textTransform: 'capitalize' }}>
              {dspSettings.adaptiveIntensity || 'balanced'}
            </span>
          </div>
          <div className="dsp-intensity-strip">
            {['subtle', 'balanced', 'dynamic', 'advanced'].map(modeKey => (
              <button
                key={modeKey}
                className={`dsp-intensity-btn${(dspSettings.adaptiveIntensity || 'balanced') === modeKey ? ' active' : ''}`}
                onClick={() => setAdaptiveIntensity(modeKey)}
                style={{ textTransform: 'capitalize' }}
              >
                {modeKey}
              </button>
            ))}
          </div>
        </div>

        {/* Live Track Song-Structure & Acoustic Metric Indicators */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          background: 'rgba(0,0,0,0.25)',
          padding: 12,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div>
            <span style={{ fontSize: '0.70rem', color: '#88928a', display: 'block' }}>Estimated Section</span>
            <strong style={{ fontSize: '0.84rem', color: '#67f0b7' }}>
              {adaptiveState?.currentSection || 'Intro'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.70rem', color: '#88928a', display: 'block' }}>Dynamic Mud Scoop</span>
            <strong style={{ fontSize: '0.84rem', color: '#f5f7ef' }}>
              {adaptiveState?.adaptiveOffsets?.lowMidMudCut ? `${adaptiveState.adaptiveOffsets.lowMidMudCut.toFixed(1)} dB` : '0.0 dB'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.70rem', color: '#88928a', display: 'block' }}>Vocal Articulation</span>
            <strong style={{ fontSize: '0.84rem', color: '#f5f7ef' }}>
              {adaptiveState?.adaptiveOffsets?.vocalClarity ? `+${adaptiveState.adaptiveOffsets.vocalClarity.toFixed(1)} dB` : '0.0 dB'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.70rem', color: '#88928a', display: 'block' }}>Sub-Bass Cushion</span>
            <strong style={{ fontSize: '0.84rem', color: '#f5f7ef' }}>
              {adaptiveState?.adaptiveOffsets?.deepBass ? `${adaptiveState.adaptiveOffsets.deepBass > 0 ? '+' : ''}${adaptiveState.adaptiveOffsets.deepBass.toFixed(1)} dB` : '0.0 dB'}
            </strong>
          </div>
        </div>
      </div>

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
            <span className="dsp-control-hint">Speech intelligibility and centered vocal presence</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Vocal Presence (1.2 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.vocalPresence ?? 1.5).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="6"
              step="0.5"
              value={dspSettings.vocalPresence ?? 1.5}
              onChange={e => updateDsp({ vocalPresence: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Forward intimacy without nasal honk</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Anti-Nasal Notch (800 Hz)</span>
              <span className="dsp-control-val">-{(dspSettings.nasalReduction ?? 0.8).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={dspSettings.nasalReduction ?? 0.8}
              onChange={e => updateDsp({ nasalReduction: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Dampens boxy acoustic telephone resonances</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Harshness Control (3.5 kHz)</span>
              <span className="dsp-control-val">-{(dspSettings.harshnessControl ?? 1.0).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={dspSettings.harshnessControl ?? 1.0}
              onChange={e => updateDsp({ harshnessControl: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Eliminates ear fatigue and piercing screech</span>
          </div>
        </div>
      </div>

      {/* ── Crystal-Clear Treble ── */}
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Crystal Treble & Air Sparkle</span>
        </div>
        <div className="dsp-controls-grid">
          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Crystal Treble (10 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.crystalTreble ?? 2.0).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="8"
              step="0.5"
              value={dspSettings.crystalTreble ?? 2.0}
              onChange={e => updateDsp({ crystalTreble: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Cymbal definition, acoustic guitar pick transients</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Air Sparkle (14–16 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.airSparkle ?? 2.0).toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-4"
              max="7"
              step="0.5"
              value={dspSettings.airSparkle ?? 2.0}
              onChange={e => updateDsp({ airSparkle: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Ultra-high frequency breath and spatial shimmer</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>Precision De-Esser (6.8 kHz)</span>
              <span className="dsp-control-val">{(dspSettings.sibilanceControl ?? 1.2).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.25"
              value={dspSettings.sibilanceControl ?? 1.2}
              onChange={e => updateDsp({ sibilanceControl: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Suppresses microphone sibilance spikes ('s', 'sh', 't')</span>
          </div>

          <div className="dsp-control-group">
            <div className="dsp-control-label-row">
              <span>High-End Detail</span>
              <span className="dsp-control-val">{(dspSettings.trebleDetail ?? 1.8).toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="0.2"
              value={dspSettings.trebleDetail ?? 1.8}
              onChange={e => updateDsp({ trebleDetail: Number(e.target.value) })}
              className="dsp-slider"
            />
            <span className="dsp-control-hint">Micro-detail resolution in complex passages</span>
          </div>
        </div>
      </div>
    </div>
  );
}
