'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Kpi, PageHeader, SearchBox, SkeletonRows, Tabs, errorText, formatDate, useConfirm, useToasts } from '@/components/admin-ui';

type Withdrawal = {
  id: number;
  user_id: number;
  amount: string | number;
  currency: string;
  source: string;
  status: string;
  note: string | null;
  created_at: string;
  user?: {
    id: number;
    name: string;
  };
};

type Filter = 'all' | 'pending' | 'approved' | 'rejected';
const TONE: Record<string, string> = { pending: 'amber', approved: 'green', success: 'green', rejected: 'red' };

export default function WithdrawalsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { withdrawals: Withdrawal[] } }>('/admin/withdrawals', token);
      setWithdrawals(json.data?.withdrawals ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load withdrawals'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const count = (s: Filter) => (s === 'all' ? withdrawals.length : withdrawals.filter((w) => w.status === s).length);
  const pending = withdrawals.filter((w) => w.status === 'pending');
  const pendingByCurrency = pending.reduce<Record<string, number>>((m, w) => ({ ...m, [w.currency]: (m[w.currency] ?? 0) + Number(w.amount) }), {});

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return withdrawals.filter((w) =>
      (filter === 'all' || w.status === filter) &&
      (!term || String(w.user_id) === term || String(w.id) === term || (w.user?.name ?? '').toLowerCase().includes(term)),
    );
  }, [withdrawals, filter, q]);

  function act(w: Withdrawal, action: 'approve' | 'reject') {
    const who = w.user?.name ?? `User #${w.user_id}`;
    confirm({
      title: action === 'approve' ? 'Approve this withdrawal?' : 'Reject this withdrawal?',
      message: <><strong>{Number(w.amount).toFixed(2)} {w.currency}</strong> to {who} (#{w.user_id}) from {w.source}. This cannot be undone.</>,
      confirmLabel: action === 'approve' ? 'Approve payout' : 'Reject',
      tone: action === 'approve' ? 'success' : 'danger',
      onConfirm: async () => {
        await api(`/admin/withdrawals/${w.id}/${action}`, token, { method: 'POST' });
        toast('success', `Withdrawal #${w.id} ${action === 'approve' ? 'approved' : 'rejected'}`);
        void load();
      },
    });
  }

  return (
    <main className="cp-page">
      <PageHeader title="Withdrawals (legacy)" subtitle="Review and process cash-out requests from users. Shows the latest 50 requests." />

      <div className="cp-kpis">
        <Kpi label="Pending requests" value={pending.length} tone={pending.length ? 'amber' : undefined} onClick={() => setFilter('pending')} active={filter === 'pending'} />
        <Kpi
          label="Pending amount"
          value={Object.keys(pendingByCurrency).length ? Object.entries(pendingByCurrency).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(' · ') : '—'}
          sub="Awaiting review"
        />
        <Kpi label="Approved" value={count('approved')} tone="green" onClick={() => setFilter('approved')} active={filter === 'approved'} />
        <Kpi label="Rejected" value={count('rejected')} tone="red" onClick={() => setFilter('rejected')} active={filter === 'rejected'} />
      </div>

      <section className="cp-card">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'pending', label: 'Pending', count: count('pending'), tone: 'amber' },
            { value: 'approved', label: 'Approved', count: count('approved'), tone: 'green' },
            { value: 'rejected', label: 'Rejected', count: count('rejected'), tone: 'red' },
            { value: 'all', label: 'All', count: count('all') },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search user name, user ID or request ID" />
        </div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">User</th>
                <th className="cp-th cp-num">Amount</th>
                <th className="cp-th">Source</th>
                <th className="cp-th">Requested</th>
                <th className="cp-th">Status</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && withdrawals.length === 0 ? (
                <SkeletonRows cols={6} />
              ) : filtered.length === 0 ? (
                <EmptyRow cols={6} title={filter === 'pending' ? 'Nothing waiting for review' : 'No withdrawal requests'} hint={q ? 'Try a different search.' : 'New requests appear here.'} />
              ) : (
                filtered.map((w) => (
                  <tr key={w.id} className="cp-row">
                    <td className="cp-td is-main">
                      <div>
                        <div className="cp-name">{w.user?.name ?? `User #${w.user_id}`}</div>
                        <div className="cp-sub">User #{w.user_id} · request #{w.id}</div>
                      </div>
                      <span className="cp-mobile-only"><span className={`cp-badge ${TONE[w.status] ?? 'gray'}`}>{w.status}</span></span>
                    </td>
                    <td className="cp-td cp-num tone-green" data-label="Amount" style={{ fontWeight: 700, fontSize: '1rem' }}>{Number(w.amount).toFixed(2)} {w.currency}</td>
                    <td className="cp-td" data-label="Source"><span className="cp-tag">{w.source}</span></td>
                    <td className="cp-td" data-label="Requested">{formatDate(w.created_at)}</td>
                    <td className="cp-td is-hide-sm"><span className={`cp-badge ${TONE[w.status] ?? 'gray'}`}>{w.status}</span></td>
                    <td className="cp-td cp-num is-actions is-fill">
                      {w.status === 'pending' ? (
                        <div className="cp-actions">
                          <button type="button" className="cp-btn cp-btn-solid tone-success" onClick={() => act(w, 'approve')}>Approve</button>
                          <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => act(w, 'reject')}>Reject</button>
                        </div>
                      ) : (
                        <span className="cp-hint" style={{ fontSize: '0.8rem' }}>Processed</span>
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
