/**
 * Cliente HTTP do ledger da Movimentação de Áreas (/api/area-movimentos).
 * Eventos são imutáveis: só há leitura e criação (empilhar um movimento).
 * Cada criação grava o evento E atualiza a projeção (cadastro) no servidor.
 */
import type { AreaMovimentoRow } from '../../agents/pecuario/areas/types';

const API_BASE = '/api/area-movimentos';

/** Erro HTTP com o corpo da resposta anexado (necessário p/ 409 com payload). */
export interface ApiError extends Error {
  status?: number;
  code?: string;
  payload?: any;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json?.error || 'Erro na requisição') as ApiError;
    e.status = res.status;
    e.code = json?.code;
    e.payload = json;
    throw e;
  }
  return json.data ?? json;
}

/** Realocação de rebanho: origemLocalId → destinoRef (índice do filho | id destino). */
export type RealocacaoMap = Record<string, string>;

function post<T>(body: unknown): Promise<T> {
  return fetchJson<T>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByFarm(farmId: string, signal?: AbortSignal): Promise<AreaMovimentoRow[]> {
  return fetchJson<AreaMovimentoRow[]>(`${API_BASE}?farmId=${encodeURIComponent(farmId)}`, { signal });
}

export async function listMovimentosByArea(areaId: string, signal?: AbortSignal): Promise<AreaMovimentoRow[]> {
  return fetchJson<AreaMovimentoRow[]>(`${API_BASE}?areaId=${encodeURIComponent(areaId)}`, { signal });
}

// ── Escrita (um helper por operação) ──────────────────────────────────────────

/** Campos comuns a todo lançamento. */
interface Base {
  organizationId: string;
  farmId: string;
  data: string;                 // 'AAAA-MM-DD'
  nota?: string | null;
  classe?: 'movimento' | 'correcao';
}

export interface FilhoInput {
  name: string;
  tipo?: string | null;
  uso?: string | null;
  area?: string | null;
  geometry?: [number, number][] | null;
  geometrySource?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}

export const renomear = (i: Base & { areaId: string; name: string }) =>
  post<AreaMovimentoRow>({ tipo: 'renomear', ...i });

/** Redesenho de perímetro: novo geometry vira nova versão (remodelar) no ledger. */
export const redesenhar = (i: Base & { areaId: string; geometry: [number, number][] | null; geometrySource?: string | null; area?: string | null }) =>
  post<AreaMovimentoRow>({ tipo: 'remodelar', ...i });

/** Conversão de uso: mesma identidade, novo uso, nova versão. */
export const conversaoUso = (i: Base & { areaId: string; uso: string }) =>
  post<AreaMovimentoRow>({ tipo: 'conversao_uso', ...i });

export const mover = (i: Base & { areaId: string; retiroId?: string | null; setorId?: string | null }) =>
  post<AreaMovimentoRow>({ tipo: 'mover', ...i });

export const aposentar = (i: Base & { areaId: string; motivo?: string | null }) =>
  post<AreaMovimentoRow>({ tipo: 'aposentar', ...i });

export const reativar = (i: Base & { areaId: string }) =>
  post<AreaMovimentoRow>({ tipo: 'reativar', ...i });

export const dividir = (i: Base & { parentId: string; filhos: FilhoInput[]; realocacao?: RealocacaoMap; ackTolerancia?: boolean }) =>
  post<{ pai: { id: string }; filhos: any[]; evento: AreaMovimentoRow }>({ tipo: 'dividir', ...i });

export const unir = (i: Base & { origemIds: string[]; destino: FilhoInput; realocacao?: RealocacaoMap; ackTolerancia?: boolean }) =>
  post<{ destino: any; origens: any[]; evento: AreaMovimentoRow }>({ tipo: 'unir', ...i });

export const mudarNivel = (i: Base & { nivel: 'retiro' | 'setor' | 'local'; retiro: boolean; setor: boolean; local: boolean }) =>
  post<AreaMovimentoRow>({ tipo: 'nivel', ...i });
