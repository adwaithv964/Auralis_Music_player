/**
 * context/AppContext.jsx
 *
 * Owns all non-audio app state:
 *   - UI (view, mobile panels, preferences dialog)
 *   - Language / mood filter
 *   - Preferences (theme, volume, accent) — persisted to MongoDB
 *   - Playlists
 *   - Play history (loaded from bootstrap, full track snapshots)
 *   - Track data (local + external)
 *   - Favorites list (ID array for fast isFav checks)
 *   - Liked Songs (full track snapshots — source of truth for Liked Songs page)
 *
 * Auth isolation note:
 *   AppProvider only mounts when the user is authenticated (see App.jsx).
 *   On logout it unmounts entirely, wiping all state automatically.
 *   On login it remounts fresh, re-running bootstrap for the new user.
 */
import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { trackHasAudio } from '../utils/audioHelpers';
import { DEFAULT_PREFS } from '../utils/constants';

export const AppContext = createContext(null);

// ── Retry a promise-returning fn up to `maxRetries` times with exponential back-off ─
// Auth errors (session expired) are NOT retried — they surface immediately.
function withRetry(fn, maxRetries = 4, baseDelayMs = 1500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fn().then(resolve).catch(err => {
        // Don't retry auth errors — retrying won't help and delays UX
        const isAuthError = err.message?.includes('Session expired') ||
                            err.message?.includes('Authentication required') ||
                            err.message?.includes('401');
        if (n >= maxRetries || isAuthError) { reject(err); return; }
        const delay = baseDelayMs * Math.pow(2, n); // 1.5s, 3s, 6s, 12s
        console.warn(`[AppContext] retry ${n + 1}/${maxRetries} in ${delay}ms — ${err.message}`);
        setTimeout(() => attempt(n + 1), delay);
      });
    };
    attempt(0);
  });
}

export function AppProvider({ children }) {
  // ── Auth — for logout access and user identity ───────────────────────────
  const { currentUser, logout: authLogout } = useAuth();

  // ── Navigation ───────────────────────────────────────────────
  const [view,          setView]          = useState('home');
  // Stack of views visited so we can go back (newest at end)
  const navHistoryRef = useRef(['home']);

  /** Navigate to a new view, pushing a browser history entry */
  const navigateTo = useCallback((newView) => {
    if (newView === navHistoryRef.current[navHistoryRef.current.length - 1]) return;
    navHistoryRef.current = [...navHistoryRef.current, newView];
    window.history.pushState({ view: newView }, '', `#${newView}`);
    setView(newView);
  }, []);

  /** Go back one step in the in-app history stack */
  const navigateBack = useCallback(() => {
    const stack = navHistoryRef.current;
    if (stack.length <= 1) return false; // nothing to go back to
    const prev = stack[stack.length - 2];
    navHistoryRef.current = stack.slice(0, -1);
    setView(prev);
    return true;
  }, []);

  // ── Mobile panel states ──────────────────────────────────────
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNowOpen, setMobileNowOpen] = useState(false);

  // ── Preferences dialog ───────────────────────────────────────
  const [showPrefs,     setShowPrefs]     = useState(false);

  // ── Music data ───────────────────────────────────────────────
  const [prefs,          setPrefsRaw]      = useState(DEFAULT_PREFS);
  const [playlists,      setPlaylists]     = useState([]);

  // ── History (full track snapshots, newest first) ─────────────
  const [playHistory,    setPlayHistory]   = useState([]);

  // ── Playlist modal state ─────────────────────────────────────
  const [playlistModal,  setPlaylistModal] = useState({ open: false, track: null });
  const [localTracks,    setLocalTracks]   = useState([]);
  const [externalTracks, setExternalTracks] = useState([]);
  const [favorites,      setFavorites]     = useState([]);
  // Full track snapshots for Liked Songs page — the single source of truth.
  // Stored at like-time so it never depends on externalTracks being loaded.
  const [likedSongs,     setLikedSongs]    = useState([]);

  // ── Language / mood filter ───────────────────────────────────
  const [language, setLanguage] = useState('malayalam');
  const [mood,     setMood]     = useState('');

  // ── Search ───────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = useState('');
  const [suggestions,     setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── External loading state ───────────────────────────────────
  const [isLoadingExt, setIsLoadingExt] = useState(false);
  const [extPage,      setExtPage]      = useState(0);

  // ── Preferences debounce ref (avoids hammering DB on slider) ─
  const prefsSaveTimer = useRef(null);

  // ── setPrefs: update local state + debounced DB persist ──────
  const setPrefs = useCallback((updater) => {
    setPrefsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      // Debounce DB write by 800ms — no lag for sliders/toggles
      clearTimeout(prefsSaveTimer.current);
      prefsSaveTimer.current = setTimeout(() => {
        api.updatePreferences(next).catch(() => {});
      }, 800);
      return next;
    });
  }, []);

  // ── Bootstrap: load initial data from MongoDB ────────────────────────
  useEffect(() => {
    withRetry(() => api.fetchBootstrap(), 5, 2000)
      .then(data => {
        setLocalTracks(data.tracks    || []);
        setFavorites(  data.favorites || []);
        // Full track snapshots for Liked Songs page
        setLikedSongs( data.likedSongs || []);
        // Restore history snapshots (full track objects)
        setPlayHistory(data.history   || []);
        // Merge saved preferences (language, volume, theme, etc.)
        if (data.preferences) {
          setPrefsRaw(p => ({ ...p, ...data.preferences }));
          // Always default to Malayalam — only restore if user explicitly set it
          // (non-english, non-empty). This ensures Malayalam is the landing language.
          const savedLang = data.preferences.language;
          if (savedLang && savedLang !== 'english') {
            setLanguage(savedLang);
          }
          // If no saved language or it was English, stays as 'malayalam' (initial state)
        }
      })
      .catch(err => console.error('[Bootstrap] failed after retries:', err.message));
    // Load playlists separately
    withRetry(() => api.getPlaylists(), 5, 2000)
      .then(data => setPlaylists(data.playlists || []))
      .catch(() => {});
  }, []);

  // ── Apply theme + accent CSS vars ───────────────────────────
  useEffect(() => {
    document.body.setAttribute('data-theme', prefs.theme || 'dark');
    document.body.style.setProperty('--accent', prefs.accent || '#1db954');
  }, [prefs.theme, prefs.accent]);

  // ── Persist language to preferences when user changes it ─────
  const changeLanguage = useCallback((lang) => {
    setLanguage(lang);
    setMood('');
    setView('home');
    setMobileNavOpen(false);
    // Save to DB (debounced via setPrefs)
    setPrefs(p => ({ ...p, language: lang }));
  }, [setPrefs]);

  // ── Dedup helpers (mirrors server logic) ────────────────────
  const canonicalTitle = (t) =>
    String(t || '').replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').toLowerCase().trim();
  const firstArtist = (a) =>
    String(a || '').split(/[,&]/)[0].toLowerCase().trim();
  const dedupKey = (t) => `${canonicalTitle(t.title)}|${firstArtist(t.artist)}`;

  // ── Load external tracks ─────────────────────────────────
  const doLoadExternal = useCallback(async (lang, moodVal, page, term) => {
    setIsLoadingExt(true);
    try {
      // Retry once after a short delay on transient 502/503
      const data = await withRetry(
        () => api.searchExternal(term, lang, page, moodVal),
        2, 2000
      );
      const incoming = (data.tracks || []).filter(trackHasAudio);
      if (page === 0) {
        // Fresh load — dedup within the new batch
        const seenId  = new Set();
        const seenKey = new Set();
        const fresh = incoming.filter(t => {
          const k = dedupKey(t);
          if (seenId.has(t.id) || seenKey.has(k)) return false;
          seenId.add(t.id); seenKey.add(k);
          return true;
        });
        setExternalTracks(fresh);
      } else {
        // Append — dedup against existing + within incoming
        setExternalTracks(prev => {
          const seenId  = new Set(prev.map(t => t.id));
          const seenKey = new Set(prev.map(dedupKey));
          const unique = incoming.filter(t => {
            const k = dedupKey(t);
            if (seenId.has(t.id) || seenKey.has(k)) return false;
            seenId.add(t.id); seenKey.add(k);
            return true;
          });
          return [...prev, ...unique];
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

  // ── Playlist CRUD actions ────────────────────────────────────
  const createPlaylist = useCallback(async ({ name, description, color }) => {
    const data = await api.createPlaylist({ name, description, color });
    setPlaylists(prev => [data.playlist, ...prev]);
    return data.playlist;
  }, []);

  const addToPlaylist = useCallback(async (playlistId, track) => {
    const data = await api.addToPlaylist(playlistId, track);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? data.playlist : p));
    return data;
  }, []);

  const removeFromPlaylist = useCallback(async (playlistId, trackId) => {
    const data = await api.removeFromPlaylist(playlistId, trackId);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? data.playlist : p));
  }, []);

  const deletePlaylist = useCallback(async (id) => {
    await api.deletePlaylist(id);
    setPlaylists(prev => prev.filter(p => p.id !== id));
  }, []);

  /** Open the playlist-picker modal for a specific track */
  const openPlaylistModal = useCallback((track) => {
    setPlaylistModal({ open: true, track });
  }, []);

  const closePlaylistModal = useCallback(() => {
    setPlaylistModal({ open: false, track: null });
  }, []);

  const value = {
    // Navigation
    view, setView, navigateTo, navigateBack,
    // Mobile overlays
    mobileNavOpen, setMobileNavOpen,
    mobileNowOpen, setMobileNowOpen,
    // Preferences dialog
    showPrefs, setShowPrefs,
    // Preferences data
    prefs, setPrefs,
    // Playlists
    playlists,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    playlistModal,
    openPlaylistModal,
    closePlaylistModal,
    // Track data
    localTracks,
    externalTracks,
    // History
    playHistory, setPlayHistory,
    // Favorites (ID array)
    favorites, setFavorites,
    // Liked Songs (full snapshots — use this for Liked Songs page display)
    likedSongs, setLikedSongs,
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
    // Auth
    currentUser,
    logout: authLogout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Hook for consuming AppContext — throws if used outside AppProvider */
export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
};
