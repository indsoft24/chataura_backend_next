'use client';

import { Fragment, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, Kpi, PageHeader, SearchBox, Section, SkeletonRows, Switch, Tabs, useConfirm, useDebouncedCommit } from '@/components/admin-ui';

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
type Flash = (ok: boolean, t: string) => void;
type Confirm = ReturnType<typeof useConfirm>['confirm'];

export default function RoomRewardsPage() {
  const { token } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { confirm, confirmNode } = useConfirm();

  // Stable identity: tabs list it as an effect dependency.
  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  return (
    <main className="ad-page">
      <style dangerouslySetInnerHTML={{ __html: RR_STYLES }} />
      <PageHeader
        title="Room Reward Levels"
        subtitle="Lifetime room gifting milestones (never reset). Each level pays the room owner and the top partners once per room; partners rank by gifting toward the level, then time in the room."
      />
      <div className="ad-card rr-nav">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'levels', label: 'Levels' },
            { value: 'rooms', label: 'Rooms' },
            { value: 'payouts', label: 'Payouts' },
          ]}
        />
      </div>

      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {token && tab === 'overview' && <OverviewTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'levels' && <LevelsTab token={token} flash={flash} confirm={confirm} />}
      {token && tab === 'rooms' && <RoomsTab token={token} />}
      {token && tab === 'payouts' && <PayoutsTab token={token} />}
      {confirmNode}
    </main>
  );
}

// ------------------------------------------------------------------ overview + settings

function OverviewTab({ token, flash, confirm }: { token: string; flash: Flash; confirm: Confirm }) {
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

  async function doSave() {
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

  function save() {
    if (enabled && !data?.settings.room_reward_enabled) {
      confirm({
        title: 'Turn Room Reward Levels on?',
        message: 'Rooms start counting from 0 now and payouts are credited automatically.',
        confirmLabel: 'Turn on',
        onConfirm: doSave,
      });
      return;
    }
    void doSave();
  }

  if (!data) {
    return <div className="ad-kpis">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ad-skeleton" style={{ height: 84 }} />)}</div>;
  }

  return (
    <>
      <div className="ad-kpis rr-kpis">
        <Kpi label="Coins paid" value={fmt(data.total_paid)} sub="All time" tone="amber" />
        <Kpi label="Levels completed" value={fmt(data.payouts)} />
        <Kpi label="People paid" value={fmt(data.recipients)} />
        <Kpi label="Rooms with progress" value={fmt(data.rooms_with_progress)} />
        <Kpi label="Waiting on visitors" value={fmt(data.rooms_pending)} sub="Rooms" tone={data.rooms_pending ? 'indigo' : undefined} />
      </div>

      <Section title="Settings" className="rr-settings">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="ad-toggle-row">
            <div>
              <div className="ad-toggle-title">Room Reward Levels</div>
              <div className={`ad-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — counting gifts and paying levels' : 'Off — nothing is counted or paid'}
              </div>
            </div>
            <Switch label="Room Reward Levels enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="ad-form-grid is-2up">
            <Field label="Presence required" hint="Continuous stay before a visitor counts (owner never counts).">
              <div className="ad-unit"><input type="number" min={0} max={240} value={presence} onChange={(e) => setPresence(e.target.value)} /><span>min</span></div>
            </Field>
            <Field label="Allowed drop" hint="Shorter disconnects keep the stay continuous.">
              <div className="ad-unit"><input type="number" min={0} max={30} value={gap} onChange={(e) => setGap(e.target.value)} /><span>min</span></div>
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

// ------------------------------------------------------------------ level editor

function LevelsTab({ token, flash, confirm }: { token: string; flash: Flash; confirm: Confirm }) {
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

  function dropRow(i: number) {
    setRows((rs) => rs!.filter((_, j) => j !== i));
    setPreview(null);
    setDirty(true);
  }

  function removeLevel(i: number) {
    const r = rows![i];
    if (r.rooms_paid > 0) {
      confirm({
        title: `Remove level ${r.level}?`,
        message: `It was already paid to ${r.rooms_paid} room(s), so it will be deactivated (history kept), not deleted.`,
        confirmLabel: 'Remove',
        tone: 'danger',
        onConfirm: async () => dropRow(i),
      });
      return;
    }
    dropRow(i);
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

  async function doSave() {
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

  async function save() {
    const p = await runPreview();
    if (!p) return;
    if (p.issues.length > 0) {
      flash(false, `Fix ${p.issues.length} problem(s) highlighted in the table before saving.`);
      return;
    }
    confirm({
      title: `Save ${rows!.length} level(s)?`,
      message: p.impact.length ? (
        <>
          Rooms that already reached a level complete it as soon as their visitor target is met:
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {p.impact.map((i) => (
              <li key={i.level}>Level {i.level}: {i.rooms_due} room(s), up to {fmt(i.max_coins)} coins</li>
            ))}
          </ul>
          Up to <strong>{fmt(p.max_immediate_coins)}</strong> coins could be paid right away.
        </>
      ) : (
        'No room would complete a level immediately.'
      ),
      confirmLabel: 'Save levels',
      onConfirm: doSave,
    });
  }

  const cell = (i: number, field: keyof LevelRow, r: LevelRow, label: string, cls = '') => {
    const err = issuesByCell.get(`${r.level}:${field}`);
    return (
      <td className={`ad-td ${cls}`} data-label={label}>
        <input
          className={`rr-cell ${err ? 'has-error' : ''}`}
          value={r[field] as string}
          inputMode="numeric"
          aria-label={label}
          title={err}
          onChange={(e) => update(i, { [field]: e.target.value.replace(/[^\d]/g, '') } as Partial<LevelRow>)}
        />
        {err && <div className="rr-err">{err}</div>}
      </td>
    );
  };

  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <div>
          <h2>Levels {rows ? `(${rows.length})` : ''}</h2>
          <p>Partner reward is paid to each partner: total = owner + partner × partners. Coin targets must rise level by level; paid levels are final.</p>
        </div>
        <div className="ad-actions">
          <button type="button" className="ad-btn ad-btn-soft" onClick={addLevel} disabled={!rows}>+ Add level</button>
          <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void runPreview()} disabled={busy || !rows}>Check</button>
          <button type="button" className="ad-btn ad-btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? 'Working…' : 'Save levels'}
          </button>
        </div>
      </div>

      {preview && preview.issues.length === 0 && (
        <div className="ad-alert is-success" style={{ marginTop: 12 }}>
          ✓ Table is valid.
          {preview.impact.length > 0
            ? ` ${preview.impact.reduce((s2, i) => s2 + i.rooms_due, 0)} room-level(s) already reached — up to ${fmt(preview.max_immediate_coins)} coins could be paid right after saving.`
            : ' No room would complete a level immediately.'}
        </div>
      )}

      <div className="ad-table-wrap">
        <table className="ad-table is-stack is-3up rr-levels">
          <thead>
            <tr>
              <th className="ad-th">Level</th>
              <th className="ad-th">Visitors ≥</th>
              <th className="ad-th">Room coins ≥</th>
              <th className="ad-th">Owner coins</th>
              <th className="ad-th">Partner coins each</th>
              <th className="ad-th">Partners</th>
              <th className="ad-th ad-num">Total</th>
              <th className="ad-th ad-num">Rooms paid</th>
              <th className="ad-th">Active</th>
              <th className="ad-th"></th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <SkeletonRows cols={10} rows={4} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={10} title="No levels yet" hint="Add the first level to start paying rooms." />
            ) : (
              rows.map((r, i) => (
                <tr key={i} className={`ad-row ${r.is_active ? '' : 'is-off'}`}>
                  {cell(i, 'level', r, 'Level', 'rr-level-cell')}
                  {cell(i, 'min_visitors', r, 'Visitors ≥')}
                  {cell(i, 'min_room_coins', r, 'Room coins ≥', 'rr-wide')}
                  {cell(i, 'owner_reward', r, 'Owner coins', 'rr-wide')}
                  {cell(i, 'partner_reward', r, 'Partner each', 'rr-wide')}
                  {cell(i, 'partner_count', r, 'Partners')}
                  <td className="ad-td ad-num" data-label="Total" style={{ fontWeight: 700 }}>{fmt(rowTotal(r))}</td>
                  <td className="ad-td ad-num" data-label="Rooms paid">{r.rooms_paid}</td>
                  <td className="ad-td" data-label="Active">
                    <Switch label={`Level ${r.level} active`} checked={r.is_active} onChange={(v) => update(i, { is_active: v })} />
                  </td>
                  <td className="ad-td ad-num is-actions">
                    <div className="ad-actions">
                      <button type="button" className="ad-btn ad-btn-danger-soft ad-icon-btn" title={`Remove level ${r.level}`} aria-label={`Remove level ${r.level}`} onClick={() => removeLevel(i)}>✕<span className="ad-mobile-only">&nbsp;Remove</span></button>
                    </div>
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

// ------------------------------------------------------------------ live rooms

function RoomsTab({ token }: { token: string }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rooms: RoomRow[] } | null>(null);
  useDebouncedCommit(q, (v) => {
    if (v !== search) {
      setSearch(v);
      setPage(1);
    }
  });

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}), ...(pending ? { pending: 'true' } : {}) });
    const res = await api<{ data: { total: number; rooms: RoomRow[] } }>(`/admin/room-rewards/rooms?${qs}`, token);
    setData(res.data);
  }, [token, page, search, pending]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="ad-card">
      <div className="ad-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Room ID, room UUID or title" />
        <label className="ad-check is-wide">
          <input type="checkbox" checked={pending} onChange={(e) => { setPending(e.target.checked); setPage(1); }} />
          Waiting on visitors only
        </label>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={() => void load()}>Refresh</button>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table is-stack">
          <thead>
            <tr>
              <th className="ad-th">Room</th>
              <th className="ad-th">Owner</th>
              <th className="ad-th ad-num">Lifetime coins</th>
              <th className="ad-th ad-num">Level reached</th>
              <th className="ad-th">Next level</th>
              <th className="ad-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={6} />
            ) : data.rooms.length === 0 ? (
              <EmptyRow cols={6} title="No rooms found" hint={search || pending ? 'Try a different search.' : 'Rooms appear once they receive gifts.'} />
            ) : (
              data.rooms.map((r) => (
                <tr key={r.room_id} className="ad-row">
                  <td className="ad-td is-main">
                    <div style={{ minWidth: 0 }}>
                      <div className="ad-name">{r.room_title}</div>
                      <div className="ad-sub">ID {r.room_display_id}</div>
                    </div>
                    <span className="ad-mobile-only">{statusBadge(r)}</span>
                  </td>
                  <td className="ad-td" data-label="Owner">
                    <div className="ad-name" style={{ fontWeight: 500 }}>{r.owner_name ?? '—'}</div>
                    <div className="ad-sub">ID {r.owner_display_id ?? '—'}</div>
                  </td>
                  <td className="ad-td ad-num" data-label="Lifetime coins" style={{ fontWeight: 600 }}>{fmt(r.lifetime_coins)}</td>
                  <td className="ad-td ad-num" data-label="Level reached">L{r.last_level}</td>
                  <td className="ad-td" data-label="Next level">
                    {r.next_level == null ? <span className="ad-hint">All levels done</span> : <>L{r.next_level}: {fmt(r.next_level_coins)} coins · {r.next_level_visitors} visitors</>}
                  </td>
                  <td className="ad-td is-hide-sm">{statusBadge(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} total={data.total} size={25} onPage={setPage} />}
    </section>
  );
}

function statusBadge(r: RoomRow): ReactNode {
  return r.pending_level != null ? (
    <span className="ad-badge amber" title={r.pending_since ? `Since ${new Date(r.pending_since).toLocaleString()}` : undefined}>
      L{r.pending_level} waiting
    </span>
  ) : (
    <span className="ad-badge gray">Progressing</span>
  );
}

// ------------------------------------------------------------------ payouts

function PayoutsTab({ token }: { token: string }) {
  const [roomQ, setRoomQ] = useState('');
  const [userQ, setUserQ] = useState('');
  const [room, setRoom] = useState('');
  const [user, setUser] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [data, setData] = useState<{ total: number; payouts: Payout[] } | null>(null);
  useDebouncedCommit(roomQ, (v) => { if (v !== room) { setRoom(v); setPage(1); } });
  useDebouncedCommit(userQ, (v) => { if (v !== user) { setUser(v); setPage(1); } });

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: '25', ...(room ? { room } : {}), ...(user ? { user } : {}) });
    const res = await api<{ data: { total: number; payouts: Payout[] } }>(`/admin/room-rewards/payouts?${qs}`, token);
    setData(res.data);
  }, [token, page, room, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="ad-card">
      <div className="ad-toolbar">
        <SearchBox value={roomQ} onChange={setRoomQ} placeholder="Room ID or UUID" />
        <SearchBox value={userQ} onChange={setUserQ} placeholder="User ID (public or account)" />
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table is-stack is-3up">
          <thead>
            <tr>
              <th className="ad-th">Room</th>
              <th className="ad-th">When</th>
              <th className="ad-th ad-num">Level</th>
              <th className="ad-th ad-num">Paid</th>
              <th className="ad-th ad-num">Room coins at</th>
              <th className="ad-th ad-num">Visitors</th>
              <th className="ad-th ad-num">Partners</th>
              <th className="ad-th"></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows cols={8} />
            ) : data.payouts.length === 0 ? (
              <EmptyRow cols={8} title="No payouts yet" hint={room || user ? 'Try a different room or user.' : 'Payouts appear when rooms complete levels.'} />
            ) : (
              data.payouts.map((p) => (
                <Fragment key={p.id}>
                  <tr className="ad-row">
                    <td className="ad-td is-main">
                      <div style={{ minWidth: 0 }}>
                        <div className="ad-name">{p.room_title ?? '—'}</div>
                        <div className="ad-sub">ID {p.room_display_id ?? '—'}</div>
                      </div>
                      <span className="ad-badge indigo ad-mobile-only">L{p.level}</span>
                    </td>
                    <td className="ad-td" data-label="When">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="ad-td ad-num is-hide-sm">L{p.level}</td>
                    <td className="ad-td ad-num tone-amber" data-label="Paid" style={{ fontWeight: 700 }}>{fmt(p.total_paid)}</td>
                    <td className="ad-td ad-num" data-label="Room coins at">{fmt(p.room_coins_at)}</td>
                    <td className="ad-td ad-num" data-label="Visitors">{p.qualified_visitors}</td>
                    <td className="ad-td ad-num" data-label="Partners">{p.partners_paid} / {p.partner_slots}</td>
                    <td className="ad-td ad-num is-actions">
                      <div className="ad-actions">
                        <button type="button" className="ad-btn ad-btn-ghost" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                          {open === p.id ? 'Hide recipients' : `Recipients (${p.recipients.length})`}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr className="rr-recipients-row">
                      <td colSpan={8}>
                        <div className="rr-recipients">
                          {p.recipients.map((r) => (
                            <div key={r.user_id} className="rr-recipient">
                              <span className={`ad-badge ${r.role === 'owner' ? 'indigo' : 'gray'}`}>{r.role}{r.rank ? ` #${r.rank}` : ''}</span>
                              <div className="rr-recipient-name">
                                <div className="ad-name">{r.name ?? 'User'}</div>
                                <div className="ad-sub">ID {r.display_id ?? r.user_id}{r.role === 'owner' ? '' : ` · gifted ${fmt(r.gifted_coins)} · stayed ${Math.floor(r.stay_seconds / 60)} min`}</div>
                              </div>
                              <strong className="tone-amber">{fmt(r.amount)}</strong>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} total={data.total} size={25} onPage={setPage} />}
    </section>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="ad-pager">
      <div className="ad-pager-info">
        <span>Page <strong>{page}</strong> of <strong>{pages}</strong> · {total.toLocaleString('en-US')} total</span>
      </div>
      <div className="ad-pager-controls">
        <button type="button" className="ad-page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
        <button type="button" className="ad-page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
      </div>
    </div>
  );
}

const RR_STYLES = `
.rr-nav { margin-bottom: 16px; }
.rr-nav .ad-tabs { border-bottom: none; }
.rr-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rr-settings { max-width: 640px; }
.ad-page .rr-cell { width: 100%; min-width: 56px; padding: 6px 8px; min-height: 34px; font-size: 0.86rem; }
.rr-levels .ad-th, .rr-levels .ad-td { padding-left: 6px; padding-right: 6px; }
.rr-levels .ad-th { white-space: normal; }
.rr-levels .rr-wide { min-width: 108px; }
.ad-page .rr-cell.has-error { border-color: #dc2626; }
.rr-err { color: #dc2626; font-size: 0.7rem; margin-top: 2px; }
.ad-row.is-off .rr-cell { color: #9ca3af; }
.rr-recipients-row td { padding: 0 20px 14px; background: #fafafb; border-bottom: 1px solid #f3f4f6; }
.rr-recipients { display: grid; gap: 8px; padding-top: 12px; }
.rr-recipient { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.rr-recipient-name { flex: 1; min-width: 0; }
@media (max-width: 1100px) { .rr-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .rr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-page .rr-cell { width: 100%; min-width: 0; padding: 6px 8px; }
  .ad-table.is-stack.rr-levels tr { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.3fr); }
  .rr-recipients-row td { padding: 0 12px 12px; background: transparent; border: none; }
  .rr-recipients { padding-top: 0; }
  .rr-recipient { flex-wrap: wrap; gap: 8px; }
}
`;
