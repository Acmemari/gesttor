const API_BASE = '/api/estacao-monta';

export interface EstacaoMonta {
  id: string;
  organizationId: string;
  farmId: string | null;   // nível Fazenda
  retiro: string | null;   // nível Retiro (nome) — quando a fazenda tiver retiros
  montaInicio: string;     // 'YYYY-MM-DD' — início do Período da Monta
  montaFim: string;        // 'YYYY-MM-DD' — fim do Período da Monta
  nascimentoInicio: string; // derivado: montaInicio + 281 dias
  nascimentoFim: string;    // derivado: montaFim + 281 dias
  safra: string;           // derivada (julho→julho), ex.: "2026/2027"
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

export async function listEstacoesMonta(organizationId: string, signal?: AbortSignal): Promise<EstacaoMonta[]> {
  return fetchJson<EstacaoMonta[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createEstacaoMonta(data: {
  organizationId: string;
  farmId?: string | null;
  retiro?: string | null;
  montaInicio: string;
  montaFim: string;
}): Promise<EstacaoMonta> {
  return fetchJson<EstacaoMonta>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateEstacaoMonta(id: string, data: {
  farmId?: string | null;
  retiro?: string | null;
  montaInicio?: string;
  montaFim?: string;
}): Promise<EstacaoMonta> {
  return fetchJson<EstacaoMonta>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
}

export async function deleteEstacaoMonta(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderEstacoesMonta(items: { id: string; ordem: number }[]): Promise<void> {
  await fetchJson<any>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reorder', items }),
  });
}
