/**
 * Cliente HTTP para Movimentação › Mudança de Categoria.
 * Endpoints em /api/mudanca-categoria. Move animais de uma categoria de saída
 * (origem) para uma de entrada (destino). No modo "por animal", muda a categoria
 * atual do animal (upsert em fichas_animal) e registra o evento; no modo
 * "coletivo", apenas declara uma quantidade.
 */
const API_BASE = '/api/mudanca-categoria';

export interface MudancaCategoriaFichaRow {
  id: string;
  movimentoId: string;
  apelido: string | null;
  rfid: string | null;
  categoriaOrigemId: string | null;
  categoriaDestinoId: string | null;
  qtd: number;
  peso: string | null;
  valor: string | null;
  obs: string | null;
  createdAt: string;
}

export interface MudancaCategoriaMovimentoRow {
  id: string;
  organizationId: string;
  farmId: string | null;
  localId: string | null;
  proprietarioId: string | null;
  data: string; // 'AAAA-MM-DD'
  safra: string | null;
  retiro: string | null;
  qtd: number;
  catDecl: { catId: string; qtd: number }[];
  obs: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  fichas: MudancaCategoriaFichaRow[];
}

export interface ChangeCategoryAnimalInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  apelido?: string | null;
  rfid?: string | null;
  categoriaOrigemId?: string | null;
  categoriaDestinoId: string;
  peso?: string | null;
  valor?: string | null;
  sexo?: string | null;
  nascimentoFichaId?: string | null;
  obs?: string | null;
}

export interface DeclareCategoryChangeInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  categoriaOrigemId?: string | null;
  categoriaDestinoId: string;
  qtd: number;
  peso?: string | null;
  valor?: string | null;
  obs?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<MudancaCategoriaMovimentoRow[]> {
  return fetchJson<MudancaCategoriaMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function changeCategoryAnimal(data: ChangeCategoryAnimalInput): Promise<MudancaCategoriaMovimentoRow> {
  return fetchJson<MudancaCategoriaMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'change', ...data }),
  });
}

export async function declareCategoryChange(data: DeclareCategoryChangeInput): Promise<MudancaCategoriaMovimentoRow> {
  return fetchJson<MudancaCategoriaMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'declare', ...data }),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
