const API_BASE = import.meta.env['VITE_API_URL'] ?? '';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = (await res.json()) as { data: T; error: { code: string; message: string } | null };

  if (!res.ok || json.error) {
    throw Object.assign(
      new Error(json.error?.message ?? `HTTP ${res.status}`),
      { code: json.error?.code, status: res.status }
    );
  }

  return json.data;
}

export function formatPrice(pence: number, symbol = '£'): string {
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

export function timeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
