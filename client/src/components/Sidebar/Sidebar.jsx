import { useApp }    from '../../context/AppContext';
import { LANGUAGES }  from '../../utils/constants';

/**
 * Sidebar
 * Left navigation panel.
 * - Brand logo
 * - Preferences button
 * - Language quick-links
 * - Playlist strip
 *
 * On mobile: shown as a full-screen drawer when mobileNavOpen is true.
 */
export function Sidebar() {
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
        className={`sidebar glass-panel${mobileNavOpen ? ' sidebar--mobile-open' : ''}`}
        aria-label="Navigation"
      >
        {/* Mobile header row: brand + close button */}
        <div className="sidebar-mobile-header">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">Auralis</span>
          </div>
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

        {/* Preferences */}
        <div className="sidebar-actions">
          <button className="action-row" onClick={() => setShowPrefs(true)}>
            <svg><use href="#i-settings" /></svg>
            <span>Preferences</span>
          </button>
        </div>

        {/* Language quick-links */}
        <div className="sidebar-lang-strip">
          <p className="section-kicker" style={{ marginBottom: 8 }}>Languages</p>
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              className={`sidebar-lang-btn${language === l.id ? ' active' : ''}`}
              onClick={() => changeLanguage(l.id)}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>

        {/* Playlists */}
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
      </aside>
    </>
  );
}
