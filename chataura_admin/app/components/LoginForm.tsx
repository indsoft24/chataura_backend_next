'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminTier, tierFromUser } from '@/lib/tier';

/**
 * Shared panel login. `accept` decides which tiers this panel allows; a wrong tier gets an
 * error and, when `alt` is given, a link to the other panel (a plain <a>: it crosses basePaths).
 */
export function LoginForm({
  title,
  accept,
  alt,
}: {
  title: string;
  accept: (tier: AdminTier | null) => boolean;
  alt?: { href: string; label: string };
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [wrongTier, setWrongTier] = useState(false);
  // Google-only app accounts have a random password, so staff set one here via email OTP.
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState('');

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot-password', null, { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
        setMode('reset');
        setNotice('If this email has an account, a 6-digit code was sent to it.');
        return;
      }
      await api('/auth/reset-password', null, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), password }),
      });
      setMode('login');
      setOtp('');
      setPassword('');
      setNotice('Password updated. Sign in with the new password.');
    } catch (err: any) {
      setError(err?.name === 'ApiError' && err?.message ? err.message : 'Network error: Unable to reach the server.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setWrongTier(false);
    setNotice('');
    try {
      const json = await api<{
        success: boolean;
        data?: { access_token: string; user?: { role?: string; staff_badge_type?: string | null } };
        error?: { message?: string };
      }>('/auth/login', null, {
        method: 'POST',
        // Panel tokens are a separate channel, so logging in here never logs the admin out of the app.
        headers: { 'X-Client': 'admin-panel' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!json.success || !json.data?.access_token) {
        setError(json.error?.message ?? 'Login failed');
        return;
      }
      const tier = tierFromUser(json.data.user?.role, json.data.user?.staff_badge_type ?? null);
      if (!accept(tier)) {
        setWrongTier(tier != null);
        setError(tier ? 'This account signs in on a different page.' : 'Admin access required');
        return;
      }
      localStorage.setItem('ca_admin_token', json.data.access_token);
      localStorage.setItem('ca_admin_tier', tier as string);
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      document.cookie = `ca_admin_token=${encodeURIComponent(json.data.access_token)}; path=/; max-age=86400; SameSite=Lax; ${isHttps ? 'Secure;' : ''}`;
      router.push('/');
    } catch (err: any) {
      console.error(err);
      if (err?.name === 'ApiError' && err?.message) {
        setError(err.message);
        return;
      }
      setError('Network error: Unable to reach the server. Please ensure the backend is running.');
    }
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <h1>{title}</h1>
        {mode !== 'login' ? (
          <form className="card" onSubmit={onForgot}>
            <p>
              <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === 'reset'} />
            </p>
            {mode === 'reset' ? (
              <>
                <p>
                  <input placeholder="6-digit code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
                </p>
                <p>
                  <input type="password" placeholder="new password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
                </p>
              </>
            ) : null}
            {notice ? <p>{notice}</p> : null}
            {error ? <p className="err">{error}</p> : null}
            <button type="submit">{mode === 'forgot' ? 'Send code' : 'Set new password'}</button>
            <p>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(''); setNotice(''); }}>Back to sign in</a>
            </p>
          </form>
        ) : (
        <form className="card" onSubmit={onSubmit}>
          <p>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </p>
          <p>
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </p>
          {error ? <p className="err">{error}</p> : null}
          {wrongTier && alt ? (
            <p>
              <a href={alt.href}>{alt.label}</a>
            </p>
          ) : null}
          {notice ? <p>{notice}</p> : null}
          <button type="submit">Sign In to Dashboard</button>
          <p>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setError(''); setNotice(''); }}>Forgot password?</a>
          </p>
        </form>
        )}
      </div>
    </main>
  );
}
