import { useRef } from 'react';
import { useApp }   from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { artProxy }  from '../../utils/audioHelpers';

/**
 * BottomNav
 * Mobile-only bottom bar with:
 *  - Compact mini-player strip (tap → full Now Playing sheet)
 *  - Three navigation tabs: Home, Search, Your Library
 */
export function BottomNav() {
  const { view, navigateTo, setMobileNowOpen } = useApp();
  const {
    currentTrack,
    isPlaying,
    progress,
    resolvingId,
    isFav,
    togglePlay,
    toggleFavorite,
  } = usePlayer();

  // ── Double-tap Home → scroll to top ────────────────────────
  const lastHomeTapRef = useRef(0);

  const handleHomeTap = () => {
    const now = Date.now();
    if (view === 'home' && now - lastHomeTapRef.current < 300) {
      // Double-tap on Home while already on Home → scroll to top
      const mainArea = document.querySelector('.main-area');
      if (mainArea) {
        mainArea.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      navigateTo('home');
    }
    lastHomeTapRef.current = now;
  };

  const coverBgInline = currentTrack?.artworkUrl
    ? `url(${artProxy(currentTrack.artworkUrl)}) center/cover`
    : currentTrack
      ? `linear-gradient(135deg,${currentTrack.color?.[0]||'#1db954'},${currentTrack.color?.[1]||'#191414'})`
      : 'none';

  const TABS = [
    {
      id: 'home', label: 'Home',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      ),
    },
    {
      id: 'search', label: 'Search',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="26" height="26">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      ),
    },
    {
      id: 'library', label: 'Your Library',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
          <path d="M3 6h2v12H3zm4-2h2v16H7zm4 4h2v12h-2zm4-6h2v18h-2zm4 2h2v14h-2z"/>
        </svg>
      ),
    },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">

      {/* ── Mini-player strip (visible when a track is loaded) ── */}
      {currentTrack && (
        <div className="bmp-strip" onClick={() => setMobileNowOpen(true)}>
          {/* Thin progress line at top */}
          <div className="bmp-strip-progress">
            <div className="bmp-strip-fill" style={{ width: `${progress}%` }} />
            {resolvingId && <div className="bmp-strip-shimmer" />}
          </div>

          <div className="bmp-strip-inner">
            {/* Album art */}
            <div className="bmp-strip-art" style={{ background: coverBgInline }}>
              {currentTrack.artworkUrl && (
                <img src={artProxy(currentTrack.artworkUrl)} alt=""
                  style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} />
              )}
            </div>

            {/* Track text */}
            <div className="bmp-strip-text">
              <strong>{currentTrack.title}</strong>
              <span>{currentTrack.artist}</span>
            </div>

            {/* Heart + Play */}
            <div className="bmp-strip-btns">
              <button
                className={`bmp-icon-btn${isFav ? ' bmp-icon-btn--active' : ''}`}
                onClick={e => { e.stopPropagation(); toggleFavorite(currentTrack.id); }}
                title={isFav ? 'Saved' : 'Save'}
              >
                <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="22" height="22">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
              <button
                className="bmp-icon-btn bmp-play"
                onClick={e => { e.stopPropagation(); togglePlay(); }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
                  {isPlaying
                    ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                    : <path d="M8 5.5v13l11-6.5-11-6.5Z"/>}
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="bottom-nav-tabs">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`bottom-nav-tab${view === id ? ' bottom-nav-tab--active' : ''}`}
            onClick={id === 'home' ? handleHomeTap : () => navigateTo(id)}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
      </div>

    </nav>
  );
}
