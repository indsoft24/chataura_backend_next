'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Level = {
  level: number;
  name: string;
  threshold_coins: number;
  reward_pool_percentage: number;
  reward_distribution_rules: number[];
  frame_id: number | null;
  frame_winners: number;
  frame_days: number;
  xp_rate: number;
  min_xp: number;
  duration_seconds: number;
  theme_color: string;
  visual_tier: number;
  launch_asset_key: string | null;
  station_asset_key: string | null;
  badge_asset_key: string | null;
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
type LevelDraft = Omit<Level, 'threshold_coins' | 'reward_pool_percentage' | 'reward_distribution_rules' | 'frame_days' | 'frame_winners' | 'duration_seconds' | 'xp_rate' | 'min_xp'> & {
  threshold_coins: string;
  reward_pool_percentage: string;
  reward_distribution_rules: string;
  frame_days: string;
  frame_winners: string;
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
    frame_winners: String(l.frame_winners),
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
    if (dirty && !confirm('Discard unsaved level changes?')) return;
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
        frame_winners: last?.frame_winners ?? '3',
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
  }

  function removeLastLevel() {
    if (drafts.length <= 1) return;
    const last = drafts[drafts.length - 1];
    if (!confirm(`Remove LV${last.level} "${last.name}"? Rooms on it keep running until their rocket ends.`)) return;
    setDrafts(drafts.slice(0, -1));
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
      return;
    }
    if (!confirm('Publish this ladder? New rockets use it immediately; rockets already running keep their current rules.')) return;
    setBusy('levels');
    try {
      await api(`/admin/rockit/campaigns/${selected.id}/levels`, token, {
        method: 'PUT',
        body: JSON.stringify({
          levels: drafts.map((d) => ({
            level: d.level,
            name: d.name.trim(),
            threshold_coins: Number(d.threshold_coins),
            reward_pool_percentage: Number(d.reward_pool_percentage),
            reward_distribution_rules: parseRules(d.reward_distribution_rules),
            frame_id: d.frame_id,
            frame_winners: Number(d.frame_winners),
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
      flash(true, 'Ladder published.');
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

  async function createCampaign() {
    if (!token) return;
    const name = prompt('New campaign name', 'Rocket Season');
    if (!name) return;
    setBusy('create');
    try {
      const json = unwrap<{ campaign: Campaign }>(
        await api('/admin/rockit/campaigns', token, {
          method: 'POST',
          body: JSON.stringify({ name, status: false }),
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
    if (!confirm(`Restore the settings and ladder from before change #${entry.id}?`)) return;
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

  const card = {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  } as const;
  const input = {
    width: '100%',
    padding: '7px 9px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  } as const;
  const label = { fontSize: 12, fontWeight: 600, color: '#374151' } as const;
  const btn = (primary = false) =>
    ({
      background: primary ? '#2563eb' : '#f3f4f6',
      color: primary ? '#fff' : '#111827',
      border: primary ? 0 : '1px solid #d1d5db',
      borderRadius: 8,
      padding: '9px 14px',
      fontWeight: 600,
      cursor: 'pointer',
    }) as const;

  const totalLadder = drafts.reduce((a, d) => a + (Number(d.threshold_coins) || 0), 0);

  return (
    <main style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Rocket levels</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem', maxWidth: 760 }}>
            Each room climbs LV1 → LV{drafts.length || 'N'}. When a level&apos;s target is reached it launches, pays the top
            contributors, and the next level starts. After the top level the room goes back to LV1 at zero.
            {settings?.daily_reset_enabled &&
              ` Every room resets to LV1 daily at ${String(settings.reset_hour).padStart(2, '0')}:00 (${settings.reset_timezone}).`}
          </p>
        </div>
        <button type="button" style={btn()} onClick={() => void createCampaign()} disabled={busy !== ''}>
          + New campaign
        </button>
      </div>

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            background: msg.ok ? '#d1fae5' : '#fee2e2',
            color: msg.ok ? '#065f46' : '#991b1b',
            borderRadius: 8,
            marginBottom: 20,
            fontWeight: 600,
          }}
        >
          {msg.text}
        </div>
      )}

      {loading && !selected ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : !selected || !settings ? (
        <p style={{ color: '#6b7280' }}>No campaigns yet. Create one to get the standard ladder.</p>
      ) : (
        <>
          {campaigns.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c)}
                  style={{
                    ...btn(c.id === selected.id),
                    borderRadius: 999,
                    padding: '6px 14px',
                  }}
                >
                  #{c.id} {c.name} {c.status ? '● Active' : ''}
                </button>
              ))}
            </div>
          )}

          {/* Campaign settings */}
          <section style={{ ...card, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: '1.05rem' }}>Campaign settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              <label>
                <span style={label}>Name</span>
                <input style={input} value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
              </label>
              <label>
                <span style={label}>Eligible rooms</span>
                <input
                  style={input}
                  value={settings.eligible_room_types.join(', ')}
                  placeholder="all or public, vip, permanent"
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      eligible_room_types: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                <span style={label}>Minimum contribution (coins)</span>
                <input
                  style={input}
                  type="number"
                  min={1}
                  value={settings.minimum_contribution_required}
                  onChange={(e) => setSettings({ ...settings, minimum_contribution_required: Number(e.target.value) })}
                />
              </label>
              <label>
                <span style={label}>When a level&apos;s time runs out</span>
                <select
                  style={input}
                  value={settings.expiry_mode}
                  onChange={(e) => setSettings({ ...settings, expiry_mode: e.target.value as Campaign['expiry_mode'] })}
                >
                  <option value="RESET_PROGRESS">Stay on level, progress back to 0</option>
                  <option value="RESET_CYCLE">Go back to LV1</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={settings.daily_reset_enabled}
                  onChange={(e) => setSettings({ ...settings, daily_reset_enabled: e.target.checked })}
                />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Daily reset to LV1</span>
              </label>
              <label>
                <span style={label}>Reset time</span>
                <select
                  style={input}
                  value={settings.reset_hour}
                  disabled={!settings.daily_reset_enabled}
                  onChange={(e) => setSettings({ ...settings, reset_hour: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={label}>Timezone</span>
                <input
                  style={input}
                  value={settings.reset_timezone}
                  disabled={!settings.daily_reset_enabled}
                  placeholder="Asia/Kolkata"
                  onChange={(e) => setSettings({ ...settings, reset_timezone: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={settings.carry_overflow}
                  onChange={(e) => setSettings({ ...settings, carry_overflow: e.target.checked })}
                />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Carry extra coins into next level</span>
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={settings.status} onChange={(e) => setSettings({ ...settings, status: e.target.checked })} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Active (deactivates other campaigns)</span>
              </label>
              <button type="button" style={btn(true)} disabled={busy !== ''} onClick={() => void saveSettings()}>
                {busy === 'settings' ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </section>

          {/* Ladder */}
          <section style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                Ladder · {drafts.length} levels · full climb {short(totalLadder)} coins
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn()} onClick={addLevel} disabled={drafts.length >= 50}>
                  + Add level
                </button>
                <button type="button" style={btn()} onClick={removeLastLevel} disabled={drafts.length <= 1}>
                  Remove last
                </button>
                <button
                  type="button"
                  style={{ ...btn(true), opacity: dirty ? 1 : 0.6 }}
                  disabled={busy !== '' || !dirty}
                  onClick={() => void saveLevels()}
                >
                  {busy === 'levels' ? 'Publishing…' : dirty ? 'Publish ladder' : 'Published'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {drafts.map((d) => {
                const target = Number(d.threshold_coins) || 0;
                const pct = Number(d.reward_pool_percentage) || 0;
                const rules = parseRules(d.reward_distribution_rules);
                const sum = rules.reduce((a, b) => a + b, 0) || 1;
                const pool = Math.floor((target * pct) / 100);
                const errs = errors[d.level];
                const launchUrl = urlFor(d, 'launch');
                const stationUrl = urlFor(d, 'station');
                const badgeUrl = urlFor(d, 'badge');
                return (
                  <div
                    key={d.level}
                    style={{
                      ...card,
                      borderLeft: `6px solid ${d.theme_color}`,
                      borderColor: errs ? '#fca5a5' : '#e5e7eb',
                      opacity: d.is_active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span
                        style={{
                          background: d.theme_color,
                          color: '#fff',
                          fontWeight: 800,
                          borderRadius: 8,
                          padding: '4px 10px',
                          fontSize: 14,
                        }}
                      >
                        LV{d.level}
                      </span>
                      <input
                        style={{ ...input, width: 220, fontWeight: 700 }}
                        value={d.name}
                        onChange={(e) => patch(d.level, { name: e.target.value })}
                      />
                      <span style={{ color: '#6b7280', fontSize: 13 }}>
                        Target <strong style={{ color: '#111827' }}>{short(target)}</strong> · Pool{' '}
                        <strong style={{ color: '#111827' }}>{short(pool)}</strong> · #1 gets{' '}
                        <strong style={{ color: '#111827' }}>{short(Math.floor((pool * (rules[0] ?? 0)) / sum))}</strong> · Platform
                        keeps {short(target - pool)} ({(100 - pct).toFixed(1)}%)
                      </span>
                      <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={d.is_active} onChange={(e) => patch(d.level, { is_active: e.target.checked })} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Active</span>
                      </label>
                      {!d.saved && <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>NEW</span>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
                      <label>
                        <span style={label}>Target (coins)</span>
                        <input style={input} type="number" min={1} value={d.threshold_coins} onChange={(e) => patch(d.level, { threshold_coins: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>Reward pool %</span>
                        <input style={input} type="number" min={0} max={100} step={0.5} value={d.reward_pool_percentage} onChange={(e) => patch(d.level, { reward_pool_percentage: e.target.value })} />
                      </label>
                      <label style={{ gridColumn: 'span 2' }}>
                        <span style={label}>
                          Prize split % ({rules.length} winners, sum{' '}
                          <span style={{ color: Math.abs(sum - 100) > 0.5 ? '#b91c1c' : '#047857' }}>
                            {rules.reduce((a, b) => a + b, 0)}%
                          </span>
                          )
                        </span>
                        <input style={input} value={d.reward_distribution_rules} onChange={(e) => patch(d.level, { reward_distribution_rules: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>Time limit (min, 0 = until reset)</span>
                        <input style={input} type="number" min={0} value={d.duration_minutes} onChange={(e) => patch(d.level, { duration_minutes: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>Theme colour</span>
                        <input style={{ ...input, padding: 2, height: 34 }} type="color" value={d.theme_color} onChange={(e) => patch(d.level, { theme_color: e.target.value.toUpperCase() })} />
                      </label>
                      <label style={{ gridColumn: 'span 2' }}>
                        <span style={label}>Frame reward</span>
                        <select
                          style={input}
                          value={d.frame_id ?? ''}
                          onChange={(e) => patch(d.level, { frame_id: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">Default (first active frames)</option>
                          {frames.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span style={label}>Frame for top N</span>
                        <input style={input} type="number" min={0} value={d.frame_winners} onChange={(e) => patch(d.level, { frame_winners: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>Frame days</span>
                        <input style={input} type="number" min={1} value={d.frame_days} onChange={(e) => patch(d.level, { frame_days: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>XP per coin won</span>
                        <input style={input} type="number" min={0} step={0.01} value={d.xp_rate} onChange={(e) => patch(d.level, { xp_rate: e.target.value })} />
                      </label>
                      <label>
                        <span style={label}>Fallback jet (old apps)</span>
                        <select style={input} value={d.visual_tier} onChange={(e) => patch(d.level, { visual_tier: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 5].map((t) => (
                            <option key={t} value={t}>
                              LV{t} {TIER_NAMES[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Media */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
                      {(['launch', 'station', 'badge'] as const).map((slot) => {
                        const url = slot === 'launch' ? launchUrl : slot === 'station' ? stationUrl : badgeUrl;
                        const accept = slot === 'badge' ? '.png,.webp' : '.webm,.mp4';
                        const key = `${slot}-${d.level}`;
                        return (
                          <div key={slot} style={{ border: '1px dashed #d1d5db', borderRadius: 10, padding: 10, background: '#f9fafb' }}>
                            <div style={{ ...label, marginBottom: 6 }}>
                              {slot === 'launch' ? 'Launch video' : slot === 'station' ? 'Station (sheet) video' : 'Level badge'}
                              <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                                {' '}
                                · {slot === 'badge' ? 'PNG/WebP ≤ 1 MB' : 'WebM/MP4 ≤ 8 MB'}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 120,
                                background: '#0b1b4a',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                marginBottom: 8,
                              }}
                            >
                              {url ? (
                                slot === 'badge' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={url} alt="" style={{ maxHeight: 110, maxWidth: '100%' }} />
                                ) : (
                                  <video src={url} muted loop autoPlay playsInline style={{ maxHeight: 120, maxWidth: '100%' }} />
                                )
                              ) : (
                                <span style={{ color: '#9cc4ff', fontSize: 12 }}>
                                  {slot === 'badge' ? 'Uses the built-in badge' : 'No video yet'}
                                </span>
                              )}
                            </div>
                            <label style={{ ...btn(), display: 'inline-block', fontSize: 13, padding: '6px 10px', opacity: d.saved ? 1 : 0.5 }}>
                              {busy === key ? 'Uploading…' : url ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept={accept}
                                hidden
                                disabled={!d.saved || busy !== ''}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) void upload(d.level, slot, f);
                                }}
                              />
                            </label>
                            {!d.saved && <span style={{ fontSize: 11, color: '#b45309', marginLeft: 8 }}>Publish the ladder first</span>}
                          </div>
                        );
                      })}
                    </div>

                    {errs && (
                      <ul style={{ margin: '12px 0 0', color: '#b91c1c', fontSize: 13, paddingLeft: 18 }}>
                        {errs.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Change history */}
          <section style={card}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>Change history</h2>
            {audit.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No changes recorded yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                    <th style={{ padding: '6px 8px' }}>#</th>
                    <th style={{ padding: '6px 8px' }}>When</th>
                    <th style={{ padding: '6px 8px' }}>Change</th>
                    <th style={{ padding: '6px 8px' }}>Admin</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 8px' }}>{a.id}</td>
                      <td style={{ padding: '6px 8px' }}>{new Date(a.created_at).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px' }}>{a.action.replace(/_/g, ' ').toLowerCase()}</td>
                      <td style={{ padding: '6px 8px' }}>{a.actor_id ?? '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {a.before != null && (
                          <button type="button" style={{ ...btn(), padding: '4px 10px', fontSize: 12 }} disabled={busy !== ''} onClick={() => void restore(a)}>
                            Restore before this
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '10px 0 0' }}>
              API: {API}/admin/rockit · Uploaded media is stored on Google Cloud Storage under fx/v1/rocket/lv&lt;N&gt;/.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
