import { getAuthHeaders } from '../session';

const API_BASE = '/api/tipos-local';

export interface TipoLocalCategoria {
  id: string;
  organizationId: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  ordem: number;
  createdAt: string;
  updatedAt: string;
}

export interface TipoLocalItem {
  id: string;
  organizationId: string;
  categoriaId: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  descricao: string | null;
  ordem: number;
  createdAt: string;
  updatedAt: string;
}

export interface TipoLocalDetalhe {
  id: string;
  organizationId: string;
  tipoId: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  ordem: number;
  createdAt: string;
  updatedAt: string;
}

export interface TiposLocalData {
  categorias: TipoLocalCategoria[];
  tipos: TipoLocalItem[];
  detalhes: TipoLocalDetalhe[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  // Auth por Bearer token (sessionStorage) — o app não usa cookie de sessão.
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...authHeaders, ...(init?.headers as Record<string, string> | undefined) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

function postJson<T>(body: unknown): Promise<T> {
  return fetchJson<T>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchJson<T>(body: unknown): Promise<T> {
  return fetchJson<T>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listTiposLocal(organizationId: string, signal?: AbortSignal): Promise<TiposLocalData> {
  return fetchJson<TiposLocalData>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

// ── Categorias ──────────────────────────────────────────────────────────────────
export async function createCategoria(data: {
  organizationId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
}): Promise<TipoLocalCategoria> {
  return postJson<TipoLocalCategoria>({ action: 'create-categoria', ...data });
}

export async function updateCategoria(id: string, data: {
  nome?: string;
  cor?: string | null;
  icone?: string | null;
}): Promise<TipoLocalCategoria> {
  return patchJson<TipoLocalCategoria>({ kind: 'categoria', id, ...data });
}

export async function deleteCategoria(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?kind=categoria&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderCategorias(items: { id: string; ordem: number }[]): Promise<void> {
  await postJson<any>({ action: 'reorder-categorias', items });
}

// ── Tipos ───────────────────────────────────────────────────────────────────────
export async function createTipo(data: {
  organizationId: string;
  categoriaId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  descricao?: string | null;
}): Promise<TipoLocalItem> {
  return postJson<TipoLocalItem>({ action: 'create-tipo', ...data });
}

export async function updateTipo(id: string, data: {
  categoriaId?: string;
  nome?: string;
  cor?: string | null;
  icone?: string | null;
  descricao?: string | null;
}): Promise<TipoLocalItem> {
  return patchJson<TipoLocalItem>({ kind: 'tipo', id, ...data });
}

export async function deleteTipo(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?kind=tipo&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderTipos(items: { id: string; ordem: number }[]): Promise<void> {
  await postJson<any>({ action: 'reorder-tipos', items });
}

// ── Detalhes (3º nível) ───────────────────────────────────────────────────────────
export async function createDetalhe(data: {
  organizationId: string;
  tipoId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
}): Promise<TipoLocalDetalhe> {
  return postJson<TipoLocalDetalhe>({ action: 'create-detalhe', ...data });
}

export async function updateDetalhe(id: string, data: {
  tipoId?: string;
  nome?: string;
  cor?: string | null;
  icone?: string | null;
}): Promise<TipoLocalDetalhe> {
  return patchJson<TipoLocalDetalhe>({ kind: 'detalhe', id, ...data });
}

export async function deleteDetalhe(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?kind=detalhe&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderDetalhes(items: { id: string; ordem: number }[]): Promise<void> {
  await postJson<any>({ action: 'reorder-detalhes', items });
}

/** Insere os detalhes pré-cadastrados (defaults) do tipo que ainda não existem. */
export async function seedDetalhes(organizationId: string, tipoId: string): Promise<{ inserted: number; available: number }> {
  return postJson<{ inserted: number; available: number }>({ action: 'seed-detalhes', organizationId, tipoId });
}
