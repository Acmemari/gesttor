const API_BASE = '/api/tipos-chifre';

export interface TipoChifre {
  id: string;
  organizationId: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listTiposChifre(organizationId: string, signal?: AbortSignal): Promise<TipoChifre[]> {
  return fetchJson<TipoChifre[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createTipoChifre(data: {
  organizationId: string;
  nome: string;
  descricao?: string | null;
}): Promise<TipoChifre> {
  return fetchJson<TipoChifre>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateTipoChifre(id: string, data: {
  nome?: string;
  descricao?: string | null;
  ativo?: boolean;
}): Promise<TipoChifre> {
  return fetchJson<TipoChifre>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteTipoChifre(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderTiposChifre(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
