const API_BASE = '/api/padrao-racial';

export interface PadraoRacial {
  id: string;
  organizationId: string;
  nome: string;
  /** Padrão Racial exclusivo: 'PO' | 'PC' | 'LA' | 'Comercial' | null. */
  classificacao: string | null;
  /** CEIP — combinável apenas com PO/PC/LA. */
  ceip: boolean;
  /** Grau de Sangue: 'Puro' | '1/2 sangue' | '3/4 sangue' | '5/8 sangue' | '3/8 sangue' | '7/8 sangue' | '15/16 sangue' | null. */
  grauSangue: string | null;
  /** Observação livre. */
  observacao: string | null;
  /** Registro padrão do sistema: só pode ser ativado/inativado, nunca alterado/excluído. */
  sistema: boolean;
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

export async function listPadraoRacial(organizationId: string, signal?: AbortSignal): Promise<PadraoRacial[]> {
  return fetchJson<PadraoRacial[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createPadraoRacial(data: {
  organizationId: string;
  nome: string;
  classificacao?: string | null;
  ceip?: boolean;
  grauSangue?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}): Promise<PadraoRacial> {
  return fetchJson<PadraoRacial>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updatePadraoRacial(id: string, data: {
  nome?: string;
  classificacao?: string | null;
  ceip?: boolean;
  grauSangue?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}): Promise<PadraoRacial> {
  return fetchJson<PadraoRacial>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deletePadraoRacial(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderPadraoRacial(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
