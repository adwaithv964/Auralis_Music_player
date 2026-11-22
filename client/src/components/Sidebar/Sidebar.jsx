import { useApp } from '../../context/AppContext';

/**
 * Sidebar — Auralis Emerald Midnight redesign
 *
 * Props:
 *   collapsed        — boolean, icon-only mode
 *   onToggleCollapse — callback to flip collapsed state
 *   openPlaylistModal — callback to open the new-playlist modal
 *
 * On mobile: full-screen overlay drawer when mobileNavOpen === true.
 */
export function Sidebar({ collapsed = false, onToggleCollapse, openPlaylistModal: propOpenPlaylistModal }) {
  const {
    language, changeLanguage,
    mobileNavOpen, setMobileNavOpen,
    setShowPrefs,
    playlists: ctxPlaylists,
    prefs,
    currentUser,
    logout,
    navigateTo,
    view,
    openPlaylistModal: ctxOpenPlaylistModal,
  } = useApp();

  const openPlaylist = propOpenPlaylistModal || ctxOpenPlaylistModal;
  const isActive = (v) => view === v;

  // Fallback playlists matching the design reference when none are loaded yet
  const displayPlaylists = (ctxPlaylists && ctxPlaylists.length > 0)
    ? ctxPlaylists
    : [
        { id: 'ref-1', name: 'Malayalam Hits', count: 24, artworkUrl: '/assets/auralis/home/malayalam-mix.webp' },
        { id: 'ref-2', name: 'Chill Vibes', count: 18, artworkUrl: '/assets/auralis/home/daily-mix-2.webp' },
        { id: 'ref-3', name: 'Focus Mode', count: 32, artworkUrl: '/assets/auralis/home/focus-mix.webp' },
      ];

  // ── Nav items ────────────────────────────────────────────────
  const NAV_MAIN = [
    {
      id: 'home', label: 'Home', view: 'home',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      ),
      action: () => { navigateTo('home'); setMobileNavOpen(false); },
    },
    {
      id: 'search', label: 'Search', view: 'search',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
      ),
      action: () => { navigateTo('search'); setMobileNavOpen(false); },
    },
    {
      id: 'library', label: 'Your Library', view: 'library',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M3 6h2v12H3zm4-2h2v16H7zm4 4h2v12h-2zm4-6h2v18h-2zm4 2h2v14h-2z" />
        </svg>
      ),
      action: () => { navigateTo('library'); setMobileNavOpen(false); },
    },
  ];

  const NAV_SUB = [
    {
      id: 'playlists', label: 'Playlists', view: 'library',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
        </svg>
      ),
      action: () => { navigateTo('library'); setMobileNavOpen(false); },
    },
    {
      id: 'favorites', label: 'Favorites', view: 'library',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: () => { navigateTo('library'); setMobileNavOpen(false); },
    },
    {
      id: 'downloads', label: 'Downloads', view: null,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
        </svg>
      ),
      action: () => {}, // no-op for now
    },
  ];

  const accentColor = '#39E89A';
  const accentBg    = 'rgba(57,232,154,0.12)';

  const navItemStyle = (active) => ({
    display:        'flex',
    alignItems:     'center',
    gap:            collapsed ? 0 : 10,
    padding:        collapsed ? '10px 0' : '9px 12px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius:   10,
    border:         'none',
    cursor:         'pointer',
    width:          '100%',
    background:     active ? accentBg : 'transparent',
    color:          active ? accentColor : 'var(--text-muted, #75877C)',
    fontWeight:     active ? 600 : 400,
    fontSize:       '0.9rem',
    transition:     'background 150ms, color 150ms',
  });

  const songCount = (p) => p.count ?? p.songs?.length ?? 0;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`sidebar glass-panel${mobileNavOpen ? ' sidebar--mobile-open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`}
        style={{ padding: '12px 10px 8px', gap: 6, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        aria-label="Navigation"
      >
        {/* ── Brand row ─────────────────────────────────────────── */}
        <div className="sidebar-brand-row">
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              className="brand-mark"
              style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                width:           36,
                height:          36,
                borderRadius:    10,
                flexShrink:      0,
                overflow:        'hidden',
                background:      'rgba(57,232,154,0.10)',
              }}
            >
              <img
                src="/assets/logo_1.png"
                alt="Auralis logo"
                width={28}
                height={28}
                style={{ objectFit: 'contain' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </span>

            {!collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                <span className="brand-name" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #F5F8F6)', whiteSpace: 'nowrap' }}>
                  Auralis
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #75877C)', whiteSpace: 'nowrap' }}>
                  Music Player
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              width="16"
              height="16"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 250ms' }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Mobile close button */}
          <button
            className="sidebar-close-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mobile header (shown via CSS inside mobile drawer) */}
        <div className="sidebar-mobile-header">
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="brand-mark"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(57,232,154,0.10)', overflow: 'hidden', flexShrink: 0 }}
            >
              <img src="/assets/logo_1.png" alt="" width={28} height={28} style={{ objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span className="brand-name" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #F5F8F6)' }}>Auralis</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #75877C)' }}>Music Player</span>
            </div>
          </div>
        </div>

        {/* ── Main navigation ───────────────────────────────────── */}
        <nav style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_MAIN.map((item) => (
            <button
              key={item.id}
              style={navItemStyle(isActive(item.view) && item.view != null)}
              onClick={item.action}
              title={collapsed ? item.label : undefined}
              onMouseEnter={(e) => { if (!isActive(item.view)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { if (!isActive(item.view)) e.currentTarget.style.background = 'transparent'; }}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}

          {NAV_SUB.map((item) => (
            <button
              key={item.id}
              style={navItemStyle(false)}
              onClick={item.action}
              title={collapsed ? item.label : undefined}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-primary, #F5F8F6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-sub, #A7B5AC)'; }}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* ── Playlist section ──────────────────────────────────── */}
        {!collapsed && (
          <section style={{ padding: '0 12px 8px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {/* New Playlist Action */}
            <button
              onClick={() => openPlaylist?.()}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: 'transparent', border: 'none',
                color: 'var(--text-primary, #F5F8F6)', padding: '8px 4px 12px',
                cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = accentColor; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-primary, #F5F8F6)'; }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              New Playlist
            </button>

            {displayPlaylists.map((p) => (
              <button
                key={p.id}
                className="playlist-item"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', background: 'transparent', border: 'none',
                  borderRadius: 8, padding: '7px 6px', cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => navigateTo('library')}
              >
                {/* Artwork */}
                <div
                  className="playlist-icon"
                  style={{
                    width: 38, height: 38, flexShrink: 0,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: `linear-gradient(135deg, rgba(57,232,154,0.2), #142920)`,
                  }}
                >
                  {p.artworkUrl ? (
                    <img
                      src={p.artworkUrl}
                      alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${accentColor}, #20C982)`, opacity: 0.85 }} />
                  )}
                </div>
                <div className="playlist-meta" style={{ minWidth: 0, flex: 1 }}>
                  <span className="playlist-name" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #F5F8F6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </span>
                  <span className="playlist-count" style={{ fontSize: '0.74rem', color: 'var(--text-muted, #75877C)' }}>
                    {songCount(p)} songs
                  </span>
                </div>
              </button>
            ))}
          </section>
        )}

        {/* ── Ambient wave graphic decor ────────────────────────── */}
        {!collapsed && (
          <div style={{ padding: '0 8px', pointerEvents: 'none', opacity: 0.45, maxHeight: 42, overflow: 'hidden' }}>
            <svg viewBox="0 0 200 40" fill="none" width="100%" height="40" preserveAspectRatio="none">
              <path d="M0 25 C40 10, 80 35, 120 20 C160 5, 180 28, 200 15" stroke="#39E89A" strokeWidth="1.5" strokeOpacity="0.5" />
              <path d="M0 32 C30 18, 90 38, 140 22 C170 14, 190 30, 200 24" stroke="#20C982" strokeWidth="1" strokeOpacity="0.3" />
            </svg>
          </div>
        )}

        {/* ── Account section ───────────────────────────────────── */}
        <div
          style={{
            padding:       collapsed ? '12px 8px' : '12px 16px',
            borderTop:     '1px solid rgba(255,255,255,0.07)',
            display:       'flex',
            alignItems:    'center',
            gap:           collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          {/* Avatar */}
          <div
            className="sidebar-user-avatar"
            title={currentUser?.username || 'cybershield929'}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: accentColor,
              color: '#06100D', fontWeight: 700, fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {(currentUser?.username?.[0] || 'C').toUpperCase()}
          </div>

          {!collapsed && (
            <>
              <div className="sidebar-user-info" style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="sidebar-user-name"
                  style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #F5F8F6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {currentUser?.username || 'cybershield929'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #75877C)' }}>
                  {currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : 'Free Plan'}
                </span>
              </div>

              {/* Settings gear */}
              <button
                className="action-row"
                onClick={() => { setShowPrefs(true); setMobileNavOpen(false); }}
                title="Preferences"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted, #75877C)', padding: 6, borderRadius: 8,
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center',
                  transition: 'color 150ms, background 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary, #F5F8F6)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted, #75877C)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
