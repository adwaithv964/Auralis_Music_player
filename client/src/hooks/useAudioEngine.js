import { useRef, useEffect, useState, useCallback } from 'react';

// Single audio element at module scope — never recreated
const audioEl = new Audio();
audioEl.preload = 'auto';

export function useAudioEngine(currentTrack, preferences) {
  const audioRef  = useRef(audioEl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [elapsed,   setElapsed]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const pendingSrc = useRef(null); // track which src we're loading

  // Wire all audio events exactly once
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      const dur = audio.duration || 0;
      const cur = audio.currentTime || 0;
      setElapsed(Math.floor(cur));
      setDuration(isNaN(dur) || !isFinite(dur) ? 0 : Math.floor(dur));
      setProgress(dur > 0 ? (cur / dur) * 100 : 0);
    };
    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onEnded   = () => { setIsPlaying(false); setProgress(100); };
    const onError   = (e) => {
      console.warn('[Audio error]', e.target?.error?.code, e.target?.error?.message);
      setIsPlaying(false);
    };
    const onWaiting = () => console.info('[Audio waiting] buffering…');

    // ── Stall recovery: reload the src (triggers a fresh /api/youtube/stream redirect) ──
    let stallTimer = null;
    const onStall = () => {
      console.warn('[Audio stall] network stall on', audio.src?.slice(-60));
      clearTimeout(stallTimer);
      // Give it 4 seconds before forcing a reload
      stallTimer = setTimeout(() => {
        if (audio.paused) return; // user paused — don't reload
        const currentSrc  = audio.src;
        const currentTime = audio.currentTime || 0;
        console.warn('[Audio stall] forcing reload of', currentSrc?.slice(-60));
        const onCanPlayAfterStall = () => {
          audio.removeEventListener('canplay', onCanPlayAfterStall);
          // Seek back to where we were (best-effort; CDN URLs reset to 0)
          try { if (currentTime > 2) audio.currentTime = currentTime; } catch (_) {}
          audio.play().catch(e => console.warn('[stall-recovery play]', e.message));
        };
        audio.addEventListener('canplay', onCanPlayAfterStall);
        audio.load();
      }, 4000);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play',       onPlay);
    audio.addEventListener('pause',      onPause);
    audio.addEventListener('ended',      onEnded);
    audio.addEventListener('error',      onError);
    audio.addEventListener('stalled',    onStall);
    audio.addEventListener('waiting',    onWaiting);

    return () => {
      clearTimeout(stallTimer);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play',       onPlay);
      audio.removeEventListener('pause',      onPause);
      audio.removeEventListener('ended',      onEnded);
      audio.removeEventListener('error',      onError);
      audio.removeEventListener('stalled',    onStall);
      audio.removeEventListener('waiting',    onWaiting);
    };
  }, []);

  // Change src when track (or its previewUrl) changes
  useEffect(() => {
    if (!currentTrack?.previewUrl) {
      setProgress(0); setElapsed(0); setDuration(0);
      return;
    }

    const audio = audioRef.current;
    const src   = currentTrack.previewUrl;

    // Skip if the src hasn't actually changed (e.g. metadata-only update)
    if (audio.src && (audio.src === src || audio.src.endsWith(src))) return;

    pendingSrc.current = src;

    const wasPlaying = !audio.paused;
    audio.pause();

    // Clear old state
    setProgress(0);
    setElapsed(0);
    setDuration(0);
    setIsPlaying(false);

    // Use canplay event to start once the new src is buffered enough
    const onCanPlay = () => {
      if (pendingSrc.current !== src) return; // stale
      audio.removeEventListener('canplay', onCanPlay);
      if (wasPlaying) {
        audio.play().catch(err => console.warn('[Autoplay blocked]', err.message));
      }
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.src  = src;
    audio.load();

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [currentTrack?.previewUrl]); // ONLY re-run when the URL changes, not the whole track object

  // Volume sync
  useEffect(() => {
    audioRef.current.volume = Math.min(1, Math.max(0, (preferences?.volume ?? 62) / 100));
  }, [preferences?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.src) return;
    // If still loading, wait for canplay then trigger
    if (audio.readyState < 2) {
      const onReady = () => {
        audio.removeEventListener('canplay', onReady);
        audio.play().catch(e => console.warn('[play after load]', e.message));
      };
      audio.addEventListener('canplay', onReady);
      return;
    }
    audio.play().catch(e => console.warn('[play]', e.message));
  }, []);

  const pause = useCallback(() => {
    audioRef.current.pause();
  }, []);

  const seek = useCallback((percentage) => {
    const audio = audioRef.current;
    const dur   = audio.duration;
    if (dur && !isNaN(dur) && isFinite(dur)) {
      audio.currentTime = Math.max(0, Math.min(dur, (percentage / 100) * dur));
    }
  }, []);

  return { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef };
}
