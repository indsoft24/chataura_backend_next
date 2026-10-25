'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Kpi, Modal, PageHeader, Section, SkeletonRows, Switch, useConfirm } from '@/components/admin-ui';

/**
 * Gold Mine — users activate Mine 1 / Mine 2 with coins for a number of days and get free Daily
 * Treasure draws every IST day while it runs (SVIP adds bonus draws, set on the SVIP Levels tab).
 * Each draw picks a prize from the weighted pool below and pays it at once.
 */

type Plan = {
  id: number;
  name: string;
  price: number;
  duration_days: number;
  daily_draws: number;
  is_active: boolean;
  running: number;
  expected_payout: number;
};

type Prize = {
  id: number;
  name: string;
  kind: 'coins' | 'frame';
  coins: number;
  frame_id: number | null;
  frame_name: string | null;
  days: number;
  weight: number;
  chance_pct: number;
  image_url: string | null;
  preview_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type Config = {
  settings: { gold_mine_enabled: boolean };
  plans: Plan[];
  prizes: Prize[];
  stats: { expected_coins_per_draw: number; draws_today: number; coins_paid_30d: number; coins_sold_30d: number };
};

type PlanRow = { id: number; name: string; price: string; duration_days: string; daily_draws: string; is_active: boolean };
type FrameOpt = { id: number; name: string; category: string; is_active: boolean };
type PrizeForm = { id?: number; name: string; kind: 'coins' | 'frame'; coins: string; frame_id: string; days: string; weight: string; image_url: string; is_active: boolean; sort_order: string };

const EMPTY_PRIZE: PrizeForm = { name: '', kind: 'coins', coins: '', frame_id: '', days: '7', weight: '10', image_url: '', is_active: true, sort_order: '0' };
/** Frames from their own system can't be prizes (the backend refuses them too). */
const NON_PRIZE_FRAMES = new Set(['rocket', 'rank', 'special', 'svip', 'role', 'relationship']);

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  return n.toLocaleString('en-US');
}

export default function GoldMinePage() {
  const { token } = useAdminAuth();
  const { confirm, confirmNode } = useConfirm();
  const [data, setData] = useState<Config | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState<FrameOpt[]>([]);
  const [form, setForm] = useState<PrizeForm | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  const apply = (c: Config) => {
    setData(c);
    setEnabled(c.settings.gold_mine_enabled);
    setPlans(
      c.plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: String(p.price),
        duration_days: String(p.duration_days),
        daily_draws: String(p.daily_draws),
        is_active: p.is_active,
      })),
    );
    setDirty(false);
  };

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api<{ data: Config }>('/admin/gold-mine', token);
    apply(res.data);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  useEffect(() => {
    if (!token) return;
    api<{ data?: { frames: FrameOpt[] } }>('/admin/frames', token)
      .then((r) => setFrames((r.data?.frames ?? []).filter((f) => !NON_PRIZE_FRAMES.has((f.category ?? '').toLowerCase()))))
      .catch(() => setFrames([]));
  }, [token]);

  async function doSave() {
    setBusy(true);
    try {
      const res = await api<{ data: Config }>('/admin/gold-mine', token!, {
        method: 'PUT',
        body: JSON.stringify({ settings: { gold_mine_enabled: enabled }, plans }),
      });
      apply(res.data);
      flash(true, 'Gold Mine saved. New prices apply to new activations.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (enabled && !data?.settings.gold_mine_enabled) {
      confirm({
        title: 'Open Gold Mine?',
        message: data?.prizes.some((p) => p.is_active)
          ? 'Users can activate mines and draw prizes right away.'
          : 'There are no active prizes yet — draws will fail until you add some.',
        confirmLabel: 'Turn on',
        onConfirm: doSave,
      });
      return;
    }
    void doSave();
  }

  function updatePlan(i: number, patch: Partial<PlanRow>) {
    setPlans((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function savePrize() {
    if (!form) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ ...form, frame_id: form.frame_id || null });
      const res = await api<{ data: Config }>(form.id ? `/admin/gold-mine/prizes/${form.id}` : '/admin/gold-mine/prizes', token!, {
        method: form.id ? 'PUT' : 'POST',
        body,
      });
      apply(res.data);
      setForm(null);
      flash(true, 'Prize saved.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function removePrize(p: Prize) {
    confirm({
      title: `Delete "${p.name}"?`,
      message: 'It leaves the pool now. Past draws keep their record.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await api<{ data: Config }>(`/admin/gold-mine/prizes/${p.id}`, token!, { method: 'DELETE' });
          apply(res.data);
          flash(true, 'Prize deleted.');
        } catch (e: any) {
          flash(false, `Delete failed: ${e?.message ?? e}`);
        }
      },
    });
  }

  const s = data?.stats;
  return (
    <main className="ad-page">
      <style dangerouslySetInnerHTML={{ __html: GM_STYLES }} />
      <PageHeader
        title="Gold Mine"
        subtitle="Users activate a mine with coins and get free Daily Treasure draws every day it runs (reset 00:00 IST, unused draws don't carry over). SVIP bonus draws are set per level on the SVIP page."
      />
      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      <div className="ad-kpis gm-kpis">
        <Kpi label="Avg coins / draw" value={s ? fmt(s.expected_coins_per_draw) : '…'} sub="From prize weights" tone="amber" />
        <Kpi label="Draws today" value={s ? fmt(s.draws_today) : '…'} />
        <Kpi label="Mines sold (30 d)" value={s ? fmt(s.coins_sold_30d) : '…'} sub="Coins in" />
        <Kpi label="Prizes paid (30 d)" value={s ? fmt(s.coins_paid_30d) : '…'} sub="Coins out" />
      </div>

      <section className="ad-card" style={{ marginBottom: 16 }}>
        <div className="ad-card-head">
          <div>
            <h2>Mines</h2>
            <p>Buying a running mine again extends it. Payback = average coins a full period of draws pays (no SVIP bonus) — keep it below the price.</p>
          </div>
          <div className="ad-actions">
            <button type="button" className="ad-btn ad-btn-primary" onClick={save} disabled={busy || (!dirty && enabled === data?.settings.gold_mine_enabled)}>
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="ad-card-body">
          <div className="ad-toggle-row">
            <div>
              <div className="ad-toggle-title">Gold Mine</div>
              <div className={`ad-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — users can activate mines' : 'Off — no new activations (running mines keep their draws)'}
              </div>
            </div>
            <Switch label="Gold Mine enabled" checked={enabled} onChange={setEnabled} />
          </div>
        </div>
        <div className="ad-table-wrap">
          <table className="ad-table is-stack is-3up gm-table">
            <thead>
              <tr>
                <th className="ad-th">Name</th>
                <th className="ad-th">Price</th>
                <th className="ad-th">Days</th>
                <th className="ad-th">Draws / day</th>
                <th className="ad-th ad-num">Payback</th>
                <th className="ad-th ad-num">Running</th>
                <th className="ad-th">On sale</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <SkeletonRows cols={7} rows={2} />
              ) : (
                plans.map((r, i) => {
                  const plan = data.plans[i];
                  const payback = Math.round(s!.expected_coins_per_draw * (Number(r.daily_draws) || 0) * (Number(r.duration_days) || 0));
                  const risky = payback >= (Number(r.price) || 0);
                  return (
                    <tr key={r.id} className={`ad-row ${r.is_active ? '' : 'is-off'}`}>
                      <td className="ad-td" data-label="Name">
                        <input className="gm-cell" value={r.name} maxLength={64} aria-label={`Mine ${r.id} name`} onChange={(e) => updatePlan(i, { name: e.target.value })} />
                      </td>
                      {(['price', 'duration_days', 'daily_draws'] as const).map((k) => (
                        <td key={k} className="ad-td" data-label={k}>
                          <input
                            className="gm-cell"
                            inputMode="numeric"
                            value={r[k]}
                            aria-label={`${r.name} ${k}`}
                            onChange={(e) => updatePlan(i, { [k]: e.target.value.replace(/[^\d]/g, '') } as Partial<PlanRow>)}
                          />
                        </td>
                      ))}
                      <td className={`ad-td ad-num ${risky ? 'tone-red' : ''}`} data-label="Payback" title={risky ? 'Pays back more than it costs' : ''}>
                        {fmt(payback)}
                      </td>
                      <td className="ad-td ad-num" data-label="Running">{plan?.running ?? 0}</td>
                      <td className="ad-td" data-label="On sale">
                        <Switch label={`${r.name} on sale`} checked={r.is_active} onChange={(v) => updatePlan(i, { is_active: v })} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Section
        title="Prize pool"
        subtitle="Each draw picks one active prize by weight. Chance = weight ÷ total weight."
        bodyClassName=""
        actions={<button type="button" className="ad-btn ad-btn-soft" onClick={() => setForm({ ...EMPTY_PRIZE })}>+ Add prize</button>}
      >
        <div className="ad-table-wrap">
          <table className="ad-table is-stack is-3up">
            <thead>
              <tr>
                <th className="ad-th">Prize</th>
                <th className="ad-th">Reward</th>
                <th className="ad-th ad-num">Weight</th>
                <th className="ad-th ad-num">Chance</th>
                <th className="ad-th">Status</th>
                <th className="ad-th"></th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <SkeletonRows cols={6} rows={3} />
              ) : data.prizes.length === 0 ? (
                <EmptyRow cols={6} title="No prizes" hint="Add coin or frame prizes before turning Gold Mine on." />
              ) : (
                data.prizes.map((p) => (
                  <tr key={p.id} className={`ad-row ${p.is_active ? '' : 'is-off'}`}>
                    <td className="ad-td" data-label="Prize">
                      <div className="gm-prize">
                        {p.preview_url ? <img src={p.preview_url} alt="" /> : <span className="gm-ph">{p.kind === 'coins' ? '🪙' : '🖼'}</span>}
                        <div className="ad-name">{p.name}</div>
                      </div>
                    </td>
                    <td className="ad-td" data-label="Reward">
                      {p.kind === 'coins' ? `${fmt(p.coins)} coins` : `${p.frame_name ?? 'Frame removed'} · ${p.days} days`}
                    </td>
                    <td className="ad-td ad-num" data-label="Weight">{p.weight}</td>
                    <td className="ad-td ad-num" data-label="Chance">{p.chance_pct}%</td>
                    <td className="ad-td" data-label="Status">
                      <span className={`ad-badge ${p.is_active && p.chance_pct > 0 ? 'green' : 'gray'}`}>{p.is_active ? (p.chance_pct > 0 ? 'in pool' : 'frame off') : 'off'}</span>
                    </td>
                    <td className="ad-td ad-num is-actions">
                      <button
                        type="button"
                        className="ad-btn ad-btn-soft"
                        onClick={() =>
                          setForm({
                            id: p.id,
                            name: p.name,
                            kind: p.kind,
                            coins: String(p.coins || ''),
                            frame_id: p.frame_id ? String(p.frame_id) : '',
                            days: String(p.days || 7),
                            weight: String(p.weight),
                            image_url: p.image_url ?? '',
                            is_active: p.is_active,
                            sort_order: String(p.sort_order),
                          })
                        }
                      >
                        Edit
                      </button>
                      <button type="button" className="ad-btn ad-btn-danger-soft" onClick={() => removePrize(p)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {form && (
        <Modal
          title={form.id ? 'Edit prize' : 'Add prize'}
          onClose={() => setForm(null)}
          busy={busy}
          onSubmit={() => void savePrize()}
          footer={
            <button type="submit" className="ad-btn ad-btn-primary" disabled={busy || !form.name.trim()}>
              {busy ? 'Saving…' : 'Save prize'}
            </button>
          }
        >
          <div className="ad-form-grid">
            <Field label="Name" hint="Shown to the user, e.g. “5K Coins”.">
              <input value={form.name} maxLength={64} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Type">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PrizeForm['kind'] })}>
                <option value="coins">Coins</option>
                <option value="frame">Frame for some days</option>
              </select>
            </Field>
            {form.kind === 'coins' ? (
              <Field label="Coins">
                <input inputMode="numeric" value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
            ) : (
              <>
                <Field label="Frame" hint="Reward, role, CP and SVIP frames can't be prizes.">
                  <select value={form.frame_id} onChange={(e) => setForm({ ...form, frame_id: e.target.value })}>
                    <option value="">Pick a frame…</option>
                    {frames.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}{f.is_active ? '' : ' (off)'}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Days" hint="Winning again adds more days.">
                  <input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="Weight" hint="Higher = more likely. Rare prizes: small weight.">
              <input type="number" min={1} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </Field>
            <Field label="Image URL" hint="Optional. Frame prizes use the frame image when empty.">
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            </Field>
            <Field label="Order" hint="Lower shows first in the app.">
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </Field>
            <div className="ad-toggle-row">
              <div className="ad-toggle-title">In the pool</div>
              <Switch label="Prize active" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
        </Modal>
      )}
      {confirmNode}
    </main>
  );
}

const GM_STYLES = `
.gm-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ad-page .gm-cell { width: 100%; min-width: 64px; padding: 6px 8px; min-height: 34px; font-size: 0.86rem; }
.ad-row.is-off .gm-cell { color: #9ca3af; }
.gm-prize { display: flex; align-items: center; gap: 10px; }
.gm-prize img, .gm-ph { width: 36px; height: 36px; border-radius: 8px; object-fit: contain; background: #f3f4f6; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
.tone-red { color: #dc2626; font-weight: 700; }
@media (max-width: 640px) {
  .gm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-page .gm-cell { min-width: 0; }
}
`;
