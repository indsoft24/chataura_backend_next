'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type ModerationReport = {
  id: number;
  category: string;
  reason: string;
  description: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  reporter: { id: number; name: string; email: string | null };
  reported_user: { id: number; name: string; email: string | null; status: string };
};

export default function UserReportsPage() {
  const { token } = useAdminAuth();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  // Detail Modal
  const [activeReport, setActiveReport] = useState<ModerationReport | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        ...(search ? { q: search } : {}),
      });
      const res = await api<any>(`/admin/moderation/reports?${params.toString()}`, token);
      setReports(res.data?.reports ?? []);
      setPendingCount(res.data?.pending_count ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, statusFilter]);

  const handleAction = async (reportId: number, action: 'resolve' | 'dismiss' | 'reopen') => {
    if (!token) return;
    setActionLoading(true);
    try {
      await api(`/admin/moderation/reports/${reportId}/${action}`, token, {
        method: 'POST',
        body: action === 'resolve' && notes ? JSON.stringify({ notes }) : undefined,
      });
      setActiveReport(null);
      await load();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} report`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearReview = async (userId: number) => {
    if (!token) return;
    try {
      await api(`/admin/moderation/users/${userId}/clear-review`, token, { method: 'POST' });
      alert(`User #${userId} cleared from review.`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to clear user review');
    }
  };

  const statuses = [
    { id: 'all', label: 'All Reports' },
    { id: 'pending', label: `Pending (${pendingCount})` },
    { id: 'resolved', label: 'Resolved' },
    { id: 'dismissed', label: 'Dismissed' },
  ];

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Moderation Reports</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Review user-submitted violation reports, flag malicious accounts, and take moderation action.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {statuses.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: statusFilter === s.id ? '#4f46e5' : '#6b7280',
              borderBottom: statusFilter === s.id ? '2px solid #4f46e5' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>REPORTED USER</th>
              <th style={{ padding: '12px 16px' }}>REPORTER</th>
              <th style={{ padding: '12px 16px' }}>VIOLATION REASON</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>REPORTED AT</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading moderation reports...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No reports matching filter.
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{r.reported_user?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      ID: {r.reported_user?.id} • {r.reported_user?.status}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500, color: '#374151' }}>{r.reporter?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {r.reporter?.id}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontWeight: 600, color: '#b91c1c' }}>{r.reason}</span>
                    {r.description && (
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: r.status === 'resolved' ? '#def7ec' : r.status === 'dismissed' ? '#f3f4f6' : '#fef08a',
                        color: r.status === 'resolved' ? '#03543f' : r.status === 'dismissed' ? '#4b5563' : '#713f12',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280' }}>
                    {new Date(r.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setActiveReport(r);
                          setNotes(r.notes ?? '');
                        }}
                        style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {activeReport && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 520, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 600 }}>
              Report #{activeReport.id}: {activeReport.reason}
            </h3>

            <div style={{ backgroundColor: '#f9fafb', padding: 14, borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
              <div style={{ marginBottom: 6 }}>
                <strong>Reported:</strong> {activeReport.reported_user?.name} (ID: {activeReport.reported_user?.id})
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong>Reporter:</strong> {activeReport.reporter?.name} (ID: {activeReport.reporter?.id})
              </div>
              {activeReport.description && (
                <div style={{ marginTop: 8, color: '#374151' }}>
                  <strong>Description:</strong> {activeReport.description}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Moderator Notes
              </label>
              <textarea
                rows={3}
                placeholder="Resolution notes or warning details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveReport(null)}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
              >
                Close
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {activeReport.status !== 'dismissed' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(activeReport.id, 'dismiss')}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Dismiss
                  </button>
                )}
                {activeReport.status !== 'resolved' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(activeReport.id, 'resolve')}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Resolve & Close
                  </button>
                )}
                {activeReport.status !== 'pending' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(activeReport.id, 'reopen')}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
