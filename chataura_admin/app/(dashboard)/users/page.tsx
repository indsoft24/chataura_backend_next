'use client';

import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

  async function load(token: string, query = '') {
    setLoading(true);
    try {
      const json = await api<{
        success: boolean;
        data?: { users: UserRow[] };
      }>(`/admin/users?q=${encodeURIComponent(query)}`, token);
      setUsers(json.data?.users ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function performAction(userId: number, action: string, body: Record<string, unknown> = {}) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    await api(`/admin/users/${userId}/${action}`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    void load(token, q);
  }

  async function toggleStar(userId: number, currentStar: boolean) {
    await performAction(userId, 'star', { is_star: !currentStar });
  }

  async function changeRole(userId: number, role: string) {
    await performAction(userId, 'link', { role });
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Management</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>View, search, assign roles, verify star creators, and manage user accounts.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <input
            placeholder="Search by name or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const token = localStorage.getItem('ca_admin_token');
                if (token) void load(token, q);
              }
            }}
            style={{ maxWidth: '400px', margin: 0 }}
          />
          <button
            type="button"
            onClick={() => {
              const token = localStorage.getItem('ca_admin_token');
              if (token) void load(token, q);
            }}
            style={{ width: 'auto' }}
          >
            Search
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>ID</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>User Info</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Role</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'center' }}>Star Creator</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Status</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>#{u.id}</td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{u.display_name ?? 'Unknown'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{u.email ?? 'No email registered'}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <select
                        value={u.role ?? 'user'}
                        onChange={(e) => void changeRole(u.id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: '1px solid #d1d5db',
                          background: u.role === 'admin' ? '#fee2e2' : u.role === 'seller' ? '#fef3c7' : '#e0e7ff',
                          color: u.role === 'admin' ? '#991b1b' : u.role === 'seller' ? '#92400e' : '#3730a3',
                          textTransform: 'uppercase',
                        }}
                      >
                        <option value="user">User</option>
                        <option value="seller">Coin Seller</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => void toggleStar(u.id, Boolean(u.is_star_account))}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: u.is_star_account ? '#fef3c7' : '#f3f4f6',
                          color: u.is_star_account ? '#b45309' : '#9ca3af',
                          border: '1px solid #d1d5db',
                          cursor: 'pointer',
                          width: 'auto',
                        }}
                      >
                        {u.is_star_account ? '⭐ Star Creator' : '☆ Standard'}
                      </button>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: u.account_status === 'active' ? '#d1fae5' : '#fee2e2', color: u.account_status === 'active' ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {u.account_status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {u.account_status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => performAction(u.id, 'suspend', { reason: 'Admin suspended' })}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', width: 'auto', cursor: 'pointer' }}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => performAction(u.id, 'unsuspend')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#d1fae5', color: '#047857', border: '1px solid #86efac', borderRadius: '6px', width: 'auto', cursor: 'pointer' }}
                          >
                            Unsuspend
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Deactivating a user will permanently end active sessions. Proceed?')) {
                              void performAction(u.id, 'deactivate', { reason: 'Admin deactivated' });
                            }
                          }}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f3f4f6', color: '#374151', width: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
