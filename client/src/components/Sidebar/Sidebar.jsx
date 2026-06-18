import { useApp }    from '../../context/AppContext';
import { LANGUAGES }  from '../../utils/constants';

/**
 * Sidebar
 * Left navigation panel with fold/unfold support.
 *
 * Props:
 *   collapsed        — boolean, is it in icon-only mode?
 *   onToggleCollapse — callback to flip the collapsed state
 *
 * On mobile: shown as a full-screen drawer when mobileNavOpen is true.
 */
export function Sidebar({ collapsed = false, onToggleCollapse }) {
  const {
    language, changeLanguage,
    mobileNavOpen, setMobileNavOpen,
    setShowPrefs,
    playlists,
    prefs,
  } = useApp();

  return (
    <>
      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`sidebar glass-panel${mobileNavOpen ? ' sidebar--mobile-open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`}
        aria-label="Navigation"
      >
        {/* ── Brand + collapse toggle ── */}
        <div className="sidebar-brand-row">
          <div className="brand">
            <span className="brand-mark" />
            {!collapsed && <span className="brand-name">Auralis</span>}
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

        {/* Mobile header */}
        <div className="sidebar-mobile-header">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">Auralis</span>
          </div>
        </div>

        {/* Preferences */}
        <div className="sidebar-actions">
          <button
            className="action-row"
            onClick={() => setShowPrefs(true)}
            title="Preferences"
          >
            <svg><use href="#i-settings" /></svg>
            {!collapsed && <span>Preferences</span>}
          </button>
        </div>

        {/* Language quick-links */}
        <div className="sidebar-lang-strip">
          {!collapsed && <p className="section-kicker" style={{ marginBottom: 8 }}>Languages</p>}
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              className={`sidebar-lang-btn${language === l.id ? ' active' : ''}`}
              onClick={() => changeLanguage(l.id)}
              title={collapsed ? l.label : undefined}
            >
              <span>{l.flag}</span>
              {!collapsed && <span>{l.label}</span>}
            </button>
          ))}
        </div>

        {/* Playlists — hide in collapsed mode */}
        {!collapsed && (
          <section className="playlist-strip">
            <p className="section-kicker">Playlists</p>
            {playlists.map(p => (
              <button key={p.id} className="playlist-item">
                <div className="playlist-icon" style={{ backgroundColor: prefs.accent }} />
                <div className="playlist-meta">
                  <span className="playlist-name">{p.name}</span>
                  <span className="playlist-count">{p.count} songs</span>
                </div>
              </button>
            ))}
          </section>
        )}
      </aside>
    </>
  );
}
