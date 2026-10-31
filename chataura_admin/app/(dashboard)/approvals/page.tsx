'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Kpi, PageHeader, SearchBox, SkeletonRows, Tabs, errorText, formatDate, useConfirm, useToasts } from '@/components/admin-ui';

type Person = { id: number; name: string; tier: string } | null;
type Approval = {
  id: number;
  method: string;
  path: string;
  url: string;
  body: unknown;
  status: string;
  result: string | null;
  requester: Person;
  decided_by: Person;
  created_at: string;
  decided_at: string | null;
};

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'failed';
const TONE: Record<string, string> = { pending: 'amber', processing: 'amber', approved: 'green', rejected: 'red', failed: 'red' };
const VERB: Record<string, string> = { POST: 'Create / action', PUT: 'Replace', PATCH: 'Edit', DELETE: 'Delete' };

export default function ApprovalsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { approvals: Approval[] } }>('/admin/approvals', token);
      setRows(json.data?.approvals ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load approval requests'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const count = (s: Filter) => (s === 'all' ? rows.length : rows.filter((r) => r.status === s).length);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return rows.filter((r) =>
      (filter === 'all' || r.status === filter) &&
      (!term || String(r.id) === term || r.path.toLowerCase().includes(term) || (r.requester?.name ?? '').toLowerCase().includes(term)),
    );
  }, [rows, filter, q]);

  function act(r: Approval, action: 'approve' | 'reject') {
    confirm({
      title: action === 'approve' ? 'Approve and apply this change?' : 'Reject this change?',
      message: <><strong>{r.method} {r.path}</strong> requested by {r.requester?.name ?? 'unknown'}. {action === 'approve' ? 'It runs now, as you.' : 'Nothing will change.'}</>,
      confirmLabel: action === 'approve' ? 'Approve' : 'Reject',
      tone: action === 'approve' ? 'success' : 'danger',
      onConfirm: async () => {
        try {
          await api(`/admin/approvals/${r.id}/${action}`, token, { method: 'POST' });
          toast('success', `Request #${r.id} ${action === 'approve' ? 'approved and applied' : 'rejected'}`);
        } catch (e) {
          toast('error', errorText(e, `Request #${r.id} failed`));
        }
        void load();
      },
    });
  }

  return (
    <main className="cp-page">
      <PageHeader title="Staff Approvals" subtitle="Every change staff make in the staff panel waits here. Nothing is applied until you approve it." />

      <div className="cp-kpis">
        <Kpi label="Waiting for you" value={count('pending')} tone={count('pending') ? 'amber' : undefined} onClick={() => setFilter('pending')} active={filter === 'pending'} />
        <Kpi label="Approved" value={count('approved')} tone="green" onClick={() => setFilter('approved')} active={filter === 'approved'} />
        <Kpi label="Rejected" value={count('rejected')} tone="red" onClick={() => setFilter('rejected')} active={filter === 'rejected'} />
        <Kpi label="Failed" value={count('failed')} sub="Approved but the change errored" onClick={() => setFilter('failed')} active={filter === 'failed'} />
      </div>

      <section className="cp-card">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'pending', label: 'Pending', count: count('pending'), tone: 'amber' },
            { value: 'approved', label: 'Approved', count: count('approved'), tone: 'green' },
            { value: 'rejected', label: 'Rejected', count: count('rejected'), tone: 'red' },
            { value: 'failed', label: 'Failed', count: count('failed'), tone: 'red' },
            { value: 'all', label: 'All', count: count('all') },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search staff name, page path or request ID" />
        </div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Change</th>
                <th className="cp-th">Requested by</th>
                <th className="cp-th">Details</th>
                <th className="cp-th">Status</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <SkeletonRows cols={5} />
              ) : filtered.length === 0 ? (
                <EmptyRow cols={5} title={filter === 'pending' ? 'Nothing waiting for approval' : 'No requests'} hint={q ? 'Try a different search.' : 'Staff changes appear here.'} />
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="cp-row">
                    <td className="cp-td is-main">
                      <div>
                        <div className="cp-name">{VERB[r.method] ?? r.method} · {r.path.replace(/^\/admin\//, '')}</div>
                        <div className="cp-sub">Request #{r.id} · {formatDate(r.created_at)}</div>
                      </div>
                    </td>
                    <td className="cp-td" data-label="Requested by">
                      {r.requester ? <>{r.requester.name} <span className="cp-tag">{r.requester.tier}</span></> : '—'}
                    </td>
                    <td className="cp-td" data-label="Details">
                      {r.body == null ? <span className="cp-hint">No data</span> : (
                        <pre style={{ margin: 0, maxWidth: 420, maxHeight: 160, overflow: 'auto', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(r.body, null, 2)}</pre>
                      )}
                      {r.result && r.status === 'failed' ? <div className="cp-sub tone-red">{r.result}</div> : null}
                    </td>
                    <td className="cp-td" data-label="Status">
                      <span className={`cp-badge ${TONE[r.status] ?? 'gray'}`}>{r.status}</span>
                      {r.decided_by ? <div className="cp-sub">{r.decided_by.name} · {formatDate(r.decided_at)}</div> : null}
                    </td>
                    <td className="cp-td cp-num is-actions is-fill">
                      {r.status === 'pending' ? (
                        <div className="cp-actions">
                          <button type="button" className="cp-btn cp-btn-solid tone-success" onClick={() => act(r, 'approve')}>Approve</button>
                          <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => act(r, 'reject')}>Reject</button>
                        </div>
                      ) : (
                        <span className="cp-hint" style={{ fontSize: '0.8rem' }}>Done</span>
                      )}
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
