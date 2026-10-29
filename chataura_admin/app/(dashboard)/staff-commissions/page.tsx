'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Section, Switch, errorText, useToasts } from '@/components/admin-ui';

type Settings = {
  id: number;
  gems_per_coin: number;
  min_gems_convert_to_coins: number;
  coin_to_xp_ratio: number;
  gift_commission_pct: number;
  earnings_purchase_enabled: boolean;
  cashout_enabled: boolean;
  star_chat_commission_pct: number;
};

export default function StaffCommissionsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [giftComm, setGiftComm] = useState('20');
  const [starComm, setStarComm] = useState('30');
  const [gemsPerCoin, setGemsPerCoin] = useState('10');
  const [cashoutEnabled, setCashoutEnabled] = useState(false);
  const [earningsPurchaseEnabled, setEarningsPurchaseEnabled] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const json = await api<{ success: boolean; data?: { settings: Settings } }>('/admin/settings', token);
        const s = json.data?.settings;
        if (s) {
          setGiftComm(String(s.gift_commission_pct ?? 20));
          setStarComm(String(s.star_chat_commission_pct ?? 30));
          setGemsPerCoin(String(s.gems_per_coin ?? 10));
          setCashoutEnabled(Boolean(s.cashout_enabled));
          setEarningsPurchaseEnabled(Boolean(s.earnings_purchase_enabled));
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
          gift_commission_pct: Number(giftComm),
          star_chat_commission_pct: Number(starComm),
          gems_per_coin: Number(gemsPerCoin),
          cashout_enabled: cashoutEnabled,
          earnings_purchase_enabled: earningsPurchaseEnabled,
        }),
      });
      toast('success', 'Commission and payout settings saved');
    } catch (e) {
      toast('error', errorText(e, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  const unit = (value: string, set: (v: string) => void, suffix: string, step?: string) => (
    <div className="cp-unit">
      <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => set(e.target.value)} />
      <span>{suffix}</span>
    </div>
  );

  return (
    <main className="cp-page">
      <PageHeader title="Staff & Host Commissions" subtitle="Host revenue share, platform commission on gifts and star chat, and cash-out policy." />

      {loading ? (
        <div className="cp-grid-2"><div className="cp-skeleton is-card" /><div className="cp-skeleton is-card" /></div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="cp-grid-2">
            <Section title="Revenue shares & rates" subtitle="What the platform keeps from each transaction.">
              <div style={{ display: 'grid', gap: 16 }}>
                <Field label="Live room gift commission" hint="Platform fee; the rest goes to the room host.">
                  {unit(giftComm, setGiftComm, '%')}
                </Field>
                <Field label="1-on-1 star chat commission" hint="Platform fee on star chat sessions.">
                  {unit(starComm, setStarComm, '%')}
                </Field>
                <Field label="Gems per coin" hint="How many host gems convert into 1 coin.">
                  {unit(gemsPerCoin, setGemsPerCoin, 'gems')}
                </Field>
              </div>
            </Section>

            <Section title="Payout & cash-out policy" subtitle="What creators and sellers can do with earnings.">
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="cp-toggle-row">
                  <div>
                    <div className="cp-toggle-title">Allow cash-out requests</div>
                    <div className="cp-toggle-hint">Creators and coin sellers can submit withdrawal requests.</div>
                  </div>
                  <Switch label="Allow cash-out requests" checked={cashoutEnabled} onChange={setCashoutEnabled} />
                </div>
                <div className="cp-toggle-row">
                  <div>
                    <div className="cp-toggle-title">Earnings wallet purchases</div>
                    <div className="cp-toggle-hint">Users can spend earned gems directly on catalog items.</div>
                  </div>
                  <Switch label="Earnings wallet purchases" checked={earningsPurchaseEnabled} onChange={setEarningsPurchaseEnabled} />
                </div>
              </div>
            </Section>
          </div>
          <div className="cp-form-actions">
            <button type="submit" className="cp-btn cp-btn-accent cp-btn-lg" disabled={saving}>
              {saving ? 'Saving…' : 'Save commission settings'}
            </button>
          </div>
        </form>
      )}
      {toastNode}
    </main>
  );
}
