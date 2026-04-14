const API_BASE = import.meta.env['VITE_API_URL'] ?? '';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  sessionToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

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
