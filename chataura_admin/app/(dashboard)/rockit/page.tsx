'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Modal, PageHeader, Section, Switch, errorText, useConfirm } from '@/components/admin-ui';

type Level = {
  level: number;
  name: string;
  threshold_coins: number;
  reward_pool_percentage: number;
  reward_distribution_rules: number[];
  frame_id: number | null;
  frame_days: number;
  xp_rate: number;
  min_xp: number;
  duration_seconds: number;
  theme_color: string;
  visual_tier: number;
  launch_asset_key: string | null;
  station_asset_key: string | null;
  badge_asset_key: string | null;
  lucky_audience_percent: number;
  lucky_pool_percentage: number;
  is_active: boolean;
};

type Campaign = {
  id: number;
  name: string;
  launch_threshold_coins: number;
  minimum_contribution_required: number;
  eligible_room_types: string[];
  rockit_duration_seconds: number;
  status: boolean;
  daily_reset_enabled: boolean;
  reset_timezone: string;
  reset_hour: number;
  expiry_mode: 'RESET_PROGRESS' | 'RESET_CYCLE';
  carry_overflow: boolean;
  levels: Level[];
};

type AuditEntry = {
  id: number;
  actor_id: number | null;
  action: string;
  created_at: string;
  before: unknown;
};

type Frame = { id: number; name: string };

/** Editable level row: numeric fields kept as strings while typing. */
type LevelDraft = Omit<Level, 'threshold_coins' | 'reward_pool_percentage' | 'reward_distribution_rules' | 'frame_days' | 'duration_seconds' | 'xp_rate' | 'min_xp' | 'lucky_audience_percent' | 'lucky_pool_percentage'> & {
  threshold_coins: string;
  reward_pool_percentage: string;
  reward_distribution_rules: string;
  frame_days: string;
  lucky_audience_percent: string;
  lucky_pool_percentage: string;
  duration_minutes: string;
  xp_rate: string;
  min_xp: string;
  saved: boolean;
};

const TIER_NAMES = ['', 'Emerald', 'Amethyst', 'Crimson', 'Solar Gold', 'Cosmic'];

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

function toDraft(l: Level): LevelDraft {
  return {
    ...l,
    threshold_coins: String(l.threshold_coins),
    reward_pool_percentage: String(l.reward_pool_percentage),
    reward_distribution_rules: (l.reward_distribution_rules ?? []).join(', '),
    frame_days: String(l.frame_days),
    lucky_audience_percent: String(l.lucky_audience_percent ?? 0),
    lucky_pool_percentage: String(l.lucky_pool_percentage ?? 0),
    duration_minutes: String(Math.round(l.duration_seconds / 60)),
    xp_rate: String(l.xp_rate),
    min_xp: String(l.min_xp),
    saved: true,
  };
}

function parseRules(text: string): number[] {
  return text
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** 10000000 → "10M", 1500000 → "1.5M". */
function short(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function levelErrors(drafts: LevelDraft[]): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  drafts.forEach((d, i) => {
    const errs: string[] = [];
    const t = Number(d.threshold_coins);
    if (!Number.isInteger(t) || t < 1 || t > 1e9) errs.push('Target must be 1 – 1,000,000,000');
    if (i > 0 && t <= Number(drafts[i - 1].threshold_coins)) errs.push(`Target must be above LV${i}`);
    const pool = Number(d.reward_pool_percentage);
    if (!(pool >= 0 && pool <= 100)) errs.push('Pool must be 0 – 100%');
    const luckyAudience = Number(d.lucky_audience_percent);
    if (!(luckyAudience >= 0 && luckyAudience <= 100)) errs.push('Lucky audience must be 0 – 100%');
    const luckyPool = Number(d.lucky_pool_percentage);
    if (!(luckyPool >= 0 && luckyPool <= 100)) errs.push('Lucky pool must be 0 – 100%');
    else if (pool + luckyPool > 100) errs.push('Reward pool + lucky pool must not exceed 100%');
    const rules = parseRules(d.reward_distribution_rules);
    const sum = rules.reduce((a, b) => a + b, 0);
    if (rules.length === 0) errs.push('Add at least one winner %');
    else if (Math.abs(sum - 100) > 0.5) errs.push(`Prize split sums to ${sum}%, must be 100%`);
    if (errs.length) out[d.level] = errs;
  });
  return out;
}

export default function RocketLevelsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Campaign | null>(null);
  const [drafts, setDrafts] = useState<LevelDraft[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState<string | null>(null);
  const { confirm, confirmNode } = useConfirm();

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  const errors = useMemo(() => levelErrors(drafts), [drafts]);
  const dirty = useMemo(() => {
    if (!selected) return false;
    const saved = JSON.stringify(selected.levels.map(toDraft));
    return JSON.stringify(drafts.map((d) => ({ ...d, saved: true }))) !== saved;
  }, [drafts, selected]);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(null), 4000);
  }

  async function load(tok: string, keepId?: number | null) {
    setLoading(true);
    try {
      const data = unwrap<{ campaigns: Campaign[]; asset_urls?: Record<string, string> }>(
        await api('/admin/rockit/campaigns', tok),
      );
      const list = Array.isArray(data.campaigns) ? data.campaigns : [];
      setCampaigns(list);
      setAssetUrls(data.asset_urls ?? {});
      const pick =
        list.find((c) => c.id === keepId) ?? list.find((c) => c.status) ?? list[0] ?? null;
      setSelectedId(pick?.id ?? null);
      setSettings(pick ? { ...pick } : null);
      setDrafts(pick ? pick.levels.map(toDraft) : []);
      if (pick) void loadAudit(tok, pick.id);
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit(tok: string, id: number) {
    try {
      const data = unwrap<{ entries: AuditEntry[] }>(
        await api(`/admin/rockit/audit?campaign_id=${id}&limit=20`, tok),
      );
      setAudit(data.entries ?? []);
    } catch {
      setAudit([]);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    api('/admin/frames', token)
      .then((j) => setFrames(unwrap<{ frames: Frame[] }>(j).frames ?? []))
      .catch(() => setFrames([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function choose(c: Campaign) {
    if (dirty) {
      confirm({
        title: 'Discard unsaved changes?',
        message: 'Your edits to this ladder have not been published.',
        confirmLabel: 'Discard',
        tone: 'danger',
        onConfirm: async () => switchTo(c),
      });
      return;
    }
    switchTo(c);
  }

  function switchTo(c: Campaign) {
    setSelectedId(c.id);
    setSettings({ ...c });
    setDrafts(c.levels.map(toDraft));
    if (token) void loadAudit(token, c.id);
  }

  function patch(level: number, p: Partial<LevelDraft>) {
    setDrafts((ds) => ds.map((d) => (d.level === level ? { ...d, ...p } : d)));
  }

  function addLevel() {
    const last = drafts[drafts.length - 1];
    const n = drafts.length + 1;
    const lastTarget = Number(last?.threshold_coins ?? 0);
    setDrafts([
      ...drafts,
      {
        level: n,
        name: `Level ${n}`,
        threshold_coins: String(lastTarget > 0 ? lastTarget + 50_000_000 : 10_000_000),
        reward_pool_percentage: last?.reward_pool_percentage ?? '15',
        reward_distribution_rules: last?.reward_distribution_rules ?? '40, 25, 15, 12, 8',
        frame_id: last?.frame_id ?? null,
        lucky_audience_percent: last?.lucky_audience_percent ?? '50',
        lucky_pool_percentage: last?.lucky_pool_percentage ?? '3',
        frame_days: last?.frame_days ?? '7',
        duration_minutes: '0',
        xp_rate: last?.xp_rate ?? '0.02',
        min_xp: last?.min_xp ?? '20',
        theme_color: last?.theme_color ?? '#6366F1',
        visual_tier: 5,
        launch_asset_key: null,
        station_asset_key: null,
        badge_asset_key: null,
        is_active: true,
        saved: false,
      },
    ]);
    setOpen((o) => new Set(o).add(n));
  }

  function removeLastLevel() {
    if (drafts.length <= 1) return;
    const last = drafts[drafts.length - 1];
    confirm({
      title: `Remove LV${last.level}?`,
      message: <>&ldquo;{last.name}&rdquo; is removed when you publish. Rooms already on it keep running until their rocket ends.</>,
      confirmLabel: 'Remove level',
      tone: 'danger',
      onConfirm: async () => setDrafts((ds) => ds.slice(0, -1)),
    });
  }

  async function saveSettings() {
    if (!token || !settings) return;
    setBusy('settings');
    try {
      await api('/admin/rockit/campaigns', token, {
        method: 'POST',
        body: JSON.stringify({
          id: settings.id,
          name: settings.name,
          minimum_contribution_required: Number(settings.minimum_contribution_required),
          eligible_room_types: settings.eligible_room_types,
          status: settings.status,
          daily_reset_enabled: settings.daily_reset_enabled,
          reset_timezone: settings.reset_timezone,
          reset_hour: Number(settings.reset_hour),
          expiry_mode: settings.expiry_mode,
          carry_overflow: settings.carry_overflow,
        }),
      });
      flash(true, 'Campaign settings saved.');
      await load(token, settings.id);
    } catch (e) {
      flash(false, `Save failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function saveLevels() {
    if (!token || !selected) return;
    if (Object.keys(errors).length) {
      flash(false, 'Fix the highlighted levels before publishing.');
      setOpen(new Set(Object.keys(errors).map(Number)));
      return;
    }
    confirm({
      title: 'Publish this ladder?',
      message: 'It applies right away, including rockets already running (their progress is kept).',
      confirmLabel: 'Publish',
      onConfirm: publishLevels,
    });
  }

  async function publishLevels() {
    if (!token || !selected) return;
    setBusy('levels');
    try {
      const res = await api<unknown>(`/admin/rockit/campaigns/${selected.id}/levels`, token, {
        method: 'PUT',
        body: JSON.stringify({
          levels: drafts.map((d) => ({
            level: d.level,
            name: d.name.trim(),
            threshold_coins: Number(d.threshold_coins),
            reward_pool_percentage: Number(d.reward_pool_percentage),
            reward_distribution_rules: parseRules(d.reward_distribution_rules),
            frame_id: d.frame_id,
            lucky_audience_percent: Number(d.lucky_audience_percent),
            lucky_pool_percentage: Number(d.lucky_pool_percentage),
            frame_days: Number(d.frame_days),
            xp_rate: Number(d.xp_rate),
            min_xp: Number(d.min_xp),
            duration_seconds: Math.round(Number(d.duration_minutes) * 60),
            theme_color: d.theme_color,
            visual_tier: d.visual_tier,
            launch_asset_key: d.launch_asset_key,
            station_asset_key: d.station_asset_key,
            badge_asset_key: d.badge_asset_key,
            is_active: d.is_active,
          })),
        }),
      });
      const live = unwrap<{ refreshed_live_events?: number }>(res)?.refreshed_live_events ?? 0;
      flash(true, live > 0 ? `Ladder published. ${live} live rocket${live === 1 ? '' : 's'} updated to the new rules.` : 'Ladder published.');
      await load(token, selected.id);
    } catch (e) {
      flash(false, `Publish failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function upload(level: number, slot: 'launch' | 'station' | 'badge', file: File) {
    if (!token || !selected) return;
    setBusy(`${slot}-${level}`);
    try {
      const form = new FormData();
      form.append('file', file);
      await api(`/admin/rockit/campaigns/${selected.id}/levels/${level}/assets/${slot}`, token, {
        method: 'POST',
        body: form,
      });
      flash(true, `LV${level} ${slot} uploaded to storage. Apps pick it up on their next catalog refresh.`);
      await load(token, selected.id);
    } catch (e) {
      flash(false, `Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function createCampaign(name: string) {
    if (!token || !name.trim()) return;
    setNewName(null);
    setBusy('create');
    try {
      const json = unwrap<{ campaign: Campaign }>(
        await api('/admin/rockit/campaigns', token, {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), status: false }),
        }),
      );
      flash(true, 'Campaign created (inactive) with the standard LV1–LV5 ladder.');
      await load(token, json.campaign?.id);
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function restore(entry: AuditEntry) {
    if (!token || !selected) return;
    confirm({
      title: `Restore before change #${entry.id}?`,
      message: 'The campaign settings and ladder go back to how they were before this change.',
      confirmLabel: 'Restore',
      onConfirm: () => doRestore(entry),
    });
  }

  async function doRestore(entry: AuditEntry) {
    if (!token || !selected) return;
    setBusy('restore');
    try {
      await api(`/admin/rockit/audit/${entry.id}/restore`, token, { method: 'POST' });
      flash(true, `Restored version before change #${entry.id}.`);
      await load(token, selected.id);
    } catch (e) {
      flash(false, `Restore failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  function urlFor(d: LevelDraft, slot: 'launch' | 'station' | 'badge'): string | null {
    const own = slot === 'launch' ? d.launch_asset_key : slot === 'station' ? d.station_asset_key : d.badge_asset_key;
    return (
      (own ? assetUrls[own] : undefined) ??
      assetUrls[`rocket.${slot}_lv${d.level}`] ??
      (slot === 'launch' ? assetUrls[`rocket.launch_lv${d.visual_tier}`] : undefined) ??
      (slot === 'station' ? assetUrls['rocket.station_idle'] : undefined) ??
      null
    );
  }

  const totalLadder = drafts.reduce((a, d) => a + (Number(d.threshold_coins) || 0), 0);
  const toggleOpen = (level: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(level)) n.delete(level);
      else n.add(level);
      return n;
    });
  const SLOT_LABEL = { launch: 'Launch video', station: 'Station video', badge: 'Level badge' } as const;

  return (
    <main className="ad-page">
      <style dangerouslySetInnerHTML={{ __html: RK_STYLES }} />
      <PageHeader
        title="Rocket levels"
        subtitle={
          <>
            Each room climbs LV1 → LV{drafts.length || 'N'}. When a level&apos;s target is reached it launches, pays the top contributors and
            the next level starts; after the top level the room returns to LV1.
            {settings?.daily_reset_enabled && ` Rooms reset to LV1 daily at ${String(settings.reset_hour).padStart(2, '0')}:00 (${settings.reset_timezone}).`}
          </>
        }
        actions={
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={() => setNewName('Rocket Season')} disabled={busy !== ''}>
            + New campaign
          </button>
        }
      />

      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      {loading && !selected ? (
        <div style={{ display: 'grid', gap: 14 }}><div className="ad-skeleton is-card" /><div className="ad-skeleton is-card" /></div>
      ) : !selected || !settings ? (
        <section className="ad-card"><div className="ad-empty"><div className="ad-empty-title">No campaigns yet</div>Create one to get the standard LV1–LV5 ladder.</div></section>
      ) : (
        <>
          {campaigns.length > 1 && (
            <div className="ad-chips" style={{ marginBottom: 14 }}>
              {campaigns.map((c) => (
                <button key={c.id} type="button" className={`ad-chip ${c.id === selected.id ? 'is-active' : ''}`} onClick={() => choose(c)}>
                  #{c.id} {c.name}{c.status ? ' · Active' : ''}
                </button>
              ))}
            </div>
          )}

          <Section collapsible title="Campaign settings" subtitle={`${settings.name} · ${settings.status ? 'Active' : 'Inactive'} · min contribution ${short(settings.minimum_contribution_required)} coins`}>
            <div className="ad-form-grid rk-settings">
              <Field label="Name">
                <input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
              </Field>
              <Field label="Eligible rooms" hint="“all”, or a list like public, vip, permanent.">
                <input
                  value={settings.eligible_room_types.join(', ')}
                  placeholder="all or public, vip, permanent"
                  onChange={(e) => setSettings({ ...settings, eligible_room_types: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                />
              </Field>
              <Field label="Minimum contribution">
                <div className="ad-unit">
                  <input type="number" min={1} value={settings.minimum_contribution_required} onChange={(e) => setSettings({ ...settings, minimum_contribution_required: Number(e.target.value) })} />
                  <span>coins</span>
                </div>
              </Field>
              <Field label="When a level's time runs out">
                <select value={settings.expiry_mode} onChange={(e) => setSettings({ ...settings, expiry_mode: e.target.value as Campaign['expiry_mode'] })}>
                  <option value="RESET_PROGRESS">Stay on level, progress back to 0</option>
                  <option value="RESET_CYCLE">Go back to LV1</option>
                </select>
              </Field>
              <Field label="Daily reset time">
                <select value={settings.reset_hour} disabled={!settings.daily_reset_enabled} onChange={(e) => setSettings({ ...settings, reset_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </Field>
              <Field label="Timezone">
                <input value={settings.reset_timezone} disabled={!settings.daily_reset_enabled} placeholder="Asia/Kolkata" onChange={(e) => setSettings({ ...settings, reset_timezone: e.target.value })} />
              </Field>
            </div>
            <div className="rk-toggles">
              {([
                ['status', 'Active campaign', 'Activating this deactivates every other campaign.'],
                ['daily_reset_enabled', 'Daily reset to LV1', 'Every room goes back to LV1 at the reset time.'],
                ['carry_overflow', 'Carry extra coins', 'Coins above a level’s target count toward the next level.'],
              ] as const).map(([k, title, hint]) => (
                <div key={k} className="ad-toggle-row">
                  <div>
                    <div className="ad-toggle-title">{title}</div>
                    <div className="ad-toggle-hint">{hint}</div>
                  </div>
                  <Switch label={title} checked={Boolean(settings[k])} onChange={(v) => setSettings({ ...settings, [k]: v })} />
                </div>
              ))}
            </div>
            <div className="ad-form-actions">
              <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" disabled={busy !== ''} onClick={() => void saveSettings()}>
                {busy === 'settings' ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </Section>

          <section className="ad-card">
            <div className="ad-card-head">
              <div>
                <h2>Ladder</h2>
                <p>{drafts.length} levels · full climb {short(totalLadder)} coins</p>
              </div>
              <div className="ad-actions">
                <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setOpen(open.size ? new Set() : new Set(drafts.map((d) => d.level)))}>
                  {open.size ? 'Collapse all' : 'Expand all'}
                </button>
                <button type="button" className="ad-btn ad-btn-ghost" onClick={removeLastLevel} disabled={drafts.length <= 1}>Remove last</button>
                <button type="button" className="ad-btn ad-btn-soft" onClick={addLevel} disabled={drafts.length >= 50}>+ Add level</button>
              </div>
            </div>

            <div className="rk-levels">
              {drafts.map((d) => {
                const target = Number(d.threshold_coins) || 0;
                const pct = Number(d.reward_pool_percentage) || 0;
                const rules = parseRules(d.reward_distribution_rules);
                const ruleSum = rules.reduce((a, b) => a + b, 0);
                const sum = ruleSum || 1;
                const pool = Math.floor((target * pct) / 100);
                const luckyPct = Number(d.lucky_pool_percentage) || 0;
                const luckyAudience = Number(d.lucky_audience_percent) || 0;
                const luckyPool = luckyAudience > 0 ? Math.floor((target * luckyPct) / 100) : 0;
                const errs = errors[d.level];
                const isOpen = open.has(d.level) || Boolean(errs);
                return (
                  <div key={d.level} className={`rk-level ${errs ? 'has-error' : ''} ${d.is_active ? '' : 'is-off'}`} style={{ borderLeftColor: d.theme_color }}>
                    <div className="rk-level-head">
                      <button type="button" className="rk-level-toggle" aria-expanded={isOpen} onClick={() => toggleOpen(d.level)}>
                        <span className="rk-lv" style={{ background: d.theme_color }}>LV{d.level}</span>
                        <span className="rk-level-title">
                          <strong>{d.name || `Level ${d.level}`}</strong>
                          <span>
                            {short(target)} target · {short(pool)} pool · #1 wins {short(Math.floor((pool * (rules[0] ?? 0)) / sum))}
                            {luckyPool > 0 ? ` · Lucky ${short(luckyPool)}` : ''}
                          </span>
                        </span>
                        {!d.saved && <span className="ad-badge amber">New</span>}
                        {errs && <span className="ad-badge red">{errs.length} issue{errs.length > 1 ? 's' : ''}</span>}
                        <span className="rk-chevron" aria-hidden>{isOpen ? '−' : '+'}</span>
                      </button>
                      <Switch label={`LV${d.level} active`} checked={d.is_active} onChange={(v) => patch(d.level, { is_active: v })} />
                    </div>

                    {isOpen && (
                      <div className="rk-level-body">
                        <div className="rk-econ">
                          Platform keeps <strong>{short(target - pool - luckyPool)}</strong> ({(100 - pct - (luckyPool > 0 ? luckyPct : 0)).toFixed(1)}%)
                          {luckyPool > 0 && <> · {luckyAudience}% of the room shares the lucky pool</>}
                        </div>
                        <div className="rk-fields">
                          <Field label="Level name" className="rk-span2">
                            <input value={d.name} onChange={(e) => patch(d.level, { name: e.target.value })} />
                          </Field>
                          <Field label="Target">
                            <div className="ad-unit"><input type="number" min={1} value={d.threshold_coins} onChange={(e) => patch(d.level, { threshold_coins: e.target.value })} /><span>coins</span></div>
                          </Field>
                          <Field label="Reward pool">
                            <div className="ad-unit"><input type="number" min={0} max={100} step={0.5} value={d.reward_pool_percentage} onChange={(e) => patch(d.level, { reward_pool_percentage: e.target.value })} /><span>%</span></div>
                          </Field>
                          <Field
                            label={<>Prize split · {rules.length} winners · <span className={Math.abs(ruleSum - 100) > 0.5 ? 'tone-red' : 'tone-green'}>{ruleSum}%</span></>}
                            hint="Percent for #1, #2, … separated by commas; must total 100."
                            className="rk-span2"
                          >
                            <input value={d.reward_distribution_rules} onChange={(e) => patch(d.level, { reward_distribution_rules: e.target.value })} />
                          </Field>
                          <Field label="Time limit" hint="0 = until the daily reset.">
                            <div className="ad-unit"><input type="number" min={0} value={d.duration_minutes} onChange={(e) => patch(d.level, { duration_minutes: e.target.value })} /><span>min</span></div>
                          </Field>
                          <Field label="Theme colour">
                            <input className="rk-color" type="color" value={d.theme_color} onChange={(e) => patch(d.level, { theme_color: e.target.value.toUpperCase() })} />
                          </Field>
                          <Field label="Frame reward" className="rk-span2">
                            <select value={d.frame_id ?? ''} onChange={(e) => patch(d.level, { frame_id: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">Default (first active frames)</option>
                              {frames.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Frame days">
                            <div className="ad-unit"><input type="number" min={1} value={d.frame_days} onChange={(e) => patch(d.level, { frame_days: e.target.value })} /><span>days</span></div>
                          </Field>
                          <Field label="Lucky audience" hint="0 = off.">
                            <div className="ad-unit"><input type="number" min={0} max={100} step={1} value={d.lucky_audience_percent} onChange={(e) => patch(d.level, { lucky_audience_percent: e.target.value })} /><span>%</span></div>
                          </Field>
                          <Field label="Lucky pool" hint="Of the target.">
                            <div className="ad-unit"><input type="number" min={0} max={100} step={0.5} value={d.lucky_pool_percentage} onChange={(e) => patch(d.level, { lucky_pool_percentage: e.target.value })} /><span>%</span></div>
                          </Field>
                          <Field label="XP per coin won">
                            <input type="number" min={0} step={0.01} value={d.xp_rate} onChange={(e) => patch(d.level, { xp_rate: e.target.value })} />
                          </Field>
                          <Field label="Fallback jet" hint="Shown by old app versions.">
                            <select value={d.visual_tier} onChange={(e) => patch(d.level, { visual_tier: Number(e.target.value) })}>
                              {[1, 2, 3, 4, 5].map((t) => (
                                <option key={t} value={t}>LV{t} {TIER_NAMES[t]}</option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        <div className="rk-media">
                          {(['launch', 'station', 'badge'] as const).map((slot) => {
                            const url = urlFor(d, slot);
                            const key = `${slot}-${d.level}`;
                            return (
                              <div key={slot} className="rk-slot">
                                <div className="rk-slot-label">
                                  {SLOT_LABEL[slot]}
                                  <span>{slot === 'badge' ? 'PNG/WebP ≤ 1 MB' : 'WebM/MP4 ≤ 8 MB'}</span>
                                </div>
                                <div className="rk-slot-preview">
                                  {url ? (
                                    slot === 'badge' ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={url} alt="" />
                                    ) : (
                                      <video src={url} muted loop autoPlay playsInline />
                                    )
                                  ) : (
                                    <span>{slot === 'badge' ? 'Built-in badge' : 'No video yet'}</span>
                                  )}
                                </div>
                                <label className={`ad-btn ad-btn-ghost ad-btn-block ${!d.saved || busy !== '' ? 'is-disabled' : ''}`}>
                                  {busy === key ? 'Uploading…' : !d.saved ? 'Publish first' : url ? 'Replace' : 'Upload'}
                                  <input
                                    type="file"
                                    accept={slot === 'badge' ? '.png,.webp' : '.webm,.mp4'}
                                    hidden
                                    disabled={!d.saved || busy !== ''}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      e.target.value = '';
                                      if (f) void upload(d.level, slot, f);
                                    }}
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>

                        {errs && (
                          <ul className="rk-errs">
                            {errs.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={`rk-publish ${dirty ? 'is-dirty' : ''}`}>
              <span>{dirty ? 'Unpublished ladder changes' : 'Ladder is live'}</span>
              <button type="button" className="ad-btn ad-btn-accent ad-btn-lg" disabled={busy !== '' || !dirty} onClick={() => void saveLevels()}>
                {busy === 'levels' ? 'Publishing…' : 'Publish ladder'}
              </button>
            </div>
          </section>

          <Section title="Change history" subtitle="Restore the campaign to how it was before any recorded change." bodyClassName="">
            <div className="ad-table-wrap">
              <table className="ad-table is-stack">
                <thead>
                  <tr>
                    <th className="ad-th">#</th>
                    <th className="ad-th">Change</th>
                    <th className="ad-th">When</th>
                    <th className="ad-th">Admin</th>
                    <th className="ad-th ad-num"></th>
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 ? (
                    <EmptyRow cols={5} title="No changes recorded yet" hint="Edits to settings and the ladder appear here." />
                  ) : (
                    audit.map((a) => (
                      <tr key={a.id} className="ad-row">
                        <td className="ad-td ad-id is-hide-sm">#{a.id}</td>
                        <td className="ad-td is-main" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {a.action.replace(/_/g, ' ').toLowerCase()}
                          <span className="ad-mobile-only ad-hint">#{a.id}</span>
                        </td>
                        <td className="ad-td" data-label="When">{new Date(a.created_at).toLocaleString()}</td>
                        <td className="ad-td" data-label="Admin">{a.actor_id ?? '—'}</td>
                        <td className="ad-td ad-num is-actions">
                          {a.before != null && (
                            <div className="ad-actions">
                              <button type="button" className="ad-btn ad-btn-ghost" disabled={busy !== ''} onClick={() => void restore(a)}>
                                Restore before this
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="ad-hint" style={{ fontSize: 12, margin: 0, padding: '10px 20px 14px' }}>
              API: {API}/admin/rockit · Media is stored on Google Cloud Storage under fx/v1/rocket/lv&lt;N&gt;/.
            </p>
          </Section>
        </>
      )}

      {newName !== null && (
        <Modal
          title="New campaign"
          onClose={() => setNewName(null)}
          onSubmit={() => void createCampaign(newName)}
          footer={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setNewName(null)}>Cancel</button>
              <button type="submit" className="ad-btn ad-btn-primary" disabled={!newName.trim()}>Create</button>
            </>
          }
        >
          <p className="ad-modal-text">Created inactive with the standard LV1–LV5 ladder.</p>
          <Field label="Campaign name">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </Modal>
      )}
      {confirmNode}
    </main>
  );
}

const RK_STYLES = `
.rk-settings { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rk-toggles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.rk-levels { display: grid; gap: 12px; padding: 16px 20px; }
.rk-level { border: 1px solid #e5e7eb; border-left: 5px solid #6366f1; border-radius: 12px; background: #fff; }
.rk-level.has-error { border-color: #fca5a5; }
.rk-level.is-off .rk-level-toggle { opacity: 0.55; }
.rk-level-head { display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 10px; }
.ad-page .rk-level-toggle { all: unset; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 2px 0; }
.ad-page .rk-level-toggle:focus-visible { outline: 2px solid #4f46e5; outline-offset: 4px; border-radius: 6px; }
.rk-lv { color: #fff; font-weight: 800; border-radius: 8px; padding: 5px 9px; font-size: 0.8rem; flex-shrink: 0; text-shadow: 0 1px 1px rgba(0,0,0,0.25); }
.rk-level-title { display: grid; min-width: 0; flex: 1; }
.rk-level-title strong { font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rk-level-title span { font-size: 0.78rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rk-chevron { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #374151; }
.rk-level-body { padding: 4px 16px 16px; border-top: 1px solid #f1f2f6; }
.rk-econ { font-size: 0.82rem; color: #6b7280; padding: 10px 0 14px; }
.rk-econ strong { color: #111827; }
.rk-fields { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
.rk-span2 { grid-column: span 2; }
.ad-page .rk-color { padding: 3px; height: 40px; width: 100%; border: 1px solid #d1d5db; border-radius: 9px; background: #fff; cursor: pointer; }
.rk-media { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.rk-slot { border: 1px dashed #d1d5db; border-radius: 12px; padding: 10px; background: #f9fafb; display: grid; gap: 8px; min-width: 0; }
.rk-slot-label { font-size: 0.78rem; font-weight: 700; color: #374151; display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.rk-slot-label span { color: #9ca3af; font-weight: 400; }
.rk-slot-preview { height: 120px; background: #0b1b4a; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.rk-slot-preview img, .rk-slot-preview video { max-height: 100%; max-width: 100%; }
.rk-slot-preview span { color: #9cc4ff; font-size: 0.75rem; text-align: center; padding: 0 6px; }
.ad-page .rk-slot .ad-btn { cursor: pointer; }
.ad-page .rk-slot .ad-btn.is-disabled { opacity: 0.5; cursor: not-allowed; }
.rk-errs { margin: 12px 0 0; color: #b91c1c; font-size: 0.82rem; padding-left: 18px; }
.rk-publish { position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96); backdrop-filter: blur(6px); border-radius: 0 0 14px 14px; z-index: 5; }
.rk-publish span { font-size: 0.84rem; color: #9ca3af; }
.rk-publish.is-dirty { position: sticky; bottom: 0; box-shadow: 0 -6px 16px rgba(16,24,40,0.06); }
.rk-publish.is-dirty span { color: #b45309; font-weight: 600; }
@media (max-width: 1100px) {
  .rk-fields { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .rk-settings, .rk-toggles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .rk-settings, .rk-toggles { grid-template-columns: minmax(0, 1fr); }
  .rk-levels { padding: 12px; gap: 10px; }
  .rk-level-head { padding: 8px 10px 8px 8px; gap: 8px; }
  .ad-page .rk-level-toggle { gap: 8px; }
  .rk-level-body { padding: 2px 12px 12px; }
  .rk-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .rk-span2 { grid-column: 1 / -1; }
  .rk-media { gap: 8px; }
  .rk-slot { padding: 6px; }
  .rk-slot-label span { display: none; }
  .rk-slot-preview { height: 80px; }
  .ad-page .rk-slot .ad-btn { padding: 7px 4px; font-size: 0.74rem; }
  .rk-publish { padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); justify-content: space-between; }
}
`;
