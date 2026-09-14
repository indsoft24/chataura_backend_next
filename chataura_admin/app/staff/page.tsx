'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type StaffRow = {
  id: number;
  email?: string;
  display_name?: string;
  role?: string;
  account_status?: string;
  business?: {
    rooms_hosted_today: number;
    gift_coins_today: number;
    recharge_coins_today: number;
  };
};

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    const json = await api<{ success: boolean; data?: { staff: StaffRow[] } }>(
      '/admin/staff',
      token,
    );
    setStaff(json.data?.staff ?? []);
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function linkExisting() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token || !userId) return;
    const json = await api<{ success: boolean; error?: { message?: string } }>(
      `/admin/users/${userId}/link`,
      token,
      { method: 'POST', body: JSON.stringify({ role: 'admin' }) },
    );
    if (!json.success) {
      setError(json.error?.message ?? 'Link failed');
      return;
    }
    setError('');
    setUserId('');
    void load(token);
  }

  return (
    <main>
      <p>
        <Link href="/">Dashboard</Link> · <Link href="/users">Users</Link> ·{' '}
        <Link href="/packages">Packages</Link>
      </p>
      <h1>Staff</h1>
      <p>
        <input
          placeholder="existing user id"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button type="button" onClick={() => void linkExisting()}>
          Link as admin
        </button>
      </p>
      {error ? <p className="err">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Rooms today</th>
            <th>Gift coins today</th>
            <th>Recharge today</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.display_name ?? s.email}</td>
              <td>{s.role}</td>
              <td>{s.business?.rooms_hosted_today ?? 0}</td>
              <td>{s.business?.gift_coins_today ?? 0}</td>
              <td>{s.business?.recharge_coins_today ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
