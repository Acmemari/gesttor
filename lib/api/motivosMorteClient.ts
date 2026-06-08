const API_BASE = '/api/motivos-morte';

export interface MotivoMorte {
  id: string;
  organizationId: string;
  nome: string;
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

export async function listMotivosMorte(organizationId: string, signal?: AbortSignal): Promise<MotivoMorte[]> {
  return fetchJson<MotivoMorte[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMotivoMorte(data: {
  organizationId: string;
  nome: string;
  descricao?: string | null;
}): Promise<MotivoMorte> {
  return fetchJson<MotivoMorte>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateMotivoMorte(id: string, data: {
  nome?: string;
  descricao?: string | null;
}): Promise<MotivoMorte> {
  return fetchJson<MotivoMorte>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteMotivoMorte(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderMotivosMorte(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
