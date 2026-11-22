/**
 * store/lyricsStore.js
 *
 * Dedicated Zustand store for all lyrics state in the Auralis music player.
 *
 * Design principles (mirrors playerStore.js):
 *   - Pure state only — zero lyrics logic lives here
 *   - The LyricsEngine singleton writes to this store after every event
 *   - React components subscribe to slices via useLyricsStore(selector)
 *     to avoid unnecessary re-renders
 *   - Actions are lean setters; all orchestration stays in LyricsEngine
 *   - Immutable state updates throughout
 *
 * Usage (in a component):
 *   import { useLyricsStore } from '../store/lyricsStore';
 *
 *   // Fine-grained subscription — re-renders only when activeLine changes
 *   const activeLine = useLyricsStore(s => s.activeLine);
 *
 *   // Action subscription
 *   const clearLyrics = useLyricsStore(s => s.clearLyrics);
 *
 * Usage (outside React — e.g. in LyricsEngine):
 *   import { useLyricsStore } from '../store/lyricsStore';
 *   const state = useLyricsStore.getState();
 *   state.setActiveLine({ activeIndex: 3, activeLine: {...}, nextLine: {...} });
 */

import { create } from 'zustand';

// ─── Store shape ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LyricsState
 *
 * ── Raw content ────────────────────────────────────────────────────────────────
 * @property {string|null}                         lyrics        - Raw LRC/plain text string
 * @property {import('../lyrics/LyricsEngine').ParsedLyrics|null} parsedLyrics
 *
 * ── Synchronization position ────────────────────────────────────────────────
 * @property {import('../lyrics/LyricsEngine').LyricLine|null}    activeLine    - Currently active lyric line
 * @property {import('../lyrics/LyricsEngine').LyricLine|null}    nextLine      - Next lyric line (for pre-render)
 * @property {number}                              activeIndex   - Index into parsedLyrics.lines; -1 = before start
 *
 * ── Status flags ────────────────────────────────────────────────────────────
 * @property {boolean}                             isLoading     - True while resolution pipeline is running
 * @property {boolean}                             hasLyrics     - True when lyrics are available and parsed
 * @property {boolean}                             isInstrumental - True when track has no lyrics
 *
 * ── Source metadata ─────────────────────────────────────────────────────────
 * @property {string|null}                         provider      - Provider that resolved lyrics (e.g. 'LrcLib')
 * @property {string|null}                         lastUpdated   - ISO timestamp of last successful load
 * @property {string|null}                         language      - BCP-47 language tag if known
 *
 * ── Language layers ─────────────────────────────────────────────────────────
 * @property {string[]|null}                       translation   - Parallel translation strings (index = line index)
 * @property {string|null}                         translationLanguage - BCP-47 tag for translation
 * @property {string[]|null}                       romanized     - Parallel romanized strings
 *
 * ── Actions ─────────────────────────────────────────────────────────────────
 * @property {Function}   setLoading
 * @property {Function}   setLyrics
 * @property {Function}   setParsedLyrics
 * @property {Function}   setActiveLine
 * @property {Function}   setIsInstrumental
 * @property {Function}   setHasLyrics
 * @property {Function}   setProvider
 * @property {Function}   updateTranslation
 * @property {Function}   updateRomanization
 * @property {Function}   clearLyrics
 * @property {Function}   cacheLyrics
 */

export const useLyricsStore = create((set, get) => ({
  // ── Raw content ─────────────────────────────────────────────────────────────
  lyrics:       null,
  parsedLyrics: null,

  // ── Synchronization position ─────────────────────────────────────────────
  activeLine:   null,
  nextLine:     null,
  activeIndex:  -1,

  // ── Status flags ─────────────────────────────────────────────────────────
  isLoading:      false,
  hasLyrics:      false,
  isInstrumental: false,

  // ── Source metadata ───────────────────────────────────────────────────────
  provider:     null,
  lastUpdated:  null,
  language:     null,

  // ── Language layers ───────────────────────────────────────────────────────
  translation:         null,
  translationLanguage: null,
  romanized:           null,

  // ═════════════════════════════════════════════════════════════════════════
  // Actions
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Set the loading flag.
   * @param {boolean} isLoading
   */
  setLoading: (isLoading) => set({ isLoading: !!isLoading }),

  /**
   * Bulk-update lyrics state after a successful load.
   * Accepts a partial object matching the state shape.
   *
   * @param {{
   *   lyrics:         string|null,
   *   parsedLyrics:   import('../lyrics/LyricsEngine').ParsedLyrics|null,
   *   hasLyrics:      boolean,
   *   isInstrumental: boolean,
   *   isLoading:      boolean,
   *   provider:       string|null,
   *   lastUpdated:    string|null,
   *   language:       string|null,
   * }} payload
   */
  setLyrics: (payload) => set({
    lyrics:         payload.lyrics         ?? null,
    parsedLyrics:   payload.parsedLyrics   ?? null,
    hasLyrics:      payload.hasLyrics      ?? false,
    isInstrumental: payload.isInstrumental ?? false,
    isLoading:      payload.isLoading      ?? false,
    provider:       payload.provider       ?? null,
    lastUpdated:    payload.lastUpdated    ?? null,
    language:       payload.language       ?? null,
    // Reset position to beginning when new lyrics are loaded
    activeLine:     null,
    nextLine:       null,
    activeIndex:    -1,
  }),

  /**
   * Replace the parsed lyrics object only.
   * Used when updating lyrics mid-session (e.g. after translation injection).
   * @param {import('../lyrics/LyricsEngine').ParsedLyrics|null} parsedLyrics
   */
  setParsedLyrics: (parsedLyrics) => set({ parsedLyrics }),

  /**
   * Update the active lyric line, next line, and index from the sync loop.
   *
   * Called ~60fps while playing — uses minimal allocation:
   * spreads only the three fields being updated.
   *
   * @param {{
   *   activeIndex: number,
   *   activeLine:  import('../lyrics/LyricsEngine').LyricLine|null,
   *   nextLine:    import('../lyrics/LyricsEngine').LyricLine|null,
   * }} result
   */
  setActiveLine: ({ activeIndex, activeLine, nextLine }) => set({
    activeIndex,
    activeLine,
    nextLine,
  }),

  /** @param {boolean} isInstrumental */
  setIsInstrumental: (isInstrumental) => set({ isInstrumental: !!isInstrumental }),

  /** @param {boolean} hasLyrics */
  setHasLyrics: (hasLyrics) => set({ hasLyrics: !!hasLyrics }),

  /** @param {string|null} provider */
  setProvider: (provider) => set({ provider }),

  /**
   * Inject or update the translation layer.
   * Immutably replaces the translation array.
   *
   * @param {string[]} lines           - One string per parsed lyric line
   * @param {string|null} [language]   - BCP-47 language tag
   */
  updateTranslation: (lines, language = null) => set({
    translation:         Array.isArray(lines) ? [...lines] : null,
    translationLanguage: language,
  }),

  /**
   * Inject or update the romanized lyrics layer.
   * @param {string[]} lines - One romanized string per parsed lyric line
   */
  updateRomanization: (lines) => set({
    romanized: Array.isArray(lines) ? [...lines] : null,
  }),

  /**
   * Reset all lyrics state to initial values.
   * Called on song change, stop, or explicit clear.
   *
   * Preserves nothing — a fresh song should start from a clean slate.
   */
  clearLyrics: () => set({
    lyrics:              null,
    parsedLyrics:        null,
    activeLine:          null,
    nextLine:            null,
    activeIndex:         -1,
    isLoading:           false,
    hasLyrics:           false,
    isInstrumental:      false,
    provider:            null,
    lastUpdated:         null,
    language:            null,
    translation:         null,
    translationLanguage: null,
    romanized:           null,
  }),

  /**
   * Trigger a cache write for the current parsed lyrics.
   * This is a no-op action in the store — the actual caching is done by
   * LyricsEngine. Exposed here for store-level debugging and testing.
   */
  cacheLyrics: () => {
    const state = get();
    if (!state.parsedLyrics) return;
    // Implemented in LyricsEngine — this is a store-level stub
    // for testing and future use.
  },
}));
