'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Switch } from '@/components/admin-ui';

const ITEMS = ['orange', 'lemon', 'grape', 'cherry', 'super_lucky', 'apple', 'watermelon', 'mango', 'strawberry', 'lucky'];
const MULT: Record<string, number> = { orange: 5, lemon: 5, grape: 5, cherry: 5, apple: 10, watermelon: 15, mango: 25, strawberry: 45, super_lucky: 0, lucky: 0 };
const BONUS: Record<string, number> = { lucky: 2, super_lucky: 3 };
const FRUITS = ITEMS.filter((k) => MULT[k] > 0);
const TARGETS = ['5M', '50M', '250M', '500M', '2.5B'];
const label = (k: string) => k.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());

type Settings = {
  lucky_fruit_enabled: boolean;
  lucky_fruit_weights: Record<string, number>;
  lucky_fruit_bonus_pay_pct: number;
  lucky_fruit_max_round_bet: number;
  lucky_fruit_chest_rewards: number[];
};
type Day = { day: string; bets: number; payout: number; players: number; rounds: number; rtp: number };

/** Same formula as the server: long-run payout share (%) when one fruit is backed every round. */
function rtpOf(w: Record<string, number>, pct: number) {
  const total = ITEMS.reduce((a, k) => a + (w[k] || 0), 0);
  const lit = Object.entries(BONUS).reduce((a, [k, n]) => a + ((w[k] || 0) / total) * (n / FRUITS.length), 0);
  return Object.fromEntries(FRUITS.map((f) => [f, Math.round((((w[f] || 0) / total) * MULT[f] + lit * MULT[f] * (pct / 100)) * 10000) / 100]));
}

/** Lucky Fruit — one shared round for everyone; the server draws and pays. */
export default function LuckyFruitPage() {
  const { token } = useAdminAuth();
  const [enabled, setEnabled] = useState(false);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [bonusPct, setBonusPct] = useState('20');
  const [maxBet, setMaxBet] = useState('10000000');
  const [chests, setChests] = useState<string[]>(['0', '0', '0', '0', '0']);
  const [days, setDays] = useState<Day[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: Settings) => {
    setEnabled(s.lucky_fruit_enabled);
    setWeights(Object.fromEntries(ITEMS.map((k) => [k, String(s.lucky_fruit_weights[k])])));
    setBonusPct(String(s.lucky_fruit_bonus_pay_pct));
    setMaxBet(String(s.lucky_fruit_max_round_bet));
    setChests(s.lucky_fruit_chest_rewards.map(String));
  };

  const load = useCallback(async () => {
    if (!token) return;
    apply((await api<{ data: Settings }>('/admin/lucky-fruit', token)).data);
    setDays((await api<{ data: { days: Day[] } }>('/admin/lucky-fruit/stats', token)).data.days);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }));
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ data: Settings }>('/admin/lucky-fruit', token!, {
        method: 'PUT',
        body: JSON.stringify({
          lucky_fruit_enabled: enabled,
          lucky_fruit_weights: Object.fromEntries(ITEMS.map((k) => [k, Number(weights[k])])),
          lucky_fruit_bonus_pay_pct: Number(bonusPct),
          lucky_fruit_max_round_bet: Number(maxBet),
          lucky_fruit_chest_rewards: chests.map(Number),
        }),
      });
      apply(res.data);
      setMsg({ ok: true, text: 'Saved. The next round uses these values.' });
    } catch (e: any) {
      setMsg({ ok: false, text: `Save failed: ${e?.message ?? e}` });
    } finally {
      setBusy(false);
    }
  }

  const numW = Object.fromEntries(ITEMS.map((k) => [k, Number(weights[k]) || 0]));
  const total = ITEMS.reduce((a, k) => a + numW[k], 0);
  const rtp = total > 0 ? rtpOf(numW, Number(bonusPct) || 0) : {};

  return (
    <main className="cp-page">
      <PageHeader
        title="Lucky Fruit"
        subtitle="A shared 15-second round in the room games list. Players bet chips on fruits, the server draws the winner and pays in coins. Lucky lights 2 random fruits, Super Lucky lights 3."
      />
      {msg && <div className={`cp-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <section className="cp-card">
        <div className="cp-card-head"><div><h2>Settings</h2></div></div>
        <div className="cp-card-body">
          <div className="cp-toggle-row">
            <div>
              <div className="cp-toggle-title">Lucky Fruit</div>
              <div className={`cp-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — players can bet' : 'Off — betting is refused'}
              </div>
            </div>
            <Switch label="Lucky Fruit enabled" checked={enabled} onChange={setEnabled} />
          </div>
          <div className="cp-form-grid is-2up">
            <Field label="Lit fruit pays (% of its multiplier)" hint="When Lucky / Super Lucky lights a fruit you backed, you get this share of that fruit's multiplier.">
              <div className="cp-unit"><input type="number" min={0} max={100} value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} /><span>%</span></div>
            </Field>
            <Field label="Max bet per player per round (coins)" hint="Total of all chips one player can put in one round.">
              <input type="number" min={1000} value={maxBet} onChange={(e) => setMaxBet(e.target.value)} />
            </Field>
          </div>

          <h3 style={{ margin: '18px 0 6px' }}>Tile weights</h3>
          <p className="cp-toggle-hint">Chance = weight ÷ total ({total.toLocaleString()}). Multipliers are fixed (the app shows them). Return = share of bets paid back when a player backs that fruit every round.</p>
          <table className="cp-table">
            <thead><tr><th>Tile</th><th>Multiplier</th><th>Weight</th><th>Chance</th><th>Return</th></tr></thead>
            <tbody>
              {ITEMS.map((k) => (
                <tr key={k}>
                  <td>{label(k)}</td>
                  <td>{MULT[k] ? `x${MULT[k]}` : `Bonus (${BONUS[k]} fruits)`}</td>
                  <td><input type="number" min={1} value={weights[k] ?? ''} onChange={(e) => setWeights({ ...weights, [k]: e.target.value })} /></td>
                  <td>{total > 0 ? ((numW[k] / total) * 100).toFixed(2) : '–'}%</td>
                  <td>{(rtp as Record<string, number>)[k] != null ? `${(rtp as Record<string, number>)[k].toFixed(2)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ margin: '18px 0 6px' }}>Turnover chests (per day, IST)</h3>
          <p className="cp-toggle-hint">A player who bets this much today can open the chest once a day. 0 = the chest gives nothing yet.</p>
          <div className="cp-form-grid is-2up">
            {TARGETS.map((t, i) => (
              <Field key={t} label={`Chest ${t} — reward coins`}>
                <input type="number" min={0} value={chests[i] ?? '0'} onChange={(e) => setChests(chests.map((c, j) => (j === i ? e.target.value : c)))} />
              </Field>
            ))}
          </div>

          <div className="cp-form-actions">
            <button type="button" className="cp-btn cp-btn-primary cp-btn-lg" onClick={save} disabled={busy}>
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      <section className="cp-card" style={{ marginTop: 16 }}>
        <div className="cp-card-head"><div><h2>Last 7 days (IST)</h2></div></div>
        <div className="cp-card-body">
          <table className="cp-table">
            <thead><tr><th>Day</th><th>Rounds</th><th>Players</th><th>Bets</th><th>Paid out</th><th>Return</th></tr></thead>
            <tbody>
              {days.length === 0 && <tr><td colSpan={6}>No rounds yet.</td></tr>}
              {days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td><td>{d.rounds}</td><td>{d.players}</td>
                  <td>{d.bets.toLocaleString()}</td><td>{d.payout.toLocaleString()}</td><td>{d.rtp}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
