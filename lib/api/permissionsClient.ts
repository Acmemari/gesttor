/**
 * Cliente HTTP para API de permissões por fazenda.
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: string;
}

async function fetchApi<T>(url: string): Promise<ApiSuccess<T> | ApiError> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, { headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    return (json as ApiError).error ? (json as ApiError) : { ok: false, error: `HTTP ${res.status}` };
  }
  return json as ApiSuccess<T>;
}

export interface FarmPermissionData {
  permissions: Record<string, string>;
  is_responsible: boolean;
}

/** Obtém permissões para uma fazenda. */
export async function fetchFarmPermissions(
  farmId: string,
): Promise<{ permissions: Record<string, string>; is_responsible: boolean } | null> {
  const res = await fetchApi<FarmPermissionData | null>(
    `${API_BASE}/permissions?farmId=${encodeURIComponent(farmId)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/** Obtém permissões em batch para múltiplas fazendas. */
export async function fetchFarmPermissionsBatch(
  farmIds: string[],
): Promise<{ farm_id: string; is_responsible: boolean; permissions: Record<string, string> }[]> {
  if (farmIds.length === 0) return [];
  const res = await fetchApi<{ farm_id: string; is_responsible: boolean; permissions: Record<string, string> }[]>(
    `${API_BASE}/permissions?farmIds=${encodeURIComponent(farmIds.join(','))}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data ?? [];
}
