/**
 * components/Lyrics/LyricsEmpty.jsx
 *
 * Rendered when lyrics are unavailable:
 *   - isInstrumental=true  → "Instrumental Track / No lyrics available."
 *   - otherwise            → "No synchronized lyrics available for this track."
 *
 * Styled to integrate naturally with the Auralis glassmorphism aesthetic.
 * No logic — pure display component.
 */

import React from 'react';

function InstrumentalIcon() {
  return (
    <svg
      className="lyrics-empty-icon"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"/>
      <path
        d="M30 14v14a5 5 0 1 1-4-4.9V18l-8 2v10a5 5 0 1 1-4-4.9V15l16-4v3z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

function NoLyricsIcon() {
  return (
    <svg
      className="lyrics-empty-icon"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 14h28M10 22h20M10 30h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.4"
      />
      <circle cx="36" cy="34" r="8" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
      <path d="M32 38l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

export function LyricsEmpty({ isInstrumental }) {
  return (
    <div
      className="lyrics-empty"
      role="status"
      aria-label={isInstrumental ? 'Instrumental track, no lyrics available' : 'No lyrics available for this track'}
    >
      {isInstrumental ? <InstrumentalIcon /> : <NoLyricsIcon />}

      <p className="lyrics-empty-title">
        {isInstrumental ? 'Instrumental Track' : 'No Lyrics Available'}
      </p>
      <p className="lyrics-empty-sub">
        {isInstrumental
          ? 'No lyrics available for instrumental tracks.'
          : 'No synchronized lyrics available for this track.'}
      </p>
    </div>
  );
}
