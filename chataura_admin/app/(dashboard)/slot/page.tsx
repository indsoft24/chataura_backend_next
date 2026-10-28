'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Switch } from '@/components/admin-ui';

type Settings = {
  slot_enabled: boolean;
  slot_rtp_preset: number;
  slot_bet_levels: number[];
  slot_big_win_x: number;
};

/** Lucky Slots — 3x3, 5 lines. The server draws every spin; RTP is the long-run share of bets paid back. */
export default function SlotPage() {
  const { token } = useAdminAuth();
  const [enabled, setEnabled] = useState(false);
  const [rtp, setRtp] = useState('94');
  const [levels, setLevels] = useState('');
  const [bigWin, setBigWin] = useState('10');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: Settings) => {
    setEnabled(s.slot_enabled);
    setRtp(String(s.slot_rtp_preset));
    setLevels(s.slot_bet_levels.join(', '));
    setBigWin(String(s.slot_big_win_x));
  };

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api<{ data: Settings }>('/admin/slot', token);
    apply(res.data);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }));
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ data: Settings }>('/admin/slot', token!, {
        method: 'PUT',
        body: JSON.stringify({
          slot_enabled: enabled,
          slot_rtp_preset: Number(rtp),
          slot_bet_levels: levels.split(',').map((x) => Number(x.trim())),
          slot_big_win_x: Number(bigWin),
        }),
      });
      apply(res.data);
      setMsg({ ok: true, text: 'Saved. The next spin uses these values.' });
    } catch (e: any) {
      setMsg({ ok: false, text: `Save failed: ${e?.message ?? e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ad-page">
      <PageHeader
        title="Lucky Slots"
        subtitle="A 3x3 slot machine with 5 paylines, played from the room games list. The bet is taken and the win paid in coins in one step."
      />
      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <section className="ad-card">
        <div className="ad-card-head"><div><h2>Settings</h2></div></div>
        <div className="ad-card-body">
          <div className="ad-toggle-row">
            <div>
              <div className="ad-toggle-title">Lucky Slots</div>
              <div className={`ad-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — players can spin' : 'Off — spinning is refused'}
              </div>
            </div>
            <Switch label="Lucky Slots enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="ad-form-grid is-2up">
            <Field label="Return to player (RTP)" hint="Share of all bets paid back over many spins. Higher = players win more.">
              <select value={rtp} onChange={(e) => setRtp(e.target.value)}>
                <option value="90">90%</option>
                <option value="94">94%</option>
                <option value="96">96%</option>
              </select>
            </Field>
            <Field label="Big win multiplier" hint="A win of this many times the bet shows the BIG WIN banner.">
              <div className="ad-unit"><input type="number" min={1} max={1000} value={bigWin} onChange={(e) => setBigWin(e.target.value)} /><span>x</span></div>
            </Field>
            <Field label="Bet levels (coins)" hint="1–8 rising numbers, comma separated, each divisible by 5 (the bet is split over 5 lines).">
              <input value={levels} onChange={(e) => setLevels(e.target.value)} />
            </Field>
          </div>
          <div className="ad-form-actions">
            <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" onClick={save} disabled={busy}>
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
