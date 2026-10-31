'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Kpi, Modal, PageHeader, Pager, Section, SkeletonRows, Switch, Tabs, useConfirm } from '@/components/admin-ui';

/**
 * SVIP — monthly status earned by real-money recharge (a rupee amount per level, counted over a rolling
 * window). Before a period ends the member renews with a maintenance fee in coins (a % of the level's fee base)
 * or by recharging again; a grace window follows. Admins edit the ladder and rules, and can grant / revoke a
 * membership (audited in the coin ledger).
 */

type Settings = {
  svip_enabled: boolean;
  svip_maintenance_pct: number;
  svip_grace_days: number;
  svip_period_days: number;
  svip_recharge_days: number;
  svip_renew_days: number;
  svip_promo_enabled: boolean;
  svip_promo_days: number;
};

type ApiLevel = {
  level: number;
  name: string;
  purchase_price: number;
  recharge_inr: number;
  seller_price: number;
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
  recharge_inr: string;
  seller_price: string;
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
  source: 'recharge' | 'admin' | 'seller' | 'promo';
};

type Seller = {
  user_id: string;
  display_id: string;
  name: string | null;
  balance: number;
  suspended: boolean;
  month_gifts: number;
  month_spent: number;
};

type Gift = {
  id: string;
  giver: { user_id: string; display_id: string | null; name: string | null };
  giver_role: 'seller' | 'admin';
  user: { user_id: string; display_id: string | null; name: string | null };
  level: number;
  days: number;
  kind: 'new' | 'upgrade' | 'extend';
  price: number;
  recharge_coins: number;
  created_at: string;
};

type Config = { settings: Settings; levels: ApiLevel[] };
type Tab = 'overview' | 'levels' | 'members' | 'sellers' | 'gifts';
type Flash = (ok: boolean, t: string) => void;
type Confirm = ReturnType<typeof useConfirm>['confirm'];

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  return n.toLocaleString('en-US');
}

const SOURCE_LABEL: Record<Member['source'], string> = { recharge: 'Recharge', admin: 'Admin gift', seller: 'Seller gift', promo: 'Free promo' };
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
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: SV_STYLES }} />
      <PageHeader
        title="SVIP"
        subtitle="Users unlock a level by recharging real money (for example Rs 500 at once, or 5 x Rs 100 within the recharge window). Before the period ends they renew with the maintenance fee in coins or by recharging again; nothing is charged automatically."
      />
      <div className="cp-card sv-nav">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'levels', label: 'Levels' },
            { value: 'members', label: 'Members' },
            { value: 'sellers', label: 'Coin sellers' },
            { value: 'gifts', label: 'Gifts' },
          ]}
        />
      </div>

      {msg && <div className={`cp-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {token && tab === 'overview' && <OverviewTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'levels' && <LevelsTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'members' && <MembersTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'sellers' && <SellersTab token={token} flash={flash} />}
      {token && tab === 'gifts' && <GiftsTab token={token} flash={flash} />}
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
  const [rechargeDays, setRechargeDays] = useState('5');
  const [renewDays, setRenewDays] = useState('5');
  const [promo, setPromo] = useState(false);
  const [promoDays, setPromoDays] = useState('7');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ data: Config }>('/admin/svip/config', token);
    setData(res.data);
    setEnabled(res.data.settings.svip_enabled);
    setPct(String(res.data.settings.svip_maintenance_pct));
    setGrace(String(res.data.settings.svip_grace_days));
    setPeriod(String(res.data.settings.svip_period_days));
    setRechargeDays(String(res.data.settings.svip_recharge_days));
    setRenewDays(String(res.data.settings.svip_renew_days));
    setPromo(res.data.settings.svip_promo_enabled);
    setPromoDays(String(res.data.settings.svip_promo_days));
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
            svip_recharge_days: Number(rechargeDays),
            svip_renew_days: Number(renewDays),
            svip_promo_enabled: promo,
            svip_promo_days: Number(promoDays),
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
    if (promo && !data?.settings.svip_promo_enabled) {
      confirm({
        title: 'Start the free SVIP 1 promo?',
        message: `Every user without SVIP gets SVIP 1 free for ${promoDays} days, within minutes. It ends at once with no grace, and renews only by recharge. Needs "SVIP by recharge" on.`,
        confirmLabel: 'Start promo',
        onConfirm: doSave,
      });
      return;
    }
    if (enabled && !data?.settings.svip_enabled) {
      confirm({
        title: 'Open SVIP?',
        message: 'Users who recharge the set amount unlock SVIP right away.',
        confirmLabel: 'Turn on',
        onConfirm: doSave,
      });
      return;
    }
    void doSave();
  }

  if (!data) {
    return <div className="cp-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="cp-skeleton" style={{ height: 84 }} />)}</div>;
  }

  const members = data.levels.reduce((s, l) => s + l.members, 0);
  const forSale = data.levels.filter((l) => l.is_active).length;
  const first = data.levels.find((l) => l.is_active);

  return (
    <>
      <div className="cp-kpis sv-kpis">
        <Kpi label="Members" value={fmt(members)} sub="Active + grace" tone="amber" />
        <Kpi label="Levels unlockable" value={`${forSale} / ${data.levels.length}`} />
        <Kpi
          label={first ? `${first.name} maintenance` : 'Maintenance'}
          value={first ? fmt(Math.floor((first.purchase_price * Number(pct || 0)) / 100)) : '—'}
          sub={`${pct || 0}% every ${period || 0} days`}
        />
      </div>

      <Section title="Settings" className="sv-settings">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="cp-toggle-row">
            <div>
              <div className="cp-toggle-title">SVIP by recharge</div>
              <div className={`cp-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — recharges unlock, upgrade and renew SVIP' : 'Off — recharges do nothing for SVIP (existing members keep their level until it ends)'}
              </div>
            </div>
            <Switch label="SVIP by recharge enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="cp-toggle-row">
            <div>
              <div className="cp-toggle-title">Launch promo: free SVIP 1</div>
              <div className={`cp-toggle-hint ${promo ? 'tone-green' : 'tone-red'}`}>
                {promo
                  ? 'On — every user without SVIP gets SVIP 1 free. It ends at once (no grace); to keep it they recharge the level amount.'
                  : 'Off — switch on for the launch week, switch off when the week is over (people who already got it keep it until it ends).'}
              </div>
            </div>
            <Switch label="Launch promo enabled" checked={promo} onChange={setPromo} />
          </div>
          <div className="cp-form-grid is-2up">
            <Field label="Promo length" hint="Days of free SVIP 1, counted from when each user gets it.">
              <div className="cp-unit"><input type="number" min={1} max={60} value={promoDays} onChange={(e) => setPromoDays(e.target.value)} /><span>days</span></div>
            </Field>
            <Field label="Maintenance fee" hint="Coins a member pays to renew by hand, as a % of the level's fee base.">
              <div className="cp-unit"><input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /><span>%</span></div>
            </Field>
            <Field label="Period" hint="Days one unlock or renewal lasts.">
              <div className="cp-unit"><input type="number" min={1} max={365} value={period} onChange={(e) => setPeriod(e.target.value)} /><span>days</span></div>
            </Field>
            <Field label="Grace" hint="Days SVIP stays on after the period ends, so the member can still renew.">
              <div className="cp-unit"><input type="number" min={0} max={30} value={grace} onChange={(e) => setGrace(e.target.value)} /><span>days</span></div>
            </Field>
            <Field label="Recharge window" hint="A recharge counts towards SVIP for this many days (e.g. 5 x Rs 100 inside 5 days).">
              <div className="cp-unit"><input type="number" min={1} max={60} value={rechargeDays} onChange={(e) => setRechargeDays(e.target.value)} /><span>days</span></div>
            </Field>
            <Field label="Renew window" hint="Renewing early (coins or recharge) opens in the last this-many days of a period.">
              <div className="cp-unit"><input type="number" min={0} max={30} value={renewDays} onChange={(e) => setRenewDays(e.target.value)} /><span>days</span></div>
            </Field>
          </div>
        </div>
        <div className="cp-form-actions">
          <button type="button" className="cp-btn cp-btn-primary cp-btn-lg" onClick={save} disabled={saving}>
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
        recharge_inr: String(l.recharge_inr),
        seller_price: String(l.seller_price),
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
            recharge_inr: r.recharge_inr.trim() || '0',
            seller_price: r.seller_price.trim() || '0',
            monthly_reward: r.monthly_reward.trim(),
            dice_refreshes: r.dice_refreshes.trim(),
            gold_mine_bonus_draws: r.gold_mine_bonus_draws.trim(),
            is_active: r.is_active,
          })),
        }),
      });
      apply(res.data);
      flash(true, 'Levels saved. New recharge amounts apply to the next unlock; the maintenance fee applies to the next renewal.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    confirm({
      title: 'Save SVIP levels?',
      message: 'Members pay the new maintenance fee at their next renewal. Turning a level off stops new unlocks only.',
      confirmLabel: 'Save levels',
      onConfirm: doSave,
    });
  }

  const num = (
    i: number,
    field: 'purchase_price' | 'seller_price' | 'monthly_reward' | 'dice_refreshes' | 'gold_mine_bonus_draws',
    r: LevelRow,
    label: string,
    narrow = false,
  ) => (
    <td className={`cp-td ${narrow ? 'sv-narrow' : 'sv-wide'}`} data-label={label}>
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
    <section className="cp-card">
      <div className="cp-card-head">
        <div>
          <h2>Levels</h2>
          <p>Recharge amounts (rupees) must rise level by level; moving up needs the difference. Fee base only sets the coin maintenance fee. Only turn a level on once its assets are live in the app.</p>
        </div>
        <div className="cp-actions">
          <button type="button" className="cp-btn cp-btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Working…' : 'Save levels'}
          </button>
        </div>
      </div>
      <div className="cp-table-wrap">
        <table className="cp-table is-stack is-3up sv-levels">
          <thead>
            <tr>
              <th className="cp-th">Level</th>
              <th className="cp-th">Name</th>
              <th className="cp-th" title="Rupees of real-money recharge (inside the recharge window) that unlock this level. 0 = cannot be unlocked.">Recharge (Rs)</th>
              <th className="cp-th" title="Coins. The maintenance fee is a % of this.">Fee base (coins)</th>
              <th className="cp-th" title="Coins a coin seller pays from their balance to give this level for one period. 0 = sellers cannot give it.">Seller price (coins)</th>
              <th className="cp-th">Monthly coins</th>
              <th className="cp-th" title="How many times one dice roll can be re-rolled (within 10 s)">Dice re-rolls</th>
              <th className="cp-th" title="Extra Daily Treasure draws per day while a Gold Mine runs">Mine bonus draws</th>
              <th className="cp-th cp-num">Maintenance ({pct}%)</th>
              <th className="cp-th cp-num">Members</th>
              <th className="cp-th">Unlock on</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <SkeletonRows cols={11} rows={9} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={11} title="No levels" hint="Levels are created by the SVIP migration." />
            ) : (
              rows.map((r, i) => (
                <tr key={r.level} className={`cp-row ${r.is_active ? '' : 'is-off'}`}>
                  <td className="cp-td" data-label="Level" style={{ fontWeight: 700 }}>{r.level}</td>
                  <td className="cp-td sv-wide" data-label="Name">
                    <input className="sv-cell" value={r.name} maxLength={64} aria-label={`Level ${r.level} name`} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td className="cp-td sv-wide" data-label="Recharge (Rs)">
                    <input
                      className="sv-cell"
                      value={r.recharge_inr}
                      inputMode="decimal"
                      aria-label={`${r.name} recharge amount in rupees`}
                      onChange={(e) => update(i, { recharge_inr: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                  </td>
                  {num(i, 'purchase_price', r, 'Fee base (coins)')}
                  {num(i, 'seller_price', r, 'Seller price (coins)')}
                  {num(i, 'monthly_reward', r, 'Monthly coins')}
                  {num(i, 'dice_refreshes', r, 'Dice re-rolls', true)}
                  {num(i, 'gold_mine_bonus_draws', r, 'Mine bonus draws', true)}
                  <td className="cp-td cp-num" data-label="Maintenance">{fmt(Math.floor(((Number(r.purchase_price) || 0) * pct) / 100))}</td>
                  <td className="cp-td cp-num" data-label="Members">{r.members}</td>
                  <td className="cp-td" data-label="On sale">
                    <Switch label={`${r.name} unlock on`} checked={r.is_active} onChange={(v) => update(i, { is_active: v })} />
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
  const [form, setForm] = useState({ user: '', level: '1', days: '30', recharge: false, coins: '' });
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
        body: JSON.stringify({
          user: form.user.trim(),
          level: Number(form.level),
          days: Number(form.days),
          ...(form.recharge ? { recharge_coins: form.coins.trim() } : {}),
        }),
      });
      setGranting(false);
      setForm({ user: '', level: '1', days: '30', recharge: false, coins: '' });
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
    <section className="cp-card">
      <div className="cp-toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="grace">Grace</option>
          <option value="expired">Expired</option>
        </select>
        <div className="cp-actions" style={{ marginLeft: 'auto' }}>
          <button type="button" className="cp-btn cp-btn-soft" onClick={() => setGranting(true)}>+ Grant SVIP</button>
        </div>
      </div>
      <div className="cp-table-wrap">
        <table className="cp-table is-stack is-3up">
          <thead>
            <tr>
              <th className="cp-th">User</th>
              <th className="cp-th cp-num">Level</th>
              <th className="cp-th">Status</th>
              <th className="cp-th">Source</th>
              <th className="cp-th">Period ends</th>
              <th className="cp-th"></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={6} />
            ) : data.items.length === 0 ? (
              <EmptyRow cols={6} title="No members" hint="Nobody matches this filter yet." />
            ) : (
              data.items.map((m) => (
                <tr key={m.user_id} className="cp-row">
                  <td className="cp-td" data-label="User">
                    <div className="cp-name">{m.name ?? '—'}</div>
                    <div className="cp-sub">ID {m.display_id}</div>
                  </td>
                  <td className="cp-td cp-num" data-label="Level">SVIP {m.level}</td>
                  <td className="cp-td" data-label="Status"><span className={`cp-badge ${STATUS_TONE[m.status]}`}>{m.status}</span></td>
                  <td className="cp-td" data-label="Source">{SOURCE_LABEL[m.source] ?? m.source}</td>
                  <td className="cp-td" data-label="Period ends">{new Date(m.period_ends_at).toLocaleString()}</td>
                  <td className="cp-td cp-num is-actions">
                    {m.status !== 'expired' && (
                      <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => revoke(m)}>Revoke</button>
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
            <button type="submit" className="cp-btn cp-btn-primary" disabled={busy || !form.user.trim() || (form.recharge && !form.coins)}>
              {busy ? 'Granting…' : 'Grant'}
            </button>
          }
        >
          <div className="cp-form-grid">
            <Field label="User" hint="Public user ID (as shown in the app) or account id.">
              <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} autoFocus />
            </Field>
            <Field label="Level">
              <input type="number" min={1} max={9} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            </Field>
            <Field label="Days" hint="Free period. Gifted SVIP renews by recharge only.">
              <input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </Field>
            <Field label="Type" hint="SVIP only, or SVIP with recharge: the user is also credited the coins you enter (no payment needed from you).">
              <select value={form.recharge ? 'recharge' : 'only'} onChange={(e) => setForm({ ...form, recharge: e.target.value === 'recharge' })}>
                <option value="only">SVIP only</option>
                <option value="recharge">SVIP with recharge</option>
              </select>
            </Field>
            {form.recharge && (
              <Field label="Recharge coins" hint="Coins credited to the user's wallet.">
                <input inputMode="numeric" value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ coin sellers

function SellersTab({ token, flash }: { token: string; flash: Flash }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<{ total: number; items: Seller[] } | null>(null);
  const [adding, setAdding] = useState<Seller | null>(null);
  const [coins, setCoins] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...(q.trim() ? { q: q.trim() } : {}) });
    const res = await api<{ data: { total: number; items: Seller[] } }>(`/admin/svip/sellers?${qs}`, token);
    setData(res.data);
  }, [token, page, limit, q]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  async function addCoins() {
    if (!adding) return;
    setBusy(true);
    try {
      await api(`/admin/users/${adding.user_id}/adjust-balance`, token, {
        method: 'POST',
        body: JSON.stringify({ asset: 'coins', action: 'add', amount: Number(coins), note: note.trim() || 'Coin seller stock' }),
      });
      setAdding(null);
      setCoins('');
      setNote('');
      await load();
      flash(true, 'Coins added to the seller.');
    } catch (e: any) {
      flash(false, `Failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cp-card">
      <div className="cp-toolbar">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name or user ID" aria-label="Search sellers" />
      </div>
      <p className="cp-sub" style={{ margin: '0 0 12px' }}>
        A seller pays the seller price (Levels tab) from their balance for every SVIP they give, plus any recharge coins they add. Add
        stock here; balances can only be changed by the super admin and every change is in the coin ledger. To make someone a seller, set their role to Coin Seller.
      </p>
      <div className="cp-table-wrap">
        <table className="cp-table is-stack is-3up">
          <thead>
            <tr>
              <th className="cp-th">Seller</th>
              <th className="cp-th cp-num">Balance</th>
              <th className="cp-th cp-num">Gifts this month</th>
              <th className="cp-th cp-num">Spent this month</th>
              <th className="cp-th"></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={5} />
            ) : data.items.length === 0 ? (
              <EmptyRow cols={5} title="No coin sellers" hint="Set a user's role to Coin Seller to list them here." />
            ) : (
              data.items.map((s) => (
                <tr key={s.user_id} className="cp-row">
                  <td className="cp-td" data-label="Seller">
                    <div className="cp-name">{s.name ?? '—'}{s.suspended && <span className="cp-badge gray" style={{ marginLeft: 6 }}>suspended</span>}</div>
                    <div className="cp-sub">ID {s.display_id}</div>
                  </td>
                  <td className="cp-td cp-num" data-label="Balance">{fmt(s.balance)}</td>
                  <td className="cp-td cp-num" data-label="Gifts this month">{s.month_gifts}</td>
                  <td className="cp-td cp-num" data-label="Spent this month">{fmt(s.month_spent)}</td>
                  <td className="cp-td cp-num is-actions">
                    <button type="button" className="cp-btn cp-btn-soft" onClick={() => setAdding(s)}>+ Add coins</button>
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
      {adding && (
        <Modal
          title={`Add coins to ${adding.name ?? adding.display_id}`}
          onClose={() => setAdding(null)}
          busy={busy}
          onSubmit={() => void addCoins()}
          footer={
            <button type="submit" className="cp-btn cp-btn-primary" disabled={busy || !coins || Number(coins) < 1}>
              {busy ? 'Adding…' : 'Add coins'}
            </button>
          }
        >
          <div className="cp-form-grid">
            <Field label="Coins" hint={`Current balance ${fmt(adding.balance)}.`}>
              <input inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/[^\d]/g, ''))} autoFocus />
            </Field>
            <Field label="Note" hint="Shown in the ledger (for example the bulk sale it belongs to).">
              <input value={note} maxLength={180} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ gifts

function GiftsTab({ token, flash }: { token: string; flash: Flash }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<{ total: number; items: Gift[] } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await api<{ data: { total: number; items: Gift[] } }>(`/admin/svip/gifts?${qs}`, token);
    setData(res.data);
  }, [token, page, limit]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  const who = (u: Gift['giver']) => (
    <>
      <div className="cp-name">{u.name ?? '—'}</div>
      <div className="cp-sub">ID {u.display_id ?? u.user_id}</div>
    </>
  );

  return (
    <section className="cp-card">
      <div className="cp-table-wrap">
        <table className="cp-table is-stack is-3up">
          <thead>
            <tr>
              <th className="cp-th">When</th>
              <th className="cp-th">Given by</th>
              <th className="cp-th">To</th>
              <th className="cp-th">SVIP</th>
              <th className="cp-th cp-num">Seller paid (coins)</th>
              <th className="cp-th cp-num">Recharge coins</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={6} />
            ) : data.items.length === 0 ? (
              <EmptyRow cols={6} title="No gifts yet" hint="SVIP given by sellers or admins shows here." />
            ) : (
              data.items.map((g) => (
                <tr key={g.id} className="cp-row">
                  <td className="cp-td" data-label="When">{new Date(g.created_at).toLocaleString()}</td>
                  <td className="cp-td" data-label="Given by">{who(g.giver)}<span className={`cp-badge ${g.giver_role === 'admin' ? 'amber' : 'green'}`}>{g.giver_role}</span></td>
                  <td className="cp-td" data-label="To">{who(g.user)}</td>
                  <td className="cp-td" data-label="SVIP">SVIP {g.level} · {g.kind} · {g.days}d</td>
                  <td className="cp-td cp-num" data-label="Seller paid (coins)">{g.giver_role === 'seller' ? fmt(g.price + g.recharge_coins) : '—'}</td>
                  <td className="cp-td cp-num" data-label="Recharge coins">{g.recharge_coins ? fmt(g.recharge_coins) : '—'}</td>
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
    </section>
  );
}

const SV_STYLES = `
.sv-nav { margin-bottom: 16px; }
.sv-nav .cp-tabs { border-bottom: none; }
.sv-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.sv-settings { max-width: 640px; }
.cp-page .sv-cell { width: 100%; min-width: 56px; padding: 6px 8px; min-height: 34px; font-size: 0.86rem; }
.sv-levels .sv-wide { min-width: 120px; }
.sv-levels .sv-narrow { min-width: 72px; width: 90px; }
.cp-row.is-off .sv-cell { color: #9ca3af; }
@media (max-width: 640px) {
  .sv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cp-page .sv-cell { min-width: 0; }
}
`;
