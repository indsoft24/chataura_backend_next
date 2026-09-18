'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const json = await api<{
        success: boolean;
        data?: { access_token: string; user?: { role?: string } };
        error?: { message?: string };
      }>('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!json.success || !json.data?.access_token) {
        setError(json.error?.message ?? 'Login failed');
        return;
      }
      if (json.data.user?.role !== 'admin') {
        setError('Admin role required');
        return;
      }
      localStorage.setItem('ca_admin_token', json.data.access_token);
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      document.cookie = `ca_admin_token=${encodeURIComponent(json.data.access_token)}; path=/; max-age=86400; SameSite=Lax; ${isHttps ? 'Secure;' : ''}`;
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError('Network error: Unable to reach the server. Please ensure the backend is running.');
    }
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <h1>ChatAura Admin</h1>
        <form className="card" onSubmit={onSubmit}>
          <p>
            <input
              placeholder="admin@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
          <button type="submit">Sign In to Dashboard</button>
        </form>
      </div>
    </main>
  );
}
