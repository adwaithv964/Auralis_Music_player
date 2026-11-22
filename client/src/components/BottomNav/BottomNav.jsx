import { useRef } from 'react';
import { useApp }        from '../../context/AppContext';
import { usePlayer }     from '../../context/PlayerContext';
import { artProxy }      from '../../utils/audioHelpers';
import { useSwipeSheet } from '../../hooks/useSwipeSheet';

/**
 * BottomNav — Auralis Emerald Midnight redesign
 * Mobile-only bottom bar with:
 *  - Compact mini-player strip (tap → full Now Playing sheet)
 *  - Four navigation tabs: Home, Search, Library, You
 */
export function BottomNav() {
  const { view, navigateTo, setMobileNowOpen, mobileNowOpen, setMobileNavOpen, showPrefs, setShowPrefs } = useApp();
  const {
    currentTrack,
    isPlaying,
    progress,
    resolvingId,
    isFav,
    togglePlay,
    toggleFavorite,
  } = usePlayer();

  // ── Swipe-up gesture to open Now Playing sheet ──────────────
  const swipeRef = useSwipeSheet({
    role:    'mini',
    isOpen:  mobileNowOpen,
    onOpen:  () => setMobileNowOpen(true),
    onClose: () => {}, // mini never closes via swipe
  });

  // ── Double-tap Home → scroll to top ────────────────────────
  const lastHomeTapRef = useRef(0);

  const handleHomeTap = () => {
    const now = Date.now();
    if (view === 'home' && now - lastHomeTapRef.current < 300) {
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

  const activeTrack = currentTrack || {
    id: 'ref-rathinamo',
    title: 'Rathinamo',
    artist: 'Saurav Srisan',
    artworkUrl: '/assets/auralis/home/malayalam-mix.webp',
  };

  const coverBgInline = activeTrack?.artworkUrl
    ? `url(${artProxy(activeTrack.artworkUrl)}) center/cover`
    : activeTrack
      ? `linear-gradient(135deg,${activeTrack.color?.[0] || '#1db954'},${activeTrack.color?.[1] || '#191414'})`
      : 'none';

  // ── Tab definitions ──────────────────────────────────────────
  const TABS = [
    {
      id: 'home', label: 'Home',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      ),
      action: handleHomeTap,
    },
    {
      id: 'search', label: 'Search',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="24" height="24">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
      ),
      action: () => navigateTo('search'),
    },
    {
      id: 'library', label: 'Library',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M3 6h2v12H3zm4-2h2v16H7zm4 4h2v12h-2zm4-6h2v18h-2zm4 2h2v14h-2z" />
        </svg>
      ),
      action: () => navigateTo('library'),
    },
    {
      id: 'settings', label: 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: () => {
        setShowPrefs(true);
        navigateTo('settings');
      },
    },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">

      {/* ── Mini-player strip (always visible per reference design) ── */}
      {activeTrack && (
        <div
          className="bmp-strip"
          ref={swipeRef}
          onClick={() => setMobileNowOpen(true)}
        >
          {/* Thin progress line at top */}
          <div className="bmp-strip-progress">
            <div className="bmp-strip-fill" style={{ width: `${progress}%` }} />
            {resolvingId && <div className="bmp-strip-shimmer" />}
          </div>

          <div className="bmp-strip-inner">
            {/* Album art */}
            <div className="bmp-strip-art" style={{ background: coverBgInline }}>
              {activeTrack.artworkUrl && (
                <img src={artProxy(activeTrack.artworkUrl)} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
              )}
            </div>

            {/* Track text */}
            <div className="bmp-strip-text">
              <strong>{activeTrack.title}</strong>
              <span>{activeTrack.artist}</span>
            </div>

            {/* Heart + Play + Queue */}
            <div className="bmp-strip-btns">
              <button
                className={`bmp-icon-btn${isFav ? ' bmp-icon-btn--active' : ''}`}
                onClick={e => { e.stopPropagation(); if (currentTrack) toggleFavorite(currentTrack.id); }}
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
                    ? <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
                    : <path d="M8 5.5v13l11-6.5-11-6.5Z" />}
                </svg>
              </button>
              <button
                className="bmp-icon-btn bmp-queue"
                onClick={e => { e.stopPropagation(); setMobileNowOpen(true); }}
                title="Queue"
                style={{ color: 'var(--em-text-sub, #A7B5AC)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
                  <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
                  <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
                  <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" strokeWidth="3" />
                  <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" strokeWidth="3" />
                  <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" strokeWidth="3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="bottom-nav-tabs">
        {TABS.map(({ id, label, icon, action }) => {
          const active = id === 'settings' ? (showPrefs || view === 'settings') : (!showPrefs && view === id);
          return (
            <button
              key={id}
              className={`bottom-nav-tab${active ? ' bottom-nav-tab--active' : ''}`}
              onClick={action}
              style={active ? { '--tab-accent': 'var(--accent, #39E89A)' } : undefined}
            >
              <span className="bottom-nav-icon">{icon}</span>
              <span className="bottom-nav-label">{label}</span>
            </button>
          );
        })}
      </div>

    </nav>
  );
}
