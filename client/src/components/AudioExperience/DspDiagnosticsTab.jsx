/**
 * audio/DspDiagnosticsTab.jsx
 * Interactive Synthetic DSP Validation Suite UI.
 */

import { useState } from 'react';
import { runDspValidationSuite } from '../../audio/dspValidator';

export function DspDiagnosticsTab() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const results = await runDspValidationSuite();
      setTestResults(results);
    } catch (err) {
      console.error('Validation test error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="dsp-card">
        <div className="dsp-card-title">
          <span>Automated Synthetic DSP Validation Test Suite</span>
          <button
            className="dsp-btn-primary"
            onClick={handleRunTests}
            disabled={isRunning}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            {isRunning ? 'Running Audio Tests…' : '▶ Run DSP Validation Suite'}
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#a9b1aa', lineHeight: 1.45 }}>
          Executes faster-than-realtime mathematical rendering via <code>OfflineAudioContext</code>.
          Validates all 4 bypass combinations (Engine OFF/EQ OFF, Engine ON/EQ OFF, Engine OFF/EQ ON, Engine ON/EQ ON),
          +6 dBFS limiter containment, stereo phase correlation safety, and psychoacoustic harmonic excitation.
        </p>

        {testResults ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {testResults.map(test => (
              <div
                key={test.id}
                style={{
                  background: test.passed ? 'rgba(103, 240, 183, 0.06)' : 'rgba(255, 77, 77, 0.08)',
                  border: test.passed ? '1px solid rgba(103, 240, 183, 0.25)' : '1px solid rgba(255, 77, 77, 0.35)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem', color: test.passed ? '#67f0b7' : '#ff4d4d' }}>
                      {test.passed ? '✓' : '✗'}
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: test.passed ? '#f5f7ef' : '#ff7a7a' }}>
                      {test.name}
                    </strong>
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                      color: '#a9b1aa',
                    }}>
                      {test.category}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#a9b1aa', marginLeft: 24 }}>
                    {test.detail}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {test.speed && (
                    <span style={{ fontSize: '0.75rem', color: '#a9b1aa', fontFamily: 'monospace' }}>
                      {test.speed}
                    </span>
                  )}
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: test.passed ? 'rgba(103, 240, 183, 0.2)' : 'rgba(255, 77, 77, 0.2)',
                    color: test.passed ? '#67f0b7' : '#ff4d4d',
                  }}>
                    {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: 30,
            textAlign: 'center',
            color: '#88928a',
            fontSize: '0.85rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            border: '1px dashed rgba(255,255,255,0.08)',
          }}>
            Click "Run DSP Validation Suite" to execute synthetic audio signal checks.
          </div>
        )}
      </div>
    </div>
  );
}
