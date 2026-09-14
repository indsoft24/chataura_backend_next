'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Pack = {
  id: number;
  audience: string;
  coins: number;
  currency: string;
  price: number;
  is_active: boolean;
};

export default function PackagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Pack[]>([]);
  const [coins, setCoins] = useState('100');
  const [price, setPrice] = useState('99');
  const [audience, setAudience] = useState('user');
  const [error, setError] = useState('');

  async function load(token: string) {
    const json = await api<{ success: boolean; data?: { packages: Pack[] } }>(
      '/admin/packages',
      token,
    );
    setRows(json.data?.packages ?? []);
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function create() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    const json = await api<{ success: boolean; error?: { message?: string } }>(
      '/admin/packages',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          coins: Number(coins),
          price: Number(price),
          audience,
        }),
      },
    );
    if (!json.success) {
      setError(json.error?.message ?? 'Create failed');
      return;
    }
    setError('');
    void load(token);
  }

  return (
    <main>
      <p>
        <Link href="/">Dashboard</Link> · <Link href="/users">Users</Link> ·{' '}
        <Link href="/staff">Staff</Link>
      </p>
      <h1>Coin packages</h1>
      <p>No max-pack limit. Seller and user audiences are both allowed.</p>
      <p>
        <input
          placeholder="coins"
          value={coins}
          onChange={(e) => setCoins(e.target.value)}
        />
        <input
          placeholder="price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <select value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="user">user</option>
          <option value="coin_seller">coin_seller</option>
        </select>
        <button type="button" onClick={() => void create()}>
          Add package
        </button>
      </p>
      {error ? <p className="err">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Audience</th>
            <th>Coins</th>
            <th>Price</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.audience}</td>
              <td>{p.coins}</td>
              <td>
                {p.price} {p.currency}
              </td>
              <td>{p.is_active ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
