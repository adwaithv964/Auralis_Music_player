import { useRef, useEffect, useState, useCallback } from 'react';
import { audioEngine } from '../audio/AudioEngine';

// Single audio element at module scope — never recreated
const audioEl = new Audio();
audioEl.preload = 'auto';
audioEl.crossOrigin = 'anonymous';

export function useAudioEngine(currentTrack, preferences) {
  const audioRef  = useRef(audioEl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [elapsed,   setElapsed]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const pendingSrc = useRef(null); // track which src we're loading
  const retryAttempts = useRef(0);

  // Wire all audio events and initialize DSP audio graph exactly once
  useEffect(() => {
    const audio = audioRef.current;

    // Initialize Web Audio DSP Engine with the single audio element
    audioEngine.init(audio);

    const onTimeUpdate = () => {
      const dur = audio.duration || 0;
      const cur = audio.currentTime || 0;
      setElapsed(Math.floor(cur));
      setDuration(isNaN(dur) || !isFinite(dur) ? 0 : Math.floor(dur));
      setProgress(dur > 0 ? (cur / dur) * 100 : 0);

      // Buffer recovery: clear buffering state when time advances
      audioEngine.store.updateRuntimeState({
        isBuffering: false,
        mediaElementState: audio.paused ? 'paused' : 'playing',
      });
    };

    const onPlay = () => {
      setIsPlaying(true);
      audioEngine.resume();
      audioEngine.store.updateRuntimeState({
        mediaElementState: 'playing',
        isBuffering: false,
      });
    };

    const onPause = () => {
      setIsPlaying(false);
      audioEngine.store.updateRuntimeState({
        mediaElementState: 'paused',
      });
    };

    const onEnded = () => {
      setIsPlaying(false);
      setProgress(100);
      audioEngine.store.updateRuntimeState({
        mediaElementState: 'ended',
        isBuffering: false,
      });
    };

    const onError = (e) => {
      const errCode = e.target?.error?.code;
      const errMsg = e.target?.error?.message || 'Media decode or stream error';
      console.warn('[Audio error]', errCode, errMsg);

      audioEngine.store.recordInterruption(errMsg, 'stream_error');
      setIsPlaying(false);

      // Safe bounded retry for transient network dropouts without destroying CORS
      if (retryAttempts.current < 2 && pendingSrc.current && !audio.paused) {
        retryAttempts.current += 1;
        const curTime = audio.currentTime || 0;
        console.warn(`[AudioEngine] Attempting safe stream retry (${retryAttempts.current}/2)...`);
        setTimeout(() => {
          if (pendingSrc.current) {
            audio.src = pendingSrc.current;
            audio.load();
            audio.currentTime = curTime;
            audio.play().then(() => {
              audioEngine.store.markInterruptionRecovered();
            }).catch(() => {});
          }
        }, 1200);
      }
    };

    const onWaiting = () => {
      audioEngine.store.updateRuntimeState({
        isBuffering: true,
        mediaElementState: 'buffering',
      });
    };

    const onPlaying = () => {
      audioEngine.store.updateRuntimeState({
        isBuffering: false,
        mediaElementState: 'playing',
      });
      audioEngine.store.markInterruptionRecovered();
    };

    // Non-destructive stall handler: tracks network buffering without flushing cache
    const onStall = () => {
      audioEngine.store.updateRuntimeState({
        isBuffering: true,
        mediaElementState: 'buffering',
      });
    };

    // Auto-resume AudioContext on browser tab visibility / focus
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !audio.paused) {
        audioEngine.resume();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play',       onPlay);
    audio.addEventListener('playing',    onPlaying);
    audio.addEventListener('pause',      onPause);
    audio.addEventListener('ended',      onEnded);
    audio.addEventListener('error',      onError);
    audio.addEventListener('stalled',    onStall);
    audio.addEventListener('waiting',    onWaiting);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play',       onPlay);
      audio.removeEventListener('playing',    onPlaying);
      audio.removeEventListener('pause',      onPause);
      audio.removeEventListener('ended',      onEnded);
      audio.removeEventListener('error',      onError);
      audio.removeEventListener('stalled',    onStall);
      audio.removeEventListener('waiting',    onWaiting);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
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

    // Inform AudioEngine of track change (resets adaptive analysis; preserves ALL user preferences)
    audioEngine.onTrackChange(currentTrack);

    // Skip if the src hasn't actually changed (e.g. metadata-only update)
    if (audio.src && (audio.src === src || audio.src.endsWith(src))) return;

    pendingSrc.current = src;
    retryAttempts.current = 0;

    // Ensure crossOrigin remains anonymous for Web Audio processing
    if (audio.crossOrigin !== 'anonymous') {
      audio.crossOrigin = 'anonymous';
    }

    const wasPlaying = !audio.paused;
    audio.pause();

    // Clear old playback counters
    setProgress(0);
    setElapsed(0);
    setDuration(0);
    setIsPlaying(false);

    // Use canplay event to start once the new stream has buffered
    const onCanPlay = () => {
      if (pendingSrc.current !== src) return;
      audio.removeEventListener('canplay', onCanPlay);
      if (wasPlaying) {
        audioEngine.resume();
        audio.play().catch(err => console.warn('[Autoplay blocked]', err.message));
      }
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.src = src;
    audio.load();

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [currentTrack?.previewUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume sync
  useEffect(() => {
    audioRef.current.volume = Math.min(1, Math.max(0, (preferences?.volume ?? 62) / 100));
  }, [preferences?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // Passive first-user-gesture unlock for AudioContext
  useEffect(() => {
    const unlockOnGesture = () => {
      audioEngine.resume();
    };
    window.addEventListener('click', unlockOnGesture, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true, passive: true });
    window.addEventListener('touchstart', unlockOnGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('click', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
      window.removeEventListener('touchstart', unlockOnGesture);
    };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.src) return;
    audioEngine.resume();
    const doPlay = () => audio.play().catch(e => {
      if (e.name !== 'NotAllowedError') {
        console.warn('[play]', e.message);
      }
    });
    if (audio.readyState < 2) {
      const onReady = () => {
        audio.removeEventListener('canplay', onReady);
        audioEngine.fadeToPlay(doPlay);
      };
      audio.addEventListener('canplay', onReady);
      return;
    }
    audioEngine.fadeToPlay(doPlay);
  }, []);

  const pause = useCallback(() => {
    audioEngine.fadeToPause(() => {
      audioRef.current.pause();
    });
  }, []);

  const seek = useCallback((percentage) => {
    const audio = audioRef.current;
    const dur   = audio.duration;
    if (dur && !isNaN(dur) && isFinite(dur)) {
      audioEngine.fadeToPause(() => {
        audio.currentTime = Math.max(0, Math.min(dur, (percentage / 100) * dur));
        audioEngine.fadeToPlay();
      });
    }
  }, []);

  return { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef };
}
