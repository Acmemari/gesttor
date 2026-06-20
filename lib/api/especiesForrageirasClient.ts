const API_BASE = '/api/especies-forrageiras';

/** Alturas-alvo de pastejo (cm) por regime de manejo. Qualquer ponta é opcional. */
export interface AlturasPastejo {
  /** Pastejo contínuo: altura ideal a manter no pasto (campo único). idealMin/idealMax são legados. */
  continuo?: { ideal?: number | null; idealMin?: number | null; idealMax?: number | null };
  /** Pastejo rotacionado: altura de entrada e de saída. */
  rotacionado?: { entrada?: number | null; saida?: number | null };
  /** Pastejo rotatínuo (rotacionado contínuo): altura de entrada e de saída. */
  rotatinuo?: { entrada?: number | null; saida?: number | null };
}

export interface EspecieForrageira {
  id: string;
  organizationId: string;
  nome: string;
  nomeCientifico: string | null;
  alturas: AlturasPastejo;
  imagens: string[];
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

export async function listEspeciesForrageiras(organizationId: string, signal?: AbortSignal): Promise<EspecieForrageira[]> {
  return fetchJson<EspecieForrageira[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createEspecieForrageira(data: {
  organizationId: string;
  nome: string;
  nomeCientifico?: string | null;
  alturas?: AlturasPastejo;
  imagens?: string[];
  descricao?: string | null;
}): Promise<EspecieForrageira> {
  return fetchJson<EspecieForrageira>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateEspecieForrageira(id: string, data: {
  nome?: string;
  nomeCientifico?: string | null;
  alturas?: AlturasPastejo;
  imagens?: string[];
  descricao?: string | null;
}): Promise<EspecieForrageira> {
  return fetchJson<EspecieForrageira>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteEspecieForrageira(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderEspeciesForrageiras(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
