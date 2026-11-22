/**
 * App.jsx — Entry shell
 *
 * Provider order (outermost → innermost):
 *   AuthProvider    → JWT auth state, login/logout/refresh
 *   AppProvider     → non-audio app state (language, tracks, prefs…)
 *   PlayerProvider  → audio engine + playback
 *   AuthGate        → shows AuthPage when not logged in, AppShell when logged in
 *
 * Optimization: AppShell is code-split / lazy-loaded so that unauthenticated
 * and first-time visitors download only the lightweight auth bundle (~30kB)
 * and view the login screen immediately without loading heavy audio engines,
 * waveform visualizers, or vibrance color palettes.
 */
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider }          from './context/AppContext';
import { PlayerProvider }       from './context/PlayerContext';
import { AlbumThemeProvider }   from './context/AlbumThemeContext';
import { AuthPage }             from './pages/Auth/AuthPage';
import { setApiToken }          from './services/api';
import './index.css';

// Lazy-load the heavy music application shell
const AppShell = lazy(() => import('./AppShell').then(m => ({ default: m.AppShell })));

function FullScreenSpinner() {
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

/**
 * AuthGate — conditionally renders the app or the login screen.
 * Keeps api.js token in sync with AuthContext whenever it changes.
 */
function AuthGate() {
  const { currentUser, accessToken, authLoading, refreshToken, logout } = useAuth();

  // Sync token synchronously before child components mount
  setApiToken(accessToken, refreshToken, logout);

  // Silent-refresh in progress for returning users with an active session hint
  if (authLoading) {
    return <FullScreenSpinner />;
  }

  // Not logged in: show public login/register UI immediately
  if (!currentUser) {
    return <AuthPage />;
  }

  // Logged in: mount the application with lazy-loaded AppShell
  return (
    <AppProvider>
      <PlayerProvider>
        <AlbumThemeProvider>
          <Suspense fallback={<FullScreenSpinner />}>
            <AppShell />
          </Suspense>
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
