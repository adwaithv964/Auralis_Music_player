/**
 * hooks/useLyricsSync.js
 *
 * React hook that manages the LyricsEngine sync loop lifecycle
 * in response to component mount/unmount and playback state changes.
 *
 * Responsibilities:
 *   - Ensures the LyricsEngine singleton is initialised (import-side-effect)
 *   - Exposes the current active lyric line for immediate rendering
 *   - Provides a utility function to seek the sync loop from UI interactions
 *   - Handles cleanup correctly on component unmount
 *
 * Architecture note:
 *   This hook does NOT own or manage the rAF loop directly.
 *   That is the exclusive responsibility of LyricsEngine + LyricsSync.
 *   This hook is a thin bridge that:
 *     a) Reads sync position from lyricsStore (written by LyricsSync via LyricsEngine)
 *     b) Exposes the lyricsEngine API for imperative interactions
 *
 * Usage:
 *   import { useLyricsSync } from '../hooks/useLyricsSync';
 *
 *   function NowPlayingLyrics() {
 *     const { activeLine, nextLine, activeIndex, isReady, seekToLine } = useLyricsSync();
 *     ...
 *   }
 */

import { useCallback, useEffect }  from 'react';
import { lyricsEngine }            from '../lyrics/LyricsEngine';
import { audioEngine }             from '../audio/AudioEngine';
import { useLyricsStore }          from '../store/lyricsStore';
import { usePlayerStore }          from '../store/playerStore';

/**
 * @typedef {Object} UseLyricsSyncResult
 * @property {import('../lyrics/LyricsEngine').LyricLine|null} activeLine  - Current active lyric line
 * @property {import('../lyrics/LyricsEngine').LyricLine|null} nextLine    - Next lyric line
 * @property {number}  activeIndex   - Index in parsedLyrics.lines (-1 = before start)
 * @property {boolean} isReady       - True when synchronized lyrics are loaded and sync is running
 * @property {boolean} isLoading     - True while the provider chain is resolving
 * @property {boolean} isInstrumental - True when the track has no lyrics
 * @property {boolean} hasLyrics     - True when lyrics are available
 * @property {(lineIndex: number) => void} seekToLine - Seek audio to the start of a specific line
 */

/**
 * Primary lyrics sync hook.
 *
 * Subscribe to this hook in any component that renders synchronized lyrics.
 * The hook reads state from lyricsStore (written by LyricsSync at ~60fps)
 * and provides the seekToLine utility for click-to-seek interactions.
 *
 * @returns {UseLyricsSyncResult}
 */
export function useLyricsSync() {
  // ── Lyrics state ─────────────────────────────────────────────────────────
  const activeLine    = useLyricsStore(s => s.activeLine);
  const nextLine      = useLyricsStore(s => s.nextLine);
  const activeIndex   = useLyricsStore(s => s.activeIndex);
  const isLoading     = useLyricsStore(s => s.isLoading);
  const isInstrumental = useLyricsStore(s => s.isInstrumental);
  const hasLyrics     = useLyricsStore(s => s.hasLyrics);
  const parsedLyrics  = useLyricsStore(s => s.parsedLyrics);

  // ── Playback state (for isReady computation) ──────────────────────────────
  const isPlaying = usePlayerStore(s => s.isPlaying);

  // isReady: true when synchronized lyrics are loaded AND audio is playing
  const isReady = !!(
    hasLyrics &&
    parsedLyrics?.type === 'synchronized' &&
    isPlaying
  );

  // ── Effect: Ensure LyricsEngine handles play/pause transitions ────────────
  // The LyricsEngine already listens to AudioElement events, but this effect
  // provides an extra React-lifecycle-aware trigger for edge cases where
  // lyrics are loaded AFTER playback has already started (e.g. slow network).
  useEffect(() => {
    if (isPlaying && parsedLyrics?.type === 'synchronized') {
      lyricsEngine.onPlaybackStarted();
    } else if (!isPlaying) {
      lyricsEngine.onPlaybackPaused();
    }
  }, [isPlaying, parsedLyrics?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Do not stop the sync loop on unmount — the engine owns the loop.
      // Only clean up view-specific subscriptions if added in future.
    };
  }, []);

  // ── seekToLine utility ────────────────────────────────────────────────────
  /**
   * Seek audio playback to the timestamp of a specific lyric line.
   * Useful for click-to-seek behaviour in the lyrics list.
   *
   * @param {number} lineIndex - Index into parsedLyrics.lines
   */
  const seekToLine = useCallback((lineIndex) => {
    const lines = parsedLyrics?.lines;
    if (!lines || lineIndex < 0 || lineIndex >= lines.length) return;

    const targetTime = lines[lineIndex].time;
    if (targetTime < 0) return; // plain text — no timestamp

    // Seek the actual audio element
    if (audioEngine?.primaryAudio) {
      audioEngine.primaryAudio.currentTime = targetTime;
    }

    // Notify the sync engine to snap immediately (avoids waiting for 'seeked' event)
    lyricsEngine.onSeeked(targetTime);
  }, [parsedLyrics]);

  return {
    activeLine,
    nextLine,
    activeIndex,
    isReady,
    isLoading,
    isInstrumental,
    hasLyrics,
    seekToLine,
  };
}

/**
 * Minimal hook for components that only need the active line text.
 * No isReady, no seekToLine — absolute minimum re-render surface.
 *
 * @returns {{ text: string, translation: string|null, romanized: string|null } | null}
 */
export function useActiveLineText() {
  const activeLine = useLyricsStore(s => s.activeLine);
  const activeIndex = useLyricsStore(s => s.activeIndex);
  const translation = useLyricsStore(s => s.translation);
  const romanized   = useLyricsStore(s => s.romanized);

  if (!activeLine) return null;

  return {
    text:        activeLine.text,
    translation: (translation && activeIndex >= 0) ? (translation[activeIndex] ?? null) : null,
    romanized:   (romanized   && activeIndex >= 0) ? (romanized[activeIndex]   ?? null) : null,
  };
}
