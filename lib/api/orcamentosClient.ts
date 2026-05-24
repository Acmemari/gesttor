/**
 * Cliente HTTP do workspace de Gestão Orçamentária.
 * Cobre orçamentos, versões, colaboradores, auditoria e plano de contas.
 */
import { getAuthHeaders, clearToken } from '../session';
import type {
  Orcamento,
  OrcamentoDetalhado,
  OrcamentoVersao,
  OrcamentoColaborador,
  AuditEvent,
  PapelColaborador,
} from '../../components/orcamento/types';

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
  if (!json) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  if (!res.ok && 'error' in json) {
    return json as ApiError;
  }
  return json as ApiSuccess<T>;
}

// ─── Orçamentos ─────────────────────────────────────────────────────────────

export interface CreateOrcamentoPayload {
  organizationId: string;
  nome: string;
  safra: string;
  dataInicio: string;
  dataFim: string;
  descricao?: string | null;
  fazendas: string[];
  colaboradores: { userId: string; papel: PapelColaborador; eAprovador?: boolean }[];
  premissasIniciais: { chave: string; valor: number; unidade: string; fonte: string }[];
}

export async function listOrcamentos(opts: {
  organizationId: string;
  search?: string;
  includeArquivados?: boolean;
  signal?: AbortSignal;
}): Promise<{ data: Orcamento[]; hasMore: boolean }> {
  const params = new URLSearchParams({ organizationId: opts.organizationId });
  if (opts.search) params.set('search', opts.search);
  if (opts.includeArquivados) params.set('includeArquivados', 'true');
  const res = await fetchApi<Orcamento[]>(`${API_BASE}/orcamentos?${params}`, { signal: opts.signal });
  if ('error' in res) {
    if (opts.signal?.aborted !== true) {
      console.warn('[orcamentosClient] listOrcamentos falhou:', res.error, res.code);
    }
    return { data: [], hasMore: false };
  }
  return { data: res.data, hasMore: !!res.meta?.hasMore };
}

export async function getOrcamentoById(id: string, signal?: AbortSignal): Promise<OrcamentoDetalhado | null> {
  const res = await fetchApi<OrcamentoDetalhado>(`${API_BASE}/orcamentos?id=${encodeURIComponent(id)}`, { signal });
  if ('error' in res) {
    if (signal?.aborted !== true) {
      console.warn('[orcamentosClient] getOrcamentoById falhou:', res.error, res.code);
    }
    return null;
  }
  return res.data;
}

export async function createOrcamento(payload: CreateOrcamentoPayload): Promise<ApiResult<{ orcamento: Orcamento; versao: OrcamentoVersao }>> {
  return fetchApi<{ orcamento: Orcamento; versao: OrcamentoVersao }>(`${API_BASE}/orcamentos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function archiveOrcamento(id: string): Promise<ApiResult<{ id: string; arquivado: boolean }>> {
  return fetchApi<{ id: string; arquivado: boolean }>(`${API_BASE}/orcamentos?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ─── Versões ────────────────────────────────────────────────────────────────

export async function listVersoes(orcamentoId: string, signal?: AbortSignal): Promise<OrcamentoVersao[]> {
  const res = await fetchApi<OrcamentoVersao[]>(
    `${API_BASE}/orcamentos-versoes?orcamentoId=${encodeURIComponent(orcamentoId)}`,
    { signal },
  );
  return res.ok ? res.data : [];
}

// ─── Colaboradores ──────────────────────────────────────────────────────────

export async function listColaboradores(orcamentoId: string, signal?: AbortSignal): Promise<OrcamentoColaborador[]> {
  const res = await fetchApi<OrcamentoColaborador[]>(
    `${API_BASE}/orcamentos-colaboradores?orcamentoId=${encodeURIComponent(orcamentoId)}`,
    { signal },
  );
  return res.ok ? res.data : [];
}

export async function listUsuariosDisponiveis(
  organizationId: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string | null; email: string; role: string }[]> {
  const res = await fetchApi<{ id: string; name: string | null; email: string; role: string }[]>(
    `${API_BASE}/orcamentos-colaboradores?disponiveis=1&organizationId=${encodeURIComponent(organizationId)}`,
    { signal },
  );
  return res.ok ? res.data : [];
}

// ─── Auditoria ──────────────────────────────────────────────────────────────

export async function listAuditoria(opts: {
  orcamentoId: string;
  versaoId?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<AuditEvent[]> {
  const params = new URLSearchParams({ orcamentoId: opts.orcamentoId });
  if (opts.versaoId) params.set('versaoId', opts.versaoId);
  if (opts.limit) params.set('limit', String(opts.limit));
  const res = await fetchApi<AuditEvent[]>(`${API_BASE}/orcamentos-auditoria?${params}`, { signal: opts.signal });
  return res.ok ? res.data : [];
}

// ─── Plano de Contas ────────────────────────────────────────────────────────

export interface PlanoContaRow {
  id: string;
  numero: string;
  numeroPaiId: string | null;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
  isFolha: boolean;
  ativo: boolean;
}

let _planoContasCache: PlanoContaRow[] | null = null;

export async function listPlanoContas(forceRefresh = false): Promise<PlanoContaRow[]> {
  if (!forceRefresh && _planoContasCache) return _planoContasCache;
  const res = await fetchApi<PlanoContaRow[]>(`${API_BASE}/plano-contas`);
  if (!res.ok) return [];
  _planoContasCache = res.data;
  return res.data;
}
