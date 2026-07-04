/**
 * context/PlayerContext.jsx
 *
 * Owns all audio-playback state surfaced to React components.
 *
 * Phase 2 migration:
 *   - All stream resolution now delegates to PlaybackEngine / StreamResolver.
 *   - All session persistence now delegates to SessionPersistence.
 *   - All queue operations now delegate to PlaybackEngine / QueueEngine.
 *   - Auto-advance on 'ended' is handled by PlaybackEngine internally.
 *   - Media Session is managed by PlaybackEngine internally.
 *
 * The public context API remains 100% identical to the Phase 1 version.
 * All component consumers (NowPlaying, PlayerBar, BottomNav, Home, etc.)
 * require zero changes.
 *
 * Consumes AppContext for localTracks, externalTracks, prefs, setFavorites.
 */
import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from 'react';
import { useAudioEngine }    from '../hooks/useAudioEngine';
import { audioEngine }       from '../audio/AudioEngine';
import { playbackEngine }    from '../audio/PlaybackEngine';
import { queueEngine }       from '../audio/QueueEngine';
import { sessionPersistence } from '../audio/SessionPersistence';
import { usePlayerStore }    from '../store/playerStore';
import { useApp }            from './AppContext';
import { api }               from '../services/api';
import { trackHasAudio }     from '../utils/audioHelpers';

export const PlayerContext = createContext(null);

// ─── Legacy localStorage key (write-compat only — reads migrated by SessionPersistence) ──
const LS_POS_KEY = 'auralis:lastPosition'; // kept for backward compat writes

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return true if a track object has the minimum fields to attempt playback. */
function isPlayableSong(track) {
  return track != null && track.id != null && typeof track.title === 'string';
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

  // ── Zustand store subscriptions ─────────────────────────────────────────────
  // Read currentSong from the store (PlaybackEngine writes it on each song start)
  const storeSong = usePlayerStore(s => s.currentSong);

  // ── Local UI state ──────────────────────────────────────────────────────────
  /**
   * currentTrack mirrors the store's currentSong but also carries transient
   * loading/resolution flags (ytLoading, unavailable) that aren't in the store.
   * On initial mount we populate from session restore (done below).
   */
  const [currentTrack, setCurrentTrackRaw] = useState(() => {
    // Session restore is deferred to useEffect — start null or with store value
    return null;
  });

  const [shuffle,      setShuffle]     = useState(false);
  const [repeat,       setRepeat]      = useState(false);
  const [resolvingId,  setResolvingId] = useState(null);
  const [queue,        setQueueState]  = useState([]);   // mirrors store.queue for context consumers
  const [activeQueue,  setActiveQueueState] = useState([]); // mirrors store.activeQueue

  // ── Audio engine hook (Phase 1 compat) ───────────────────────────────────────
  const { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef } =
    useAudioEngine(currentTrack, prefs);

  // ── Keep local currentTrack in sync with the store ────────────────────────
  // When PlaybackEngine updates the store (after stream resolves + play starts),
  // mirror it to local state so all context consumers see the update.
  useEffect(() => {
    if (storeSong && storeSong.id !== currentTrack?.id) {
      setCurrentTrackRaw(storeSong);
    }
  }, [storeSong]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep local queue state in sync with the store ─────────────────────────
  const storeQueue       = usePlayerStore(s => s.queue);
  const storeActiveQueue = usePlayerStore(s => s.activeQueue);

  useEffect(() => {
    setQueueState(storeQueue);
  }, [storeQueue]);

  useEffect(() => {
    setActiveQueueState(storeActiveQueue);
  }, [storeActiveQueue]);

  // ── Wrap setCurrentTrack so every change is surfaced locally ────────────────
  const setCurrentTrack = useCallback((track) => {
    setCurrentTrackRaw(track);
    if (track) {
      usePlayerStore.getState().setCurrentSong(track);
    }
  }, []);

  // ── Derived: all tracks the player can navigate ──────────────────────────────
  const playableTracks = useMemo(() => [
    ...localTracks.filter(trackHasAudio),
    ...externalTracks.filter(trackHasAudio),
  ], [localTracks, externalTracks]);

  // ── Toggle play/pause ────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    isPlaying ? playbackEngine.pause() : playbackEngine.resume();
  }, [isPlaying]);

  // ── Core play handler ────────────────────────────────────────────────────────
  /**
   * handlePlay — the single entry point for playing a song from the UI.
   *
   * In Phase 2 this delegates to PlaybackEngine.playSong() which handles:
   *   - Stream URL resolution (StreamResolver)
   *   - Audio loading + playback (AudioEngine)
   *   - Store updates + Media Session
   *   - Stall recovery setup
   *   - Prefetch arming
   *   - Session saving
   *
   * We preserve the resolvingId loading indicator and the playHistory side-effect
   * for backward compatibility with NowPlaying / search UI components.
   */
  const handlePlay = useCallback(async (track) => {
    if (!trackHasAudio(track) && !isPlayableSong(track)) return;

    // Optimistically set local state for immediate UI feedback
    setCurrentTrackRaw({ ...track, ytLoading: !track.previewUrl });
    if (!track.previewUrl) setResolvingId(track.id);

    // Push to local play history (optimistic + DB)
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
      api.saveHistory(t); // fire-and-forget
    };

    try {
      // Delegate full resolution + playback pipeline to PlaybackEngine
      await playbackEngine.playSong(track);

      // After PlaybackEngine resolves and starts playback, the store.currentSong
      // will be updated (possibly with a resolved URL). Read the final song from store.
      const resolvedTrack = usePlayerStore.getState().currentSong || track;
      setCurrentTrackRaw(resolvedTrack);

      if (!resolvedTrack.unavailable) {
        pushHistory(resolvedTrack);
      }
    } catch (err) {
      console.warn('[PlayerContext] handlePlay error:', err?.message);
      setCurrentTrackRaw({ ...track, unavailable: true, ytLoading: false });
    } finally {
      setResolvingId(null);
    }
  }, [setPlayHistory]);

  // ── Set active queue and start playback ─────────────────────────────────────
  const setActiveQueueAndPlay = useCallback((tracks, startTrack) => {
    if (!tracks || tracks.length === 0) return;
    playbackEngine.setActiveQueueAndPlay(tracks, startTrack || tracks[0]);
    setCurrentTrackRaw(startTrack || tracks[0]);
  }, []);

  // ── Previous / Next ──────────────────────────────────────────────────────────
  const handlePrev = useCallback(() => {
    playbackEngine.previous();
  }, []);

  const handleNext = useCallback(() => {
    playbackEngine.next();
  }, []);

  // ── Queue actions (delegate to PlaybackEngine) ───────────────────────────────
  const addToQueue = useCallback((track) => {
    playbackEngine.addToQueue(track);
  }, []);

  const clearQueue = useCallback(() => {
    playbackEngine.clearQueue();
  }, []);

  // ── Sync shuffle/repeat to PlaybackEngine ────────────────────────────────────
  useEffect(() => {
    playbackEngine.setShuffleMode(shuffle);
  }, [shuffle]);

  useEffect(() => {
    // Map boolean repeat → repeatMode string ('one' when true for backward compat)
    playbackEngine.setRepeatMode(repeat ? 'one' : 'none');
    usePlayerStore.getState().setRepeatMode(repeat ? 'one' : 'none');
  }, [repeat]);

  // ── Volume sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const rawVolume = prefs?.volume ?? 62;
    const normalised = Math.min(1, Math.max(0, rawVolume / 100));
    playbackEngine.setVolume(normalised);
  }, [prefs?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save playback position periodically (legacy compat key) ─────────────────
  // SessionPersistence handles the primary save; this writes the legacy key
  // so any code still reading auralis:lastPosition continues to work.
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused && currentTrack) {
        try {
          localStorage.setItem(LS_POS_KEY, String(Math.floor(audio.currentTime || 0)));
        } catch { /* ignore */ }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [audioRef, currentTrack]);

  // ── Session restore on mount ─────────────────────────────────────────────────
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;

    // PlaybackEngine.restoreSession() reads from SessionPersistence, populates
    // the Zustand store, and returns the restored song (no autoplay).
    const restoredSong = playbackEngine.restoreSession();

    if (restoredSong) {
      // Set local currentTrack to show the restored song in NowPlaying / PlayerBar
      // without triggering playback.
      setCurrentTrackRaw(restoredSong);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // ── Toggle favorite (API + local state sync) ─────────────────────────────────
  const toggleFavorite = useCallback(async (id) => {
    const isFav = favorites.includes(id);
    const track = playableTracks.find(t => t.id === id) ||
                  (currentTrack?.id === id ? currentTrack : null);
    try {
      const data = await api.toggleFavorite(id, isFav, track);
      setFavorites(data.favorites || []);
      if (data.likedSongs !== undefined) {
        setLikedSongs(data.likedSongs);
      }
    } catch (e) {
      console.error('[toggleFavorite]', e);
    }
  }, [favorites, setFavorites, setLikedSongs, playableTracks, currentTrack]);

  // ── Derived convenience ───────────────────────────────────────────────────────
  const isFav           = favorites.includes(currentTrack?.id);
  const displayElapsed  = elapsed  || 0;
  const displayDuration = duration || currentTrack?.duration || 0;

  // ── Context value — identical shape to Phase 1 ───────────────────────────────
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
