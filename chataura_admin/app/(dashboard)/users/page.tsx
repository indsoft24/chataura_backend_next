'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type UserRow = {
  id: number;
  email?: string;
  display_name?: string;
  role?: string;
  is_star_account?: boolean;
  account_status?: string;
  coins?: number;
  coin_balance?: number;
  gems?: number;
};

type AdjustTarget = {
  id: number;
  name: string;
  coins: number;
  gems: number;
};

export default function UsersPage() {
  const { token } = useAdminAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const [asset, setAsset] = useState<'coins' | 'gems'>('coins');
  const [action, setAction] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  async function load(tok: string, query = '') {
    setLoading(true);
    try {
      const json = await api<{
        success: boolean;
        data?: { users: UserRow[] };
      }>(`/admin/users?q=${encodeURIComponent(query)}`, tok);
      setUsers(json.data?.users ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void load(token);
    }
  }, [token]);

  async function performAction(userId: number, actionName: string, body: Record<string, unknown> = {}) {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    await api(`/admin/users/${userId}/${actionName}`, tok, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    void load(tok, q);
  }

  async function toggleStar(userId: number, currentStar: boolean) {
    await performAction(userId, 'star', { is_star: !currentStar });
  }

  async function changeRole(userId: number, role: string) {
    await performAction(userId, 'link', { role });
  }

  function openAdjust(u: UserRow) {
    setAdjustTarget({
      id: u.id,
      name: u.display_name ?? u.email ?? `User #${u.id}`,
      coins: Number(u.coins ?? u.coin_balance ?? 0),
      gems: Number(u.gems ?? 0),
    });
    setAsset('coins');
    setAction('add');
    setAmount('');
    setNote('');
    setAdjustError(null);
    setAdjustSuccess(null);
  }

  function closeAdjust() {
    if (adjusting) return;
    setAdjustTarget(null);
    setAdjustError(null);
    setAdjustSuccess(null);
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;

    const parsed = Math.floor(Number(amount));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setAdjustError('Enter a positive whole-number amount.');
      return;
    }
    if (action === 'deduct' && !note.trim()) {
      setAdjustError('A note is required when deducting.');
      return;
    }

    setAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const json = await api<{
        success: boolean;
        data?: {
          message?: string;
          balances?: { coin_balance?: number; gems?: number };
        };
        message?: string;
      }>(`/admin/users/${adjustTarget.id}/adjust-balance`, tok, {
        method: 'POST',
        body: JSON.stringify({
          asset,
          action,
          amount: parsed,
          note: note.trim() || undefined,
        }),
      });
      const msg =
        json.data?.message ??
        json.message ??
        (action === 'add'
          ? `Added ${parsed} ${asset}`
          : `Deducted ${parsed} ${asset}`);
      setAdjustSuccess(msg);
      if (json.data?.balances) {
        setAdjustTarget((prev) =>
          prev
            ? {
                ...prev,
                coins: Number(json.data?.balances?.coin_balance ?? prev.coins),
                gems: Number(json.data?.balances?.gems ?? prev.gems),
              }
            : prev,
        );
      }
      setAmount('');
      setNote('');
      void load(tok, q);
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : 'Adjustment failed');
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Management</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
          View, search, assign roles, credit/debit coins &amp; gems, and manage user accounts.
        </p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <input
            placeholder="Search by name or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const tok = localStorage.getItem('ca_admin_token');
                if (tok) void load(tok, q);
              }
            }}
            style={{ maxWidth: '400px', margin: 0 }}
          />
          <button
            type="button"
            onClick={() => {
              const tok = localStorage.getItem('ca_admin_token');
              if (tok) void load(tok, q);
            }}
            style={{ width: 'auto' }}
          >
            Search
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>ID</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>User Info</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Balance</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Role</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'center' }}>Star Creator</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Status</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>#{u.id}</td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{u.display_name ?? 'Unknown'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{u.email ?? 'No email registered'}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', color: '#374151', whiteSpace: 'nowrap' }}>
                      <div>🪙 {Number(u.coins ?? u.coin_balance ?? 0).toLocaleString()}</div>
                      <div style={{ color: '#6b7280' }}>💎 {Number(u.gems ?? 0).toLocaleString()}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <select
                        value={u.role ?? 'user'}
                        onChange={(e) => void changeRole(u.id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: '1px solid #d1d5db',
                          background: u.role === 'admin' ? '#fee2e2' : u.role === 'seller' ? '#fef3c7' : '#e0e7ff',
                          color: u.role === 'admin' ? '#991b1b' : u.role === 'seller' ? '#92400e' : '#3730a3',
                          textTransform: 'uppercase',
                        }}
                      >
                        <option value="user">User</option>
                        <option value="seller">Coin Seller</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => void toggleStar(u.id, Boolean(u.is_star_account))}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: u.is_star_account ? '#fef3c7' : '#f3f4f6',
                          color: u.is_star_account ? '#b45309' : '#9ca3af',
                          border: '1px solid #d1d5db',
                          cursor: 'pointer',
                          width: 'auto',
                        }}
                      >
                        {u.is_star_account ? '⭐ Star Creator' : '☆ Standard'}
                      </button>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: u.account_status === 'active' ? '#d1fae5' : '#fee2e2', color: u.account_status === 'active' ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {u.account_status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openAdjust(u)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '6px', width: 'auto', cursor: 'pointer' }}
                        >
                          Adjust
                        </button>
                        {u.account_status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => performAction(u.id, 'suspend', { reason: 'Admin suspended' })}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', width: 'auto', cursor: 'pointer' }}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => performAction(u.id, 'unsuspend')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#d1fae5', color: '#047857', border: '1px solid #86efac', borderRadius: '6px', width: 'auto', cursor: 'pointer' }}
                          >
                            Unsuspend
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Deactivating a user will permanently end active sessions. Proceed?')) {
                              void performAction(u.id, 'deactivate', { reason: 'Admin deactivated' });
                            }
                          }}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f3f4f6', color: '#374151', width: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjustTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeAdjust}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              padding: 24,
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                Adjust balance
              </h2>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                {adjustTarget.name} · #{adjustTarget.id}
              </p>
              <p style={{ margin: '8px 0 0', color: '#374151', fontSize: '0.85rem' }}>
                Current: 🪙 {adjustTarget.coins.toLocaleString()} · 💎 {adjustTarget.gems.toLocaleString()}
              </p>
            </div>

            <form onSubmit={(e) => void submitAdjust(e)} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', color: '#374151' }}>
                Asset
                <select
                  value={asset}
                  onChange={(e) => setAsset(e.target.value as 'coins' | 'gems')}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                >
                  <option value="coins">Coins</option>
                  <option value="gems">Gems</option>
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAction('add')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: action === 'add' ? '1px solid #86efac' : '1px solid #d1d5db',
                    background: action === 'add' ? '#d1fae5' : '#fff',
                    color: action === 'add' ? '#065f46' : '#374151',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Credit (add)
                </button>
                <button
                  type="button"
                  onClick={() => setAction('deduct')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: action === 'deduct' ? '1px solid #fca5a5' : '1px solid #d1d5db',
                    background: action === 'deduct' ? '#fee2e2' : '#fff',
                    color: action === 'deduct' ? '#991b1b' : '#374151',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Debit (deduct)
                </button>
              </div>

              <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', color: '#374151' }}>
                Amount
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', margin: 0 }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', color: '#374151' }}>
                Note {action === 'deduct' ? '(required)' : '(optional)'}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  required={action === 'deduct'}
                  placeholder={
                    action === 'deduct'
                      ? 'Reason for debit (required for audit)'
                      : 'Optional reason for this credit'
                  }
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', resize: 'vertical', margin: 0 }}
                />
              </label>

              {adjustError && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem' }}>
                  {adjustError}
                </div>
              )}
              {adjustSuccess && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#ecfdf5', color: '#047857', fontSize: '0.85rem' }}>
                  {adjustSuccess}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={closeAdjust}
                  disabled={adjusting}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', width: 'auto', cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: action === 'deduct' ? '#b91c1c' : '#111827',
                    color: '#fff',
                    width: 'auto',
                    cursor: adjusting ? 'wait' : 'pointer',
                    opacity: adjusting ? 0.7 : 1,
                  }}
                >
                  {adjusting ? 'Saving…' : action === 'add' ? 'Credit' : 'Debit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
