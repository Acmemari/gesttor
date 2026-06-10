const API_BASE = '/api/pelagens';

export interface Pelagem {
  id: string;
  organizationId: string;
  descricao: string;
  bovino: boolean;
  equideo: boolean;
  observacao: string | null;
  imagens: string[];
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

export async function listPelagens(organizationId: string, signal?: AbortSignal): Promise<Pelagem[]> {
  return fetchJson<Pelagem[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createPelagem(data: {
  organizationId: string;
  descricao: string;
  bovino: boolean;
  equideo: boolean;
  observacao?: string | null;
  imagens?: string[];
}): Promise<Pelagem> {
  return fetchJson<Pelagem>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updatePelagem(id: string, data: {
  descricao?: string;
  bovino?: boolean;
  equideo?: boolean;
  observacao?: string | null;
  imagens?: string[];
}): Promise<Pelagem> {
  return fetchJson<Pelagem>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deletePelagem(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderPelagens(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
