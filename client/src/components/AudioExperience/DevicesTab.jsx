/**
 * audio/DevicesTab.jsx
 * Transducer-tailored Acoustic Optimization Profiles.
 */

import { useAudioEngineContext } from '../../audio/AudioEngineContext';
import { DEVICE_PROFILES } from '../../audio/deviceProfiles';

export function DevicesTab() {
  const { dspSettings, setDeviceProfile } = useAudioEngineContext();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Headphone & Speaker Hardware Optimization</span>
          <span style={{ fontSize: '0.78rem', color: '#67f0b7' }}>
            Selected: {DEVICE_PROFILES.find(d => d.id === dspSettings.deviceProfile)?.name}
          </span>
        </div>

        <div className="dsp-devices-grid">
          {DEVICE_PROFILES.map(dev => {
            const isActive = dspSettings.deviceProfile === dev.id;
            return (
              <div
                key={dev.id}
                className={`dsp-device-card${isActive ? ' active' : ''}`}
                onClick={() => setDeviceProfile(dev.id)}
              >
                <span className="dsp-device-icon">{dev.icon}</span>
                <div className="dsp-device-info">
                  <span className="dsp-device-name">{dev.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#67f0b7', fontWeight: 600 }}>{dev.type}</span>
                  <span className="dsp-device-desc">{dev.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: '14px 18px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        fontSize: '0.78rem',
        color: '#a9b1aa',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: '#f5f7ef' }}>Hardware Optimization Transparency:</strong> Browsers cannot automatically measure physical acoustic impedance or micro-driver transfer functions. These listening profiles apply targeted DSP compensation curves (e.g. sub-sonic filtering for portable speakers, psychoacoustic harmonics for Bluetooth codecs, and crossfeed for over-ears). Manual adjustment remains available in the Sound Engine and Equalizer tabs.
      </div>
    </div>
  );
}
