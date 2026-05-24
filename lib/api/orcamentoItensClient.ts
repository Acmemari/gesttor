/**
 * Cliente HTTP para itens de orçamento (planilha de despesas).
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

export interface ContaPlanilha {
  id: string;
  numero: string;
  numeroPaiId: string | null;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
  isFolha: boolean;
}

export interface PlanilhaResult {
  contas: ContaPlanilha[];
  itens: Record<string, Record<string, number>>;
  versao: {
    id: string;
    orcamentoId: string;
    tipo: string;
    imutavel: boolean;
    mesCorte: string | null;
    nome: string;
  };
  orcamento: {
    id: string;
    nome: string;
    safra: string;
    dataInicio: string;
    dataFim: string;
  };
}

export interface EdicaoInput {
  planoContaId: string;
  /** chave='YYYY-MM-DD'; valor=number ou null (remove) */
  valoresMensais: Record<string, number | null>;
}

export async function listarPlanilha(opts: {
  versaoId: string;
  farmId: string;
  /** Quando omitido, traz todas as raízes de despesa. */
  numeroRaiz?: string;
  signal?: AbortSignal;
}): Promise<PlanilhaResult | null> {
  const params = new URLSearchParams({
    versaoId: opts.versaoId,
    farmId: opts.farmId,
  });
  if (opts.numeroRaiz) params.set('numeroRaiz', opts.numeroRaiz);
  const res = await fetchApi<PlanilhaResult>(`${API_BASE}/orcamento-itens?${params}`, {
    signal: opts.signal,
  });
  return res.ok ? res.data : null;
}

export async function salvarEdicoes(opts: {
  versaoId: string;
  farmId: string;
  edicoes: EdicaoInput[];
}): Promise<ApiResult<{ atualizadas: number; criadas: number; removidas: number }>> {
  return fetchApi<{ atualizadas: number; criadas: number; removidas: number }>(
    `${API_BASE}/orcamento-itens`,
    {
      method: 'PATCH',
      body: JSON.stringify(opts),
    },
  );
}
