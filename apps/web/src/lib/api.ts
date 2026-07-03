// Cliente HTTP fino. A API vive no mesmo origin (proxy do Vite em dev,
// nginx em produção), então os cookies de sessão fluem naturalmente.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Prefixa o caminho com o base path do deploy (raiz ou subcaminho). */
export function apiUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // corpo não-JSON — mantém statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** URL de início do login Google, voltando para `next` após autenticar. */
export function loginUrl(next: string): string {
  return apiUrl(`/api/auth/google/login?next=${encodeURIComponent(next)}`);
}
