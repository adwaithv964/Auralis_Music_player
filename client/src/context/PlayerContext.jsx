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
import { trackHasAudio } from '../utils/audioHelpers';

export const PlayerContext = createContext(null);

const LS_KEY        = 'auralis:lastTrack';
const LS_POS_KEY    = 'auralis:lastPosition';
const LS_STREAM_KEY = 'auralis:streamCache'; // short-lived: cleared after use

/** Save a lightweight snapshot.
 *  - Audius / local tracks: keep previewUrl (stable URLs)
 *  - YouTube CDN URLs: omit (they expire in ~6 hours)
 */
function saveLastTrack(track, positionSec = 0) {
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
    localStorage.setItem(LS_KEY,     JSON.stringify(snap));
    localStorage.setItem(LS_POS_KEY, String(Math.floor(positionSec || 0)));
  } catch {}
}

/** Cache the live YouTube stream URL right before unload so we can restore instantly */
function saveStreamCache(streamUrl, positionSec) {
  try {
    localStorage.setItem(LS_STREAM_KEY, JSON.stringify({
      url:       streamUrl,
      position:  Math.floor(positionSec || 0),
      savedAt:   Date.now(),
    }));
  } catch {}
}

/** Load the cached stream — only valid if saved less than 90 seconds ago */
function loadStreamCache() {
  try {
    const raw = localStorage.getItem(LS_STREAM_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // YouTube stream URLs are valid for ~6 hours, but to be safe use within 90s
    if (Date.now() - obj.savedAt > 90_000) {
      localStorage.removeItem(LS_STREAM_KEY);
      return null;
    }
    return obj; // { url, position }
  } catch {
    return null;
  }
}

function loadLastTrack() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadLastPosition() {
  try {
    const raw = localStorage.getItem(LS_POS_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function PlayerProvider({ children }) {
  const {
    localTracks,
    externalTracks,
    prefs,
    favorites,
    setFavorites,
    setLikedSongs,
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
  const [activeQueue,  setActiveQueue]     = useState([]);   // base list for playback

  /** Memoize resolved YouTube stream URLs to avoid re-resolving */
  const resolvedCache = useRef(new Map());

  // ── Audio engine — must be declared BEFORE setCurrentTrack ───
  const { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef } =
    useAudioEngine(currentTrack, prefs);

  /** Wrap setCurrentTrack so every change is persisted */
  const setCurrentTrack = useCallback((track) => {
    setCurrentTrackRaw(track);
    if (track) saveLastTrack(track, audioRef.current?.currentTime);
  }, [audioRef]);


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

    // Has a working previewUrl AND it's not an expired iTunes URL →  direct play
    const hasWorkingUrl = !!(track.previewUrl) && track.sourceType !== 'itunes';
    if (hasWorkingUrl) {
      setCurrentTrack(track);
      setTimeout(() => play(), 30);
      pushHistory(track);
      return;
    }

    // Audius / local with stable URL → direct play
    if ((track.sourceType === 'audius' || track.sourceType === 'local') && track.previewUrl) {
      setCurrentTrack(track);
      setTimeout(() => play(), 30);
      pushHistory(track);
      return;
    }

    // iTunes track OR history snapshot (no previewUrl) → resolve via JioSaavn
    pause();
    setCurrentTrack({ ...track, previewUrl: '', ytLoading: true });
    setResolvingId(track.id);

    try {
      const res = await fetch(
        `/api/saavn/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}`
      );

      if (res.status === 404) {
        // Track not on JioSaavn — show it as unavailable instead of silent failure
        console.warn('[JioSaavn] Track not found:', track.title);
        setCurrentTrack({ ...track, previewUrl: '', unavailable: true, ytLoading: false });
        setResolvingId(null);
        return;
      }

      if (!res.ok) throw new Error(`Saavn resolve failed: ${res.status}`);

      const saavn = await res.json();
      if (saavn?.streamUrl) {
        const fullTrack = {
          ...track,
          previewUrl:  saavn.streamUrl,
          isFull:      true,
          ytResolved:  true,
          sourceType:  'itunes',
          contentType: saavn.contentType || 'audio/mp4',
          lyrics:      ['Full track via JioSaavn', track.artist, track.album],
        };
        resolvedCache.current.set(track.id, fullTrack);
        setCurrentTrack(fullTrack);
        setTimeout(() => play(), 80);
        pushHistory(fullTrack);
      }
    } catch (e) {
      console.warn('[JioSaavn resolve failed]', e.message);
      setCurrentTrack({ ...track, previewUrl: '', unavailable: true, ytLoading: false });
    } finally {
      setResolvingId(null);
    }
  }, [play, pause, setPlayHistory]);

  // ── Set active queue and start playback ──────────────────────
  /**
   * Primary entry point for starting playback from any source.
   * Replaces the active queue with the given list and starts playing startTrack.
   * All Next/Prev/auto-advance operations will then navigate within tracks[].
   */
  const setActiveQueueAndPlay = useCallback((tracks, startTrack) => {
    if (!tracks || tracks.length === 0) return;
    setActiveQueue(tracks);
    handlePlay(startTrack || tracks[0]);
  }, [handlePlay]);

  // ── Previous track ───────────────────────────────────────────
  const handlePrev = useCallback(() => {
    // Use activeQueue when available, fall back to global playableTracks
    const source = activeQueue.length > 0 ? activeQueue : playableTracks;
    if (!source.length) return;
    const idx = source.findIndex(t => t.id === currentTrack?.id);
    handlePlay(source[(idx - 1 + source.length) % source.length]);
  }, [activeQueue, playableTracks, currentTrack, handlePlay]);

  // ── Next track (drains manual queue first, then respects shuffle + repeat) ─
  const handleNext = useCallback(() => {
    // Drain the manual up-next queue first
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      handlePlay(next);
      return;
    }

    // Use activeQueue when available, fall back to global playableTracks
    const source = activeQueue.length > 0 ? activeQueue : playableTracks;
    if (!source.length) return;

    // Repeat One — stay on same track
    if (repeat) {
      const idx = source.findIndex(t => t.id === currentTrack?.id);
      if (idx !== -1) handlePlay(source[idx]);
      return;
    }

    // Shuffle — random within active source
    if (shuffle) {
      handlePlay(source[Math.floor(Math.random() * source.length)]);
      return;
    }

    // Normal advance
    const idx = source.findIndex(t => t.id === currentTrack?.id);
    const nextIdx = idx + 1;

    if (nextIdx >= source.length) {
      // End of queue — stop gracefully (no wrap without repeat)
      pause();
      return;
    }

    handlePlay(source[nextIdx]);
  }, [activeQueue, playableTracks, currentTrack, shuffle, repeat, handlePlay, queue, pause]);

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

  // ── Save playback position periodically (every 5s) ───────────
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused && currentTrack) {
        localStorage.setItem(LS_POS_KEY, String(Math.floor(audio.currentTime || 0)));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [audioRef, currentTrack]);

  // ── Save stream URL on page unload (for instant restore after refresh) ─
  useEffect(() => {
    const onUnload = () => {
      const audio = audioRef.current;
      if (!audio || !currentTrack) return;
      const src = audio.src;
      const pos = audio.currentTime || 0;
      // Save exact position
      localStorage.setItem(LS_POS_KEY, String(Math.floor(pos)));
      // Cache the live stream URL for quick restore (YouTube URLs are valid for hours)
      if (src && !audio.paused && (src.includes('youtube') || src.includes('googlevideo') || src.includes('localhost'))) {
        saveStreamCache(src, pos);
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [audioRef, currentTrack]);

  // ── Auto-resume on mount: use cached stream or re-resolve ────
  const didAutoResume = useRef(false);
  useEffect(() => {
    if (didAutoResume.current) return;
    const saved = loadLastTrack();
    if (!saved) return;
    didAutoResume.current = true;

    const streamCache = loadStreamCache();

    // ★ FAST PATH: we have a fresh cached stream URL — skip re-resolution entirely
    if (streamCache?.url) {
      localStorage.removeItem(LS_STREAM_KEY); // consume it
      const cachedPos = streamCache.position || 0;
      const fullTrack = {
        ...saved,
        previewUrl:  streamCache.url,
        isFull:      true,
        ytResolved:  true,
        sourceType:  saved.sourceType || 'itunes',
      };
      setCurrentTrackRaw(fullTrack);
      // Wait for audio to be ready, then seek + play
      const audio = audioRef.current;
      const onCanPlay = () => {
        audio.removeEventListener('canplay', onCanPlay);
        if (cachedPos > 4) {
          try { audio.currentTime = cachedPos; } catch (_) {}
        }
        audio.play().catch(e => console.warn('[auto-resume]', e.message));
      };
      audio.addEventListener('canplay', onCanPlay);
      return;
    }

    // Stable URL tracks (Audius / local): restore + seek
    if (saved.previewUrl && (saved.sourceType === 'audius' || saved.sourceType === 'local')) {
      const savedPos = loadLastPosition();
      if (savedPos > 4) {
        const onCanPlay = () => {
          audioRef.current?.removeEventListener('canplay', onCanPlay);
          try { audioRef.current.currentTime = savedPos; } catch (_) {}
        };
        audioRef.current?.addEventListener('canplay', onCanPlay);
      }
      handlePlay(saved);
      return;
    }

    // iTunes / YouTube: resolve fresh stream then play
    handlePlay(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Intentionally run once on mount only

  // ── Toggle favorite (API + local state sync) ─────────────────
  /**
   * Toggles the liked state for a track.
   * On like (PUT): resolves the full track object and sends it to the server
   *   so a snapshot is stored in likedSongs[] for display.
   * On unlike (DELETE): removes from both favorites[] and likedSongs[].
   * Both favorites (ID array) and likedSongs (snapshots) are synced from
   * the server response — single source of truth, no stale state.
   */
  const toggleFavorite = useCallback(async (id) => {
    const isFav = favorites.includes(id);
    // Resolve the full track object to send as snapshot on like
    const track = playableTracks.find(t => t.id === id) ||
                  (currentTrack?.id === id ? currentTrack : null);
    try {
      const data = await api.toggleFavorite(id, isFav, track);
      setFavorites(data.favorites || []);
      // Sync likedSongs snapshots from server response
      if (data.likedSongs !== undefined) {
        setLikedSongs(data.likedSongs);
      }
    } catch (e) {
      console.error('[toggleFavorite]', e);
    }
  }, [favorites, setFavorites, setLikedSongs, playableTracks, currentTrack]);

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
    activeQueue,
    setActiveQueueAndPlay,
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
