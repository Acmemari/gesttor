/**
 * Cliente HTTP para Mapa de Rebanho (Estoque de Partida).
 *
 * Endpoints em /api/mapa-rebanho cobrem dois recursos:
 *   - "Headers": cabeçalho do mapa (fazenda, data de referência, status).
 *   - "Lançamentos": células da matriz Local × Categoria (qtd + peso médio).
 */
const API_BASE = '/api/mapa-rebanho';

export interface MapaRebanhoHeader {
  id: string;
  organizationId: string;
  farmId: string;
  dataReferencia: string; // 'AAAA-MM-DD'
  status: 'rascunho' | 'salvo';
  // Modo que "trava" o mapa: 'pasto' | 'categoria' | null (ainda não travado)
  distribuicaoModo: 'pasto' | 'categoria' | null;
  observacao: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapaRebanhoLancamento {
  id: string;
  mapaHeaderId: string;
  localId: string;
  categoriaId: string;
  quantidade: number;
  pesoKgCabeca: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

// ── Headers ──────────────────────────────────────────────────────────────────

export async function listMapasByOrg(organizationId: string, signal?: AbortSignal): Promise<MapaRebanhoHeader[]> {
  return fetchJson<MapaRebanhoHeader[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function listMapasByFarm(farmId: string, signal?: AbortSignal): Promise<MapaRebanhoHeader[]> {
  return fetchJson<MapaRebanhoHeader[]>(`${API_BASE}?farmId=${encodeURIComponent(farmId)}`, { signal });
}

export async function getMapaById(headerId: string, signal?: AbortSignal): Promise<MapaRebanhoHeader | null> {
  return fetchJson<MapaRebanhoHeader | null>(`${API_BASE}?headerId=${encodeURIComponent(headerId)}`, { signal });
}

export async function createMapa(data: {
  organizationId: string;
  farmId: string;
  dataReferencia: string;
  observacao?: string;
}): Promise<MapaRebanhoHeader> {
  return fetchJson<MapaRebanhoHeader>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateMapa(id: string, data: {
  status?: 'rascunho' | 'salvo';
  observacao?: string;
  dataReferencia?: string;
  distribuicaoModo?: 'pasto' | 'categoria' | null;
}): Promise<MapaRebanhoHeader> {
  return fetchJson<MapaRebanhoHeader>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteMapa(headerId: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?headerId=${encodeURIComponent(headerId)}`, { method: 'DELETE' });
}

// ── Lançamentos ──────────────────────────────────────────────────────────────

export async function listLancamentos(mapaHeaderId: string, signal?: AbortSignal): Promise<MapaRebanhoLancamento[]> {
  return fetchJson<MapaRebanhoLancamento[]>(
    `${API_BASE}?lancamentosHeaderId=${encodeURIComponent(mapaHeaderId)}`,
    { signal },
  );
}

export async function upsertLancamento(data: {
  mapaHeaderId: string;
  localId: string;
  categoriaId: string;
  quantidade: number;
  pesoKgCabeca: number;
}): Promise<MapaRebanhoLancamento> {
  return fetchJson<MapaRebanhoLancamento>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert-lancamento', ...data }),
  });
}
