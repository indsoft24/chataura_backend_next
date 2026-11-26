export const API =
  process.env.NEXT_PUBLIC_API_URL || '/api/v2';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code = '';
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const body = (await res.json()) as { error?: { message?: string; code?: string }; message?: string };
        message = body?.error?.message ?? body?.message ?? message;
        code = body?.error?.code ?? '';
      } else {
        // HTML error page from Nginx / proxy — don't try to parse JSON
        message = `Server error (${res.status})`;
      }
    } catch {
      // ignore parse errors
    }
    // A suspended account answers 403 ACCOUNT_SUSPENDED: sign it out like a 401 so the panel never stays open.
    if ((res.status === 401 || (res.status === 403 && code === 'ACCOUNT_SUSPENDED')) && typeof window !== 'undefined') {
      localStorage.removeItem('ca_admin_token');
      localStorage.removeItem('ca_admin_tier');
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/nextadmin';
      const loginUrl = `${basePath.replace(/\/$/, '')}/login`;
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = loginUrl;
      }
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

export async function uploadAdminFile(
  file: File,
  token: string | null,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api<{ success: boolean; url?: string; data?: { url?: string } }>(
    '/admin/upload',
    token,
    {
      method: 'POST',
      body: formData,
    },
  );
  const url = res.url || res.data?.url;
  if (!url) {
    throw new Error('Upload completed but no URL was returned');
  }
  return url;
}

