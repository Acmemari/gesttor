/**
 * Cliente HTTP para configuração de plano de contas por fazenda.
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { offset?: number; limit?: number; hasMore?: boolean };
}

interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResult<T>> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
    signal: options?.signal,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      clearToken();
      window.location.replace('/sign-in');
    }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!json) return { ok: false, error: `HTTP ${res.status}` };
  if (!res.ok && 'error' in json) return json as ApiError;
  return json as ApiSuccess<T>;
}

export interface PlanoContaComFlag {
  id: string;
  numero: string;
  numeroPaiId: string | null;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
  isFolha: boolean;
  ativo: boolean;
  ativoNaFazenda: boolean;
}

export interface AtivacaoInput {
  planoContaId: string;
  ativo: boolean;
}

export async function listPlanoContasDaFazenda(
  farmId: string,
  signal?: AbortSignal,
): Promise<PlanoContaComFlag[]> {
  const res = await fetchApi<PlanoContaComFlag[]>(
    `${API_BASE}/farm-plano-contas?farmId=${encodeURIComponent(farmId)}`,
    { signal },
  );
  return res.ok ? res.data : [];
}

export async function salvarAtivacoes(
  farmId: string,
  ativacoes: AtivacaoInput[],
): Promise<ApiResult<{ atualizadas: number }>> {
  return fetchApi<{ atualizadas: number }>(`${API_BASE}/farm-plano-contas`, {
    method: 'PATCH',
    body: JSON.stringify({ farmId, ativacoes }),
  });
}
