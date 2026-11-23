/**
 * client/src/components/NowPlaying/MusicVideoCompanion.jsx
 *
 * Spotify-Inspired Original Music Video Companion Component for Auralis Music.
 * Displays verified official YouTube music videos synchronized with Auralis audio,
 * with Spotify-style Full Screen Video Experience and seamless dual-playback modes.
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
  handlePrev,
  handleNext,
  shuffle,
  setShuffle,
  repeat,
  setRepeat,
  prefs,
  setPrefs,
  isFav,
  toggleFavorite,
  theme,
}) {
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [embedError, setEmbedError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  // 'companion' = Auralis Hi-Fi audio + muted synced video (default)
  // 'youtube'   = YouTube audio + video (Auralis audio paused)
  const [playbackMode, setPlaybackMode] = useState('companion');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const playerRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const activeTrackIdRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

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
          onStateChange: () => {
            if (playbackMode === 'companion') {
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

  // ── 5. Fullscreen auto-hide mouse controls (Spotify Style) ───────────────
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isFullScreen) {
        setShowControls(false);
      }
    }, 3000);
  }, [isFullScreen]);

  // Escape key exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Toggle fullscreen
  const toggleFullScreen = () => {
    const next = !isFullScreen;
    setIsFullScreen(next);
    setShowControls(true);
    if (next) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // ── 6. Mode Switch Handlers ──────────────────────────────────────────────
  const handleSwitchToYouTubeAudio = useCallback(() => {
    if (!playerRef.current) return;
    try {
      pause();
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
      playerRef.current.mute();
      const videoTime = (typeof playerRef.current.getCurrentTime === 'function')
        ? playerRef.current.getCurrentTime()
        : displayElapsed;

      if (displayDuration > 0) {
        seek((videoTime / displayDuration) * 100);
      }
      play();
      setPlaybackMode('companion');
    } catch (err) {
      console.warn('[handleSwitchToCompanionAudio] error:', err);
    }
  }, [play, seek, displayDuration, displayElapsed]);

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

  const currentVolume = prefs?.volume ?? 62;

  return (
    <div
      className={`video-companion-root${isFullScreen ? ' video-companion-root--fullscreen' : ''}`}
      onMouseMove={isFullScreen ? handleMouseMove : undefined}
    >
      {/* ── Normal View: Mode Status Banner ── */}
      {!isFullScreen && (
        <div className="video-mode-banner">
          <div className="video-mode-left">
            <span className={`video-mode-indicator ${playbackMode === 'companion' ? 'indicator-companion' : 'indicator-youtube'}`} />
            <span className="video-mode-text">
              {playbackMode === 'companion'
                ? '🎧 Auralis Hi-Fi (Video Muted)'
                : '🔊 YouTube Audio'}
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
      )}

      {/* ── Main Video Display Area (Never unmounts during fullscreen) ── */}
      <div className="video-player-container">
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

        {/* Normal mode: Fullscreen trigger button */}
        {!isFullScreen && videoInfo && (
          <button
            className="video-expand-btn"
            onClick={toggleFullScreen}
            title="Full Screen (Spotify Experience)"
            aria-label="Full Screen Video"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6m-6 5l7 7m0-6v6h-6M9 21H3v-6m0 0l7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Spotify Full Screen Chrome Overlay ── */}
      {isFullScreen && (
        <div className={`video-fs-overlay${!showControls ? ' video-fs-overlay--hidden' : ''}`}>
          {/* Top Bar */}
          <div className="video-fs-top-bar">
            <div className="video-fs-info">
              <strong className="video-fs-title">{currentTrack?.title}</strong>
              <div className="video-fs-sub">
                <span>{currentTrack?.artist}</span>
                {currentTrack?.album && <span>• {currentTrack.album}</span>}
                {videoInfo && (
                  <span className="video-fs-badge" style={getBadgeStyle(videoInfo.classification)}>
                    ✦ {videoInfo.classification}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="video-mode-switch-btn"
                style={{ fontSize: '0.8rem', padding: '8px 14px', borderRadius: 20 }}
                onClick={playbackMode === 'companion' ? handleSwitchToYouTubeAudio : handleSwitchToCompanionAudio}
              >
                {playbackMode === 'companion' ? '🔊 Switch to YouTube Audio' : '🎧 Switch to Auralis Hi-Fi Audio'}
              </button>
              <button
                className="video-fs-btn"
                onClick={toggleFullScreen}
                title="Exit Full Screen (Esc)"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bottom Bar: Full Transport Controls */}
          <div className="video-fs-bottom-bar">
            {/* Scrubber */}
            <div className="video-fs-progress-wrap">
              <span className="video-fs-time">{fmt(displayElapsed)}</span>
              <div className="video-fs-slider-box">
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={displayDuration > 0 ? Math.round((displayElapsed / displayDuration) * 1000) : 0}
                  onChange={(e) => seek?.(e.target.value / 10)}
                  className="video-fs-slider"
                  style={{ '--seek-color': theme?.vibrant || '#67f0b7' }}
                  aria-label="Seek"
                />
              </div>
              <span className="video-fs-time">{fmt(displayDuration)}</span>
            </div>

            {/* Transport & Volume Controls */}
            <div className="video-fs-controls-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isFav !== undefined && (
                  <button
                    className="video-fs-btn-sm"
                    onClick={() => toggleFavorite?.(currentTrack?.id)}
                    title={isFav ? 'Liked' : 'Like'}
                    style={{ color: isFav ? '#67f0b7' : '#fff' }}
                  >
                    <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                )}
                {setShuffle && (
                  <button
                    className={`video-fs-btn-sm${shuffle ? ' active' : ''}`}
                    onClick={() => setShuffle((s) => !s)}
                    title="Shuffle"
                    style={{ color: shuffle ? '#67f0b7' : '#fff' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <path d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Main Transport */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button className="video-fs-ctrl-btn" onClick={handlePrev} title="Previous">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                  </svg>
                </button>
                <button
                  className="video-fs-play-btn"
                  onClick={isPlaying ? pause : play}
                  title={isPlaying ? 'Pause' : 'Play'}
                  style={{ background: theme?.vibrant || '#67f0b7' }}
                >
                  <svg viewBox="0 0 24 24" fill="#000" width="28" height="28">
                    {isPlaying ? (
                      <>
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </>
                    ) : (
                      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                    )}
                  </svg>
                </button>
                <button className="video-fs-ctrl-btn" onClick={handleNext} title="Next">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M6 18l8.5-6L6 6v12zm2-6 8.5 6V6l-8.5 6zm8.5-6h2v12h-2z" />
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {setRepeat && (
                  <button
                    className={`video-fs-btn-sm${repeat ? ' active' : ''}`}
                    onClick={() => setRepeat((r) => !r)}
                    title="Repeat"
                    style={{ color: repeat ? '#67f0b7' : '#fff' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                )}
                {/* Volume */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentVolume}
                    className="video-fs-volume-slider"
                    onChange={(e) => setPrefs?.((p) => ({ ...p, volume: Number(e.target.value) }))}
                  />
                </div>
                {/* Exit full screen */}
                <button className="video-fs-btn-sm" onClick={toggleFullScreen} title="Exit Full Screen">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 14h6v6m10-10h-6V4m0 6l7-7M10 14l-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Normal View: Video Metadata & Attribution Card ── */}
      {!isFullScreen && videoInfo && (
        <div className="video-meta-card">
          <div className="video-meta-row-top">
            <span className="video-class-badge" style={getBadgeStyle(videoInfo.classification)}>
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
