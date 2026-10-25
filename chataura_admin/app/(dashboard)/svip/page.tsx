'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Kpi, Modal, PageHeader, Pager, Section, SkeletonRows, Switch, Tabs, useConfirm } from '@/components/admin-ui';

/**
 * SVIP — paid monthly status. Users buy a level with coins; every period a maintenance fee
 * (a % of the level price) renews it, with a grace window before it ends. Admins edit the
 * price ladder and rules, and can grant / revoke a membership (audited in the coin ledger).
 */

type Settings = {
  svip_enabled: boolean;
  svip_maintenance_pct: number;
  svip_grace_days: number;
  svip_period_days: number;
};

type ApiLevel = {
  level: number;
  name: string;
  purchase_price: number;
  monthly_reward: number;
  is_active: boolean;
  dice_refreshes: number;
  gold_mine_bonus_draws: number;
  members: number;
};

type LevelRow = {
  level: number;
  name: string;
  purchase_price: string;
  monthly_reward: string;
  dice_refreshes: string;
  gold_mine_bonus_draws: string;
  is_active: boolean;
  members: number;
};

type Member = {
  user_id: string;
  display_id: string;
  name: string | null;
  level: number;
  status: 'active' | 'grace' | 'expired';
  effective_level: number;
  period_starts_at: string;
  period_ends_at: string;
};

type Config = { settings: Settings; levels: ApiLevel[] };
type Tab = 'overview' | 'levels' | 'members';
type Flash = (ok: boolean, t: string) => void;
type Confirm = ReturnType<typeof useConfirm>['confirm'];

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  return n.toLocaleString('en-US');
}

const STATUS_TONE: Record<Member['status'], string> = { active: 'green', grace: 'amber', expired: 'gray' };

export default function SvipPage() {
  const { token } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { confirm, confirmNode } = useConfirm();

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  return (
    <main className="ad-page">
      <style dangerouslySetInnerHTML={{ __html: SV_STYLES }} />
      <PageHeader
        title="SVIP"
        subtitle="Users buy a level with coins. Each period a maintenance fee renews it automatically; if the wallet is short they keep SVIP through the grace days, then it ends."
      />
      <div className="ad-card sv-nav">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'levels', label: 'Levels' },
            { value: 'members', label: 'Members' },
          ]}
        />
      </div>

      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {token && tab === 'overview' && <OverviewTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'levels' && <LevelsTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'members' && <MembersTab token={token} flash={flash} confirm={confirm} />}
      {confirmNode}
    </main>
  );
}

// ------------------------------------------------------------------ overview + settings

function OverviewTab({ token, flash, confirm }: { token: string; flash: Flash; confirm: Confirm }) {
  const [data, setData] = useState<Config | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pct, setPct] = useState('20');
  const [grace, setGrace] = useState('3');
  const [period, setPeriod] = useState('30');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ data: Config }>('/admin/svip/config', token);
    setData(res.data);
    setEnabled(res.data.settings.svip_enabled);
    setPct(String(res.data.settings.svip_maintenance_pct));
    setGrace(String(res.data.settings.svip_grace_days));
    setPeriod(String(res.data.settings.svip_period_days));
  }, [token]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  async function doSave() {
    setSaving(true);
    try {
      await api('/admin/svip/config', token, {
        method: 'PUT',
        body: JSON.stringify({
          settings: {
            svip_enabled: enabled,
            svip_maintenance_pct: Number(pct),
            svip_grace_days: Number(grace),
            svip_period_days: Number(period),
          },
        }),
      });
      await load();
      flash(true, 'SVIP settings saved.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (enabled && !data?.settings.svip_enabled) {
      confirm({
        title: 'Open SVIP for purchase?',
        message: 'Users can buy active levels from the SVIP Center right away.',
        confirmLabel: 'Turn on',
        onConfirm: doSave,
      });
      return;
    }
    void doSave();
  }

  if (!data) {
    return <div className="ad-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="ad-skeleton" style={{ height: 84 }} />)}</div>;
  }

  const members = data.levels.reduce((s, l) => s + l.members, 0);
  const forSale = data.levels.filter((l) => l.is_active).length;
  const first = data.levels.find((l) => l.is_active);

  return (
    <>
      <div className="ad-kpis sv-kpis">
        <Kpi label="Members" value={fmt(members)} sub="Active + grace" tone="amber" />
        <Kpi label="Levels on sale" value={`${forSale} / ${data.levels.length}`} />
        <Kpi
          label={first ? `${first.name} maintenance` : 'Maintenance'}
          value={first ? fmt(Math.floor((first.purchase_price * Number(pct || 0)) / 100)) : '—'}
          sub={`${pct || 0}% every ${period || 0} days`}
        />
      </div>

      <Section title="Settings" className="sv-settings">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="ad-toggle-row">
            <div>
              <div className="ad-toggle-title">SVIP purchases</div>
              <div className={`ad-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — users can buy and upgrade' : 'Off — no new purchases (existing members keep renewing)'}
              </div>
            </div>
            <Switch label="SVIP purchases enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="ad-form-grid is-2up">
            <Field label="Maintenance fee" hint="Charged each period, as a % of the level's purchase price.">
              <div className="ad-unit"><input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /><span>%</span></div>
            </Field>
            <Field label="Period" hint="Days one purchase or renewal lasts.">
              <div className="ad-unit"><input type="number" min={1} max={365} value={period} onChange={(e) => setPeriod(e.target.value)} /><span>days</span></div>
            </Field>
            <Field label="Grace" hint="Days SVIP stays on after a failed renewal. Retried hourly.">
              <div className="ad-unit"><input type="number" min={0} max={30} value={grace} onChange={(e) => setGrace(e.target.value)} /><span>days</span></div>
            </Field>
          </div>
        </div>
        <div className="ad-form-actions">
          <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ level ladder

function LevelsTab({ token, flash, confirm }: { token: string; flash: Flash; confirm: Confirm }) {
  const [rows, setRows] = useState<LevelRow[] | null>(null);
  const [pct, setPct] = useState(20);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = (c: Config) => {
    setPct(c.settings.svip_maintenance_pct);
    setRows(
      c.levels.map((l) => ({
        ...l,
        purchase_price: String(l.purchase_price),
        monthly_reward: String(l.monthly_reward),
        dice_refreshes: String(l.dice_refreshes),
        gold_mine_bonus_draws: String(l.gold_mine_bonus_draws),
      })),
    );
    setDirty(false);
  };

  const load = useCallback(async () => {
    const res = await api<{ data: Config }>('/admin/svip/config', token);
    apply(res.data);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  function update(i: number, patch: Partial<LevelRow>) {
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function doSave() {
    setBusy(true);
    try {
      const res = await api<{ data: Config }>('/admin/svip/config', token, {
        method: 'PUT',
        body: JSON.stringify({
          levels: rows!.map((r) => ({
            level: r.level,
            name: r.name,
            purchase_price: r.purchase_price.trim(),
            monthly_reward: r.monthly_reward.trim(),
            dice_refreshes: r.dice_refreshes.trim(),
            gold_mine_bonus_draws: r.gold_mine_bonus_draws.trim(),
            is_active: r.is_active,
          })),
        }),
      });
      apply(res.data);
      flash(true, 'Levels saved. New prices apply to new purchases and the next renewal.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    confirm({
      title: 'Save SVIP levels?',
      message: 'Members are charged the new maintenance fee at their next renewal. Turning a level off stops new sales only.',
      confirmLabel: 'Save levels',
      onConfirm: doSave,
    });
  }

  const num = (
    i: number,
    field: 'purchase_price' | 'monthly_reward' | 'dice_refreshes' | 'gold_mine_bonus_draws',
    r: LevelRow,
    label: string,
    narrow = false,
  ) => (
    <td className={`ad-td ${narrow ? 'sv-narrow' : 'sv-wide'}`} data-label={label}>
      <input
        className="sv-cell"
        value={r[field]}
        inputMode="numeric"
        aria-label={`${r.name} ${label}`}
        onChange={(e) => update(i, { [field]: e.target.value.replace(/[^\d]/g, '') } as Partial<LevelRow>)}
      />
    </td>
  );

  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <div>
          <h2>Levels</h2>
          <p>Prices must rise level by level. Upgrade cost = new price − current price. Only turn a level on once its assets are live in the app.</p>
        </div>
        <div className="ad-actions">
          <button type="button" className="ad-btn ad-btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Working…' : 'Save levels'}
          </button>
        </div>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table is-stack is-3up sv-levels">
          <thead>
            <tr>
              <th className="ad-th">Level</th>
              <th className="ad-th">Name</th>
              <th className="ad-th">Purchase price</th>
              <th className="ad-th">Monthly coins</th>
              <th className="ad-th" title="How many times one dice roll can be re-rolled (within 10 s)">Dice re-rolls</th>
              <th className="ad-th" title="Extra Daily Treasure draws per day while a Gold Mine runs">Mine bonus draws</th>
              <th className="ad-th ad-num">Maintenance ({pct}%)</th>
              <th className="ad-th ad-num">Members</th>
              <th className="ad-th">On sale</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <SkeletonRows cols={9} rows={9} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={9} title="No levels" hint="Levels are created by the SVIP migration." />
            ) : (
              rows.map((r, i) => (
                <tr key={r.level} className={`ad-row ${r.is_active ? '' : 'is-off'}`}>
                  <td className="ad-td" data-label="Level" style={{ fontWeight: 700 }}>{r.level}</td>
                  <td className="ad-td sv-wide" data-label="Name">
                    <input className="sv-cell" value={r.name} maxLength={64} aria-label={`Level ${r.level} name`} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  {num(i, 'purchase_price', r, 'Purchase price')}
                  {num(i, 'monthly_reward', r, 'Monthly coins')}
                  {num(i, 'dice_refreshes', r, 'Dice re-rolls', true)}
                  {num(i, 'gold_mine_bonus_draws', r, 'Mine bonus draws', true)}
                  <td className="ad-td ad-num" data-label="Maintenance">{fmt(Math.floor(((Number(r.purchase_price) || 0) * pct) / 100))}</td>
                  <td className="ad-td ad-num" data-label="Members">{r.members}</td>
                  <td className="ad-td" data-label="On sale">
                    <Switch label={`${r.name} on sale`} checked={r.is_active} onChange={(v) => update(i, { is_active: v })} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ members

function MembersTab({ token, flash, confirm }: { token: string; flash: Flash; confirm: Confirm }) {
  const [status, setStatus] = useState<'' | Member['status']>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<{ total: number; items: Member[] } | null>(null);
  const [granting, setGranting] = useState(false);
  const [form, setForm] = useState({ user: '', level: '1', days: '30' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...(status ? { status } : {}) });
    const res = await api<{ data: { total: number; items: Member[] } }>(`/admin/svip/members?${qs}`, token);
    setData(res.data);
  }, [token, page, limit, status]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  async function grant() {
    setBusy(true);
    try {
      await api('/admin/svip/members/grant', token, {
        method: 'POST',
        body: JSON.stringify({ user: form.user.trim(), level: Number(form.level), days: Number(form.days) }),
      });
      setGranting(false);
      setForm({ user: '', level: '1', days: '30' });
      await load();
      flash(true, 'SVIP granted.');
    } catch (e: any) {
      flash(false, `Grant failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function revoke(m: Member) {
    confirm({
      title: `Revoke SVIP from ${m.name ?? m.display_id}?`,
      message: 'SVIP ends immediately. No coins are refunded.',
      confirmLabel: 'Revoke',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await api(`/admin/svip/members/${m.user_id}/revoke`, token, { method: 'POST' });
          await load();
          flash(true, 'SVIP revoked.');
        } catch (e: any) {
          flash(false, `Revoke failed: ${e?.message ?? e}`);
        }
      },
    });
  }

  return (
    <section className="ad-card">
      <div className="ad-toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="grace">Grace</option>
          <option value="expired">Expired</option>
        </select>
        <div className="ad-actions" style={{ marginLeft: 'auto' }}>
          <button type="button" className="ad-btn ad-btn-soft" onClick={() => setGranting(true)}>+ Grant SVIP</button>
        </div>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table is-stack is-3up">
          <thead>
            <tr>
              <th className="ad-th">User</th>
              <th className="ad-th ad-num">Level</th>
              <th className="ad-th">Status</th>
              <th className="ad-th">Period ends</th>
              <th className="ad-th"></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={5} />
            ) : data.items.length === 0 ? (
              <EmptyRow cols={5} title="No members" hint="Nobody matches this filter yet." />
            ) : (
              data.items.map((m) => (
                <tr key={m.user_id} className="ad-row">
                  <td className="ad-td" data-label="User">
                    <div className="ad-name">{m.name ?? '—'}</div>
                    <div className="ad-sub">ID {m.display_id}</div>
                  </td>
                  <td className="ad-td ad-num" data-label="Level">SVIP {m.level}</td>
                  <td className="ad-td" data-label="Status"><span className={`ad-badge ${STATUS_TONE[m.status]}`}>{m.status}</span></td>
                  <td className="ad-td" data-label="Period ends">{new Date(m.period_ends_at).toLocaleString()}</td>
                  <td className="ad-td ad-num is-actions">
                    {m.status !== 'expired' && (
                      <button type="button" className="ad-btn ad-btn-danger-soft" onClick={() => revoke(m)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data && (
        <Pager
          page={page}
          totalPages={Math.max(1, Math.ceil(data.total / limit))}
          total={data.total}
          limit={limit}
          loading={false}
          onPage={setPage}
          onLimit={(l) => { setLimit(l); setPage(1); }}
        />
      )}

      {granting && (
        <Modal
          title="Grant SVIP"
          onClose={() => setGranting(false)}
          busy={busy}
          onSubmit={() => void grant()}
          footer={
            <button type="submit" className="ad-btn ad-btn-primary" disabled={busy || !form.user.trim()}>
              {busy ? 'Granting…' : 'Grant'}
            </button>
          }
        >
          <div className="ad-form-grid">
            <Field label="User" hint="Public user ID (as shown in the app) or account id.">
              <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} autoFocus />
            </Field>
            <Field label="Level">
              <input type="number" min={1} max={9} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            </Field>
            <Field label="Days" hint="Free period; renews at the normal fee afterwards.">
              <input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </section>
  );
}

const SV_STYLES = `
.sv-nav { margin-bottom: 16px; }
.sv-nav .ad-tabs { border-bottom: none; }
.sv-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.sv-settings { max-width: 640px; }
.ad-page .sv-cell { width: 100%; min-width: 56px; padding: 6px 8px; min-height: 34px; font-size: 0.86rem; }
.sv-levels .sv-wide { min-width: 120px; }
.sv-levels .sv-narrow { min-width: 72px; width: 90px; }
.ad-row.is-off .sv-cell { color: #9ca3af; }
@media (max-width: 640px) {
  .sv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-page .sv-cell { min-width: 0; }
}
`;
