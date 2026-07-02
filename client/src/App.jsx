/**
 * App.jsx — Entry shell
 *
 * Provider order (outermost → innermost):
 *   AuthProvider    → JWT auth state, login/logout/refresh
 *   AppProvider     → non-audio app state (language, tracks, prefs…)
 *   PlayerProvider  → audio engine + playback
 *   AuthGate        → shows AuthPage when not logged in, AppShell when logged in
 *
 * This file is intentionally thin. All logic lives in context/ and pages/.
 */
import { AuthProvider, useAuth } from './context/AuthContext';

import { AppProvider }          from './context/AppContext';
import { PlayerProvider }       from './context/PlayerContext';
import { AlbumThemeProvider }   from './context/AlbumThemeContext';
import { AppShell }             from './AppShell';
import { AuthPage }             from './pages/Auth/AuthPage';
import { setApiToken }          from './services/api';
import './index.css';

/**
 * AuthGate — conditionally renders the app or the login screen.
 * Also keeps the api.js token in sync with AuthContext whenever it changes.
 */
function AuthGate() {
  const { currentUser, accessToken, authLoading, refreshToken, logout } = useAuth();

  // ── Sync token SYNCHRONOUSLY (not in useEffect) ─────────────────────────
  // setApiToken just sets module-level variables — safe to call during render.
  // This MUST happen before children mount so their useEffect bootstrap calls
  // always have a valid token. A useEffect would run AFTER child effects.
  setApiToken(accessToken, refreshToken, logout);

  // While the initial silent-refresh is in progress, show nothing
  // (avoids a flash of the login page for users with a valid cookie)
  if (authLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base, #0a0f0d)',
        zIndex: 9999,
      }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid rgba(103,240,183,0.2)',
          borderTopColor: 'var(--accent, #67f0b7)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  return (
    <AppProvider>
      <PlayerProvider>
        <AlbumThemeProvider>
          <AppShell />
        </AlbumThemeProvider>
      </PlayerProvider>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
