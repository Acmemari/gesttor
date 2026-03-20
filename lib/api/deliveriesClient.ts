/**
 * Cliente HTTP para API de entregas.
 */
import { fetchWithAuth, type ApiSuccess, type ApiError } from './fetchWithAuth';

const API_BASE = '/api';

const fetchApi = fetchWithAuth as <T>(url: string, options?: RequestInit) => Promise<ApiSuccess<T> | ApiError>;

export interface DeliveryRow {
  id: string;
  created_by: string;
  project_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  transformations_achievements: string | null;
  stakeholder_matrix: unknown[];
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  percent: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryPayload {
  project_id: string;
  name: string;
  description?: string | null;
  organization_id?: string | null;
  transformations_achievements?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  stakeholder_matrix?: unknown[];
  sort_order?: number;
}

export async function listDeliveries(projectId: string) {
  return fetchApi<DeliveryRow[]>(`${API_BASE}/deliveries?projectId=${encodeURIComponent(projectId)}`);
}

export async function createDelivery(payload: DeliveryPayload) {
  return fetchApi<DeliveryRow>(`${API_BASE}/deliveries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDelivery(id: string, payload: Partial<DeliveryPayload>) {
  return fetchApi<DeliveryRow>(`${API_BASE}/deliveries?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDelivery(id: string) {
  return fetchApi<{ deleted: boolean }>(`${API_BASE}/deliveries?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
