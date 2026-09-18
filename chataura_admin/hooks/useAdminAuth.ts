'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminAuthState {
  token: string | null;
  loading: boolean;
}

export function useAdminAuth(): AdminAuthState {
  const router = useRouter();
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
    setToken(t);
    setLoading(false);
  }, [router]);

  return { token, loading };
}
