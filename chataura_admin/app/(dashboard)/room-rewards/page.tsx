'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

/**
 * Room Reward Levels — lifetime room gifting milestones (no reset). Admins edit the level table
 * (unlimited levels), the presence rules and the on/off switch, and audit every payout.
 */

type Settings = {
  room_reward_enabled: boolean;
  room_reward_presence_minutes: number;
  room_reward_presence_gap_minutes: number;
};

type Overview = {
  settings: Settings;
  total_paid: number;
  payouts: number;
  recipients: number;
  rooms_with_progress: number;
  rooms_pending: number;
};

type LevelRow = {
  level: string;
  min_visitors: string;
  min_room_coins: string;
  owner_reward: string;
  partner_reward: string;
  partner_count: string;
  is_active: boolean;
  rooms_paid: number;
};

type ApiLevel = {
  level: number;
  min_visitors: number;
  min_room_coins: number;
  owner_reward: number;
  partner_reward: number;
  partner_count: number;
  total_reward: number;
  is_active: boolean;
  rooms_paid: number;
};

type Issue = { level: number; field: string; message: string };
type Preview = { issues: Issue[]; impact: { level: number; rooms_due: number; max_coins: number }[]; max_immediate_coins: number };

type RoomRow = {
  room_id: string;
  room_display_id: string;
  room_title: string;
  owner_name: string | null;
  owner_display_id: string | null;
  lifetime_coins: number;
  last_level: number;
  pending_level: number | null;
  pending_since: string | null;
  next_level: number | null;
  next_level_coins: number | null;
  next_level_visitors: number | null;
};

type Payout = {
  id: number;
  room_display_id: string | null;
  room_title: string | null;
  level: number;
  total_paid: number;
  room_coins_at: number;
  qualified_visitors: number;
  partner_slots: number;
  partners_paid: number;
  created_at: string;
  recipients: {
    user_id: number;
    name: string | null;
    display_id: string | null;
    role: string;
    rank: number | null;
    amount: number;
    gifted_coins: number;
    stay_seconds: number;
  }[];
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
const cellInput: React.CSSProperties = { padding: '6px 8px', fontSize: 13, minWidth: 70 };

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  return n.toLocaleString('en-US');
}

function toRows(levels: ApiLevel[]): LevelRow[] {
  return levels.map((l) => ({
    level: String(l.level),
    min_visitors: String(l.min_visitors),
    min_room_coins: String(l.min_room_coins),
    owner_reward: String(l.owner_reward),
    partner_reward: String(l.partner_reward),
    partner_count: String(l.partner_count),
    is_active: l.is_active,
    rooms_paid: l.rooms_paid,
  }));
}

function rowTotal(r: LevelRow): number {
  return (Number(r.owner_reward) || 0) + (Number(r.partner_reward) || 0) * (Number(r.partner_count) || 0);
}

function payload(rows: LevelRow[]) {
  return {
    levels: rows.map((r) => ({
      level: r.level.trim(),
      min_visitors: r.min_visitors.trim(),
      min_room_coins: r.min_room_coins.trim(),
      owner_reward: r.owner_reward.trim(),
      partner_reward: r.partner_reward.trim(),
      partner_count: r.partner_count.trim(),
      is_active: r.is_active,
    })),
  };
}

type Tab = 'overview' | 'levels' | 'rooms' | 'payouts';

export default function RoomRewardsPage() {
  const { token } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Stable identity: tabs list it as an effect dependency.
  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  return (
    <main style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 8px' }}>Room Reward Levels</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
          Lifetime room gifting milestones (never reset). Each level pays the room owner and the top partners once
          per room. Partners are ranked by gifting toward the level, then by time in the room.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['overview', 'levels', 'rooms', 'payouts'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#1c2536' : '#fff',
              color: tab === t ? '#fff' : '#374151',
              border: '1px solid #e5e7eb',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
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

      {token && tab === 'overview' && <OverviewTab token={token} flash={flash} />}
      {token && tab === 'levels' && <LevelsTab token={token} flash={flash} />}
      {token && tab === 'rooms' && <RoomsTab token={token} />}
      {token && tab === 'payouts' && <PayoutsTab token={token} />}
    </main>
  );
}

// ------------------------------------------------------------------ overview + settings

function OverviewTab({ token, flash }: { token: string; flash: (ok: boolean, t: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [presence, setPresence] = useState('10');
  const [gap, setGap] = useState('2');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ data: Overview }>('/admin/room-rewards/overview', token);
    setData(res.data);
    setEnabled(res.data.settings.room_reward_enabled);
    setPresence(String(res.data.settings.room_reward_presence_minutes));
    setGap(String(res.data.settings.room_reward_presence_gap_minutes));
  }, [token]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  async function save() {
    if (enabled && !data?.settings.room_reward_enabled) {
      const ok = window.confirm(
        'Turn Room Reward Levels ON? Rooms start counting from 0 now and payouts are credited automatically.',
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await api('/admin/room-rewards/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({
          room_reward_enabled: enabled,
          room_reward_presence_minutes: Number(presence),
          room_reward_presence_gap_minutes: Number(gap),
        }),
      });
      await load();
      flash(true, 'Room reward settings saved.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p style={{ color: '#6b7280' }}>Loading…</p>;

  const stats = [
    { label: 'Coins paid (all time)', value: fmt(data.total_paid) },
    { label: 'Levels completed', value: fmt(data.payouts) },
    { label: 'People paid', value: fmt(data.recipients) },
    { label: 'Rooms with progress', value: fmt(data.rooms_with_progress) },
    { label: 'Rooms waiting on visitors', value: fmt(data.rooms_pending) },
  ];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={card}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, maxWidth: 560 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Settings</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontWeight: 600 }}>Room Reward Levels enabled</span>
            <span style={{ fontSize: 13, color: enabled ? '#065f46' : '#991b1b' }}>
              {enabled ? 'ON — counting gifts and paying levels' : 'OFF — nothing is counted or paid'}
            </span>
          </label>
          <label>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Presence required (minutes)</span>
            <input type="number" min={0} max={240} value={presence} onChange={(e) => setPresence(e.target.value)} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              A visitor counts toward a level after staying this long continuously (owner never counts).
            </span>
          </label>
          <label>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Allowed drop (minutes)</span>
            <input type="number" min={0} max={30} value={gap} onChange={(e) => setGap(e.target.value)} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Leaving / losing connection for less than this keeps the visitor&apos;s continuous stay.
            </span>
          </label>
          <button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ level editor

function LevelsTab({ token, flash }: { token: string; flash: (ok: boolean, t: string) => void }) {
  const [rows, setRows] = useState<LevelRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ data: { levels: ApiLevel[] } }>('/admin/room-rewards/levels', token);
    setRows(toRows(res.data.levels));
    setPreview(null);
    setDirty(false);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => flash(false, String(e?.message ?? e)));
  }, [load, flash]);

  const issuesByCell = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of preview?.issues ?? []) m.set(`${i.level}:${i.field}`, i.message);
    return m;
  }, [preview]);

  function update(i: number, patch: Partial<LevelRow>) {
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setPreview(null);
    setDirty(true);
  }

  function addLevel() {
    setRows((rs) => {
      const list = rs ?? [];
      const last = list[list.length - 1];
      const nextNo = list.reduce((m, r) => Math.max(m, Number(r.level) || 0), 0) + 1;
      return [
        ...list,
        {
          level: String(nextNo),
          min_visitors: last?.min_visitors ?? '5',
          min_room_coins: last ? String((Number(last.min_room_coins) || 0) * 2) : '10000000',
          owner_reward: last?.owner_reward ?? '0',
          partner_reward: last?.partner_reward ?? '0',
          partner_count: last?.partner_count ?? '1',
          is_active: true,
          rooms_paid: 0,
        },
      ];
    });
    setPreview(null);
    setDirty(true);
  }

  function removeLevel(i: number) {
    const r = rows![i];
    if (r.rooms_paid > 0) {
      const ok = window.confirm(
        `Level ${r.level} was already paid to ${r.rooms_paid} room(s). It will be DEACTIVATED (history kept), not deleted. Continue?`,
      );
      if (!ok) return;
    }
    setRows((rs) => rs!.filter((_, j) => j !== i));
    setPreview(null);
    setDirty(true);
  }

  async function runPreview(): Promise<Preview | null> {
    setBusy(true);
    try {
      const res = await api<{ data: Preview }>('/admin/room-rewards/levels/preview', token, {
        method: 'POST',
        body: JSON.stringify(payload(rows!)),
      });
      setPreview(res.data);
      return res.data;
    } catch (e: any) {
      flash(false, `Preview failed: ${e?.message ?? e}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const p = await runPreview();
    if (!p) return;
    if (p.issues.length > 0) {
      flash(false, `Fix ${p.issues.length} problem(s) highlighted in the table before saving.`);
      return;
    }
    const impactText = p.impact.length
      ? `\n\nRooms that already reached a level will complete it as soon as their visitor target is met:\n` +
        p.impact.map((i) => `• Level ${i.level}: ${i.rooms_due} room(s), up to ${fmt(i.max_coins)} coins`).join('\n') +
        `\n\nUp to ${fmt(p.max_immediate_coins)} coins could be paid right away.`
      : '';
    if (!window.confirm(`Save ${rows!.length} level(s)?${impactText}`)) return;
    setBusy(true);
    try {
      const res = await api<{ data: { levels: ApiLevel[] } }>('/admin/room-rewards/levels', token, {
        method: 'PUT',
        body: JSON.stringify(payload(rows!)),
      });
      setRows(toRows(res.data.levels));
      setPreview(null);
      setDirty(false);
      flash(true, 'Levels saved. Rooms past any new level are being checked now.');
    } catch (e: any) {
      flash(false, `Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <p style={{ color: '#6b7280' }}>Loading…</p>;

  const cell = (i: number, field: keyof LevelRow, r: LevelRow) => {
    const err = issuesByCell.get(`${r.level}:${field}`);
    return (
      <td style={td}>
        <input
          style={{ ...cellInput, borderColor: err ? '#dc2626' : undefined }}
          value={r[field] as string}
          inputMode="numeric"
          title={err}
          onChange={(e) => update(i, { [field]: e.target.value.replace(/[^\d]/g, '') } as Partial<LevelRow>)}
        />
        {err && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>{err}</div>}
      </td>
    );
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Levels ({rows.length})</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Partner reward is paid to EACH partner. Total = owner + partner × partners. Coin targets must increase
            level by level. Paid levels are final — edits affect only rooms that haven&apos;t completed them.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={addLevel} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db' }}>
            + Add level
          </button>
          <button type="button" onClick={() => void runPreview()} disabled={busy} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db' }}>
            Check
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? 'Working…' : 'Save levels'}
          </button>
        </div>
      </div>

      {preview && preview.issues.length === 0 && (
        <div style={{ padding: '10px 14px', background: '#eff6ff', color: '#1e3a8a', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          ✓ Table is valid.
          {preview.impact.length > 0
            ? ` ${preview.impact.reduce((s, i) => s + i.rooms_due, 0)} room-level(s) already reached — up to ${fmt(preview.max_immediate_coins)} coins could be paid right after saving.`
            : ' No room would complete a level immediately.'}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Level</th>
              <th style={th}>Room visitors ≥</th>
              <th style={th}>Room coins ≥</th>
              <th style={th}>Owner coins</th>
              <th style={th}>Partner coins (each)</th>
              <th style={th}>Partners</th>
              <th style={th}>Total</th>
              <th style={th}>Active</th>
              <th style={th}>Rooms paid</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                {cell(i, 'level', r)}
                {cell(i, 'min_visitors', r)}
                {cell(i, 'min_room_coins', r)}
                {cell(i, 'owner_reward', r)}
                {cell(i, 'partner_reward', r)}
                {cell(i, 'partner_count', r)}
                <td style={{ ...td, fontWeight: 600 }}>{fmt(rowTotal(r))}</td>
                <td style={td}>
                  <input type="checkbox" checked={r.is_active} onChange={(e) => update(i, { is_active: e.target.checked })} style={{ width: 18 }} />
                </td>
                <td style={td}>{r.rooms_paid}</td>
                <td style={td}>
                  <button
                    type="button"
                    onClick={() => removeLevel(i)}
                    style={{ background: '#fff', color: '#991b1b', border: '1px solid #fecaca', padding: '6px 10px' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ live rooms

function RoomsTab({ token }: { token: string }) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rooms: RoomRow[] } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}), ...(pending ? { pending: 'true' } : {}) });
    const res = await api<{ data: { total: number; rooms: RoomRow[] } }>(`/admin/room-rewards/rooms?${qs}`, token);
    setData(res.data);
  }, [token, page, search, pending]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input placeholder="Room ID, room UUID or title" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 320 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={pending} onChange={(e) => { setPending(e.target.checked); setPage(1); }} style={{ width: 16 }} />
          Waiting on visitors only
        </label>
        <button type="button" onClick={() => void load()} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db' }}>
          Refresh
        </button>
      </div>
      {!data ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Room</th>
                <th style={th}>Owner</th>
                <th style={th}>Lifetime coins</th>
                <th style={th}>Level reached</th>
                <th style={th}>Next level</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.room_id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.room_title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>ID {r.room_display_id}</div>
                  </td>
                  <td style={td}>
                    {r.owner_name ?? '—'}
                    <div style={{ fontSize: 12, color: '#6b7280' }}>ID {r.owner_display_id ?? '—'}</div>
                  </td>
                  <td style={td}>{fmt(r.lifetime_coins)}</td>
                  <td style={td}>{r.last_level}</td>
                  <td style={td}>
                    {r.next_level == null ? 'All levels done' : `L${r.next_level}: ${fmt(r.next_level_coins)} coins, ${r.next_level_visitors} visitors`}
                  </td>
                  <td style={td}>
                    {r.pending_level != null ? (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>
                        Level {r.pending_level} waiting on visitors
                        {r.pending_since ? ` since ${new Date(r.pending_since).toLocaleString()}` : ''}
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>Progressing</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.rooms.length === 0 && (
                <tr>
                  <td style={td} colSpan={6}>No rooms yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} total={data.total} size={25} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ payouts

function PayoutsTab({ token }: { token: string }) {
  const [room, setRoom] = useState('');
  const [user, setUser] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [data, setData] = useState<{ total: number; payouts: Payout[] } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: '25', ...(room ? { room } : {}), ...(user ? { user } : {}) });
    const res = await api<{ data: { total: number; payouts: Payout[] } }>(`/admin/room-rewards/payouts?${qs}`, token);
    setData(res.data);
  }, [token, page, room, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input placeholder="Room ID or UUID" value={room} onChange={(e) => { setRoom(e.target.value); setPage(1); }} style={{ maxWidth: 260 }} />
        <input placeholder="User ID (public or account)" value={user} onChange={(e) => { setUser(e.target.value); setPage(1); }} style={{ maxWidth: 260 }} />
      </div>
      {!data ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Room</th>
                <th style={th}>Level</th>
                <th style={th}>Paid</th>
                <th style={th}>Room coins at</th>
                <th style={th}>Qualified visitors</th>
                <th style={th}>Partners</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td style={td}>{new Date(p.created_at).toLocaleString()}</td>
                    <td style={td}>
                      {p.room_title ?? '—'}
                      <div style={{ fontSize: 12, color: '#6b7280' }}>ID {p.room_display_id ?? '—'}</div>
                    </td>
                    <td style={td}>{p.level}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmt(p.total_paid)}</td>
                    <td style={td}>{fmt(p.room_coins_at)}</td>
                    <td style={td}>{p.qualified_visitors}</td>
                    <td style={td}>{p.partners_paid} / {p.partner_slots}</td>
                    <td style={td}>
                      <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db', padding: '6px 10px' }}>
                        {open === p.id ? 'Hide' : 'Recipients'}
                      </button>
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr>
                      <td style={{ ...td, background: '#f9fafb' }} colSpan={8}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={th}>Role</th>
                              <th style={th}>Rank</th>
                              <th style={th}>User</th>
                              <th style={th}>Amount</th>
                              <th style={th}>Gifted toward level</th>
                              <th style={th}>Continuous stay</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.recipients.map((r) => (
                              <tr key={r.user_id}>
                                <td style={td}>{r.role}</td>
                                <td style={td}>{r.rank ?? '—'}</td>
                                <td style={td}>{r.name ?? 'User'} <span style={{ color: '#6b7280', fontSize: 12 }}>ID {r.display_id ?? r.user_id}</span></td>
                                <td style={td}>{fmt(r.amount)}</td>
                                <td style={td}>{r.role === 'owner' ? '—' : fmt(r.gifted_coins)}</td>
                                <td style={td}>{r.role === 'owner' ? '—' : `${Math.floor(r.stay_seconds / 60)} min`}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data.payouts.length === 0 && (
                <tr>
                  <td style={td} colSpan={8}>No payouts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pager page={page} total={data.total} size={25} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, fontSize: 14 }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db' }}>
        ← Prev
      </button>
      <span>
        Page {page} of {pages} · {total.toLocaleString('en-US')} total
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} style={{ background: '#fff', color: '#1c2536', border: '1px solid #d1d5db' }}>
        Next →
      </button>
    </div>
  );
}
