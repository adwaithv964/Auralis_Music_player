/**
 * pages/Auth/AuthPage.jsx
 *
 * Full-screen login / register page.
 * Shown when currentUser === null.
 *
 * Design: matches the existing dark glass aesthetic —
 *   uses the same CSS variables (--accent, --bg-*, --glass-*) defined in index.css.
 * Does NOT modify any existing component.
 */
import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── Micro-components ──────────────────────────────────────────────────────────

function InputField({ id, label, type = 'text', value, onChange, placeholder, autoComplete }) {
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="auth-input"
        spellCheck={false}
      />
    </div>
  );
}

function AuthButton({ loading, children, ...rest }) {
  return (
    <button className={`auth-btn${loading ? ' auth-btn--loading' : ''}`} disabled={loading} {...rest}>
      {loading ? (
        <span className="auth-spinner" aria-label="Loading…" />
      ) : children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuthPage() {
  const { login, register } = useAuth();

  const [tab,      setTab]      = useState('login');    // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const switchTab = (t) => {
    setTab(t);
    setError('');
    setEmail('');
    setUsername('');
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password)     { setError('Password is required'); return; }

    if (tab === 'register') {
      if (!username.trim())     { setError('Username is required'); return; }
      if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
      if (password !== confirm)  { setError('Passwords do not match'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        await register(username.trim(), email.trim(), password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [tab, email, username, password, confirm, login, register]);

  return (
    <div className="auth-page">
      {/* Ambient background blobs */}
      <div className="auth-blob auth-blob--1" aria-hidden="true" />
      <div className="auth-blob auth-blob--2" aria-hidden="true" />

      <div className="auth-card" role="main">
        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <circle cx="20" cy="20" r="18" stroke="var(--accent)" strokeWidth="2" />
              <path d="M15 14v12M20 11v18M25 14v12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="auth-brand-name">Auralis</h1>
          <p className="auth-brand-tagline">Your personal music universe</p>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'login'}
            className={`auth-tab${tab === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => switchTab('login')}
            id="tab-login"
          >
            Sign In
          </button>
          <button
            role="tab"
            aria-selected={tab === 'register'}
            className={`auth-tab${tab === 'register' ? ' auth-tab--active' : ''}`}
            onClick={() => switchTab('register')}
            id="tab-register"
          >
            Create Account
          </button>
          <div
            className="auth-tab-indicator"
            style={{ transform: tab === 'login' ? 'translateX(0%)' : 'translateX(100%)' }}
            aria-hidden="true"
          />
        </div>

        {/* Form */}
        <form
          className="auth-form"
          onSubmit={handleSubmit}
          aria-labelledby={`tab-${tab}`}
          noValidate
        >
          {tab === 'register' && (
            <InputField
              id="auth-username"
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="Choose a username"
              autoComplete="username"
            />
          )}

          <InputField
            id="auth-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
          />

          <InputField
            id="auth-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={tab === 'register' ? 'At least 8 characters' : 'Your password'}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />

          {tab === 'register' && (
            <InputField
              id="auth-confirm"
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat your password"
              autoComplete="new-password"
            />
          )}

          {/* Error message */}
          {error && (
            <div className="auth-error" role="alert">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.5h1.5v4.5h-1.5V4.5zm0 6h1.5v1.5h-1.5V10.5z"/>
              </svg>
              {error}
            </div>
          )}

          <AuthButton loading={loading} type="submit" id={`auth-submit-${tab}`}>
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </AuthButton>
        </form>

        {/* Footer hint */}
        <p className="auth-footer">
          {tab === 'login'
            ? <>New here?{' '}<button className="auth-link" onClick={() => switchTab('register')}>Create a free account</button></>
            : <>Already have an account?{' '}<button className="auth-link" onClick={() => switchTab('login')}>Sign in</button></>
          }
        </p>
      </div>

      <style>{`
        /* ── Auth page styles ─────────────────────────────────────── */
        .auth-page {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base, #0a0f0d);
          z-index: 9999;
          overflow: hidden;
        }

        /* Animated ambient blobs */
        .auth-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.18;
          pointer-events: none;
          animation: auth-float 8s ease-in-out infinite alternate;
        }
        .auth-blob--1 {
          width: 500px; height: 500px;
          background: var(--accent, #67f0b7);
          top: -120px; left: -120px;
          animation-delay: 0s;
        }
        .auth-blob--2 {
          width: 400px; height: 400px;
          background: #7cc7ff;
          bottom: -100px; right: -80px;
          animation-delay: -4s;
        }
        @keyframes auth-float {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(40px, 30px) scale(1.08); }
        }

        /* Glass card */
        .auth-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          margin: 1rem;
          padding: 2.5rem 2.25rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
          animation: auth-card-in 0.4s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes auth-card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Brand */
        .auth-brand {
          text-align: center;
          margin-bottom: 2rem;
        }
        .auth-brand-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px; height: 56px;
          border-radius: 16px;
          background: rgba(103,240,183,0.1);
          border: 1px solid rgba(103,240,183,0.2);
          margin-bottom: 0.75rem;
        }
        .auth-brand-name {
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: var(--text-primary, #f0f0f0);
          margin: 0 0 0.25rem;
        }
        .auth-brand-tagline {
          font-size: 0.83rem;
          color: var(--text-secondary, rgba(240,240,240,0.5));
          margin: 0;
        }

        /* Tabs */
        .auth-tabs {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
          padding: 3px;
          margin-bottom: 1.75rem;
          overflow: hidden;
        }
        .auth-tab {
          position: relative;
          z-index: 1;
          padding: 0.55rem 1rem;
          border: none;
          background: transparent;
          color: var(--text-secondary, rgba(240,240,240,0.55));
          font-size: 0.85rem;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: color 0.2s;
          font-family: inherit;
        }
        .auth-tab--active {
          color: var(--text-primary, #f0f0f0);
        }
        .auth-tab-indicator {
          position: absolute;
          top: 3px; bottom: 3px;
          left: 3px;
          width: calc(50% - 3px);
          background: rgba(255,255,255,0.09);
          border-radius: 8px;
          transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
          pointer-events: none;
        }

        /* Form */
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .auth-label {
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--text-secondary, rgba(240,240,240,0.6));
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .auth-input {
          width: 100%;
          padding: 0.7rem 0.9rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: var(--text-primary, #f0f0f0);
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
          box-sizing: border-box;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.25); }
        .auth-input:focus {
          border-color: var(--accent, #67f0b7);
          background: rgba(103,240,183,0.05);
        }
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #111815 inset;
          -webkit-text-fill-color: #f0f0f0;
        }

        /* Error */
        .auth-error {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.6rem 0.9rem;
          background: rgba(255,80,80,0.1);
          border: 1px solid rgba(255,80,80,0.25);
          border-radius: 8px;
          color: #ff8080;
          font-size: 0.83rem;
          animation: auth-shake 0.35s cubic-bezier(0.36,0.07,0.19,0.97);
        }
        @keyframes auth-shake {
          0%,100% { transform: translateX(0); }
          20%,60%  { transform: translateX(-4px); }
          40%,80%  { transform: translateX(4px); }
        }

        /* Submit button */
        .auth-btn {
          margin-top: 0.25rem;
          padding: 0.75rem 1rem;
          background: var(--accent, #67f0b7);
          color: #0a0f0d;
          border: none;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
        }
        .auth-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .auth-btn:active:not(:disabled) { transform: translateY(0); }
        .auth-btn--loading { opacity: 0.7; cursor: not-allowed; }

        /* Spinner */
        .auth-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(10,15,13,0.3);
          border-top-color: #0a0f0d;
          border-radius: 50%;
          animation: auth-spin 0.65s linear infinite;
          display: inline-block;
        }
        @keyframes auth-spin { to { transform: rotate(360deg); } }

        /* Footer */
        .auth-footer {
          margin: 1.25rem 0 0;
          text-align: center;
          font-size: 0.83rem;
          color: var(--text-secondary, rgba(240,240,240,0.45));
        }
        .auth-link {
          background: none;
          border: none;
          color: var(--accent, #67f0b7);
          font-size: inherit;
          font-family: inherit;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .auth-link:hover { opacity: 0.8; }
      `}</style>
    </div>
  );
}
