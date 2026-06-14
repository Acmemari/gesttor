/**
 * Cliente HTTP para Movimentação › Consumo/Doação.
 * Endpoints em /api/consumo cobrem movimentos de consumo/doação e suas fichas.
 */
const API_BASE = '/api/consumo';

export interface ConsumoFichaRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  tipo: string | null;
  apelido: string | null;
  rfid: string | null;
  pesoVivo: string | null;
  pesoMorto: string | null;
  valor: string | null;
  obs: string | null;
  extras: Record<string, string>;
  createdAt: string;
}

export interface ConsumoCatDecl {
  catId: string;
  qtd: number;
  tipo?: string | null;
  pesoVivo?: number | null;
  pesoMorto?: number | null;
  valor?: number | null;
}

export interface ConsumoMovimentoRow {
  id: string;
  organizationId: string;
  farmId: string | null;
  localId: string | null;
  proprietarioId: string | null;
  data: string; // 'AAAA-MM-DD'
  safra: string | null;
  retiro: string | null;
  qtd: number;
  naoIdentificados: number;
  status: 'pendente' | 'conciliado';
  catDecl: ConsumoCatDecl[];
  obs: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  fichas: ConsumoFichaRow[];
}

export interface CreateConsumoMovimentoInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  qtd: number;
  naoIdentificados: number;
  status: 'pendente' | 'conciliado';
  catDecl: ConsumoCatDecl[];
  obs?: string | null;
  fichas: Array<{
    apelido?: string | null;
    rfid?: string | null;
    catId?: string | null;
    tipo?: string | null;
    pesoVivo?: number | null;
    pesoMorto?: number | null;
    valor?: number | null;
    obs?: string | null;
    extras?: Record<string, string>;
  }>;
}

export interface AddConsumoFichaInput {
  movimentoId: string;
  apelido?: string | null;
  rfid?: string | null;
  categoriaId?: string | null;
  tipo?: string | null;
  pesoVivo?: number | null;
  pesoMorto?: number | null;
  valor?: number | null;
  obs?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<ConsumoMovimentoRow[]> {
  return fetchJson<ConsumoMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMovimento(data: CreateConsumoMovimentoInput): Promise<ConsumoMovimentoRow> {
  return fetchJson<ConsumoMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function addFicha(data: AddConsumoFichaInput): Promise<ConsumoMovimentoRow> {
  return fetchJson<ConsumoMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-ficha', ...data }),
  });
}

export async function updateMovimento(
  id: string,
  data: Omit<CreateConsumoMovimentoInput, 'organizationId'>,
): Promise<ConsumoMovimentoRow> {
  return fetchJson<ConsumoMovimentoRow>(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
