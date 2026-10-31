'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminTier, PANEL, TIER_LABEL, canSeePage, panelAccepts, readTier } from '@/lib/tier';

const MENU_GROUPS = [
  {
    title: '',
    items: [
      { name: 'Dashboard', href: '/' },
      { name: 'Settings', href: '/settings' },
      { name: 'Staff', href: '/staff' },
      { name: 'Staff Approvals', href: '/approvals' },
      { name: 'Staff Commissions', href: '/staff-commissions' },
    ]
  },
  {
    title: 'BONUSES',
    items: [
      { name: 'Party Room Bonuses', href: '/party-bonuses' },
      { name: 'Rocket levels', href: '/rockit' },
      { name: 'Room Reward Levels', href: '/room-rewards' },
      { name: 'SVIP', href: '/svip' },
      { name: 'Gold Mine', href: '/gold-mine' },
      { name: 'Musical Chair', href: '/musical-chair' },
      { name: 'Battle', href: '/battle' },
      { name: 'Lucky Slots', href: '/slot' },
    ]
  },
  {
    title: 'CATALOG',
    items: [
      { name: 'Packages', href: '/packages' },
      { name: 'Levels', href: '/levels' },
      { name: 'Gifts', href: '/gifts' },
      { name: 'Relationships', href: '/relationships' },
      { name: 'Stickers', href: '/stickers' },
      { name: 'Frames', href: '/frames' },
      { name: 'Role Frames', href: '/role-frames' },
      { name: 'Entry Bars', href: '/entry-bars' },
      { name: 'Room Themes', href: '/room-themes' },
      { name: 'Banners', href: '/banners' },
      { name: 'Countries', href: '/countries' },
    ]
  },
  {
    title: 'OPERATIONS',
    items: [
      { name: 'Users', href: '/users' },
      { name: 'Star Accounts', href: '/star-accounts' },
      { name: 'Coin Sellers', href: '/coin-sellers' },
      { name: 'Withdrawals (legacy)', href: '/withdrawals' },
      { name: 'Reports', href: '/reports' },
      { name: 'Party Room Analytics', href: '/party-room-analytics' },
      { name: 'User Location Report', href: '/user-location-compliance' },
      { name: 'User reports', href: '/user-reports' },
      { name: 'Posts', href: '/posts' },
      { name: 'Reels', href: '/reels' },
      { name: 'Transactions', href: '/transactions' },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [tier, setTier] = useState<AdminTier | null>(null);
  useEffect(() => {
    const t = readTier();
    // Both panels share the browser's storage; a session for the other panel goes back to this login.
    // UI only — the API enforces every tier on its own.
    if (!panelAccepts(t)) {
      router.replace('/login');
      return;
    }
    setTier(t);
  }, [router]);

  // Default to the lowest tier until known, so a staff member never flashes gated pages.
  const effTier: AdminTier = tier ?? 'admin';
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const groups = MENU_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => canSeePage(effTier, it.href) && (!term || it.name.toLowerCase().includes(term))),
  })).filter((g) => g.items.length > 0);

  // Mobile drawer: closes on navigation and Escape.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [pathname]);
  useEffect(() => {
    if (open) document.querySelector('.sb-link.is-active')?.scrollIntoView({ block: 'center' });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const title = PANEL === 'staff' ? 'ChatAura Staff' : 'ChatAura Admin';
  const current = MENU_GROUPS.flatMap((g) => g.items).find((it) => it.href === pathname);

  return (
    <>
      <header className="sb-topbar">
        <button
          type="button"
          className="sb-burger"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="sb-drawer"
          onClick={() => setOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="sb-topbar-title">
          <strong>{current?.name ?? title}</strong>
          {current ? <small>{title}</small> : null}
        </div>
      </header>
      <div className={`sb-backdrop ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden />

      <aside id="sb-drawer" className={`sb ${open ? 'is-open' : ''}`}>
        <div className="sb-head">
          <div>
            <h2>{title}</h2>
            <p>{tier ? TIER_LABEL[tier] : ''}</p>
          </div>
          <button type="button" className="sb-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>

        <div className="sb-find">
          <input
            type="search"
            placeholder="Find a page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const first = groups[0]?.items[0];
              if (e.key === 'Enter' && first) router.push(first.href);
            }}
            aria-label="Find a page"
          />
        </div>

        <nav className="sb-nav">
          {groups.length === 0 && <p className="sb-empty">No page matches &ldquo;{query}&rdquo;</p>}
          {groups.map((group, idx) => (
            <div key={idx}>
              {group.title && <h3 className="sb-group">{group.title}</h3>}
              <div className="sb-items">
                {group.items.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`sb-link ${pathname === item.href ? 'is-active' : ''}`}
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <button
            type="button"
            className="sb-logout"
            onClick={() => {
              localStorage.removeItem('ca_admin_token');
              localStorage.removeItem('ca_admin_tier');
              document.cookie = 'ca_admin_token=; path=/; max-age=0; SameSite=Lax';
              router.push('/login');
            }}
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
