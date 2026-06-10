const API_BASE = '/api/reprodutores';

export type ReprodutorTipo = 'semen' | 'embriao';

/** Um nó da genealogia (ancestral): nome + número de registro. */
export interface GenealogiaNo {
  nome: string;
  registro: string;
}

/**
 * Genealogia em estilo pedigree — pai, mãe e os 4 avós (2 gerações de
 * ancestrais), no mesmo formato do diagrama em colchete.
 */
export interface Genealogia {
  pai?: GenealogiaNo;
  mae?: GenealogiaNo;
  avoPaternoPai?: GenealogiaNo; // avô paterno (pai do pai)
  avoPaternoMae?: GenealogiaNo; // avó paterna (mãe do pai)
  avoMaternoPai?: GenealogiaNo; // avô materno (pai da mãe)
  avoMaternoMae?: GenealogiaNo; // avó materna (mãe da mãe)
}

export interface Reprodutor {
  id: string;
  organizationId: string;
  nome: string;
  registro: string | null;
  dataNascimento: string | null;
  tipo: ReprodutorTipo;
  raca: string | null;
  central: string | null;
  imagens: string[];
  genealogia: Genealogia;
  observacao: string | null;
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

export async function listReprodutores(organizationId: string, signal?: AbortSignal): Promise<Reprodutor[]> {
  return fetchJson<Reprodutor[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createReprodutor(data: {
  organizationId: string;
  nome: string;
  registro?: string | null;
  dataNascimento?: string | null;
  tipo: ReprodutorTipo;
  raca?: string | null;
  central?: string | null;
  imagens?: string[];
  genealogia?: Genealogia;
  observacao?: string | null;
}): Promise<Reprodutor> {
  return fetchJson<Reprodutor>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateReprodutor(id: string, data: {
  nome?: string;
  registro?: string | null;
  dataNascimento?: string | null;
  tipo?: ReprodutorTipo;
  raca?: string | null;
  central?: string | null;
  imagens?: string[];
  genealogia?: Genealogia;
  observacao?: string | null;
}): Promise<Reprodutor> {
  return fetchJson<Reprodutor>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteReprodutor(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderReprodutores(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
