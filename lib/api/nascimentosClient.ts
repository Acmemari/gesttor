/**
 * Cliente HTTP para Movimentação › Nascimento.
 * Endpoints em /api/nascimentos cobrem movimentos de nascimento e suas fichas.
 */
const API_BASE = '/api/nascimentos';

export interface NascimentoFichaRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  apelido: string;
  rfid: string | null;
  sisbov: string | null;
  porte: string | null;
  raca: string | null;
  peso: string | null;
  extras: Record<string, string>;
  createdAt: string;
}

export interface NascimentoMovimentoRow {
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
  catDecl: { catId: string; qtd: number }[];
  sanitario: unknown[];
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  fichas: NascimentoFichaRow[];
}

export interface CreateMovimentoInput {
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
  catDecl: { catId: string; qtd: number }[];
  sanitario: unknown[];
  fichas: Array<{
    apelido: string;
    catId?: string | null;
    rfid?: string | null;
    sisbov?: string | null;
    porte?: string | null;
    raca?: string | null;
    peso?: number | null;
    extras?: Record<string, string>;
  }>;
}

export interface AddFichaInput {
  movimentoId: string;
  apelido: string;
  categoriaId?: string | null;
  rfid?: string | null;
  sisbov?: string | null;
  porte?: string | null;
  raca?: string | null;
  peso?: number | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<NascimentoMovimentoRow[]> {
  return fetchJson<NascimentoMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMovimento(data: CreateMovimentoInput): Promise<NascimentoMovimentoRow> {
  return fetchJson<NascimentoMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function addFicha(data: AddFichaInput): Promise<NascimentoMovimentoRow> {
  return fetchJson<NascimentoMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-ficha', ...data }),
  });
}

export async function updateMovimento(
  id: string,
  data: Omit<CreateMovimentoInput, 'organizationId'>,
): Promise<NascimentoMovimentoRow> {
  return fetchJson<NascimentoMovimentoRow>(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
