/**
 * components/Lyrics/LyricsLine.jsx
 *
 * A single lyric line rendered inside the LyricsPanel.
 *
 * Props:
 *   line        {Object}   - Lyric line object ({ text, time, ... })
 *   index       {number}   - This line's position in parsedLyrics.lines
 *   activeIndex {number}   - Currently active line index
 *   accentColor {string}   - Theme vibrant color for the active line
 *   onClick     {Function} - Called with index to seek to this timestamp
 *
 * Responsibilities:
 *   - Display the lyric text with proximity-based styling via useLyricsHighlight
 *   - Apply CSS transitions for smooth opacity / transform animations
 *   - Provide data-lyric-index attribute so useLyricsScroll can locate the element
 *   - Support click-to-seek (calls onClick with this line's index)
 *   - Skip rendering for blank spacer lines gracefully
 *
 * This component has NO synchronization logic and NO store subscriptions.
 */

import React, { memo } from 'react';
import { useLyricsHighlight } from '../../hooks/useLyricsHighlight';

export const LyricsLine = memo(function LyricsLine({
  line,
  index,
  activeIndex,
  accentColor,
  onClick,
}) {
  const { isActive, opacity, scale, fontWeight } = useLyricsHighlight(index, activeIndex);

  // Empty/spacer lines: render a short gap instead of blank text
  if (!line.text?.trim()) {
    return <div className="lyrics-line lyrics-line--spacer" data-lyric-index={index} aria-hidden="true" />;
  }

  return (
    <button
      className={`lyrics-line${isActive ? ' lyrics-line--active' : ''}`}
      data-lyric-index={index}
      onClick={() => onClick?.(index)}
      aria-label={isActive ? `Now playing: ${line.text}` : line.text}
      aria-current={isActive ? 'true' : undefined}
      style={{
        opacity,
        transform: `scale(${scale})`,
        fontWeight,
        color: isActive ? accentColor : undefined,
      }}
    >
      <span className="lyrics-line-text">{line.text}</span>
    </button>
  );
});
