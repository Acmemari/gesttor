/**
 * Cliente HTTP para Movimentação › Mortes.
 * Endpoints em /api/mortes cobrem movimentos de morte e suas fichas.
 */
const API_BASE = '/api/mortes';

export interface MorteFichaRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  motivoId: string | null;
  apelido: string | null;
  rfid: string | null;
  obs: string | null;
  extras: Record<string, string>;
  createdAt: string;
}

export interface MorteMovimentoRow {
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
  catDecl: { catId: string; qtd: number; motivoId?: string | null }[];
  obs: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  fichas: MorteFichaRow[];
}

export interface CreateMorteMovimentoInput {
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
  catDecl: { catId: string; qtd: number; motivoId?: string | null }[];
  obs?: string | null;
  fichas: Array<{
    apelido?: string | null;
    rfid?: string | null;
    catId?: string | null;
    motivoId?: string | null;
    obs?: string | null;
    extras?: Record<string, string>;
  }>;
}

export interface AddMorteFichaInput {
  movimentoId: string;
  apelido?: string | null;
  rfid?: string | null;
  categoriaId?: string | null;
  motivoId?: string | null;
  obs?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<MorteMovimentoRow[]> {
  return fetchJson<MorteMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMovimento(data: CreateMorteMovimentoInput): Promise<MorteMovimentoRow> {
  return fetchJson<MorteMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function addFicha(data: AddMorteFichaInput): Promise<MorteMovimentoRow> {
  return fetchJson<MorteMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-ficha', ...data }),
  });
}

export async function updateMovimento(
  id: string,
  data: Omit<CreateMorteMovimentoInput, 'organizationId'>,
): Promise<MorteMovimentoRow> {
  return fetchJson<MorteMovimentoRow>(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
