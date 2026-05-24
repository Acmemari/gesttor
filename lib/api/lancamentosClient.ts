/**
 * Cliente HTTP para Lançamentos de Despesa.
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

interface ApiSuccess<T> {
  ok: true;
  data: T;
}
interface ApiError {
  ok: false;
  error: string;
  code?: string;
}
export type ApiResult<T> = ApiSuccess<T> | ApiError;

export type Recorrencia = 'mensal' | 'sazonal' | 'unica';
export type StatusLancamento = 'ativo' | 'rascunho';
export type TipoOrigem = 'modal' | 'planilha';

export interface ProdutoInput {
  nome: string;
  quantidade: number;
  unidade: string | null;
  valorUnitario: number;
}

export interface ProdutoRow extends ProdutoInput {
  id: string;
  subtotal: number;
  ordem: number;
}

export interface LancamentoRow {
  id: string;
  versaoId: string;
  farmId: string;
  planoContaId: string;
  recorrencia: Recorrencia;
  valorBase: number;
  distribuicaoMensal: Record<string, number>;
  tipoOrigem: TipoOrigem;
  descricao: string | null;
  observacao: string | null;
  status: StatusLancamento;
  criadoPor: string;
  atualizadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  produtos: ProdutoRow[];
}

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

export async function listLancamentos(opts: {
  versaoId: string;
  farmId: string;
  planoContaId?: string;
  incluirShadow?: boolean;
  signal?: AbortSignal;
}): Promise<LancamentoRow[]> {
  const params = new URLSearchParams({ versaoId: opts.versaoId, farmId: opts.farmId });
  if (opts.planoContaId) params.set('planoContaId', opts.planoContaId);
  if (opts.incluirShadow) params.set('incluirShadow', 'true');
  const res = await fetchApi<LancamentoRow[]>(`${API_BASE}/lancamentos-orcamento?${params}`, {
    signal: opts.signal,
  });
  return res.ok ? res.data : [];
}

export interface CreateLancamentoPayload {
  versaoId: string;
  farmId: string;
  planoContaId: string;
  recorrencia: Recorrencia;
  valorBase: number;
  distribuicaoMensal: Record<string, number>;
  descricao?: string | null;
  observacao?: string | null;
  status?: StatusLancamento;
  produtos?: ProdutoInput[];
}

export async function createLancamento(payload: CreateLancamentoPayload): Promise<ApiResult<LancamentoRow>> {
  return fetchApi<LancamentoRow>(`${API_BASE}/lancamentos-orcamento`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UpdateLancamentoPayload {
  recorrencia?: Recorrencia;
  valorBase?: number;
  distribuicaoMensal?: Record<string, number>;
  descricao?: string | null;
  observacao?: string | null;
  status?: StatusLancamento;
  produtos?: ProdutoInput[];
}

export async function updateLancamento(id: string, payload: UpdateLancamentoPayload): Promise<ApiResult<LancamentoRow>> {
  return fetchApi<LancamentoRow>(`${API_BASE}/lancamentos-orcamento?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteLancamento(id: string): Promise<ApiResult<{ id: string; removed: boolean }>> {
  return fetchApi<{ id: string; removed: boolean }>(
    `${API_BASE}/lancamentos-orcamento?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
