/**
 * client/src/components/NowPlaying/MusicVideoCompanion.jsx
 *
 * Spotify-Inspired Original Music Video Companion Component for Auralis Music.
 * Displays the verified official YouTube music video synchronized with Auralis audio,
 * preserving all existing sound engine settings with zero duplicate audio.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMusicVideoMatch } from '../../services/videoCompanionService';
import { fmt } from '../../utils/audioHelpers';

// Ensure YouTube IFrame API script is injected once
let ytApiPromise = null;
function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        resolve(window.YT);
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.body.appendChild(tag);
      }
    });
  }
  return ytApiPromise;
}

export function MusicVideoCompanion({
  currentTrack,
  isPlaying,
  displayElapsed,
  displayDuration,
  pause,
  play,
  seek,
  theme,
}) {
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [embedError, setEmbedError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  // 'companion' = Auralis Hi-Fi audio + muted synced video (default)
  // 'youtube'   = YouTube audio + video (Auralis audio paused)
  const [playbackMode, setPlaybackMode] = useState('companion');
  const [isExpanded, setIsExpanded] = useState(false);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const activeTrackIdRef = useRef(null);

  // ── 1. Fetch matching video whenever currentTrack changes ──────────────
  useEffect(() => {
    if (!currentTrack) {
      setVideoInfo(null);
      setLoading(false);
      return;
    }

    activeTrackIdRef.current = currentTrack.id;
    setLoading(true);
    setEmbedError(false);

    let isMounted = true;
    fetchMusicVideoMatch(currentTrack).then((res) => {
      if (!isMounted) return;
      if (res.aborted) return;
      if (activeTrackIdRef.current === currentTrack.id) {
        setVideoInfo(res.found ? res : null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.title]);

  // ── 2. Initialize YouTube Player when videoInfo is available ────────────
  useEffect(() => {
    if (!videoInfo || !videoInfo.videoId) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
        setPlayerReady(false);
      }
      return;
    }

    const videoId = videoInfo.videoId;

    loadYouTubeIframeApi().then((YT) => {
      if (activeTrackIdRef.current !== currentTrack?.id) return;

      // If player already exists and is bound to the same videoId, just reuse
      if (playerRef.current && currentVideoIdRef.current === videoId) {
        return;
      }

      // If player already exists for a different video, load new video
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        currentVideoIdRef.current = videoId;
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: playbackMode === 'companion' ? displayElapsed : 0,
        });
        if (playbackMode === 'companion') {
          playerRef.current.mute();
          if (!isPlaying) playerRef.current.pauseVideo();
        }
        return;
      }

      // Create new YT.Player instance
      currentVideoIdRef.current = videoId;
      setPlayerReady(false);

      playerRef.current = new YT.Player('auralis-yt-video-frame', {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          mute: playbackMode === 'companion' ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (e) => {
            const player = e.target;
            playerRef.current = player;
            setPlayerReady(true);
            setEmbedError(false);

            if (playbackMode === 'companion') {
              player.mute();
              if (isPlaying) {
                player.playVideo();
                if (displayElapsed > 0) player.seekTo(displayElapsed, true);
              } else {
                player.pauseVideo();
              }
            }
          },
          onStateChange: (e) => {
            // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            if (playbackMode === 'companion') {
              // Ensure video never accidentally produces audible sound in companion mode
              if (playerRef.current && !playerRef.current.isMuted()) {
                playerRef.current.mute();
              }
            }
          },
          onError: (e) => {
            console.warn('[MusicVideoCompanion] Embed error:', e.data);
            setEmbedError(true);
          },
        },
      });
    });

    return () => {
      // Cleanup on unmount
    };
  }, [videoInfo?.videoId, currentTrack?.id]);

  // ── 3. Synchronization: Play/Pause state in Companion Mode ───────────────
  useEffect(() => {
    if (playbackMode !== 'companion' || !playerReady || !playerRef.current) return;

    try {
      if (isPlaying) {
        playerRef.current.mute();
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {}
  }, [isPlaying, playerReady, playbackMode]);

  // ── 4. Synchronization: Position / Seek drift correction ─────────────────
  useEffect(() => {
    if (playbackMode !== 'companion' || !playerReady || !playerRef.current) return;

    // Periodic check every 1.5s for seek or significant timing drift (> 2.0s)
    const interval = setInterval(() => {
      if (!isPlaying || !playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
      try {
        const videoTime = playerRef.current.getCurrentTime() || 0;
        const drift = Math.abs(videoTime - displayElapsed);
        if (drift > 2.0) {
          playerRef.current.seekTo(displayElapsed, true);
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [isPlaying, playerReady, playbackMode, displayElapsed]);

  // ── 5. Mode Switch Handlers ──────────────────────────────────────────────
  const handleSwitchToYouTubeAudio = useCallback(() => {
    if (!playerRef.current) return;
    try {
      // 1. Pause Auralis audio engine
      pause();
      // 2. Unmute YouTube player and play
      playerRef.current.unMute();
      playerRef.current.playVideo();
      setPlaybackMode('youtube');
    } catch (err) {
      console.warn('[handleSwitchToYouTubeAudio] error:', err);
    }
  }, [pause]);

  const handleSwitchToCompanionAudio = useCallback(() => {
    if (!playerRef.current) return;
    try {
      // 1. Mute YouTube player
      playerRef.current.mute();
      const videoTime = (typeof playerRef.current.getCurrentTime === 'function')
        ? playerRef.current.getCurrentTime()
        : displayElapsed;

      // 2. Seek Auralis audio to current video time
      if (displayDuration > 0) {
        seek((videoTime / displayDuration) * 100);
      }
      // 3. Resume Auralis audio
      play();
      setPlaybackMode('companion');
    } catch (err) {
      console.warn('[handleSwitchToCompanionAudio] error:', err);
    }
  }, [play, seek, displayDuration, displayElapsed]);

  // Classification badge color styling
  const getBadgeStyle = (classification) => {
    switch (classification) {
      case 'Official Original Video':
        return {
          background: 'rgba(103, 240, 183, 0.2)',
          borderColor: 'rgba(103, 240, 183, 0.45)',
          color: '#67f0b7',
        };
      case 'Official Music Video':
        return {
          background: 'rgba(56, 189, 248, 0.2)',
          borderColor: 'rgba(56, 189, 248, 0.4)',
          color: '#38bdf8',
        };
      case 'Official Lyrical Video':
        return {
          background: 'rgba(167, 139, 250, 0.2)',
          borderColor: 'rgba(167, 139, 250, 0.4)',
          color: '#c084fc',
        };
      case 'Official Soundtrack Video':
        return {
          background: 'rgba(251, 191, 36, 0.2)',
          borderColor: 'rgba(251, 191, 36, 0.4)',
          color: '#fbbf24',
        };
      default:
        return {
          background: 'rgba(255, 255, 255, 0.12)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: '#e2e8f0',
        };
    }
  };

  return (
    <div className={`video-companion-root${isExpanded ? ' video-companion-root--expanded' : ''}`}>
      {/* ── Mode Status Banner ── */}
      <div className="video-mode-banner">
        <div className="video-mode-left">
          <span className={`video-mode-indicator ${playbackMode === 'companion' ? 'indicator-companion' : 'indicator-youtube'}`} />
          <span className="video-mode-text">
            {playbackMode === 'companion'
              ? '🎧 Auralis Hi-Fi Audio (Video Muted)'
              : '🔊 YouTube Audio (Auralis DSP Paused)'}
          </span>
        </div>
        <button
          className="video-mode-switch-btn"
          onClick={playbackMode === 'companion' ? handleSwitchToYouTubeAudio : handleSwitchToCompanionAudio}
          title={playbackMode === 'companion' ? 'Switch to YouTube Audio' : 'Switch back to Auralis Hi-Fi Audio'}
        >
          {playbackMode === 'companion' ? 'Watch with Audio' : 'Return to Hi-Fi'}
        </button>
      </div>

      {/* ── Main Video Display Area ── */}
      <div className="video-player-container" ref={containerRef}>
        {loading ? (
          <div className="video-player-placeholder video-loading-state">
            <div className="spotify-spinner" />
            <span className="video-placeholder-text">Searching official music video…</span>
          </div>
        ) : embedError ? (
          <div className="video-player-placeholder video-error-state">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <strong className="video-placeholder-title">Embedding Restricted</strong>
            <span className="video-placeholder-desc">Content owner restricted external embedding.</span>
            {videoInfo?.youtubeUrl && (
              <a
                href={videoInfo.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="video-open-yt-btn"
              >
                Watch on YouTube ↗
              </a>
            )}
          </div>
        ) : !videoInfo ? (
          <div className="video-player-placeholder video-not-found-state">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="4" width="20" height="15" rx="2.5" />
              <polygon points="10 8 16 11.5 10 15 10 8" />
              <line x1="2" y1="20" x2="22" y2="20" />
            </svg>
            <strong className="video-placeholder-title">Official music video not available</strong>
            <span className="video-placeholder-desc">
              Auralis strictly validates official label releases to prevent unverified covers or mismatched videos.
            </span>
          </div>
        ) : (
          <div className="video-iframe-wrapper">
            <div id="auralis-yt-video-frame" className="video-iframe-target" />
          </div>
        )}

        {/* Expand / Minimize toggle button */}
        <button
          className="video-expand-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          title={isExpanded ? 'Restore normal view' : 'Expand video viewer'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            {isExpanded ? (
              <path d="M4 14h6v6m10-10h-6V4m0 6l7-7M10 14l-7 7" />
            ) : (
              <path d="M15 3h6v6m-6 5l7 7m0-6v6h-6M9 21H3v-6m0 0l7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* ── Video Metadata & Attribution Card ── */}
      {videoInfo && (
        <div className="video-meta-card">
          <div className="video-meta-row-top">
            <span
              className="video-class-badge"
              style={getBadgeStyle(videoInfo.classification)}
            >
              ✦ {videoInfo.classification}
            </span>
            <span className="video-verified-badge">
              ✓ {videoInfo.badge || 'Verified Match'}
            </span>
          </div>

          <div className="video-meta-title-wrap">
            <strong className="video-meta-song-title">{videoInfo.title}</strong>
            <div className="video-meta-channel-row">
              <span className="video-channel-icon">📺</span>
              <span className="video-channel-name">{videoInfo.channelTitle}</span>
              {videoInfo.duration > 0 && (
                <span className="video-meta-duration">
                  ({fmt(videoInfo.duration)})
                </span>
              )}
            </div>
          </div>

          <div className="video-meta-actions">
            <a
              href={videoInfo.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="video-action-link"
              title="Open original video on YouTube"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>Open in YouTube</span>
            </a>

            <div className="video-sync-stat">
              <span className="video-sync-dot" />
              <span>Synced with Auralis DSP</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
