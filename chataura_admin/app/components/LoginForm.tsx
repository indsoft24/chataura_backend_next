'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminTier, tierFromUser } from '@/lib/tier';

type LoginResponse = {
  success: boolean;
  data?: {
    access_token?: string;
    user?: { role?: string; staff_badge_type?: string | null };
    otp_required?: boolean;
    challenge_id?: string;
    sent_to?: string[];
    resend_after?: number;
  };
  error?: { message?: string };
};

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
  // Step 2: the emailed code. `challenge` is set once the password was right.
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [wait, setWait] = useState(0);
  // Sending the code takes a few seconds; without this a second click mails a second code.
  const [busy, setBusy] = useState(false);
  // State updates land a tick late, so two fast clicks would both pass `busy`; the ref closes that gap at once.
  const inflight = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

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

  /** Stores the panel token once the tier is allowed; false (with the error set) when it is not. */
  function finishLogin(json: LoginResponse): boolean {
    if (!json.data?.access_token) {
      setError(json.error?.message ?? 'Login failed');
      return false;
    }
    const tier = tierFromUser(json.data.user?.role, json.data.user?.staff_badge_type ?? null);
    if (!accept(tier)) {
      setWrongTier(tier != null);
      setError(tier ? 'This account signs in on a different page.' : 'Admin access required');
      setChallenge(null);
      return false;
    }
    localStorage.setItem('ca_admin_token', json.data.access_token);
    localStorage.setItem('ca_admin_tier', tier as string);
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    document.cookie = `ca_admin_token=${encodeURIComponent(json.data.access_token)}; path=/; max-age=86400; SameSite=Lax; ${isHttps ? 'Secure;' : ''}`;
    return true;
  }

  function failure(err: any) {
    console.error(err);
    setError(err?.name === 'ApiError' && err?.message ? err.message : 'Network error: Unable to reach the server. Please ensure the backend is running.');
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!challenge || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError('');
    try {
      const json = await api<LoginResponse>('/auth/panel-otp/verify', null, {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challenge.id, code: code.trim(), trust_device: trust }),
      });
      if (finishLogin(json)) router.push('/');
    } catch (err: any) {
      // A used-up or expired code cannot be retried: go back to the password step.
      if (err?.name === 'ApiError' && err.status === 401) setChallenge(null);
      failure(err);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function onResend() {
    if (!challenge || wait > 0 || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const json = await api<{ data?: { sent_to?: string[]; resend_after?: number } }>('/auth/panel-otp/resend', null, {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challenge.id }),
      });
      setWait(json.data?.resend_after ?? 60);
      setNotice('A new code was sent.');
    } catch (err: any) {
      if (err?.name === 'ApiError' && err.status === 401) setChallenge(null);
      failure(err);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError('');
    setWrongTier(false);
    setNotice('');
    try {
      const json = await api<LoginResponse>('/auth/login', null, {
        method: 'POST',
        // Panel tokens are a separate channel, so logging in here never logs the admin out of the app.
        headers: { 'X-Client': 'admin-panel' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Login failed');
        return;
      }
      if (json.data?.otp_required && json.data.challenge_id) {
        setChallenge({ id: json.data.challenge_id, sentTo: json.data.sent_to ?? [] });
        setWait(json.data.resend_after ?? 60);
        setCode('');
        setPassword('');
        return;
      }
      if (!finishLogin(json)) return;
      router.push('/');
    } catch (err: any) {
      failure(err);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <h1>{title}</h1>
        {challenge ? (
          <form className="card" onSubmit={onVerify}>
            <p>
              Enter the 6-digit code sent to {challenge.sentTo.length ? challenge.sentTo.join(' and ') : 'your email'}.
            </p>
            <p>
              <input
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </p>
            <p>
              <label>
                <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> Trust this browser for 30 days
              </label>
            </p>
            {notice ? <p>{notice}</p> : null}
            {error ? <p className="err">{error}</p> : null}
            <button type="submit" disabled={busy || code.length !== 6}>Verify and sign in</button>
            <p>
              <a href="#" onClick={(e) => { e.preventDefault(); onResend(); }} style={wait > 0 || busy ? { opacity: 0.5 } : undefined}>
                {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </a>
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); setChallenge(null); setError(''); setNotice(''); }}>Back</a>
            </p>
          </form>
        ) : mode !== 'login' ? (
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
          <button type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Sign In to Dashboard'}</button>
          <p>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setError(''); setNotice(''); }}>Forgot password?</a>
          </p>
        </form>
        )}
      </div>
    </main>
  );
}
