/**
 * context/AlbumThemeContext.jsx
 *
 * Centralised dynamic theming driven by album artwork color extraction.
 *
 * - Consumes currentTrack from PlayerContext
 * - Uses useAlbumTheme hook to extract palette from artworkUrl
 * - Writes CSS custom properties to :root so every element can read them
 * - Provides theme object + isExtracting via context
 *
 * CSS variables exposed on :root:
 *   --theme-dominant   — primary extracted color
 *   --theme-vibrant    — accent / button color
 *   --theme-muted      — secondary / mid tone
 *   --theme-dark-muted — deep background tone
 *   --theme-gradient   — full gradient string for now-panel background
 *   --theme-text       — rgba text color for readability
 *   --theme-text-secondary — dimmed secondary text
 */
import { createContext, useContext, useEffect } from 'react';
import { usePlayer }      from './PlayerContext';
import { useAlbumTheme, DEFAULT_THEME } from '../hooks/useAlbumTheme';

const AlbumThemeContext = createContext({ theme: DEFAULT_THEME, isExtracting: false });

export function AlbumThemeProvider({ children }) {
  const { currentTrack } = usePlayer();
  const artworkUrl       = currentTrack?.artworkUrl || null;

  const { theme, isExtracting } = useAlbumTheme(artworkUrl);

  // ── Apply CSS custom properties to :root ─────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--theme-dominant',   theme.dominant);
    root.style.setProperty('--theme-vibrant',    theme.vibrant);
    root.style.setProperty('--theme-muted',      theme.muted);
    root.style.setProperty('--theme-dark-muted', theme.darkMuted);
    root.style.setProperty('--theme-gradient',   theme.gradient);

    const isLight = theme.textColor === 'dark';
    root.style.setProperty('--theme-text',           isLight ? 'rgba(10,15,13,0.95)'  : 'rgba(245,247,239,0.97)');
    root.style.setProperty('--theme-text-secondary', isLight ? 'rgba(10,15,13,0.65)'  : 'rgba(245,247,239,0.60)');
  }, [theme]);

  return (
    <AlbumThemeContext.Provider value={{ theme, isExtracting }}>
      {children}
    </AlbumThemeContext.Provider>
  );
}

/** Hook to consume the album theme — use in NowPlaying, PlayerBar, etc. */
export const useAlbumThemeContext = () => useContext(AlbumThemeContext);
