'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Report = {
  id: number;
  reporter_id: number;
  reported_id: number;
  reason: string;
  description: string | null;
  created_at: string;
  reporter?: { id: number; name: string };
  reported?: { id: number; name: string };
};

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { reports: Report[] } }>('/admin/reports', token);
      setReports(json.data?.reports ?? []);
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

  async function resolveReport(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/reports/${id}`, token, { method: 'DELETE' });
      setActionMsg(`Report #${id} resolved.`);
      setTimeout(() => setActionMsg(''), 3000);
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function suspendReported(userId: number, reportId: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm(`Are you sure you want to suspend User #${userId}?`)) return;
    try {
      await api(`/admin/users/${userId}/suspend`, token, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Reported violation' }),
      });
      await api(`/admin/reports/${reportId}`, token, { method: 'DELETE' });
      setActionMsg(`User #${userId} suspended and report resolved.`);
      setTimeout(() => setActionMsg(''), 3000);
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Reports & Moderation</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Review reports, dismiss false alarms, or instantly moderate violating users.</p>
      </div>

      {actionMsg && (
        <div style={{ padding: '12px 16px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', marginBottom: '20px', fontWeight: 600 }}>
          {actionMsg}
        </div>
      )}

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Date</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Reporter</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Reported User</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Reason</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Details</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading reports...</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No pending reports found. All clear!</td></tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{r.reporter?.name ?? `User #${r.reporter_id}`}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>ID #{r.reporter_id}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#b91c1c' }}>{r.reported?.name ?? `User #${r.reported_id}`}</div>
                      <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>ID #{r.reported_id}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {r.reason}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.9rem', maxWidth: '280px' }}>
                      {r.description || <span style={{ fontStyle: 'italic', color: '#9ca3af' }}>No description provided</span>}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void resolveReport(r.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            width: 'auto',
                          }}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => void suspendReported(r.reported_id, r.id)}
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
                          Suspend User
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
