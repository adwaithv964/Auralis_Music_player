import { useApp }    from '../../context/AppContext';
import { useAudioEngineContext } from '../../audio/AudioEngineContext';
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
    currentUser,
    logout,
  } = useApp();
  const { openAudioExperience, dspSettings, eqSettings } = useAudioEngineContext();

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

        {/* ── User identity + actions ── */}
        <div className="sidebar-actions">
          {/* User avatar / name */}
          {currentUser && !collapsed && (
            <div className="sidebar-user-row">
              <div className="sidebar-user-avatar" aria-hidden="true">
                {currentUser.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{currentUser.username}</span>
                <span className="sidebar-user-role">{currentUser.role || 'listener'}</span>
              </div>
            </div>
          )}
          {currentUser && collapsed && (
            <div
              className="sidebar-user-avatar sidebar-user-avatar--alone"
              title={currentUser.username}
              aria-label={`Logged in as ${currentUser.username}`}
            >
              {currentUser.username?.[0]?.toUpperCase() || 'U'}
            </div>
          )}

          {/* Audio Experience DSP & EQ Studio */}
          <button
            className={`action-row${dspSettings.engineEnabled || eqSettings.eqEnabled ? ' active' : ''}`}
            onClick={() => { openAudioExperience('engine'); setMobileNavOpen(false); }}
            title="Audio Experience (DSP & EQ Studio)"
            style={(dspSettings.engineEnabled || eqSettings.eqEnabled) ? { color: '#67f0b7' } : {}}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            {!collapsed && <span>Audio Experience</span>}
          </button>

          {/* Settings */}
          <button
            className="action-row"
            onClick={() => { setShowPrefs(true); setMobileNavOpen(false); }}
            title="Preferences"
          >
            <svg><use href="#i-settings" /></svg>
            {!collapsed && <span>Preferences</span>}
          </button>

          {/* Logout */}
          <button
            className="action-row action-row--danger"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!collapsed && <span>Sign Out</span>}
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
