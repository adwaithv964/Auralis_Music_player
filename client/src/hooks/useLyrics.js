/**
 * hooks/useLyrics.js
 *
 * React hook that exposes lyrics state from the Zustand lyricsStore
 * to components that need to display lyrics.
 *
 * Design:
 *   - Fine-grained selectors: each field is subscribed independently so
 *     components re-render only when the specific value they need changes
 *   - Stable references: the returned object is composed inline (no useMemo)
 *     because each field is a primitive or reference-stable Zustand slice
 *   - The hook intentionally does NOT start/stop the sync loop — that is
 *     handled exclusively by LyricsEngine
 *   - No side effects — pure read access to lyricsStore
 *
 * Usage:
 *   import { useLyrics } from '../hooks/useLyrics';
 *
 *   function LyricsView() {
 *     const {
 *       parsedLyrics, activeLine, nextLine, activeIndex,
 *       isLoading, hasLyrics, isInstrumental,
 *       translation, romanized, provider,
 *     } = useLyrics();
 *     ...
 *   }
 *
 * Selective subscription (for performance-critical components):
 *   import { useLyricsStore } from '../store/lyricsStore';
 *   const activeLine = useLyricsStore(s => s.activeLine);
 */

import { useLyricsStore } from '../store/lyricsStore';

/**
 * Composite lyrics hook.
 *
 * Returns all lyrics state fields in a single call.
 * For high-frequency components (e.g. lyric line renderers), prefer
 * the granular `useLyricsStore(selector)` pattern instead to minimise
 * the number of fields that trigger re-renders.
 *
 * @returns {{
 *   lyrics:              string|null,
 *   parsedLyrics:        import('../lyrics/LyricsEngine').ParsedLyrics|null,
 *   activeLine:          import('../lyrics/LyricsEngine').LyricLine|null,
 *   nextLine:            import('../lyrics/LyricsEngine').LyricLine|null,
 *   activeIndex:         number,
 *   isLoading:           boolean,
 *   hasLyrics:           boolean,
 *   isInstrumental:      boolean,
 *   provider:            string|null,
 *   lastUpdated:         string|null,
 *   language:            string|null,
 *   translation:         string[]|null,
 *   translationLanguage: string|null,
 *   romanized:           string[]|null,
 * }}
 */
export function useLyrics() {
  // Each call to useLyricsStore with a selector is an independent subscription.
  // Zustand batches store updates so these selectors only cause a re-render
  // when their specific slice changes.
  const lyrics              = useLyricsStore(s => s.lyrics);
  const parsedLyrics        = useLyricsStore(s => s.parsedLyrics);
  const activeLine          = useLyricsStore(s => s.activeLine);
  const nextLine            = useLyricsStore(s => s.nextLine);
  const activeIndex         = useLyricsStore(s => s.activeIndex);
  const isLoading           = useLyricsStore(s => s.isLoading);
  const hasLyrics           = useLyricsStore(s => s.hasLyrics);
  const isInstrumental      = useLyricsStore(s => s.isInstrumental);
  const provider            = useLyricsStore(s => s.provider);
  const lastUpdated         = useLyricsStore(s => s.lastUpdated);
  const language            = useLyricsStore(s => s.language);
  const translation         = useLyricsStore(s => s.translation);
  const translationLanguage = useLyricsStore(s => s.translationLanguage);
  const romanized           = useLyricsStore(s => s.romanized);

  return {
    lyrics,
    parsedLyrics,
    activeLine,
    nextLine,
    activeIndex,
    isLoading,
    hasLyrics,
    isInstrumental,
    provider,
    lastUpdated,
    language,
    translation,
    translationLanguage,
    romanized,
  };
}

/**
 * Lightweight hook for components that only need the current active line.
 * Causes a re-render only when `activeLine` changes (~60fps while playing).
 *
 * @returns {{
 *   activeLine:  import('../lyrics/LyricsEngine').LyricLine|null,
 *   nextLine:    import('../lyrics/LyricsEngine').LyricLine|null,
 *   activeIndex: number,
 * }}
 */
export function useActiveLyricLine() {
  const activeLine  = useLyricsStore(s => s.activeLine);
  const nextLine    = useLyricsStore(s => s.nextLine);
  const activeIndex = useLyricsStore(s => s.activeIndex);
  return { activeLine, nextLine, activeIndex };
}

/**
 * Lightweight hook for lyrics status flags only.
 * Useful for conditional rendering without subscribing to sync position.
 *
 * @returns {{
 *   isLoading:      boolean,
 *   hasLyrics:      boolean,
 *   isInstrumental: boolean,
 * }}
 */
export function useLyricsStatus() {
  const isLoading      = useLyricsStore(s => s.isLoading);
  const hasLyrics      = useLyricsStore(s => s.hasLyrics);
  const isInstrumental = useLyricsStore(s => s.isInstrumental);
  return { isLoading, hasLyrics, isInstrumental };
}

/**
 * Hook for accessing the parsed lyrics lines array.
 * Returns null while loading or when no lyrics are available.
 *
 * @returns {import('../lyrics/LyricsEngine').LyricLine[]|null}
 */
export function useLyricsLines() {
  return useLyricsStore(s => s.parsedLyrics?.lines ?? null);
}

/**
 * Hook for language layer data (translation + romanized).
 *
 * @returns {{
 *   translation:         string[]|null,
 *   translationLanguage: string|null,
 *   romanized:           string[]|null,
 * }}
 */
export function useLyricsLayers() {
  const translation         = useLyricsStore(s => s.translation);
  const translationLanguage = useLyricsStore(s => s.translationLanguage);
  const romanized           = useLyricsStore(s => s.romanized);
  return { translation, translationLanguage, romanized };
}
