'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Section, errorText, useToasts } from '@/components/admin-ui';

type Settings = {
  id: number;
  coin_to_xp_ratio: number;
  spin_cost: number;
};

export default function PartyBonusesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [spinCost, setSpinCost] = useState('50');
  const [coinToXp, setCoinToXp] = useState('0.1');

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const json = await api<{ success: boolean; data?: { settings: Settings } }>('/admin/settings', token);
        const s = json.data?.settings;
        if (s) {
          setSpinCost(String(s.spin_cost ?? 50));
          setCoinToXp(String(s.coin_to_xp_ratio ?? 0.1));
        }
      } catch (e) {
        toast('error', errorText(e, 'Failed to load settings'));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, toast]);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await api('/admin/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({
          spin_cost: Number(spinCost),
          coin_to_xp_ratio: Number(coinToXp),
        }),
      });
      toast('success', 'Party room bonuses updated');
    } catch (e) {
      toast('error', errorText(e, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  const xp = Number(coinToXp);
  const coinsPerXp = xp > 0 ? Math.round(1 / xp) : null;

  return (
    <main className="cp-page">
      <PageHeader title="Party Room Bonuses" subtitle="Lucky wheel spin pricing and how fast users earn XP from spending coins." />

      {loading ? (
        <div className="cp-skeleton is-card" style={{ maxWidth: 560 }} />
      ) : (
        <form
          style={{ maxWidth: 560 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Section title="Lucky spin & XP">
            <div style={{ display: 'grid', gap: 16 }}>
              <Field label="Lucky wheel spin cost" hint="Coins charged per bonus spin.">
                <div className="cp-unit">
                  <input type="number" inputMode="numeric" value={spinCost} onChange={(e) => setSpinCost(e.target.value)} />
                  <span>coins</span>
                </div>
              </Field>
              <Field
                label="XP per coin spent"
                hint={coinsPerXp ? `Users earn 1 XP for every ${coinsPerXp.toLocaleString()} coins spent.` : 'Set above 0 to award XP for spending.'}
              >
                <div className="cp-unit">
                  <input type="number" inputMode="decimal" step="0.01" value={coinToXp} onChange={(e) => setCoinToXp(e.target.value)} />
                  <span>XP</span>
                </div>
              </Field>
            </div>
            <div className="cp-form-actions">
              <button type="submit" className="cp-btn cp-btn-accent cp-btn-lg" disabled={saving}>
                {saving ? 'Saving…' : 'Save bonus settings'}
              </button>
            </div>
          </Section>
        </form>
      )}
      {toastNode}
    </main>
  );
}
