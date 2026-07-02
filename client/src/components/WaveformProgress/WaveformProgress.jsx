/**
 * WaveformProgress
 * Replaces the flat progress bar in the Now Playing panel with an
 * animated waveform visualizer using CSS animations only.
 *
 * Architecture:
 *  - 60 bars with deterministic pseudo-random height/delay/duration.
 *  - Two stacked bar layers:
 *      wf-bars--muted  → gray (full width)
 *      wf-bars--active → accent color, clip-path clipped to progress %
 *  - Transparent <input range> floats above for seek interaction.
 *  - animation-play-state toggled by CSS class (instant freeze on pause).
 */

const BAR_COUNT = 60;

function lcg(seed) {
  return (((seed * 1664525) + 1013904223) >>> 0) / 0x100000000;
}

const BAR_DATA = Array.from({ length: BAR_COUNT }, (_, i) => {
  const r1 = lcg(i * 3 + 1);
  const r2 = lcg(i * 7 + 5);
  const r3 = lcg(i * 13 + 11);
  const sineBase = (Math.sin(i * 0.31 + 0.8) + 1) / 2;
  const height = Math.max(12, Math.min(95, 15 + sineBase * 45 + r1 * 38));
  return {
    height: `${height.toFixed(1)}%`,
    delay: `${-(r2 * 1.8).toFixed(3)}s`,
    duration: `${(0.38 + r3 * 0.88).toFixed(3)}s`,
  };
});

const makeBar = (b, i) => ({
  key: i,
  className: 'wf-bar',
  style: { '--wf-h': b.height, '--wf-delay': b.delay, '--wf-dur': b.duration },
});
const BAR_PROPS = BAR_DATA.map(makeBar);

export function WaveformProgress({
  progress,
  isPlaying,
  seek,
  displayElapsed,
  displayDuration,
  accentColor,
  isLoading,
}) {
  const stageClass = [
    'wf-stage',
    isPlaying && !isLoading ? 'wf-stage--playing' : '',
    isLoading ? 'wf-stage--loading' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="wf-root">
      <div
        className={stageClass}
        style={{
          '--wf-progress': `${progress}%`,
          '--wf-accent': accentColor || 'var(--theme-vibrant, var(--accent))',
        }}
        aria-label={`Playback progress: ${displayElapsed} of ${displayDuration}`}
      >
        <div className="wf-bars wf-bars--muted" aria-hidden="true">
          {BAR_PROPS.map(p => <span key={p.key} className={p.className} style={p.style} />)}
        </div>
        <div className="wf-bars wf-bars--active" aria-hidden="true">
          {BAR_PROPS.map(p => <span key={p.key} className={p.className} style={p.style} />)}
        </div>
        <input
          type="range"
          className="wf-seek"
          min="0"
          max="1000"
          value={Math.round(progress * 10)}
          onChange={e => seek(e.target.value / 10)}
          aria-label="Seek"
          style={{ '--seek-thumb-color': accentColor }}
        />
      </div>
      <div className="wf-times">
        <span>{displayElapsed}</span>
        <span>{displayDuration}</span>
      </div>
    </div>
  );
}
