'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { canSeePage, readTier } from '@/lib/tier';

export interface AdminAuthState {
  token: string | null;
  loading: boolean;
}

export function useAdminAuth(): AdminAuthState {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t =
      typeof window !== 'undefined'
        ? localStorage.getItem('ca_admin_token')
        : null;
    if (!t) {
      router.replace('/login');
      return;
    }
    // A typed URL above this tier goes home instead of rendering a page of 403s (no token = no fetches).
    const tier = readTier();
    if (tier && !canSeePage(tier, pathname)) {
      router.replace('/');
      return;
    }
    setToken(t);
    setLoading(false);
  }, [router, pathname]);

  return { token, loading };
}
