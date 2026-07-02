/**
 * hooks/useAlbumTheme.js
 *
 * Extracts the dominant color palette from album artwork using node-vibrant
 * and returns a centralized theme object.
 *
 * Features:
 *  - Runs only when artworkUrl changes
 *  - LRU in-memory cache (max 50 entries) — no re-extraction on repeat play
 *  - Automatic luminance-based text color selection
 *  - Graceful fallback to Auralis default theme on error / missing artwork
 *  - Non-blocking: extraction happens async, player state is never delayed
 */
import { useState, useEffect, useRef } from 'react';
import { Vibrant } from 'node-vibrant/browser';
import { artProxy } from '../utils/audioHelpers';

// ── Default Auralis theme ─────────────────────────────────────────────────────
export const DEFAULT_THEME = {
  dominant:  '#1db954',
  vibrant:   '#1db954',
  muted:     '#1a2e22',
  darkMuted: '#0f1a13',
  gradient:  'linear-gradient(180deg, #1a3320 0%, #111a15 45%, #0a0f0d 100%)',
  textColor: 'light',
};

// ── In-memory LRU cache (module-scoped — survives re-renders) ─────────────────
const CACHE_MAX  = 50;
const paletteCache = new Map(); // url → theme

function evictIfNeeded() {
  if (paletteCache.size >= CACHE_MAX) {
    // Delete the oldest entry (Map preserves insertion order)
    const firstKey = paletteCache.keys().next().value;
    paletteCache.delete(firstKey);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Vibrant swatch hex to a CSS hex string, or null */
function swatchHex(swatch) {
  return swatch ? swatch.hex : null;
}

/** Perceived luminance from a hex color (0–1) */
function luminance(hex) {
  if (!hex) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Darken a hex color by a factor (0–1) */
function darken(hex, factor = 0.4) {
  if (!hex) return '#0a0f0d';
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/** Build a theme object from a node-vibrant palette */
function buildTheme(palette) {
  const vibrant      = swatchHex(palette.Vibrant);
  const darkVibrant  = swatchHex(palette.DarkVibrant);
  const muted        = swatchHex(palette.Muted);
  const darkMuted    = swatchHex(palette.DarkMuted);
  const lightVibrant = swatchHex(palette.LightVibrant);
  const lightMuted   = swatchHex(palette.LightMuted);

  // Priority: Vibrant → DarkVibrant → Muted → DarkMuted → LightVibrant → LightMuted
  const dominant  = vibrant || darkVibrant || muted || lightVibrant || lightMuted || DEFAULT_THEME.dominant;
  const accent    = vibrant || lightVibrant || dominant;
  const mid       = muted   || darkMuted   || darken(dominant, 0.6);
  const deep      = darkMuted || darken(dominant, 0.35);

  const lum       = luminance(dominant);
  const textColor = lum > 0.35 ? 'dark' : 'light';

  // Rich multi-stop gradient: dominant → mid → deep dark
  const gradient = `linear-gradient(180deg, ${darken(dominant, 0.75)} 0%, ${darken(mid, 0.55)} 50%, ${darken(deep, 0.3)} 100%)`;

  return {
    dominant,
    vibrant: accent,
    muted:   mid,
    darkMuted: deep,
    gradient,
    textColor,
  };
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useAlbumTheme(artworkUrl)
 *
 * Returns { theme, isExtracting }.
 * Extraction is async — `theme` starts as previous/default and updates
 * smoothly once the palette is ready.
 */
export function useAlbumTheme(artworkUrl) {
  const [theme, setTheme]             = useState(DEFAULT_THEME);
  const [isExtracting, setExtracting] = useState(false);
  const lastUrlRef                    = useRef(null);

  useEffect(() => {
    // No artwork → fallback theme
    if (!artworkUrl) {
      setTheme(DEFAULT_THEME);
      lastUrlRef.current = null;
      return;
    }

    // Same URL → no-op (handles HMR / strict-mode double-fire)
    if (artworkUrl === lastUrlRef.current) return;
    lastUrlRef.current = artworkUrl;

    // Cache hit → instant theme update
    if (paletteCache.has(artworkUrl)) {
      setTheme(paletteCache.get(artworkUrl));
      return;
    }

    // Cache miss → extract asynchronously
    let cancelled = false;
    setExtracting(true);

    const proxiedUrl = artProxy(artworkUrl);

    Vibrant.from(proxiedUrl)
      .maxColorCount(64)
      .getPalette()
      .then((palette) => {
        if (cancelled) return;
        const newTheme = buildTheme(palette);
        evictIfNeeded();
        paletteCache.set(artworkUrl, newTheme);
        setTheme(newTheme);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[useAlbumTheme] Extraction failed, using default theme:', err?.message);
        setTheme(DEFAULT_THEME);
      })
      .finally(() => {
        if (!cancelled) setExtracting(false);
      });

    return () => { cancelled = true; };
  }, [artworkUrl]);

  return { theme, isExtracting };
}
