'use client';

import { useEffect, useState } from 'react';
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
  const [role, setRole] = useState<'admin' | 'seller'>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { staff: StaffRow[] } }>(
        '/admin/staff',
        token,
      );
      setStaff(json.data?.staff ?? []);
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

  async function linkExisting() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token || !userId) return;
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>(
        `/admin/users/${userId}/link`,
        token,
        { method: 'POST', body: JSON.stringify({ role }) },
      );
      if (!json.success) {
        setError(json.error?.message ?? 'Link failed');
        return;
      }
      setError('');
      setUserId('');
      void load(token);
    } catch (err: any) {
      setError('Network error');
    }
  }

  async function demoteStaff(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm(`Are you sure you want to demote Staff #${id} back to a regular user?`)) return;
    try {
      await api(`/admin/users/${id}/link`, token, {
        method: 'POST',
        body: JSON.stringify({ role: 'user' }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Staff & Seller Management</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Authorize staff administrators, designate coin sellers, and track operational metrics.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Promote User to Staff / Seller</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px', maxWidth: '360px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>User ID</div>
            <input
              placeholder="e.g. 102"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ margin: 0 }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Role</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'seller')}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.95rem', margin: 0, height: '42px' }}
            >
              <option value="admin">Administrator</option>
              <option value="seller">Coin Seller</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void linkExisting()} style={{ width: 'auto', height: '42px' }}>
              Assign Role
            </button>
          </div>
        </div>
        {error ? <p className="err" style={{ marginTop: '12px', marginBottom: 0, maxWidth: '400px' }}>{error}</p> : null}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>ID</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Staff Name</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Role</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Rooms Hosted (Today)</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Gift Volume (Today)</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading staff...</td></tr>
              ) : staff.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No administrative or seller staff found.</td></tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>#{s.id}</td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{s.display_name ?? 'Staff User'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{s.email ?? 'No email'}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: s.role === 'admin' ? '#fee2e2' : '#fef3c7',
                        color: s.role === 'admin' ? '#991b1b' : '#92400e',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {s.role === 'admin' ? 'Administrator' : 'Coin Seller'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600, color: '#4b5563' }}>
                      {s.business?.rooms_hosted_today ?? 0}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600, color: '#d97706' }}>
                      🪙 {(s.business?.gift_coins_today ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => void demoteStaff(s.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          width: 'auto',
                        }}
                      >
                        Demote to User
                      </button>
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
