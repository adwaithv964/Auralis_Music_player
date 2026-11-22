/**
 * audio/AudioExperienceModal.jsx
 * Master Audio Experience Studio for Auralis Music.
 */

import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { AudioVisualizer } from './AudioVisualizer';
import { MasterEngineTab } from './MasterEngineTab';
import { EqualizerTab } from './EqualizerTab';
import { SpatialTab } from './SpatialTab';
import { DevicesTab } from './DevicesTab';
import { AdvancedDspTab } from './AdvancedDspTab';
import { SourceQualityTab } from './SourceQualityTab';
import { DspDiagnosticsTab } from './DspDiagnosticsTab';
import './AudioExperience.css';

export function AudioExperienceModal() {
  const {
    isModalOpen,
    closeAudioExperience,
    activeTab,
    setActiveTab,
    dspSettings,
    eqSettings,
    toggleEngine,
    toggleEqualizer,
    toggleLoudnessMatch,
    resetDsp,
    resetEq,
    activeProfileData,
    activeDeviceData,
  } = useAudioEngineContext();

  if (!isModalOpen) return null;

  const TABS = [
    { id: 'engine',     label: '🎧 Sound Engine',    badge: dspSettings.engineEnabled ? 'ON' : null },
    { id: 'equalizer',  label: '🎚️ Equalizer',       badge: eqSettings.eqEnabled ? 'ON' : null },
    { id: 'spatial',    label: '🌐 Spatial Audio',   badge: null },
    { id: 'devices',    label: '📱 Devices',         badge: null },
    { id: 'advanced',   label: '⚙️ Advanced DSP',    badge: null },
    { id: 'quality',    label: 'ℹ️ Source Quality',  badge: null },
    { id: 'validation', label: '🧪 DSP Diagnostics', badge: 'TESTS' },
  ];

  return (
    <div className="dsp-overlay" onClick={e => e.target === e.currentTarget && closeAudioExperience()}>
      <div className="dsp-modal">
        {/* ── Top Header ── */}
        <div className="dsp-header">
          <div className="dsp-header-brand">
            <div className="dsp-header-mark">A</div>
            <div>
              <h2 className="dsp-title">
                Auralis Audio Experience
                <span className="dsp-pro-badge">Hi-Fi DSP</span>
              </h2>
              <p className="dsp-subtitle">Professional-Grade Sound Enhancement & Equalization Engine</p>
            </div>
          </div>

          {/* Master Engine & Equalizer Switches */}
          <div className="dsp-header-switches">
            <div className={`dsp-switch-card${dspSettings.engineEnabled ? ' active' : ''}`}>
              <span>Sound Engine</span>
              <button
                className={`dsp-toggle${dspSettings.engineEnabled ? ' dsp-toggle--on' : ''}`}
                role="switch"
                aria-checked={dspSettings.engineEnabled}
                onClick={() => toggleEngine()}
              >
                <span className="dsp-toggle-knob" />
              </button>
            </div>

            <div className={`dsp-switch-card${eqSettings.eqEnabled ? ' active' : ''}`}>
              <span>Equalizer</span>
              <button
                className={`dsp-toggle${eqSettings.eqEnabled ? ' dsp-toggle--on' : ''}`}
                role="switch"
                aria-checked={eqSettings.eqEnabled}
                onClick={() => toggleEqualizer()}
              >
                <span className="dsp-toggle-knob" />
              </button>
            </div>

            <button
              className="dsp-close-btn"
              onClick={closeAudioExperience}
              aria-label="Close Audio Experience"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="22" height="22">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Status Strip: Active Profile, Device & A/B Comparison ── */}
        <div className="dsp-status-strip">
          <div className="dsp-status-tags">
            <div className="dsp-tag">
              <span>Profile:</span>
              <span className="dsp-tag-pill dsp-tag-pill--accent">{activeProfileData.name}</span>
            </div>
            <div className="dsp-tag">
              <span>Device:</span>
              <span className="dsp-tag-pill">{activeDeviceData.icon} {activeDeviceData.name}</span>
            </div>
            <div className="dsp-tag">
              <span>Spatial:</span>
              <span className="dsp-tag-pill">{dspSettings.spatialMode.toUpperCase()}</span>
            </div>
          </div>

          {/* A/B Loudness-Matched Comparison Toggle */}
          <button
            className={`dsp-ab-button${dspSettings.loudnessMatch ? ' active' : ''}`}
            onClick={toggleLoudnessMatch}
            title="Normalizes enhanced volume level for fair acoustic comparison"
          >
            <span>⚖️ A/B Loudness Match:</span>
            <strong>{dspSettings.loudnessMatch ? 'ON (-2.2 dB)' : 'OFF'}</strong>
          </button>
        </div>

        {/* ── 60 FPS Real-time Visualizer Bar ── */}
        <AudioVisualizer />

        {/* ── Tab Bar Navigation ── */}
        <div className="dsp-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`dsp-tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(103, 240, 183, 0.25)',
                  color: '#67f0b7',
                  fontWeight: 700,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content Body ── */}
        <div className="dsp-body">
          {activeTab === 'engine'     && <MasterEngineTab />}
          {activeTab === 'equalizer'  && <EqualizerTab />}
          {activeTab === 'spatial'    && <SpatialTab />}
          {activeTab === 'devices'    && <DevicesTab />}
          {activeTab === 'advanced'   && <AdvancedDspTab />}
          {activeTab === 'quality'    && <SourceQualityTab />}
          {activeTab === 'validation' && <DspDiagnosticsTab />}
        </div>

        {/* ── Footer ── */}
        <div className="dsp-footer">
          <button
            className="dsp-btn-secondary"
            onClick={() => {
              if (window.confirm('Reset all Audio Engine and Equalizer settings to default?')) {
                resetDsp();
                resetEq();
              }
            }}
          >
            Reset All DSP to Defaults
          </button>

          <button
            className="dsp-btn-primary"
            onClick={closeAudioExperience}
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
