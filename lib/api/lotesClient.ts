const API_BASE = '/api/lotes';

/** Finalidade do lote — identidade imutável; habilita o card reprodutivo só p/ Cria. */
export type Finalidade = 'Cria' | 'Recria' | 'Terminação' | 'Outra Finalidade';

export interface Lote {
  id: string;
  organizationId: string;
  nome: string;
  codigo: string | null;
  finalidade: string | null; // Finalidade
  sistema: string | null;
  dataInicio: string; // 'YYYY-MM-DD'
  finalizado: boolean;
  descricao: string | null;
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

export async function listLotes(organizationId: string, signal?: AbortSignal): Promise<Lote[]> {
  return fetchJson<Lote[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createLote(data: {
  organizationId: string;
  nome: string;
  codigo?: string | null;
  finalidade?: string | null;
  sistema?: string | null;
  dataInicio: string;
  finalizado: boolean;
  descricao?: string | null;
}): Promise<Lote> {
  return fetchJson<Lote>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateLote(id: string, data: {
  nome?: string;
  codigo?: string | null;
  finalidade?: string | null;
  sistema?: string | null;
  dataInicio?: string;
  finalizado?: boolean;
  descricao?: string | null;
}): Promise<Lote> {
  return fetchJson<Lote>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteLote(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderLotes(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
