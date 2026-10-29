'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Switch } from '@/components/admin-ui';

type Settings = {
  battle_enabled: boolean;
  battle_winner_pct: number;
  battle_initiator_pct: number;
  battle_min_minutes: number;
  battle_max_minutes: number;
};

/** Gifting battle — seats split red / blue, higher gift total when time ends wins; winners and the initiator are paid coins. */
export default function BattlePage() {
  const { token } = useAdminAuth();
  const [enabled, setEnabled] = useState(false);
  const [winnerPct, setWinnerPct] = useState('15');
  const [initiatorPct, setInitiatorPct] = useState('2');
  const [minMinutes, setMinMinutes] = useState('2');
  const [maxMinutes, setMaxMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: Settings) => {
    setEnabled(s.battle_enabled);
    setWinnerPct(String(s.battle_winner_pct));
    setInitiatorPct(String(s.battle_initiator_pct));
    setMinMinutes(String(s.battle_min_minutes));
    setMaxMinutes(String(s.battle_max_minutes));
  };

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api<{ data: Settings }>('/admin/battle', token);
    apply(res.data);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }));
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ data: Settings }>('/admin/battle', token!, {
        method: 'PUT',
        body: JSON.stringify({
          battle_enabled: enabled,
          battle_winner_pct: Number(winnerPct),
          battle_initiator_pct: Number(initiatorPct),
          battle_min_minutes: Number(minMinutes),
          battle_max_minutes: Number(maxMinutes),
        }),
      });
      apply(res.data);
      setMsg({ ok: true, text: 'Saved. New battles use these values; a running battle keeps the values it started with.' });
    } catch (e: any) {
      setMsg({ ok: false, text: `Save failed: ${e?.message ?? e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cp-page">
      <PageHeader
        title="Battle"
        subtitle="The host, co-host or a room admin starts a timed gifting battle: left seats (red) vs right seats (blue). When time ends the team with more gifts wins. Rewards are paid in coins."
      />
      {msg && <div className={`cp-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <section className="cp-card">
        <div className="cp-card-head"><div><h2>Settings</h2></div></div>
        <div className="cp-card-body">
          <div className="cp-toggle-row">
            <div>
              <div className="cp-toggle-title">Battle</div>
              <div className={`cp-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — rooms can start a battle' : 'Off — nobody can start one (a running battle keeps going until it ends)'}
              </div>
            </div>
            <Switch label="Battle enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="cp-form-grid is-2up">
            <Field label="Winning team share" hint="% of all gifts sent during the battle, split evenly among the seated winners.">
              <div className="cp-unit"><input type="number" min={0} max={100} step="0.1" value={winnerPct} onChange={(e) => setWinnerPct(e.target.value)} /><span>%</span></div>
            </Field>
            <Field label="Initiator share" hint="% of all gifts paid to whoever started the battle. Both shares together can't pass 100%.">
              <div className="cp-unit"><input type="number" min={0} max={100} step="0.1" value={initiatorPct} onChange={(e) => setInitiatorPct(e.target.value)} /><span>%</span></div>
            </Field>
            <Field label="Shortest battle">
              <div className="cp-unit"><input type="number" min={1} max={120} value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} /><span>min</span></div>
            </Field>
            <Field label="Longest battle">
              <div className="cp-unit"><input type="number" min={1} max={240} value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} /><span>min</span></div>
            </Field>
          </div>
          <div className="cp-form-actions">
            <button type="button" className="cp-btn cp-btn-primary cp-btn-lg" onClick={save} disabled={busy}>
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
