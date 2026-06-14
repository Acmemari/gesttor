/**
 * Cliente HTTP do ledger da Movimentação de Áreas (/api/area-movimentos).
 * Eventos são imutáveis: só há leitura e criação (empilhar um movimento).
 * Cada criação grava o evento E atualiza a projeção (cadastro) no servidor.
 */
import type { AreaMovimentoRow } from '../../agents/pecuario/areas/types';

const API_BASE = '/api/area-movimentos';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

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
  area?: string | null;
  geometry?: [number, number][] | null;
  geometrySource?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}

export const renomear = (i: Base & { areaId: string; name: string }) =>
  post<AreaMovimentoRow>({ tipo: 'renomear', ...i });

export const mover = (i: Base & { areaId: string; retiroId?: string | null; setorId?: string | null }) =>
  post<AreaMovimentoRow>({ tipo: 'mover', ...i });

export const aposentar = (i: Base & { areaId: string; motivo?: string | null }) =>
  post<AreaMovimentoRow>({ tipo: 'aposentar', ...i });

export const reativar = (i: Base & { areaId: string }) =>
  post<AreaMovimentoRow>({ tipo: 'reativar', ...i });

export const dividir = (i: Base & { parentId: string; filhos: FilhoInput[] }) =>
  post<{ pai: { id: string }; filhos: any[]; evento: AreaMovimentoRow }>({ tipo: 'dividir', ...i });

export const unir = (i: Base & { origemIds: string[]; destino: FilhoInput }) =>
  post<{ destino: any; origens: any[]; evento: AreaMovimentoRow }>({ tipo: 'unir', ...i });

export const mudarNivel = (i: Base & { nivel: 'retiro' | 'setor' | 'local'; retiro: boolean; setor: boolean; local: boolean }) =>
  post<AreaMovimentoRow>({ tipo: 'nivel', ...i });
