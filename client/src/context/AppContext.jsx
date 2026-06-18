/**
 * context/AppContext.jsx
 *
 * Owns all non-audio app state:
 *   - UI (view, mobile panels, preferences dialog)
 *   - Language / mood filter
 *   - Preferences (theme, volume, accent)
 *   - Playlists
 *   - Track data (local + external)
 *   - Favorites list (loaded from bootstrap, mutated by PlayerContext)
 *   - Search state + doLoadExternal
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { trackHasAudio } from '../utils/audioHelpers';
import { DEFAULT_PREFS } from '../utils/constants';

export const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Navigation ───────────────────────────────────────────────
  const [view,          setView]          = useState('home');

  // ── Mobile panel states ──────────────────────────────────────
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNowOpen, setMobileNowOpen] = useState(false);

  // ── Preferences dialog ───────────────────────────────────────
  const [showPrefs,     setShowPrefs]     = useState(false);

  // ── Music data ───────────────────────────────────────────────
  const [prefs,          setPrefs]          = useState(DEFAULT_PREFS);
  const [playlists,      setPlaylists]      = useState([]);
  const [localTracks,    setLocalTracks]    = useState([]);
  const [externalTracks, setExternalTracks] = useState([]);
  const [favorites,      setFavorites]      = useState([]);

  // ── Language / mood filter ───────────────────────────────────
  const [language, setLanguage] = useState('malayalam');
  const [mood,     setMood]     = useState('');

  // ── Search ───────────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]      = useState('');
  const [suggestions,      setSuggestions]      = useState([]);
  const [showSuggestions,  setShowSuggestions]  = useState(false);

  // ── External loading state ───────────────────────────────────
  const [isLoadingExt, setIsLoadingExt] = useState(false);
  const [extPage,      setExtPage]      = useState(0);

  // ── Bootstrap: load initial data ────────────────────────────
  useEffect(() => {
    api.fetchBootstrap()
      .then(data => {
        setLocalTracks(data.tracks    || []);
        setPlaylists(  data.playlists || []);
        setFavorites(  data.favorites || []);
        if (data.preferences) setPrefs(p => ({ ...p, ...data.preferences }));
      })
      .catch(console.error);
  }, []);

  // ── Apply theme + accent CSS vars ───────────────────────────
  useEffect(() => {
    document.body.setAttribute('data-theme', prefs.theme || 'dark');
    document.body.style.setProperty('--accent', prefs.accent || '#1db954');
  }, [prefs.theme, prefs.accent]);

  // ── Load external tracks ─────────────────────────────────────
  const doLoadExternal = useCallback(async (lang, moodVal, page, term) => {
    setIsLoadingExt(true);
    try {
      const data     = await api.searchExternal(term, lang, page, moodVal);
      const incoming = (data.tracks || []).filter(trackHasAudio);
      if (page === 0) {
        setExternalTracks(incoming);
      } else {
        setExternalTracks(prev => {
          const ids = new Set(prev.map(t => t.id));
          return [...prev, ...incoming.filter(t => !ids.has(t.id))];
        });
      }
      setExtPage(page + 1);
    } catch (e) {
      console.error('loadExternal:', e);
    } finally {
      setIsLoadingExt(false);
    }
  }, []);

  // ── Reload when language or mood changes ─────────────────────
  useEffect(() => {
    setExtPage(0);
    setExternalTracks([]);
    doLoadExternal(language, mood, 0, '');
  }, [language, mood]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Change language helper (also resets mood + goes home) ───
  const changeLanguage = useCallback((lang) => {
    setLanguage(lang);
    setMood('');
    setView('home');
    setMobileNavOpen(false);
  }, []);

  const value = {
    // Navigation
    view, setView,
    // Mobile overlays
    mobileNavOpen, setMobileNavOpen,
    mobileNowOpen, setMobileNowOpen,
    // Preferences dialog
    showPrefs, setShowPrefs,
    // Preferences data
    prefs, setPrefs,
    // Playlists
    playlists,
    // Track data
    localTracks,
    externalTracks,
    // Favorites
    favorites, setFavorites,
    // Language / mood
    language, setLanguage, changeLanguage,
    mood, setMood,
    // Search
    searchQuery, setSearchQuery,
    suggestions, setSuggestions,
    showSuggestions, setShowSuggestions,
    // Loading
    isLoadingExt,
    extPage,
    doLoadExternal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Hook for consuming AppContext — throws if used outside AppProvider */
export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
};
