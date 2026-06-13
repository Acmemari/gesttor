import type { MovimentoFieldConfig } from '../../agents/pecuario/fichas/types';

const API_BASE = '/api/movimento-field-config';

/** Tipos de movimento que persistem configuração de campos neste endpoint. */
export type MovimentoTipo = 'compra' | 'venda' | 'morte';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

/** Linha persistida da configuração de campos (config pode vir null se nunca salva). */
export interface MovimentoFieldConfigRow {
  config: MovimentoFieldConfig | null;
}

export async function getFieldConfig(
  organizationId: string,
  tipo: MovimentoTipo,
  signal?: AbortSignal,
): Promise<MovimentoFieldConfigRow> {
  return fetchJson<MovimentoFieldConfigRow>(
    `${API_BASE}?organizationId=${encodeURIComponent(organizationId)}&tipo=${encodeURIComponent(tipo)}`,
    { signal },
  );
}

export async function saveFieldConfig(
  organizationId: string,
  tipo: MovimentoTipo,
  config: MovimentoFieldConfig,
): Promise<void> {
  await fetchJson<unknown>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId, tipo, config }),
  });
}
