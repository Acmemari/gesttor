const API_BASE = '/api/regimes-alimentares';

export interface RegimeAlimentarProduto {
  nome: string;
  origem: 'estoque' | 'manual';
  custoQuilo: number;
  estoqueQtd: number | null;
}

export interface RegimeAlimentar {
  id: string;
  organizationId: string;
  nome: string;
  codigoCurto: string;
  tipo: string;
  produtoFormulado: string | null;
  nivelIngestaoValor: string | null;
  nivelIngestaoTipo: string | null;
  custoQuilo: string | null;
  anexoUrl: string | null;
  anexoNome: string | null;
  produtos: RegimeAlimentarProduto[] | null;
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

export async function listRegimesAlimentares(organizationId: string, signal?: AbortSignal): Promise<RegimeAlimentar[]> {
  return fetchJson<RegimeAlimentar[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createRegimeAlimentar(data: {
  organizationId: string;
  nome: string;
  codigoCurto: string;
  tipo: string;
  produtoFormulado?: string | null;
  nivelIngestaoValor?: string | null;
  nivelIngestaoTipo?: string | null;
  custoQuilo?: string | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
  produtos?: RegimeAlimentarProduto[] | null;
}): Promise<RegimeAlimentar> {
  return fetchJson<RegimeAlimentar>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateRegimeAlimentar(id: string, data: {
  nome?: string;
  codigoCurto?: string;
  tipo?: string;
  produtoFormulado?: string | null;
  nivelIngestaoValor?: string | null;
  nivelIngestaoTipo?: string | null;
  custoQuilo?: string | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
  produtos?: RegimeAlimentarProduto[] | null;
  ativo?: boolean;
}): Promise<RegimeAlimentar> {
  return fetchJson<RegimeAlimentar>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteRegimeAlimentar(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderRegimesAlimentares(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}

export interface RegimeAlimentarHistorico {
  id: string;
  regimeAlimentarId: string;
  dataVigencia: string;
  custoQuilo: string;
  formulacao: string | null;
  anexoUrl: string | null;
  anexoNome: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listRegimeHistory(regimeId: string): Promise<RegimeAlimentarHistorico[]> {
  return fetchJson<RegimeAlimentarHistorico[]>(`${API_BASE}?action=history&regimeId=${encodeURIComponent(regimeId)}`);
}

export async function addRegimeHistoryEntry(data: {
  regimeAlimentarId: string;
  dataVigencia: string;
  custoQuilo: string | number;
  formulacao?: string | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
}): Promise<RegimeAlimentarHistorico> {
  return fetchJson<RegimeAlimentarHistorico>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-history', ...data }),
  });
}

export async function deleteRegimeHistoryEntry(id: string, regimeAlimentarId: string): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-history', id, regimeAlimentarId }),
  });
}

export interface RegimeAlimentarGmd {
  id: string;
  regimeAlimentarId: string;
  categoriaId: string;
  estacao: string;
  gmd: string;
  createdAt: string;
  updatedAt: string;
}

export async function listRegimeGmds(regimeId: string): Promise<RegimeAlimentarGmd[]> {
  return fetchJson<RegimeAlimentarGmd[]>(`${API_BASE}?action=gmd&regimeId=${encodeURIComponent(regimeId)}`);
}

export async function setRegimeGmd(data: {
  regimeAlimentarId: string;
  categoriaId: string;
  estacao: string;
  gmd: string | number;
}): Promise<RegimeAlimentarGmd> {
  return fetchJson<RegimeAlimentarGmd>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-gmd', ...data }),
  });
}

export async function deleteRegimeGmd(id: string): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-gmd', id }),
  });
}
