'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type UserRow = {
  id: number;
  email?: string;
  display_name?: string;
  role?: string;
  is_star_account?: boolean;
  account_status?: string;
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');

  async function load(token: string, query = '') {
    const json = await api<{
      success: boolean;
      data?: { users: UserRow[] };
    }>(`/admin/users?q=${encodeURIComponent(query)}`, token);
    setUsers(json.data?.users ?? []);
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  return (
    <main>
      <p>
        <Link href="/">Dashboard</Link> · <Link href="/staff">Staff</Link> ·{' '}
        <Link href="/packages">Packages</Link>
      </p>
      <h1>Users</h1>
      <p>
        <input
          placeholder="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            const token = localStorage.getItem('ca_admin_token');
            if (token) void load(token, q);
          }}
        >
          Search
        </button>
      </p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.email}</td>
              <td>{u.display_name}</td>
              <td>{u.role}</td>
              <td>{u.account_status}</td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    const token = localStorage.getItem('ca_admin_token');
                    if (!token) return;
                    void api(`/admin/users/${u.id}/deactivate`, token, {
                      method: 'POST',
                      body: JSON.stringify({ reason: 'admin' }),
                    }).then(() => load(token, q));
                  }}
                >
                  Deactivate
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
