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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setWrongTier(false);
    try {
      const json = await api<{
        success: boolean;
        data?: { access_token: string; user?: { role?: string; staff_badge_type?: string | null } };
        error?: { message?: string };
      }>('/auth/login', null, {
        method: 'POST',
        // Panel tokens are a separate channel, so logging in here never logs the admin out of the app.
        headers: { 'X-Client': 'admin-panel' },
        body: JSON.stringify({ email, password }),
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
          <button type="submit">Sign In to Dashboard</button>
        </form>
      </div>
    </main>
  );
}
