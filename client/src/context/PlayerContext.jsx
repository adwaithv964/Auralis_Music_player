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

export function PlayerProvider({ children }) {
  const {
    localTracks,
    externalTracks,
    prefs,
    favorites,
    setFavorites,
  } = useApp();

  // ── Playback state ───────────────────────────────────────────
  const [currentTrack, setCurrentTrack] = useState(null);
  const [shuffle,      setShuffle]      = useState(false);
  const [repeat,       setRepeat]       = useState(false);
  const [resolvingId,  setResolvingId]  = useState(null);

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

    // Already resolved → instant play from cache
    if (resolvedCache.current.has(track.id)) {
      const resolved = resolvedCache.current.get(track.id);
      setCurrentTrack(resolved);
      setTimeout(() => play(), 30);
      api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
      return;
    }

    // Non-iTunes (Audius / already full) → direct play
    if (track.sourceType !== 'itunes') {
      setCurrentTrack(track);
      setTimeout(() => play(), 30);
      api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
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
      }
    } catch (e) {
      console.warn('[YouTube resolve failed]', e.message);
      setCurrentTrack(null);
    } finally {
      setResolvingId(null);
    }

    api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
  }, [play, pause]);

  // ── Previous track ───────────────────────────────────────────
  const handlePrev = useCallback(() => {
    if (!playableTracks.length) return;
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[(idx - 1 + playableTracks.length) % playableTracks.length]);
  }, [playableTracks, currentTrack, handlePlay]);

  // ── Next track (respects shuffle + repeat) ───────────────────
  const handleNext = useCallback(() => {
    if (!playableTracks.length) return;
    if (shuffle) {
      handlePlay(playableTracks[Math.floor(Math.random() * playableTracks.length)]);
      return;
    }
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[repeat ? idx : (idx + 1) % playableTracks.length]);
  }, [playableTracks, currentTrack, shuffle, repeat, handlePlay]);

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
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** Hook for consuming PlayerContext — throws if used outside PlayerProvider */
export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within <PlayerProvider>');
  return ctx;
};
