/**
 * audio/SourceQualityTab.jsx
 * Accurate Audio Quality, Codec & Bitrate Inspection Panel.
 */

import { usePlayer } from '../../context/PlayerContext';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';

export function SourceQualityTab() {
  const { currentTrack } = usePlayer();
  const { getSourceQuality } = useAudioEngineContext();

  const quality = getSourceQuality(currentTrack);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Source Stream Quality & Format Audit</span>
          <span className="dsp-pro-badge">Hi-Fi Transparency</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Source Container & Codec</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f5f7ef', marginTop: 4 }}>{quality.format}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Stream Bitrate</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#67f0b7', marginTop: 4 }}>{quality.bitrate}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Source Sample Rate</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f5f7ef', marginTop: 4 }}>{quality.sampleRate}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Internal Processing Format</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#67f0b7', marginTop: 4 }}>{quality.outputFormat}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Verified Stream Provider</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f5f7ef', marginTop: 4 }}>{quality.provider}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#a9b1aa', textTransform: 'uppercase' }}>Sound Engine DSP Pipeline</span>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#67f0b7', marginTop: 4 }}>{quality.dspStatus}</div>
            </div>
          </div>

          <div style={{
            padding: '14px 18px',
            background: 'rgba(103, 240, 183, 0.06)',
            border: '1px solid rgba(103, 240, 183, 0.2)',
            borderRadius: 12,
            fontSize: '0.8rem',
            color: '#dfe6de',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: '#67f0b7' }}>Lossless & Fidelity Integrity Standard:</strong> {quality.notice}
          </div>
        </div>
      </div>
    </div>
  );
}
