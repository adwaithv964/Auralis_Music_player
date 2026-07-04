/**
 * hooks/useAudioEngine.js
 *
 * React hook that bridges the AudioEngine singleton and Zustand playerStore
 * with the existing PlayerContext API.
 *
 * Public API is intentionally identical to the previous implementation so
 * that PlayerContext.jsx and any other consumers require zero changes:
 *
 *   const { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef }
 *         = useAudioEngine(currentTrack, preferences);
 *
 * Internal architecture:
 *   - Playback state (isPlaying, progress, elapsed, duration) is read from the
 *     Zustand playerStore — the AudioEngine writes to it after every audio event.
 *   - The audio element (audioRef) points to audioEngine.primaryAudio — the same
 *     singleton HTMLAudioElement that lives for the entire application lifetime.
 *   - Transport calls (play, pause, seek) are forwarded to audioEngine methods.
 *   - Track loading and volume syncing are handled here via effects, mirroring
 *     the previous implementation.
 *   - The hook never creates its own Audio element or event listeners.
 *
 * Phase 2 addition:
 *   usePlaybackEngine() — returns the PlaybackEngine singleton for components
 *   that need direct access to the Phase 2 orchestration layer.
 */

import { useRef, useEffect, useCallback } from 'react';
import { audioEngine }                    from '../audio/AudioEngine';
import { playbackEngine }                 from '../audio/PlaybackEngine';
import { usePlayerStore }                 from '../store/playerStore';

/**
 * @param {Object|null} currentTrack - The track object currently selected
 * @param {Object}      preferences  - App preferences object (prefs.volume etc.)
 *
 * @returns {{
 *   isPlaying: boolean,
 *   play:      () => void,
 *   pause:     () => void,
 *   seek:      (percentage: number) => void,
 *   progress:  number,
 *   elapsed:   number,
 *   duration:  number,
 *   audioRef:  React.RefObject<HTMLAudioElement>,
 * }}
 */
export function useAudioEngine(currentTrack, preferences) {
  // ── Zustand store subscriptions ─────────────────────────────────────────────
  // Each selector is fine-grained so this hook only re-renders when the
  // individual value it cares about changes.
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const progress  = usePlayerStore(s => s.progress);
  const elapsed   = usePlayerStore(s => s.elapsed);
  const duration  = usePlayerStore(s => s.duration);

  // ── audioRef — points to the singleton primary element ──────────────────────
  // Wrapped in a ref for backward compatibility with all code that calls
  // audioRef.current.currentTime, audioRef.current.src, etc.
  const audioRef = useRef(audioEngine.primaryAudio);

  // ── Track loading ────────────────────────────────────────────────────────────
  /**
   * When the track's previewUrl changes, load it into the engine.
   * Only re-runs when the URL changes — not on metadata-only updates.
   */
  useEffect(() => {
    const src = currentTrack?.previewUrl;

    if (!src) {
      // No URL — clear progress state only (don't unload audio mid-session)
      usePlayerStore.getState().resetPlaybackState();
      return;
    }

    // Delegate to the engine (which handles deduplication internally)
    audioEngine.loadTrack(src);
  }, [currentTrack?.previewUrl]); // Only re-run when the URL changes

  // ── Volume sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const rawVolume = preferences?.volume ?? 62;
    const normalised = Math.min(1, Math.max(0, rawVolume / 100));
    audioEngine.setVolume(normalised);
  }, [preferences?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transport actions ────────────────────────────────────────────────────────

  /**
   * Start or resume playback. Initialises the Web Audio pipeline on first call
   * (satisfies the user-gesture requirement for AudioContext).
   */
  const play = useCallback(() => {
    audioEngine.play();
  }, []);

  /**
   * Pause playback.
   */
  const pause = useCallback(() => {
    audioEngine.pause();
  }, []);

  /**
   * Seek to a position expressed as 0–100 (percentage of duration).
   * @param {number} percentage
   */
  const seek = useCallback((percentage) => {
    audioEngine.seek(percentage);
  }, []);

  // ── Return shape matches the legacy useAudioEngine API exactly ───────────────
  return {
    isPlaying,
    play,
    pause,
    seek,
    progress,
    elapsed,
    duration,
    audioRef,
  };
}

/**
 * usePlaybackEngine — Phase 2 hook.
 *
 * Returns the PlaybackEngine singleton for components that need direct access
 * to the Phase 2 orchestration layer (e.g. to call playSong, next, previous,
 * setRepeatMode, addToQueue, etc.).
 *
 * The reference is stable — no re-renders are triggered.
 *
 * Usage:
 *   const engine = usePlaybackEngine();
 *   engine.playSong(track);
 *   engine.next();
 *
 * @returns {import('../audio/PlaybackEngine').PlaybackEngine}
 */
export function usePlaybackEngine() {
  return playbackEngine;
}
