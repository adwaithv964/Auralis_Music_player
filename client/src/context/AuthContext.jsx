/**
 * context/AuthContext.jsx
 *
 * Owns the entire authentication lifecycle:
 *  - currentUser   — null when logged out, object when logged in
 *  - accessToken   — short-lived JWT kept in memory ONLY (never localStorage)
 *  - login()       — POST /api/auth/login
 *  - register()    — POST /api/auth/register
 *  - logout()      — POST /api/auth/logout + clear all client state
 *  - refreshToken()— POST /api/auth/refresh (called silently on 401)
 *
 * Security notes:
 *  • The access token lives in React state (JS heap) — XSS cannot steal it
 *    from localStorage or sessionStorage.
 *  • The refresh token is an HTTP-only Secure cookie — JS cannot read it.
 *  • On logout we clear every auralis:* localStorage key to prevent leakage.
 *  • auralis:hasSession in localStorage serves ONLY as a non-sensitive hint
 *    to determine whether to attempt silent refresh on mount. It never
 *    authorizes access to protected data without server verification.
 */
import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';

export const AuthContext = createContext(null);

// All auralis localStorage keys to wipe on logout
const LS_KEYS = ['auralis:lastTrack', 'auralis:lastPosition', 'auralis:streamCache', 'auralis:hasSession'];

/** Wipe all user-specific localStorage on logout / account switch */
function clearLocalStorage() {
  LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

export function AuthProvider({ children }) {
  // Check if this browser has an active session hint from a prior login
  const hasSessionHint = typeof window !== 'undefined' && localStorage.getItem('auralis:hasSession') === '1';

  const [currentUser,  setCurrentUser]  = useState(null);
  const [accessToken,  setAccessToken]  = useState(null);
  // For first-time visitors (no session hint), authLoading is false IMMEDIATELY
  // so the public login page renders in 0ms without waiting for a backend cold start.
  const [authLoading,  setAuthLoading]  = useState(hasSessionHint);

  // Prevent double refresh-on-mount in StrictMode
  const refreshAttempted = useRef(false);
  // In-flight refresh promise deduplicator
  const refreshPromiseRef = useRef(null);

  // ── Silent refresh on app mount (Only for returning users with session hint) ─
  useEffect(() => {
    // First-time visitor or logged-out user: render public routes immediately
    if (!hasSessionHint) {
      setAuthLoading(false);
      return;
    }

    if (refreshAttempted.current) return;
    refreshAttempted.current = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout to prevent hanging

    fetch('/api/auth/refresh', {
      method:      'POST',
      credentials: 'include',
      signal:      controller.signal,
    })
      .then(async res => {
        if (!res.ok) {
          const isAuthRejection = res.status === 401 || res.status === 403;
          if (isAuthRejection) {
            // Truly invalid or expired session — clear session hint
            localStorage.removeItem('auralis:hasSession');
          }
          throw new Error(isAuthRejection ? 'Session expired' : `Server responded ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        localStorage.setItem('auralis:hasSession', '1');
        setAccessToken(data.accessToken);
        setCurrentUser(data.user);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          console.warn('[Auth] Initial refresh timed out (backend sleeping) — releasing login UI');
        } else {
          console.warn('[Auth] Initial refresh error:', err.message);
        }
        setCurrentUser(null);
        setAccessToken(null);
      })
      .finally(() => {
        clearTimeout(timer);
        setAuthLoading(false);
      });
  }, [hasSessionHint]);

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (username, email, password) => {
    const res = await fetch('/api/auth/register', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('auralis:hasSession', '1');
    setAccessToken(data.accessToken);
    setCurrentUser(data.user);
    return data.user;
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('auralis:hasSession', '1');
    setAccessToken(data.accessToken);
    setCurrentUser(data.user);
    return data.user;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) { /* best-effort */ }
    localStorage.removeItem('auralis:hasSession');
    clearLocalStorage();
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  // ── Silent token refresh (called by api.js on 401, deduplicated) ───────────
  const refreshToken = useCallback(async () => {
    // If a refresh is already in-flight, return the existing promise
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const doRefresh = async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch('/api/auth/refresh', {
          method:      'POST',
          credentials: 'include',
          signal:      ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) {
          localStorage.removeItem('auralis:hasSession');
          clearLocalStorage();
          setAccessToken(null);
          setCurrentUser(null);
          throw new Error('Session expired — please log in again');
        }
        const data = await res.json();
        localStorage.setItem('auralis:hasSession', '1');
        setAccessToken(data.accessToken);
        setCurrentUser(data.user);
        return data.accessToken;
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = doRefresh();
    return refreshPromiseRef.current;
  }, []);

  const value = {
    currentUser,
    accessToken,
    authLoading,
    login,
    register,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook for consuming AuthContext — throws if used outside AuthProvider */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};
