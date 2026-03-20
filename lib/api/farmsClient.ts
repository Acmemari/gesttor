/**
 * Cliente HTTP para API de fazendas (/api/farms).
 * Funções de criação, atualização e desativação de fazendas.
 */
import { getAuthHeaders, clearToken } from '../session';
import type { Farm } from '../../types';
import { mapFarmFromDatabase, mapFarmsFromDatabase } from '../utils/farmMapper';

const API_BASE = '/api';

interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { offset?: number; limit?: number; hasMore?: boolean };
}

interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiSuccess<T> | ApiError> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
    signal: options?.signal,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok && json && typeof json === 'object' && 'error' in json) {
    return json as ApiError;
  }
  if (!res.ok) {
    return { ok: false, error: (json as { error?: string })?.error || `HTTP ${res.status}` };
  }
  return json as ApiSuccess<T>;
}

/** Busca uma fazenda pelo ID. */
export async function getFarmById(farmId: string, signal?: AbortSignal): Promise<Farm | null> {
  const res = await fetchApi<unknown>(`${API_BASE}/farms?id=${encodeURIComponent(farmId)}`, { signal });
  if (!res.ok) return null;
  return mapFarmFromDatabase(res.data as Parameters<typeof mapFarmFromDatabase>[0]);
}

/** Lista fazendas de uma organização. */
export async function listFarms(options: {
  organizationId: string;
  search?: string;
  offset?: number;
  limit?: number;
  includeInactive?: boolean;
  signal?: AbortSignal;
}): Promise<{ data: Farm[]; hasMore: boolean }> {
  const params = new URLSearchParams({ organizationId: options.organizationId });
  if (options.search) params.set('search', options.search);
  if (options.offset != null) params.set('offset', String(options.offset));
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.includeInactive) params.set('includeInactive', 'true');

  const res = await fetchApi<unknown[]>(`${API_BASE}/farms?${params.toString()}`, { signal: options.signal });
  if (!res.ok) throw new Error(res.error);
  const data = mapFarmsFromDatabase((res.data || []) as Parameters<typeof mapFarmsFromDatabase>[0]);
  return { data, hasMore: res.meta?.hasMore ?? false };
}

/** Cria uma nova fazenda. */
export async function createFarm(data: Partial<Farm> & { organizationId: string; name: string; city: string }): Promise<Farm> {
  const res = await fetchApi<unknown>(`${API_BASE}/farms`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return mapFarmFromDatabase(res.data as Parameters<typeof mapFarmFromDatabase>[0]);
}

/** Atualiza uma fazenda existente. */
export async function updateFarm(farmId: string, data: Partial<Farm>): Promise<Farm> {
  const res = await fetchApi<unknown>(`${API_BASE}/farms`, {
    method: 'PATCH',
    body: JSON.stringify({ id: farmId, ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return mapFarmFromDatabase(res.data as Parameters<typeof mapFarmFromDatabase>[0]);
}

/** Desativa uma fazenda (soft delete: ativo = false). */
export async function deactivateFarm(farmId: string): Promise<void> {
  const res = await fetchApi<unknown>(`${API_BASE}/farms?id=${encodeURIComponent(farmId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((res as ApiError).error);
}
