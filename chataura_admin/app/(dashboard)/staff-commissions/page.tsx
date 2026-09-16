'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [giftComm, setGiftComm] = useState('20');
  const [starComm, setStarComm] = useState('30');
  const [gemsPerCoin, setGemsPerCoin] = useState('10');
  const [cashoutEnabled, setCashoutEnabled] = useState(false);
  const [earningsPurchaseEnabled, setEarningsPurchaseEnabled] = useState(true);

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { settings: Settings } }>('/admin/settings', token);
      if (json.data?.settings) {
        const s = json.data.settings;
        setGiftComm(String(s.gift_commission_pct ?? 20));
        setStarComm(String(s.star_chat_commission_pct ?? 30));
        setGemsPerCoin(String(s.gems_per_coin ?? 10));
        setCashoutEnabled(Boolean(s.cashout_enabled));
        setEarningsPurchaseEnabled(Boolean(s.earnings_purchase_enabled));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function save() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setSaving(true);
    setSuccessMsg('');
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
      setSuccessMsg('Commission and payout settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Staff & Host Commissions</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Configure host revenue share percentages, platform commissions, and cashout policies.</p>
      </div>

      {successMsg && (
        <div style={{ padding: '14px 20px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', marginBottom: '24px', fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading settings...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 20px 0', color: '#111827' }}>Revenue Shares & Rates</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Live Room Gift Platform Commission (%)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={giftComm}
                    onChange={(e) => setGiftComm(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>% platform fee (remaining goes to room host)</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  1-on-1 Star Chat Commission (%)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={starComm}
                    onChange={(e) => setStarComm(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>% platform fee for celebrity video/audio calls</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Host Gems to Coin Conversion Ratio
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={gemsPerCoin}
                    onChange={(e) => setGemsPerCoin(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Gems equal to 1 Coin</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 20px 0', color: '#111827' }}>Payout & Cashout Policies</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>Allow Cashout Requests</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Enable creators and coin sellers to submit withdrawal requests</div>
                </div>
                <input
                  type="checkbox"
                  checked={cashoutEnabled}
                  onChange={(e) => setCashoutEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>Earnings Wallet Purchases</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Allow users to use their earned gems directly to buy catalog items</div>
                </div>
                <input
                  type="checkbox"
                  checked={earningsPurchaseEnabled}
                  onChange={(e) => setEarningsPurchaseEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  style={{ width: '100%', height: '46px', fontSize: '1rem', fontWeight: 600 }}
                >
                  {saving ? 'Saving Settings...' : 'Save Commission Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
