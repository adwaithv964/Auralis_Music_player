/**
 * audio/AudioVisualizer.jsx
 * 60 FPS Real-time Audio Spectrum Analyzer and Stereo Phase Correlation Meter.
 */

import { useEffect, useRef } from 'react';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';

export function AudioVisualizer() {
  const canvasRef = useRef(null);
  const { audioEngine } = useAudioEngineContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId = null;

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Background subtle grid
      ctx.fillStyle = 'rgba(10, 14, 12, 0.4)';
      ctx.fillRect(0, 0, width, height);

      const graph = audioEngine.graph;
      if (!graph || !graph.analyser) {
        // Flat line idle state
        ctx.strokeStyle = 'rgba(103, 240, 183, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      // ── Spectrum Analyzer (FFT) ──
      const freqCount = graph.analyser.frequencyBinCount;
      const freqData = new Uint8Array(freqCount);
      graph.analyser.getByteFrequencyData(freqData);

      const numBars = Math.min(64, Math.floor(width / 6));
      const barWidth = (width / numBars) - 1.5;
      const step = Math.floor(freqCount / (numBars * 1.8));

      // Emerald Gradient
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#103923');
      gradient.addColorStop(0.5, '#1db954');
      gradient.addColorStop(0.9, '#67f0b7');
      gradient.addColorStop(1.0, '#aefce0');

      ctx.fillStyle = gradient;

      for (let i = 0; i < numBars; i++) {
        const dataIdx = Math.min(freqCount - 1, i * step);
        const val = freqData[dataIdx] || 0;
        const barHeight = Math.max(2, (val / 255) * (height - 18));
        const x = i * (barWidth + 1.5);
        const y = height - barHeight - 16;

        ctx.fillRect(x, y, barWidth, barHeight);
      }

      // ── Phase Correlation Indicator Bar (Bottom) ──
      const correlation = graph.getPhaseCorrelation();
      const meterY = height - 8;
      const meterWidth = Math.min(220, width * 0.4);
      const meterX = width - meterWidth - 12;

      // Background track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(meterX, meterY, meterWidth, 4);

      // Center tick (0.0)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(meterX + meterWidth / 2, meterY - 2, 1, 8);

      // Indicator dot (-1 to +1 mapped to meterX to meterX + meterWidth)
      const dotX = meterX + ((correlation + 1) / 2) * meterWidth;
      ctx.fillStyle = correlation >= 0 ? '#67f0b7' : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(dotX, meterY + 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Correlation label
      ctx.font = '10px monospace';
      ctx.fillStyle = '#a9b1aa';
      ctx.fillText(`PHASE: ${correlation >= 0 ? '+' : ''}${correlation.toFixed(2)}`, meterX - 80, meterY + 4);

      // Peak Meter
      const peak = graph.getPeakLevel();
      ctx.fillStyle = peak.isClipping ? '#ff4d4d' : peak.peakDb > -3 ? '#ffd166' : '#67f0b7';
      ctx.fillText(`PEAK: ${peak.peakDb.toFixed(1)} dBFS`, 12, meterY + 4);
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [audioEngine]);

  return (
    <div className="dsp-visualizer-container">
      <canvas
        ref={canvasRef}
        className="dsp-canvas"
        width={900}
        height={80}
      />
    </div>
  );
}
