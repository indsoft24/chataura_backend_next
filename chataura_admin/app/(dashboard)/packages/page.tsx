'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  EmptyRow,
  Field,
  Modal,
  PageHeader,
  SearchBox,
  SkeletonRows,
  Switch,
  Tabs,
  errorText,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

type Pack = {
  id: number;
  audience: string;
  coins: number;
  currency: string;
  price: number;
  original_price: number | null;
  is_active: boolean;
};

type Draft = { id?: number; coins: string; price: string; originalPrice: string; currency: string; audience: string; isActive: boolean };

const NEW_DRAFT: Draft = { coins: '100', price: '99', originalPrice: '149', currency: 'INR', audience: 'user', isActive: true };
const AUDIENCE_LABEL: Record<string, string> = { user: 'Users', coin_seller: 'Sellers' };

export default function PackagesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [rows, setRows] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [audience, setAudience] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('coins');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { packages: Pack[] } }>('/admin/packages', token);
      setRows(json.data?.packages ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load packages'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const counts = useMemo(() => ({
    all: rows.length,
    user: rows.filter((r) => r.audience === 'user').length,
    coin_seller: rows.filter((r) => r.audience === 'coin_seller').length,
  }), [rows]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!audience || r.audience === audience) &&
      (!status || (status === 'active') === r.is_active) &&
      (!term || [r.id, r.coins, r.price, r.currency].some((v) => String(v).toLowerCase().includes(term))),
    );
    const by: Record<string, (a: Pack, b: Pack) => number> = {
      coins: (a, b) => a.coins - b.coins,
      price: (a, b) => a.price - b.price,
      id: (a, b) => b.id - a.id,
    };
    return out.sort(by[sort]);
  }, [rows, audience, status, q, sort]);

  async function save() {
    if (!token || !draft) return;
    setSaving(true);
    setFormError('');
    const body = {
      coins: Number(draft.coins),
      price: Number(draft.price),
      original_price: draft.originalPrice ? Number(draft.originalPrice) : undefined,
      currency: draft.currency,
      audience: draft.audience,
    };
    try {
      if (draft.id) {
        await api(`/admin/packages/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `Package #${draft.id} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/packages', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', 'Package created');
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save package'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Pack) {
    if (!token) return;
    setBusyId(p.id);
    try {
      await api(`/admin/packages/${p.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !p.is_active }) });
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, is_active: !p.is_active } : r)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update package'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(p: Pack) {
    confirm({
      title: `Delete package #${p.id}?`,
      message: <>🪙 {p.coins.toLocaleString()} for {p.price} {p.currency} disappears from the recharge store.</>,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/packages/${p.id}`, token, { method: 'DELETE' });
        toast('success', `Package #${p.id} deleted`);
        void load();
      },
    });
  }

  const filtered = Boolean(audience || status || q);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="cp-page">
      <PageHeader
        title="Coin Packages"
        subtitle="Coin bundles, pricing and discounts shown in the recharge store, for users and for authorized sellers."
        actions={
          <button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>
            + New package
          </button>
        }
      />

      <section className="cp-card">
        <Tabs
          value={audience}
          onChange={setAudience}
          tabs={[
            { value: '', label: 'All', count: counts.all },
            { value: 'user', label: 'Users', count: counts.user },
            { value: 'coin_seller', label: 'Sellers', count: counts.coin_seller },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search coins, price or ID" />
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="coins">Coins (low → high)</option>
              <option value="price">Price (low → high)</option>
              <option value="id">Newest first</option>
            </select>
          </Field>
        </div>
        <div className="cp-summary">
          Showing <strong>{visible.length}</strong> of <strong>{rows.length}</strong>
          {filtered ? (
            <>
              {' · '}
              <button type="button" className="cp-link" onClick={() => { setAudience(''); setStatus(''); setQ(''); }}>Clear filters</button>
            </>
          ) : null}
        </div>

        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Package</th>
                <th className="cp-th">Audience</th>
                <th className="cp-th cp-num">Price</th>
                <th className="cp-th">Active</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <SkeletonRows cols={5} rows={5} />
              ) : visible.length === 0 ? (
                <EmptyRow
                  cols={5}
                  title={rows.length ? 'No packages match' : 'No packages yet'}
                  hint={rows.length ? 'Try a different filter.' : 'Create the first coin bundle for the recharge store.'}
                  onReset={filtered ? () => { setAudience(''); setStatus(''); setQ(''); } : undefined}
                />
              ) : (
                visible.map((p) => (
                  <tr key={p.id} className={`cp-row ${busyId === p.id ? 'is-busy' : ''} ${p.is_active ? '' : 'is-muted'}`}>
                    <td className="cp-td is-main">
                      <div>
                        <div className="cp-name" style={{ fontSize: '1rem' }}>🪙 {p.coins.toLocaleString()}</div>
                        <div className="cp-sub">Package #{p.id}</div>
                      </div>
                      <span className="cp-mobile-only"><span className={`cp-badge ${p.audience === 'user' ? 'indigo' : 'amber'}`}>{AUDIENCE_LABEL[p.audience] ?? p.audience}</span></span>
                    </td>
                    <td className="cp-td is-hide-sm">
                      <span className={`cp-badge ${p.audience === 'user' ? 'indigo' : 'amber'}`}>{AUDIENCE_LABEL[p.audience] ?? p.audience}</span>
                    </td>
                    <td className="cp-td cp-num" data-label="Price">
                      <strong className="tone-green">{p.price} {p.currency}</strong>
                      {p.original_price ? <span className="cp-hint" style={{ marginLeft: 6, textDecoration: 'line-through', fontSize: '0.8rem' }}>{p.original_price}</span> : null}
                    </td>
                    <td className="cp-td" data-label="Active">
                      <Switch label={`Package #${p.id} active`} checked={p.is_active} disabled={busyId === p.id} onChange={() => void toggleActive(p)} />
                    </td>
                    <td className="cp-td cp-num is-actions">
                      <div className="cp-actions">
                        <button type="button" className="cp-btn cp-btn-ghost" onClick={() => { setFormError(''); setDraft({ id: p.id, coins: String(p.coins), price: String(p.price), originalPrice: p.original_price ? String(p.original_price) : '', currency: p.currency, audience: p.audience, isActive: p.is_active }); }}>
                          Edit
                        </button>
                        <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => remove(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {draft && (
        <Modal
          title={draft.id ? `Edit package #${draft.id}` : 'New coin package'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving || !draft.coins || !draft.price}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create package'}
              </button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Audience" wide>
              <select value={draft.audience} onChange={(e) => set({ audience: e.target.value })}>
                <option value="user">Standard users</option>
                <option value="coin_seller">Authorized sellers</option>
              </select>
            </Field>
            <Field label="Coins">
              <input type="number" inputMode="numeric" value={draft.coins} onChange={(e) => set({ coins: e.target.value })} />
            </Field>
            <Field label="Currency">
              <input value={draft.currency} onChange={(e) => set({ currency: e.target.value })} />
            </Field>
            <Field label="Price">
              <input type="number" inputMode="decimal" value={draft.price} onChange={(e) => set({ price: e.target.value })} />
            </Field>
            <Field label="Original price" hint="Optional strike-through price.">
              <input type="number" inputMode="decimal" placeholder="Optional" value={draft.originalPrice} onChange={(e) => set({ originalPrice: e.target.value })} />
            </Field>
          </div>
          {draft.id ? (
            <div className="cp-toggle-row">
              <div>
                <div className="cp-toggle-title">Visible in the recharge store</div>
              </div>
              <Switch label="Active" checked={draft.isActive} onChange={(v) => set({ isActive: v })} />
            </div>
          ) : null}
          {formError && <div className="cp-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}
