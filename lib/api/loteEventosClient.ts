/**
 * Cliente HTTP do ledger de eventos da Gestão de Lotes (/api/lote-eventos).
 * Eventos são imutáveis: só há leitura e criação (empilhar).
 */
const API_BASE = '/api/lote-eventos';

export type LoteEventoTipo = 'alocacao' | 'transferencia' | 'manejo' | 'repro';

/** Linha persistida do evento. `dados` carrega o payload específico do tipo. */
export interface LoteEventoRow {
  id: string;
  organizationId: string;
  loteId: string;
  tipo: LoteEventoTipo;
  data: string;            // 'AAAA-MM-DD'
  resp: string | null;
  dados: Record<string, any>;
  criadoPor: string | null;
  createdAt: string;
}

export interface CreateLoteEventoInput {
  organizationId: string;
  loteId: string;
  tipo: LoteEventoTipo;
  data: string;
  resp?: string | null;
  dados: Record<string, any>;
  /** Sincroniza fichas_animal.lote quando há animais por ID. */
  syncFichas?: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listLoteEventos(organizationId: string, signal?: AbortSignal): Promise<LoteEventoRow[]> {
  return fetchJson<LoteEventoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function listLoteEventosByLote(loteId: string, signal?: AbortSignal): Promise<LoteEventoRow[]> {
  return fetchJson<LoteEventoRow[]>(`${API_BASE}?loteId=${encodeURIComponent(loteId)}`, { signal });
}

export async function createLoteEvento(data: CreateLoteEventoInput): Promise<LoteEventoRow> {
  return fetchJson<LoteEventoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
