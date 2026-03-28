/**
 * Client HTTP for semana transcriptions API (/api/semana-transcricoes).
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

export interface SemanaTranscricaoRow {
  id: string;
  semanaId: string;
  semanaNumero: number | null;
  farmId: string;
  organizationId: string;
  uploadedBy: string | null;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  descricao: string | null;
  createdAt: string;
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
  if (!res.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
  return { ok: true, data: json.data };
}

export async function listTranscricoesByFarm(farmId: string): Promise<SemanaTranscricaoRow[]> {
  const res = await fetchApi<SemanaTranscricaoRow[]>(
    `${API_BASE}/semana-transcricoes?farmId=${encodeURIComponent(farmId)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data ?? [];
}

export interface CreateTranscricaoPayload {
  semanaId: string;
  farmId: string;
  organizationId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  descricao?: string | null;
}

export async function createTranscricao(payload: CreateTranscricaoPayload): Promise<SemanaTranscricaoRow> {
  const res = await fetchApi<SemanaTranscricaoRow>(`${API_BASE}/semana-transcricoes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function deleteTranscricaoApi(id: string): Promise<{ storagePath: string }> {
  const res = await fetchApi<{ deleted: boolean; storagePath: string }>(
    `${API_BASE}/semana-transcricoes?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(res.error);
  return { storagePath: res.data!.storagePath };
}
