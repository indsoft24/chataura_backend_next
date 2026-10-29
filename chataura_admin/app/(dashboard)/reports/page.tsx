'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, PageHeader, SearchBox, SkeletonRows, errorText, formatDate, useConfirm, useToasts } from '@/components/admin-ui';

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
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { reports: Report[] } }>('/admin/reports', token);
      setReports(json.data?.reports ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load reports'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const reasons = useMemo(() => Array.from(new Set(reports.map((r) => r.reason))).sort(), [reports]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return reports.filter((r) =>
      (!reason || r.reason === reason) &&
      (!term || [r.reporter?.name, r.reported?.name, r.description, String(r.reporter_id), String(r.reported_id)].some((v) => v && v.toLowerCase().includes(term))),
    );
  }, [reports, q, reason]);

  async function dismiss(r: Report) {
    if (!token) return;
    setBusyId(r.id);
    try {
      await api(`/admin/reports/${r.id}`, token, { method: 'DELETE' });
      toast('success', `Report #${r.id} dismissed`);
      void load();
    } catch (e) {
      toast('error', errorText(e, 'Could not dismiss report'));
    } finally {
      setBusyId(null);
    }
  }

  function suspend(r: Report) {
    const who = r.reported?.name ?? `User #${r.reported_id}`;
    confirm({
      title: `Suspend ${who}?`,
      message: <>The account is suspended with reason &ldquo;Reported violation&rdquo; and this report is resolved.</>,
      confirmLabel: 'Suspend user',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/users/${r.reported_id}/suspend`, token, { method: 'POST', body: JSON.stringify({ reason: 'Reported violation' }) });
        await api(`/admin/reports/${r.id}`, token, { method: 'DELETE' });
        toast('success', `${who} suspended and report resolved`);
        void load();
      },
    });
  }

  return (
    <main className="cp-page">
      <PageHeader title="Reports" subtitle={`Quick reports from users · ${reports.length} open. Dismiss false alarms or suspend the reported user.`} />

      <section className="cp-card">
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search user, ID or details" />
          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">All reasons</option>
              {reasons.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="cp-summary">Showing <strong>{visible.length}</strong> of <strong>{reports.length}</strong> open reports</div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Reported user</th>
                <th className="cp-th">Reason</th>
                <th className="cp-th">Reporter</th>
                <th className="cp-th">Details</th>
                <th className="cp-th">Date</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && reports.length === 0 ? (
                <SkeletonRows cols={6} />
              ) : visible.length === 0 ? (
                <EmptyRow cols={6} title={reports.length ? 'No reports match' : 'All clear'} hint={reports.length ? 'Try a different search.' : 'There are no open reports.'} />
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className={`cp-row ${busyId === r.id ? 'is-busy' : ''}`}>
                    <td className="cp-td is-main">
                      <div>
                        <div className="cp-name tone-red">{r.reported?.name ?? `User #${r.reported_id}`}</div>
                        <div className="cp-sub">#{r.reported_id} · report #{r.id}</div>
                      </div>
                      <span className="cp-mobile-only"><span className="cp-badge red">{r.reason}</span></span>
                    </td>
                    <td className="cp-td is-hide-sm"><span className="cp-badge red">{r.reason}</span></td>
                    <td className="cp-td" data-label="Reporter">
                      <div style={{ fontWeight: 600 }}>{r.reporter?.name ?? `User #${r.reporter_id}`}</div>
                      <div className="cp-sub">#{r.reporter_id}</div>
                    </td>
                    <td className="cp-td is-full" data-label="Details" style={{ maxWidth: 320, color: '#4b5563' }}>
                      {r.description || <span className="cp-hint" style={{ fontStyle: 'italic' }}>No description</span>}
                    </td>
                    <td className="cp-td" data-label="Date">{formatDate(r.created_at)}</td>
                    <td className="cp-td cp-num is-actions is-fill">
                      <div className="cp-actions">
                        <button type="button" className="cp-btn cp-btn-ghost" onClick={() => void dismiss(r)}>Dismiss</button>
                        <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => suspend(r)}>Suspend user</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {confirmNode}
      {toastNode}
    </main>
  );
}
