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
 */
import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';

export const AuthContext = createContext(null);

// All auralis localStorage keys to wipe on logout
const LS_KEYS = ['auralis:lastTrack', 'auralis:lastPosition', 'auralis:streamCache'];

/** Wipe all user-specific localStorage on logout / account switch */
function clearLocalStorage() {
  LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [accessToken,  setAccessToken]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true); // true during initial refresh attempt

  // Prevent double refresh-on-mount in StrictMode
  const refreshAttempted = useRef(false);

  // ── Silent refresh on app mount ────────────────────────────────────────────
  // Try to exchange the HTTP-only refresh cookie for a new access token.
  // If it fails (no cookie / expired) the user just stays logged out.
  useEffect(() => {
    if (refreshAttempted.current) return;
    refreshAttempted.current = true;

    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('no session');
        return res.json();
      })
      .then(data => {
        setAccessToken(data.accessToken);
        setCurrentUser(data.user);
      })
      .catch(() => {
        // No active session or server not yet ready — user sees login screen
        setCurrentUser(null);
        setAccessToken(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

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
    setAccessToken(data.accessToken);
    setCurrentUser(data.user);
    return data.user;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) { /* best-effort */ }
    clearLocalStorage();
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  // ── Silent token refresh (called by api.js on 401) ─────────────────────────
  const refreshToken = useCallback(async () => {
    const res = await fetch('/api/auth/refresh', {
      method:      'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      // Refresh failed — force logout
      clearLocalStorage();
      setAccessToken(null);
      setCurrentUser(null);
      throw new Error('Session expired — please log in again');
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setCurrentUser(data.user);
    return data.accessToken;
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
