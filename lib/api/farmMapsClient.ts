/**
 * Client HTTP for farm maps API (/api/farm-maps).
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

interface FarmMapData {
  id: string;
  farm_id: string;
  uploaded_by: string;
  file_name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  geojson: unknown;
  created_at: string | null;
  updated_at: string | null;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = await res.json();
  if (!res.ok) {
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  }
  return { ok: true, data: json.data };
}

export async function listFarmMaps(farmId: string): Promise<FarmMapData[]> {
  const res = await fetchApi<FarmMapData[]>(
    `${API_BASE}/farm-maps?farmId=${encodeURIComponent(farmId)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data || [];
}

export async function createFarmMap(data: {
  farmId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  geojson?: unknown;
}): Promise<FarmMapData> {
  const res = await fetchApi<FarmMapData>(`${API_BASE}/farm-maps`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function deleteFarmMapApi(id: string): Promise<{ storagePath: string }> {
  const res = await fetchApi<{ deleted: boolean; storagePath: string }>(
    `${API_BASE}/farm-maps?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(res.error);
  return { storagePath: res.data!.storagePath };
}

export type { FarmMapData };
