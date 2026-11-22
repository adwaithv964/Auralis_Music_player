/**
 * components/Lyrics/LyricsSkeleton.jsx
 *
 * Animated shimmer placeholder shown while lyrics are loading.
 * Renders 6 bars of varying widths to mimic the visual rhythm of lyric lines.
 *
 * The shimmer animation is defined in lyrics.css and reuses the
 * existing Auralis shimmer keyframe pattern.
 *
 * No props required — purely presentational.
 */

import React from 'react';

/** Widths for each skeleton bar — varied to mimic natural lyric lengths */
const BAR_WIDTHS = ['72%', '55%', '82%', '48%', '68%', '38%'];

export function LyricsSkeleton() {
  return (
    <div
      className="lyrics-skeleton"
      role="status"
      aria-label="Loading lyrics"
      aria-busy="true"
    >
      {BAR_WIDTHS.map((width, i) => (
        <div
          key={i}
          className="lyrics-skeleton-bar"
          style={{ width, animationDelay: `${i * 120}ms` }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Loading lyrics…</span>
    </div>
  );
}
