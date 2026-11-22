import { useState, useCallback } from 'react';
import { useApp }               from '../../context/AppContext';
import { usePlayer }            from '../../context/PlayerContext';
import { useAlbumThemeContext } from '../../context/AlbumThemeContext';
import { SourceBadge }          from '../common/SourceBadge';
import { artProxy, fmt }        from '../../utils/audioHelpers';
import { useSwipeSheet }        from '../../hooks/useSwipeSheet';
import { WaveformProgress }     from '../WaveformProgress/WaveformProgress';
import { LyricsPanel }          from '../Lyrics/LyricsPanel';
import { useLyricsSync }        from '../../hooks/useLyricsSync';


/**
 * NowPlaying
 * Right-panel on desktop / full-screen sheet on mobile.
 * Spotify-style Now Playing experience with:
 *   1. Header
 *   2. Album Artwork
 *   3. Song Details + Heart
 *   4. Seek Bar (WaveformProgress)
 *   5. Transport Controls
 *   6. Secondary Controls Row
 *   7. Lyrics Preview Card
 *   8. About Artist Card
 *   9. Credits Card
 *  10. Explore Artist Section
 *  11. Source meta tags
 *
 * UI-only — consumes existing player state. No playback logic changes.
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

  // ── Local UI state (view-layer only) ────────────────────────
  const [activeTab,      setActiveTab]        = useState('now'); // 'now' | 'queue'
  const [lyricsExpanded, setLyricsExpanded]   = useState(false);
  const [artistFollowed, setArtistFollowed]   = useState(false);
  const [activeSecBtn,   setActiveSecBtn]     = useState(null); // 'lyrics' | 'queue'

  // Use active track or fallback to reference track
  const activeTrack = currentTrack || {
    id: 'ref-rathinamo',
    title: 'Rathinamo',
    artist: 'Saurav Srisan',
    album: 'Malayalam Hits',
    artworkUrl: '/assets/auralis/home/malayalam-mix.webp',
  };

  // ── Lyrics data for the preview card ────────────────────────
  const { parsedLyrics, hasLyrics, activeIndex } = useLyricsSync();

  // ── Inline style helpers derived from the dynamic theme ─────
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

  // ── Helpers ─────────────────────────────────────────────────
  const toggleSecBtn = useCallback((btn) => {
    setActiveSecBtn(prev => prev === btn ? null : btn);
    if (btn === 'lyrics') setLyricsExpanded(prev => !prev);
  }, []);

  /** Get preview lines for the lyrics card (first 3–4 lines around active) */
  const lyricsPreviewLines = (() => {
    if (!parsedLyrics?.lines?.length) return null;
    const start = Math.max(0, activeIndex - 1);
    return parsedLyrics.lines.slice(start, start + 4);
  })();

  /** Derive mock artist image: use track artwork as artist bg */
  const artistBg = activeTrack?.artworkUrl ? artProxy(activeTrack.artworkUrl) : null;

  /** Derive a short "bio" placeholder from available data */
  const artistBio = activeTrack
    ? `${activeTrack.artist} is a celebrated artist known for their unique sound in the ${activeTrack.genre || 'contemporary'} genre.`
    : '';

  return (
    <aside
      ref={swipeRef}
      className={`now-panel glass-panel now-panel--themed${mobileNowOpen ? ' now-panel--mobile-open' : ''}`}
      style={panelBgStyle}
      aria-label="Now playing"
    >
      {/* Safe-area spacer */}
      <div
        className="now-panel-safe-top"
        style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }}
      />

      {/* Mobile drag handle */}
      <div className="now-panel-mobile-handle" onClick={() => setMobileNowOpen(false)} />

      {activeTrack ? (
        <div className="spotify-now spotify-now--with-lyrics">

          {/* ═══════════════════════════════════════════════════
              1. HEADER — back arrow + context + more
              ═══════════════════════════════════════════════════ */}
          <div className="spotify-now-header">
            {/* Desktop Tabs */}
            <div className="now-panel-desktop-tabs">
              <button
                className={`now-panel-tab${activeTab === 'now' ? ' now-panel-tab--active' : ''}`}
                onClick={() => setActiveTab('now')}
              >
                Now Playing
              </button>
              <button
                className={`now-panel-tab${activeTab === 'queue' ? ' now-panel-tab--active' : ''}`}
                onClick={() => setActiveTab('queue')}
              >
                Queue
              </button>
            </div>

            {/* Mobile context view */}
            <div className="now-panel-mobile-header">
              <button
                className="spotify-down-btn"
                onClick={() => setMobileNowOpen(false)}
                aria-label="Close Now Playing"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="24" height="24">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div className="spotify-now-context">
                <span className="spotify-now-context-label">
                  PLAYING FROM
                </span>
                <span className="spotify-now-context-val">{activeTrack.album || 'Malayalam Hits'}</span>
              </div>
            </div>

            <button className="spotify-down-btn" title="More options" aria-label="More options">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <circle cx="12" cy="5"  r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════
              2. ALBUM ARTWORK — large, centered, breathing
              ═══════════════════════════════════════════════════ */}
          <div
            className={`spotify-now-art-wrapper${isPlaying ? ' spotify-now-art-wrapper--playing' : ' spotify-now-art-wrapper--paused'}`}
            style={accentStyle}
          >
            {/* Glow ring behind artwork */}
            <div className="spotify-now-art-glow" style={glowStyle} />
            <div className="spotify-now-art">
              {activeTrack.artworkUrl ? (
                <img
                  src={artProxy(activeTrack.artworkUrl)}
                  alt={activeTrack.title}
                  className="spotify-now-art-img"
                  key={activeTrack.artworkUrl}
                  loading="eager"
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

          {/* ═══════════════════════════════════════════════════
              3. SONG DETAILS — title + artist + heart + plus
              ═══════════════════════════════════════════════════ */}
          <div className="spotify-now-info">
            <div className="spotify-now-text">
              <strong className="spotify-now-title">{activeTrack.title}</strong>
              <span className="spotify-now-artist">{activeTrack.artist}</span>
              {activeTrack.album && (
                <span className="spotify-now-album">{activeTrack.album}</span>
              )}
            </div>

            <div className="now-info-actions">
              {/* Heart — save to liked */}
              <button
                className={`now-icon-btn${isFav ? ' now-icon-btn--active' : ''}`}
                onClick={() => toggleFavorite(activeTrack.id)}
                title={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                aria-label={isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                aria-pressed={isFav}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill={isFav ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  width="24"
                  height="24"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              {/* Plus — add to playlist */}
              <button
                className="now-icon-btn now-icon-btn--plus"
                onClick={() => openPlaylistModal(activeTrack)}
                title="Add to playlist"
                aria-label="Add to playlist"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="16"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              4. SEEK BAR — WaveformProgress
              ═══════════════════════════════════════════════════ */}
          <WaveformProgress
            progress={progress}
            isPlaying={isPlaying}
            isLoading={!!resolvingId}
            seek={seek}
            displayElapsed={fmt(displayElapsed)}
            displayDuration={fmt(displayDuration)}
            accentColor={theme.vibrant}
          />

          {/* ═══════════════════════════════════════════════════
              5. TRANSPORT CONTROLS
              ═══════════════════════════════════════════════════ */}
          <div className="spotify-now-controls">
            {/* Shuffle */}
            <button
              className={`spotify-ctrl-btn${shuffle ? ' spotify-ctrl-btn--active' : ''}`}
              onClick={() => setShuffle(s => !s)}
              title="Shuffle"
              aria-label="Shuffle"
              aria-pressed={shuffle}
              style={shuffle ? { color: theme.vibrant } : {}}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              {shuffle && <span className="spotify-ctrl-dot" aria-hidden="true" />}
            </button>

            {/* Previous */}
            <button
              className="spotify-ctrl-btn spotify-ctrl-btn--lg"
              onClick={handlePrev}
              title="Previous"
              aria-label="Previous track"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            {/* Play / Pause */}
            <button
              className="spotify-play-btn"
              onClick={togglePlay}
              disabled={!!resolvingId}
              aria-label={isPlaying ? 'Pause' : 'Play'}
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

            {/* Next */}
            <button
              className="spotify-ctrl-btn spotify-ctrl-btn--lg"
              onClick={handleNext}
              title="Next"
              aria-label="Next track"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M6 18l8.5-6L6 6v12zm2-6 8.5 6V6l-8.5 6zm8.5-6h2v12h-2z" />
              </svg>
            </button>

            {/* Repeat */}
            <button
              className={`spotify-ctrl-btn${repeat ? ' spotify-ctrl-btn--active' : ''}`}
              onClick={() => setRepeat(r => !r)}
              title="Repeat"
              aria-label="Repeat"
              aria-pressed={repeat}
              style={repeat ? { color: theme.vibrant } : {}}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              {repeat && <span className="spotify-ctrl-dot" aria-hidden="true" />}
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════
              6. SECONDARY CONTROLS ROW
              Lyrics / Share / Queue / Device
              ═══════════════════════════════════════════════════ */}
          <div className="snp-sec-row" role="toolbar" aria-label="Playback options">
            {/* Lyrics indicator */}
            <button
              className={`snp-sec-btn${lyricsExpanded ? ' snp-sec-btn--active' : ''}`}
              onClick={() => setLyricsExpanded(p => !p)}
              title="Lyrics"
              aria-label="Toggle lyrics"
              aria-pressed={lyricsExpanded}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
              </svg>
            </button>

            {/* Share */}
            <button
              className="snp-sec-btn"
              title="Share"
              aria-label="Share"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>

            {/* Queue */}
            <button
              className="snp-sec-btn"
              title="Queue"
              aria-label="Queue"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="15" y2="18"/>
                <circle cx="19" cy="18" r="3"/>
              </svg>
            </button>

            {/* Device / Airplay */}
            <button
              className="snp-sec-btn"
              title="Connect to a device"
              aria-label="Connect to a device"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════
              7. LYRICS PREVIEW CARD
              Collapsed preview with 3–4 lines + Show lyrics btn
              Full LyricsPanel rendered when expanded
              ═══════════════════════════════════════════════════ */}
          <div className="snp-lyrics-card" aria-label="Lyrics preview">
            <div className="snp-lyrics-card-header">
              <span className="snp-lyrics-card-title">Lyrics</span>
              {hasLyrics && lyricsPreviewLines && (
                <span className="snp-lyrics-card-hint">
                  {activeTrack.artist}
                </span>
              )}
            </div>

            {lyricsExpanded ? (
              /* Full panel when expanded */
              <div className="snp-lyrics-expanded">
                <LyricsPanel accentColor={theme.vibrant} />
              </div>
            ) : (
              /* Collapsed preview */
              <div className="snp-lyrics-preview-wrap">
                {hasLyrics && lyricsPreviewLines?.length ? (
                  <>
                    <div className="snp-lyrics-preview">
                      {lyricsPreviewLines.map((line, i) => (
                        <p
                          key={i}
                          className={`snp-lyrics-line${i === 1 ? ' snp-lyrics-line--active' : ''}`}
                        >
                          {line.text || '♪'}
                        </p>
                      ))}
                    </div>
                    <div className="snp-lyrics-fade" aria-hidden="true" />
                  </>
                ) : (
                  <p className="snp-lyrics-unavailable">
                    {currentTrack ? 'Lyrics unavailable' : ''}
                  </p>
                )}
                <button
                  className="snp-show-lyrics-btn"
                  onClick={() => setLyricsExpanded(true)}
                  aria-label="Show full lyrics"
                >
                  Show lyrics
                </button>
              </div>
            )}

            {lyricsExpanded && (
              <button
                className="snp-show-lyrics-btn snp-show-lyrics-btn--collapse"
                onClick={() => setLyricsExpanded(false)}
                aria-label="Hide lyrics"
              >
                Hide lyrics
              </button>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════
              8. ABOUT ARTIST CARD
              ═══════════════════════════════════════════════════ */}
          <div className="snp-artist-card" role="article" aria-label={`About ${activeTrack.artist}`}>
            {/* Background image */}
            {artistBg && (
              <img
                src={artistBg}
                alt=""
                className="snp-artist-bg"
                aria-hidden="true"
                loading="lazy"
              />
            )}
            <div className="snp-artist-overlay" aria-hidden="true" />

            {/* Content */}
            <div className="snp-artist-body">
              <div className="snp-artist-top">
                <span className="snp-artist-label">About the artist</span>
              </div>

              <div className="snp-artist-info">
                {/* Avatar */}
                {artistBg && (
                  <div className="snp-artist-avatar" aria-hidden="true">
                    <img src={artistBg} alt={activeTrack.artist} />
                  </div>
                )}

                <div className="snp-artist-meta">
                  <div className="snp-artist-name-row">
                    <h3 className="snp-artist-name">{activeTrack.artist}</h3>
                    {/* Verified badge */}
                    <span className="snp-artist-verified" aria-label="Verified artist" title="Verified artist">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                      </svg>
                    </span>
                  </div>
                  <p className="snp-artist-listeners">Artist</p>
                </div>

                <button
                  className={`snp-artist-follow-btn${artistFollowed ? ' snp-artist-follow-btn--following' : ''}`}
                  onClick={() => setArtistFollowed(f => !f)}
                  aria-label={artistFollowed ? `Unfollow ${activeTrack.artist}` : `Follow ${activeTrack.artist}`}
                  aria-pressed={artistFollowed}
                >
                  {artistFollowed ? 'Following' : 'Follow'}
                </button>
              </div>

              {/* Bio */}
              <p className="snp-artist-bio">{artistBio}</p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              9. CREDITS CARD
              ═══════════════════════════════════════════════════ */}
          <div className="snp-credits-card" aria-label="Track credits">
            <div className="snp-credits-header">
              <span className="snp-credits-title">Credits</span>
              <button className="snp-credits-showall" aria-label="Show all credits">Show all</button>
            </div>

            <ul className="snp-credits-list" role="list">
              {/* Main Artist */}
              <li className="snp-credit-row">
                <div className="snp-credit-info">
                  <span className="snp-credit-name">{activeTrack.artist}</span>
                  <span className="snp-credit-role">Main Artist</span>
                </div>
                <button
                  className={`snp-credit-follow-btn${artistFollowed ? ' snp-credit-follow-btn--following' : ''}`}
                  onClick={() => setArtistFollowed(f => !f)}
                  aria-label={artistFollowed ? `Unfollow ${activeTrack.artist}` : `Follow ${activeTrack.artist}`}
                >
                  {artistFollowed ? 'Following' : 'Follow'}
                </button>
              </li>

              {/* Album / Producer placeholder */}
              {activeTrack.album && (
                <li className="snp-credit-row">
                  <div className="snp-credit-info">
                    <span className="snp-credit-name">{activeTrack.album}</span>
                    <span className="snp-credit-role">Album</span>
                  </div>
                </li>
              )}

              {/* Genre placeholder */}
              {activeTrack.genre && (
                <li className="snp-credit-row snp-credit-row--last">
                  <div className="snp-credit-info">
                    <span className="snp-credit-name">{activeTrack.genre}</span>
                    <span className="snp-credit-role">Genre</span>
                  </div>
                </li>
              )}
            </ul>
          </div>

          {/* ═══════════════════════════════════════════════════
              10. EXPLORE ARTIST — Horizontal scroll cards
              ═══════════════════════════════════════════════════ */}
          <div className="snp-explore-section">
            <div className="snp-explore-header">
              <h3 className="snp-explore-title">More by {activeTrack.artist}</h3>
            </div>

            <div
              className="snp-explore-scroll"
              role="list"
              aria-label={`More songs by ${activeTrack.artist}`}
            >
              {/* Generate 4 placeholder cards using the track's artwork */}
              {[
                { label: `Songs by ${activeTrack.artist}`,      sub: 'Playlist' },
                { label: `Similar to ${activeTrack.artist}`,    sub: 'Radio'    },
                { label: activeTrack.album || 'Top Tracks',     sub: 'Album'    },
                { label: activeTrack.genre  || 'Discover More', sub: 'Mix'      },
              ].map((item, i) => (
                <div
                  key={i}
                  className="snp-explore-card"
                  role="listitem"
                  tabIndex={0}
                  aria-label={item.label}
                >
                  <div className="snp-explore-art">
                    {activeTrack.artworkUrl ? (
                      <img
                        src={artProxy(activeTrack.artworkUrl)}
                        alt={item.label}
                        loading="lazy"
                      />
                    ) : (
                      <div className="snp-explore-art-fallback" aria-hidden="true" />
                    )}
                  </div>
                  <p className="snp-explore-label">{item.label}</p>
                  <p className="snp-explore-sub">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              11. VOLUME + SOURCE META
              ═══════════════════════════════════════════════════ */}
          <div className="spotify-now-volume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input
              type="range"
              min="0"
              max="100"
              value={prefs.volume ?? 62}
              className="spotify-volume-slider"
              style={{ '--seek-thumb-color': theme.vibrant }}
              onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))}
              aria-label="Volume"
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </div>

          <div className="spotify-now-meta">
            <SourceBadge track={activeTrack} />
            {activeTrack?.genre && <span className="spotify-now-tag">{activeTrack.genre}</span>}
            {activeTrack?.year  && <span className="spotify-now-tag">{activeTrack.year}</span>}
          </div>

        </div>
      ) : (
        /* ── Empty panel — no track ever played ── */
        <div className="now-panel-idle" />
      )}
    </aside>
  );
}
