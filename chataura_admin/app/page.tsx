'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Dash = {
  users: number;
  live_rooms: number;
  coin_burn_today: number;
  recharge_today: number;
  reports: number;
  pending_withdrawals: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void api<{ success: boolean; data?: Dash; error?: { message?: string } }>(
      '/admin/dashboard',
      token,
    ).then((json) => {
      if (!json.success) {
        setError(json.error?.message ?? 'Unauthorized');
        if (json.error?.message) router.replace('/login');
        return;
      }
      setData(json.data ?? null);
    });
  }, [router]);

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        <Link href="/users">Users</Link> · <Link href="/staff">Staff</Link> ·{' '}
        <Link href="/packages">Packages</Link>
      </p>
      {error ? <p className="err">{error}</p> : null}
      {data ? (
        <div className="grid">
          {Object.entries(data).map(([k, v]) => (
            <div className="card" key={k}>
              <div>{k.replaceAll('_', ' ')}</div>
              <strong>{String(v)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  );
}
