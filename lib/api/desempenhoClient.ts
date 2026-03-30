/**
 * Cliente HTTP para desempenho (analytics de rotina semanal).
 */
import { getAuthHeaders, clearToken } from '../session';
import type { DesempenhoData } from '../../types';

async function apiFetch<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    if (res.status === 401) {
      if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
      return { ok: false, error: 'Não autorizado' };
    }
    const json = await res.json() as { ok: boolean; data?: T; error?: string };
    if (json.ok) return { ok: true, data: json.data as T };
    return { ok: false, error: json.error || `Erro ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getDesempenho(
  farmId: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ ok: true; data: DesempenhoData } | { ok: false; error: string }> {
  const params = new URLSearchParams({ farmId, dataInicio, dataFim });
  return apiFetch<DesempenhoData>(`/api/desempenho?${params}`);
}
