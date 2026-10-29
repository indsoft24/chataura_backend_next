'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Modal, PageHeader, SearchBox, SkeletonRows, Tabs, errorText, formatDate, formatTime, useDebouncedCommit, useToasts } from '@/components/admin-ui';

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

const TONE: Record<string, string> = { resolved: 'green', dismissed: 'gray', pending: 'amber' };

export default function UserReportsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  useDebouncedCommit(searchInput, setSearch);

  const [activeReport, setActiveReport] = useState<ModerationReport | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, ...(search ? { q: search } : {}) });
      const res = await api<any>(`/admin/moderation/reports?${params.toString()}`, token);
      setReports(res.data?.reports ?? []);
      setPendingCount(res.data?.pending_count ?? 0);
    } catch (err) {
      toast('error', errorText(err, 'Could not load reports'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, search]);

  async function handleAction(reportId: number, action: 'resolve' | 'dismiss' | 'reopen') {
    if (!token) return;
    setActionLoading(true);
    try {
      await api(`/admin/moderation/reports/${reportId}/${action}`, token, {
        method: 'POST',
        body: action === 'resolve' && notes ? JSON.stringify({ notes }) : undefined,
      });
      toast('success', `Report #${reportId} ${action === 'reopen' ? 'reopened' : `${action}d`}`);
      setActiveReport(null);
      await load();
    } catch (err) {
      toast('error', errorText(err, `Failed to ${action} report`));
    } finally {
      setActionLoading(false);
    }
  }

  async function clearReview(userId: number) {
    if (!token) return;
    setActionLoading(true);
    try {
      await api(`/admin/moderation/users/${userId}/clear-review`, token, { method: 'POST' });
      toast('success', `User #${userId} cleared from review`);
      await load();
    } catch (err) {
      toast('error', errorText(err, 'Failed to clear user review'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="cp-page">
      <PageHeader title="User Reports" subtitle="Violation reports submitted by users. Review each one, add notes, then resolve or dismiss." />

      <section className="cp-card">
        <Tabs
          value={statusFilter}
          onChange={setStatusFilter}
          tabs={[
            { value: 'pending', label: 'Pending', count: pendingCount, tone: 'amber' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search user, reason or ID" />
        </div>
        <div className="cp-summary"><strong>{reports.length}</strong> report{reports.length === 1 ? '' : 's'}{search ? <> matching &ldquo;{search}&rdquo;</> : null}</div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Reported user</th>
                <th className="cp-th">Reason</th>
                <th className="cp-th">Reporter</th>
                <th className="cp-th">Status</th>
                <th className="cp-th">Reported</th>
                <th className="cp-th cp-num"></th>
              </tr>
            </thead>
            <tbody className={loading && reports.length ? 'is-loading' : ''}>
              {loading && reports.length === 0 ? (
                <SkeletonRows cols={6} />
              ) : reports.length === 0 ? (
                <EmptyRow cols={6} title="No reports" hint={statusFilter === 'pending' ? 'Nothing waiting for review.' : 'Nothing matches this filter.'} />
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="cp-row is-clickable" onClick={() => { setActiveReport(r); setNotes(r.notes ?? ''); }}>
                    <td className="cp-td is-main">
                      <div>
                        <div className="cp-name">{r.reported_user?.name}</div>
                        <div className="cp-sub">#{r.reported_user?.id} · {r.reported_user?.status}</div>
                      </div>
                      <span className="cp-mobile-only"><span className={`cp-badge ${TONE[r.status] ?? 'gray'}`}>{r.status}</span></span>
                    </td>
                    <td className="cp-td is-full" data-label="Reason">
                      <span className="tone-red" style={{ fontWeight: 600 }}>{r.reason}</span>
                      {r.description && <div className="cp-sub" style={{ maxWidth: 280 }}>{r.description}</div>}
                    </td>
                    <td className="cp-td" data-label="Reporter">
                      <div style={{ fontWeight: 500 }}>{r.reporter?.name}</div>
                      <div className="cp-sub">#{r.reporter?.id}</div>
                    </td>
                    <td className="cp-td is-hide-sm"><span className={`cp-badge ${TONE[r.status] ?? 'gray'}`}>{r.status}</span></td>
                    <td className="cp-td" data-label="Reported">{formatDate(r.created_at)} <span className="cp-hint">{formatTime(r.created_at)}</span></td>
                    <td className="cp-td cp-num is-actions">
                      <div className="cp-actions">
                        <button type="button" className="cp-btn cp-btn-soft" onClick={(e) => { e.stopPropagation(); setActiveReport(r); setNotes(r.notes ?? ''); }}>Review</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activeReport && (
        <Modal
          size="wide"
          title={<>Report #{activeReport.id} · <span className="tone-red">{activeReport.reason}</span></>}
          busy={actionLoading}
          onClose={() => setActiveReport(null)}
          footer={
            <>
              {activeReport.status !== 'dismissed' && (
                <button type="button" className="cp-btn cp-btn-ghost" disabled={actionLoading} onClick={() => void handleAction(activeReport.id, 'dismiss')}>Dismiss</button>
              )}
              {activeReport.status !== 'pending' && (
                <button type="button" className="cp-btn cp-btn-soft" disabled={actionLoading} onClick={() => void handleAction(activeReport.id, 'reopen')}>Reopen</button>
              )}
              {activeReport.status !== 'resolved' && (
                <button type="button" className="cp-btn cp-btn-solid tone-success" disabled={actionLoading} onClick={() => void handleAction(activeReport.id, 'resolve')}>Resolve & close</button>
              )}
            </>
          }
        >
          <dl className="cp-dl">
            <dt>Reported user</dt>
            <dd><strong>{activeReport.reported_user?.name}</strong> #{activeReport.reported_user?.id} · <span className="cp-badge gray">{activeReport.reported_user?.status}</span></dd>
            <dt>Reporter</dt>
            <dd>{activeReport.reporter?.name} #{activeReport.reporter?.id}</dd>
            <dt>Category</dt>
            <dd>{activeReport.category}</dd>
            <dt>Reported</dt>
            <dd>{new Date(activeReport.created_at).toLocaleString()}</dd>
            {activeReport.description ? (
              <>
                <dt>Description</dt>
                <dd>{activeReport.description}</dd>
              </>
            ) : null}
          </dl>
          <Field label="Moderator notes">
            <textarea rows={3} placeholder="Resolution notes or warning details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <button type="button" className="cp-link" style={{ justifySelf: 'start' }} disabled={actionLoading} onClick={() => void clearReview(activeReport.reported_user.id)}>
            Clear #{activeReport.reported_user?.id} from the review queue
          </button>
        </Modal>
      )}
      {toastNode}
    </main>
  );
}
