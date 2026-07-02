import { useApp }               from '../../context/AppContext';
import { usePlayer }            from '../../context/PlayerContext';
import { useAlbumThemeContext } from '../../context/AlbumThemeContext';
import { SourceBadge }          from '../common/SourceBadge';
import { artProxy, fmt }        from '../../utils/audioHelpers';
import { useSwipeSheet }        from '../../hooks/useSwipeSheet';


/**
 * NowPlaying
 * Right-panel on desktop / full-screen sheet on mobile.
 * Shows artwork, track info, progress, transport controls,
 * action buttons (add to playlist, share, queue) and volume.
 */
export function NowPlaying() {
  const { mobileNowOpen, setMobileNowOpen, prefs, setPrefs, openPlaylistModal } = useApp();
  const {
    currentTrack,
    isPlaying, seek,
    progress, displayElapsed, displayDuration,
    shuffle, setShuffle,
    repeat,  setRepeat,
    resolvingId,
    isFav,
    togglePlay, handlePrev, handleNext, toggleFavorite,
  } = usePlayer();
  const { theme } = useAlbumThemeContext();

  // Inline style helpers derived from the dynamic theme
  const accentStyle    = { '--now-accent': theme.vibrant };
  const glowStyle      = { boxShadow: `0 8px 60px 6px ${theme.dominant}55, 0 2px 20px 2px ${theme.dominant}33` };
  const progressStyle  = { background: theme.vibrant, width: `${progress}%` };
  const panelBgStyle   = {
    background: theme.gradient,
    color: theme.textColor === 'dark' ? 'rgba(10,15,13,0.95)' : 'rgba(245,247,239,0.97)',
  };

  // ── Swipe-down gesture to close the sheet ──────────────────
  const swipeRef = useSwipeSheet({
    role:    'sheet',
    isOpen:  mobileNowOpen,
    onOpen:  () => setMobileNowOpen(true),
    onClose: () => setMobileNowOpen(false),
  });

  return (
    <aside
      ref={swipeRef}
      className={`now-panel glass-panel now-panel--themed${mobileNowOpen ? ' now-panel--mobile-open' : ''}`}
      style={panelBgStyle}
      aria-label="Now playing"
    >
      {/* Mobile drag handle */}
      <div className="now-panel-mobile-handle" onClick={() => setMobileNowOpen(false)} />

      {currentTrack ? (
        <div className="spotify-now">

          {/* ── Header: back arrow + context + more ── */}
          <div className="spotify-now-header">
            <button className="spotify-down-btn" onClick={() => setMobileNowOpen(false)}
              aria-label="Close Now Playing">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="24" height="24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="spotify-now-context">
              <span className="spotify-now-context-label">
                {isPlaying ? 'NOW PLAYING' : 'LAST PLAYED'}
              </span>
              {currentTrack.album && <span className="spotify-now-context-val">{currentTrack.album}</span>}
            </div>
            <button className="spotify-down-btn" title="More options">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <circle cx="12" cy="5" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>

          {/* ── Album artwork ── */}
          <div className="spotify-now-art-wrapper" style={accentStyle}>
            {/* Glow ring behind artwork — outside overflow:hidden so it bleeds out */}
            <div className="spotify-now-art-glow" style={glowStyle} />
            <div className="spotify-now-art">
              {currentTrack.artworkUrl ? (
                <img
                  src={artProxy(currentTrack.artworkUrl)}
                  alt={currentTrack.title}
                  className="spotify-now-art-img"
                  key={currentTrack.artworkUrl}
                />
              ) : (
                <div className="spotify-now-art-fallback" />
              )}
              {resolvingId && (
                <div className="spotify-now-art-loading">
                  <div className="spotify-spinner" />
                  <span>Loading full track…</span>
                </div>
              )}
            </div>
          </div>

          {/* ─ Track info + ♥ + ＋ (Spotify layout) ─ */}
          <div className="spotify-now-info">
            <div className="spotify-now-text">
              <strong className="spotify-now-title">{currentTrack.title}</strong>
              <span className="spotify-now-artist">{currentTrack.artist}</span>
              {currentTrack.album && <span className="spotify-now-album">{currentTrack.album}</span>}
            </div>

            {/* Right-side action icons: ♥  +  ··· */}
            <div className="now-info-actions">
              {/* Heart — save to liked */}
              <button
                className={`now-icon-btn${isFav ? ' now-icon-btn--active' : ''}`}
                onClick={() => toggleFavorite(currentTrack.id)}
                title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <svg viewBox="0 0 24 24"
                  fill={isFav ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth="1.8"
                  width="24" height="24">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              {/* Plus — add to playlist */}
              <button
                className="now-icon-btn now-icon-btn--plus"
                onClick={() => openPlaylistModal(currentTrack)}
                title="Add to playlist"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" width="22" height="22">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="16"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Progress bar ── */}
          <div className="spotify-now-progress">
            <div className={`spotify-progress-track${resolvingId ? ' spotify-progress-track--loading' : ''}`}>
              <div className="spotify-progress-fill" style={progressStyle} />
              {resolvingId && <div className="spotify-progress-shimmer" />}
            </div>
            <div className="spotify-progress-times">
              <span>{fmt(displayElapsed)}</span>
              <span>{fmt(displayDuration)}</span>
            </div>
            <input type="range" className="spotify-seek-input" min="0" max="1000"
              value={Math.round(progress * 10)}
              onChange={e => seek(e.target.value / 10)}
              style={{ '--seek-thumb-color': theme.vibrant }}
              aria-label="Seek" />
          </div>

          {/* ── Transport controls ── */}
          <div className="spotify-now-controls">
            <button className={`spotify-ctrl-btn${shuffle ? ' spotify-ctrl-btn--active' : ''}`}
              onClick={() => setShuffle(s => !s)} title="Shuffle"
              style={shuffle ? { color: theme.vibrant } : {}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <button className="spotify-ctrl-btn spotify-ctrl-btn--lg" onClick={handlePrev} title="Previous">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>
            <button
              className="spotify-play-btn"
              onClick={togglePlay}
              disabled={!!resolvingId}
              style={{ background: theme.vibrant, boxShadow: `0 0 24px ${theme.dominant}88` }}
            >
              {resolvingId ? (
                <div className="spotify-play-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  {isPlaying
                    ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                    : <path d="M8 5.5v13l11-6.5-11-6.5Z"/>}
                </svg>
              )}
            </button>
            <button className="spotify-ctrl-btn spotify-ctrl-btn--lg" onClick={handleNext} title="Next">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M6 18l8.5-6L6 6v12zm2-6 8.5 6V6l-8.5 6zm8.5-6h2v12h-2z" />
              </svg>
            </button>
            <button className={`spotify-ctrl-btn${repeat ? ' spotify-ctrl-btn--active' : ''}`}
              onClick={() => setRepeat(r => !r)} title="Repeat"
              style={repeat ? { color: theme.vibrant } : {}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>

          {/* ── Action row ── */}
          <div className="spotify-now-actions">
            <button className="spotify-action-btn" title="Add to Playlist">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span>Add to playlist</span>
            </button>
            <button className="spotify-action-btn" title="Share">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              <span>Share</span>
            </button>
            <button className="spotify-action-btn" title="Queue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="15" y2="18"/>
              </svg>
              <span>Queue</span>
            </button>
          </div>

          {/* ── Volume ── */}
          <div className="spotify-now-volume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input type="range" min="0" max="100"
              value={prefs.volume ?? 62}
              className="spotify-volume-slider"
              style={{ '--seek-thumb-color': theme.vibrant }}
              onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </div>

          {/* ── Source / meta tags ── */}
          <div className="spotify-now-meta">
            <SourceBadge track={currentTrack} />
            {currentTrack.genre && <span className="spotify-now-tag">{currentTrack.genre}</span>}
            {currentTrack.year  && <span className="spotify-now-tag">{currentTrack.year}</span>}
          </div>

        </div>
      ) : (
        /* ── Empty panel — no track ever played ── */
        <div className="now-panel-idle" />
      )}
    </aside>
  );
}
