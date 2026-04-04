const API_BASE = '/api/animal-categories';

export interface AnimalCategory {
  id: string;
  organizationId: string;
  nome: string;
  complemento: string | null;
  sexo: string;
  grupo: string;
  idadeFaixa: string | null;
  pesoKg: string | null;
  ordem: number;
  percentual: string | null;
  unidadePeso: string | null;
  valorKgArroba: string | null;
  valorCabeca: string | null;
  quantidade: number | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listAnimalCategories(organizationId: string, signal?: AbortSignal): Promise<AnimalCategory[]> {
  return fetchJson<AnimalCategory[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createAnimalCategory(data: {
  organizationId: string;
  nome: string;
  complemento?: string;
  sexo: string;
  grupo: string;
  idadeFaixa?: string;
  pesoKg?: number | null;
}): Promise<AnimalCategory> {
  return fetchJson<AnimalCategory>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateAnimalCategory(id: string, data: {
  nome?: string;
  complemento?: string;
  sexo?: string;
  grupo?: string;
  idadeFaixa?: string;
  pesoKg?: number | null;
}): Promise<AnimalCategory> {
  return fetchJson<AnimalCategory>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteAnimalCategory(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderAnimalCategories(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
