/**
 * Cliente HTTP para Movimentação › Desmame.
 * Endpoints em /api/desmames. O "desmamar" muda a categoria atual do animal
 * (upsert em fichas_animal) e registra o evento numa ficha de desmame.
 */
const API_BASE = '/api/desmames';

export interface DesmameFichaRow {
  id: string;
  movimentoId: string;
  apelido: string | null;
  rfid: string | null;
  categoriaOrigemId: string | null;
  categoriaDestinoId: string | null;
  peso: string | null;
  obs: string | null;
  createdAt: string;
}

export interface DesmameMovimentoRow {
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
  fichas: DesmameFichaRow[];
}

export interface WeanAnimalInput {
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
  sexo?: string | null;
  nascimentoFichaId?: string | null;
  obs?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<DesmameMovimentoRow[]> {
  return fetchJson<DesmameMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function weanAnimal(data: WeanAnimalInput): Promise<DesmameMovimentoRow> {
  return fetchJson<DesmameMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'wean', ...data }),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
