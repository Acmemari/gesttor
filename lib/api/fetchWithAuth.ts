/**
 * Fetch autenticado compartilhado.
 * Lê o token de sessão do localStorage e adiciona o header Authorization.
 * Se a resposta for 401, limpa o token e redireciona para /sign-in.
 */
import { getAuthHeaders, clearToken } from '../session';

export interface ApiSuccess<T> { ok: true; data: T; }
export interface ApiError { ok: false; error: string; }

function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  clearToken();
  window.location.replace('/sign-in');
}

export async function fetchWithAuth<T>(
  url: string,
  options?: RequestInit,
): Promise<ApiSuccess<T> | ApiError> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options?.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    handleUnauthorized();
    return { ok: false, error: 'Não autorizado' };
  }

  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    return (json as ApiError).error ? (json as ApiError) : { ok: false, error: `HTTP ${res.status}` };
  }
  return json as ApiSuccess<T>;
}
