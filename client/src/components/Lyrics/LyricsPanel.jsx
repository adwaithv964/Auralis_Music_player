/**
 * components/Lyrics/LyricsPanel.jsx
 *
 * Main lyrics container for the Auralis Now Playing panel.
 *
 * Responsibilities:
 *   - Subscribe to existing useLyricsSync() — the single source of truth.
 *   - Route between loading / empty / lyrics-list states.
 *   - Host the independently scrollable lyrics container.
 *   - Coordinate auto-scroll via useLyricsScroll.
 *   - Forward seekToLine from useLyricsSync to each LyricsLine for
 *     click-to-seek behaviour.
 *
 * Architecture:
 *   lyricsStore → useLyricsSync → LyricsPanel → LyricsLine × N
 *
 * This component contains NO playback logic and NO synchronization logic.
 * It is a pure UI consumer of the existing engine state.
 *
 * Virtualization:
 *   Full DOM rendering is used for normal songs.
 *   If parsedLyrics.lines.length > 300, a windowed slice is rendered
 *   (±50 lines around activeIndex) to keep DOM node count manageable.
 *
 * @param {string} accentColor   - Theme vibrant color (from AlbumThemeContext)
 * @param {string} [className]   - Optional extra class name
 */

import React, { useRef, useMemo } from 'react';
import { useLyricsSync }          from '../../hooks/useLyricsSync';
import { useLyricsScroll }        from '../../hooks/useLyricsScroll';
import { LyricsLine }             from './LyricsLine';
import { LyricsEmpty }            from './LyricsEmpty';
import { LyricsSkeleton }         from './LyricsSkeleton';
import './lyrics.css';

/** Lines above/below active index to render in virtual window mode */
const VIRTUAL_WINDOW = 50;
/** Minimum line count before windowed rendering activates */
const VIRTUAL_THRESHOLD = 300;

export function LyricsPanel({ accentColor, className }) {
  const {
    parsedLyrics,
    activeIndex,
    isLoading,
    hasLyrics,
    isInstrumental,
    seekToLine,
  } = useLyricsSync();

  const scrollRef = useRef(null);

  // Wire auto-scroll: scrolls active line to centre, pauses on manual interaction
  useLyricsScroll(scrollRef, activeIndex);

  // Determine the lines array, applying virtual windowing for very long lyric sets
  const lines = parsedLyrics?.lines ?? null;

  const { visibleLines, indexOffset } = useMemo(() => {
    if (!lines) return { visibleLines: null, indexOffset: 0 };

    if (lines.length <= VIRTUAL_THRESHOLD) {
      return { visibleLines: lines, indexOffset: 0 };
    }

    // Virtual window: only render lines within ±VIRTUAL_WINDOW of active
    const start  = Math.max(0, activeIndex - VIRTUAL_WINDOW);
    const end    = Math.min(lines.length, activeIndex + VIRTUAL_WINDOW + 1);
    return { visibleLines: lines.slice(start, end), indexOffset: start };
  }, [lines, activeIndex]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section
        className={`lyrics-panel${className ? ` ${className}` : ''}`}
        aria-label="Lyrics"
      >
        <div className="lyrics-panel-header" aria-hidden="true">
          <span className="lyrics-panel-label">Lyrics</span>
        </div>
        <div className="lyrics-scroll lyrics-scroll--centered">
          <LyricsSkeleton />
        </div>
      </section>
    );
  }

  // ── Empty / instrumental state ─────────────────────────────────────────────
  if (!hasLyrics || !lines?.length) {
    return (
      <section
        className={`lyrics-panel${className ? ` ${className}` : ''}`}
        aria-label="Lyrics"
      >
        <div className="lyrics-panel-header" aria-hidden="true">
          <span className="lyrics-panel-label">Lyrics</span>
        </div>
        <div className="lyrics-scroll lyrics-scroll--centered">
          <LyricsEmpty isInstrumental={isInstrumental} />
        </div>
      </section>
    );
  }

  // ── Lyrics list ───────────────────────────────────────────────────────────
  return (
    <section
      className={`lyrics-panel${className ? ` ${className}` : ''}`}
      aria-label="Lyrics"
    >
      <div className="lyrics-panel-header" aria-hidden="true">
        <span className="lyrics-panel-label">Lyrics</span>
      </div>

      <div
        ref={scrollRef}
        className="lyrics-scroll"
        role="list"
        aria-label="Song lyrics"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="text"
      >
        {/* Top padding so the first line can be centered */}
        <div className="lyrics-scroll-pad" aria-hidden="true" />

        {visibleLines.map((line, i) => {
          const absoluteIndex = i + indexOffset;
          return (
            <LyricsLine
              key={absoluteIndex}
              line={line}
              index={absoluteIndex}
              activeIndex={activeIndex}
              accentColor={accentColor}
              onClick={seekToLine}
            />
          );
        })}

        {/* Bottom padding so the last line can be centered */}
        <div className="lyrics-scroll-pad" aria-hidden="true" />
      </div>
    </section>
  );
}
