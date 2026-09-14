export const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export async function api<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return res.json() as Promise<T>;
}
