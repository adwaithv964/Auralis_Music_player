/**
 * context/PlayerContext.jsx
 *
 * Owns all audio-playback state:
 *   - currentTrack, shuffle, repeat, resolvingId
 *   - resolvedCache (YouTube resolution memoization)
 *   - Audio engine (isPlaying, play, pause, seek, progress, elapsed, duration)
 *   - Handlers: handlePlay, handlePrev, handleNext, togglePlay, toggleFavorite
 *
 * Consumes AppContext for localTracks, externalTracks, prefs, setFavorites.
 */
import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from 'react';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useApp }         from './AppContext';
import { api }            from '../services/api';
import { trackHasAudio, isFullSong } from '../utils/audioHelpers';

export const PlayerContext = createContext(null);

const LS_KEY = 'auralis:lastTrack';

/** Save a lightweight snapshot.
 *  - Audius / local tracks: keep previewUrl (stable URLs)
 *  - YouTube CDN URLs: omit (they expire in ~6 hours)
 */
function saveLastTrack(track) {
  if (!track) return;
  try {
    const isStableUrl = track.sourceType === 'audius' || track.sourceType === 'local';
    const snap = {
      id:         track.id,
      title:      track.title,
      artist:     track.artist,
      album:      track.album,
      artworkUrl: track.artworkUrl,
      duration:   track.duration,
      genre:      track.genre,
      year:       track.year,
      color:      track.color,
      sourceType: track.sourceType,
      // Keep previewUrl only for non-expiring sources
      ...(isStableUrl && track.previewUrl ? { previewUrl: track.previewUrl } : {}),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch {}
}

function loadLastTrack() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function PlayerProvider({ children }) {
  const {
    localTracks,
    externalTracks,
    prefs,
    favorites,
    setFavorites,
    setPlayHistory,
  } = useApp();

  // ── Playback state — restore last track on mount ─────────────
  const [currentTrack, setCurrentTrackRaw] = useState(() => {
    const saved = loadLastTrack();
    if (!saved) return null;
    if (saved.sourceType === 'itunes' || saved.ytResolved) {
      return { ...saved, previewUrl: '', ytResolved: false };
    }
    return saved;
  });
  const [shuffle,      setShuffle]         = useState(false);
  const [repeat,       setRepeat]          = useState(false);
  const [resolvingId,  setResolvingId]     = useState(null);
  const [queue,        setQueue]           = useState([]);   // up-next queue

  /** Wrap setCurrentTrack so every change is persisted */
  const setCurrentTrack = useCallback((track) => {
    setCurrentTrackRaw(track);
    if (track) saveLastTrack(track);
  }, []);

  /** Memoize resolved YouTube stream URLs to avoid re-resolving */
  const resolvedCache = useRef(new Map());

  // ── Audio engine ─────────────────────────────────────────────
  const { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef } =
    useAudioEngine(currentTrack, prefs);


  // ── Derived: all tracks the player can queue ─────────────────
  const playableTracks = useMemo(() => [
    ...localTracks.filter(trackHasAudio),
    ...externalTracks.filter(trackHasAudio),
  ], [localTracks, externalTracks]);

  // ── Toggle play/pause ────────────────────────────────────────
  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  // ── Core play handler ────────────────────────────────────────
  const handlePlay = useCallback(async (track) => {
    if (!trackHasAudio(track)) return;

    /** Push to in-memory history immediately (optimistic) and save to DB */
    const pushHistory = (t) => {
      const snap = {
        id: t.id, title: t.title, artist: t.artist,
        album: t.album, artworkUrl: t.artworkUrl,
        duration: t.duration, genre: t.genre,
        language: t.language, sourceType: t.sourceType,
        playedAt: new Date().toISOString(),
      };
      setPlayHistory(prev => {
        const filtered = prev.filter(h => h.id !== t.id);
        return [snap, ...filtered].slice(0, 50);
      });
      api.saveHistory(t); // fire-and-forget, never throws
    };

    // Already resolved → instant play from cache
    if (resolvedCache.current.has(track.id)) {
      const resolved = resolvedCache.current.get(track.id);
      setCurrentTrack(resolved);
      setTimeout(() => play(), 30);
      pushHistory(resolved);
      return;
    }

    // Non-iTunes (Audius / already full) → direct play
    if (track.sourceType !== 'itunes') {
      setCurrentTrack(track);
      setTimeout(() => play(), 30);
      pushHistory(track);
      return;
    }

    // iTunes track → show loading, resolve full YouTube URL, then play
    pause();
    setCurrentTrack({ ...track, previewUrl: '', ytLoading: true });
    setResolvingId(track.id);

    try {
      const yt = await api.resolveYouTube(track.title, track.artist);
      if (yt?.streamUrl) {
        const fullTrack = {
          ...track,
          previewUrl: yt.streamUrl,
          isFull:     true,
          ytResolved: true,
          videoId:    yt.videoId,
          lyrics:     ['Full track via YouTube', track.artist, track.album],
        };
        resolvedCache.current.set(track.id, fullTrack);
        setCurrentTrack(fullTrack);
        setTimeout(() => play(), 80);
        pushHistory(fullTrack);
      }
    } catch (e) {
      console.warn('[YouTube resolve failed]', e.message);
      setCurrentTrack(null);
    } finally {
      setResolvingId(null);
    }
  }, [play, pause, setPlayHistory]);

  // ── Previous track ───────────────────────────────────────────
  const handlePrev = useCallback(() => {
    if (!playableTracks.length) return;
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[(idx - 1 + playableTracks.length) % playableTracks.length]);
  }, [playableTracks, currentTrack, handlePlay]);

  // ── Next track (drains queue first, then respects shuffle + repeat) ─
  const handleNext = useCallback(() => {
    if (!playableTracks.length) return;
    // If there's something in the manual queue, play that first
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      handlePlay(next);
      return;
    }
    if (shuffle) {
      handlePlay(playableTracks[Math.floor(Math.random() * playableTracks.length)]);
      return;
    }
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[repeat ? idx : (idx + 1) % playableTracks.length]);
  }, [playableTracks, currentTrack, shuffle, repeat, handlePlay, queue]);

  /** Add a track to the end of the manual queue */
  const addToQueue = useCallback((track) => {
    setQueue(prev => [...prev, track]);
  }, []);

  /** Clear the manual queue */
  const clearQueue = useCallback(() => setQueue([]), []);

  // ── Auto-advance on track end ────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => handleNext();
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [audioRef, handleNext]);

  // ── Toggle favorite (API + local state sync) ─────────────────
  const toggleFavorite = useCallback(async (id) => {
    const isFav = favorites.includes(id);
    try {
      const data = await api.toggleFavorite(id, isFav);
      setFavorites(data.favorites || []);
    } catch (e) {
      console.error('[toggleFavorite]', e);
    }
  }, [favorites, setFavorites]);

  // ── Derived convenience ──────────────────────────────────────
  const isFav          = favorites.includes(currentTrack?.id);
  const displayElapsed  = elapsed  || 0;
  const displayDuration = duration || currentTrack?.duration || 0;

  const value = {
    // Track state
    currentTrack,
    setCurrentTrack,
    shuffle, setShuffle,
    repeat,  setRepeat,
    resolvingId,
    // Audio engine
    isPlaying,
    play, pause, seek,
    progress, elapsed, duration,
    audioRef,
    // Computed
    playableTracks,
    isFav,
    displayElapsed,
    displayDuration,
    // Actions
    togglePlay,
    handlePlay,
    handlePrev,
    handleNext,
    toggleFavorite,
    // Queue
    queue,
    addToQueue,
    clearQueue,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** Hook for consuming PlayerContext — throws if used outside PlayerProvider */
export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within <PlayerProvider>');
  return ctx;
};
