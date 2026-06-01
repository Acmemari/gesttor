const API_BASE = '/api/animal-breeds';

export interface AnimalBreed {
  id: string;
  organizationId: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listAnimalBreeds(organizationId: string, signal?: AbortSignal): Promise<AnimalBreed[]> {
  return fetchJson<AnimalBreed[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createAnimalBreed(data: {
  organizationId: string;
  nome: string;
  ativo?: boolean;
}): Promise<AnimalBreed> {
  return fetchJson<AnimalBreed>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateAnimalBreed(id: string, data: {
  nome?: string;
  ativo?: boolean;
}): Promise<AnimalBreed> {
  return fetchJson<AnimalBreed>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteAnimalBreed(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderAnimalBreeds(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
