import type { NascimentoFieldConfig } from '../../agents/pecuario/nascimento/types';

const API_BASE = '/api/nascimento-field-config';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

/** Linha persistida da configuração de campos (config pode vir null se nunca salva). */
export interface NascimentoFieldConfigRow {
  config: NascimentoFieldConfig | null;
}

export async function getFieldConfig(organizationId: string, signal?: AbortSignal): Promise<NascimentoFieldConfigRow> {
  return fetchJson<NascimentoFieldConfigRow>(
    `${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`,
    { signal },
  );
}

export async function saveFieldConfig(organizationId: string, config: NascimentoFieldConfig): Promise<void> {
  await fetchJson<unknown>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId, config }),
  });
}
