'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU_GROUPS = [
  {
    title: '',
    items: [{ name: 'Dashboard', href: '/' }]
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { name: 'Users', href: '/users' },
      { name: 'Staff', href: '/staff' },
      { name: 'Reports', href: '/reports' },
      { name: 'Withdrawals', href: '/withdrawals' }
    ]
  },
  {
    title: 'SETTINGS',
    items: [
      { name: 'Staff Commissions', href: '/staff-commissions' }
    ]
  },
  {
    title: 'BONUSES',
    items: [{ name: 'Party Room Bonuses', href: '/party-bonuses' }]
  },
  {
    title: 'CATALOG',
    items: [
      { name: 'Packages', href: '/packages' },
      { name: 'Levels', href: '/levels' },
      { name: 'Gifts', href: '/gifts' },
      { name: 'Stickers', href: '/stickers' },
      { name: 'Frames', href: '/frames' },
      { name: 'Role Frames', href: '/role-frames' },
      { name: 'Entry Bars', href: '/entry-bars' },
      { name: 'Room Themes', href: '/room-themes' },
      { name: 'Banners', href: '/banners' },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: '260px',
      backgroundColor: '#1c2536',
      color: '#9ca3af',
      height: '100vh',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '24px 20px', color: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>ChatAura Admin</h2>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>Superadmin</p>
      </div>

      <nav style={{ padding: '0 12px 24px 12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {MENU_GROUPS.map((group, idx) => (
          <div key={idx}>
            {group.title && (
              <h3 style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: '0 0 8px 12px',
                color: '#6b7280'
              }}>
                {group.title}
              </h3>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {group.items.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      color: isActive ? '#fff' : '#9ca3af',
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.color = '#fff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#9ca3af';
                      }
                    }}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
