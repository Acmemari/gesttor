const API_BASE = '/api/campos-personalizados';

export type CampoTipo = 'texto' | 'numero' | 'lista';
export type CampoMovimento = 'compra' | 'venda' | 'nascimento' | 'morte' | 'consumo';

export interface CampoPersonalizado {
  id: string;
  organizationId: string;
  nome: string;
  tipo: CampoTipo;
  opcoes: string[];
  movimentos: CampoMovimento[];
  obrigatorio: boolean;
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

export async function listCamposPersonalizados(organizationId: string, signal?: AbortSignal): Promise<CampoPersonalizado[]> {
  return fetchJson<CampoPersonalizado[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createCampoPersonalizado(data: {
  organizationId: string;
  nome: string;
  tipo: CampoTipo;
  opcoes?: string[];
  movimentos?: CampoMovimento[];
  obrigatorio?: boolean;
}): Promise<CampoPersonalizado> {
  return fetchJson<CampoPersonalizado>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateCampoPersonalizado(id: string, data: {
  nome?: string;
  tipo?: CampoTipo;
  opcoes?: string[];
  movimentos?: CampoMovimento[];
  obrigatorio?: boolean;
}): Promise<CampoPersonalizado> {
  return fetchJson<CampoPersonalizado>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteCampoPersonalizado(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderCamposPersonalizados(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
