/**
 * Cliente HTTP para API de marcos (initiative_milestones).
 */
import { fetchWithAuth, type ApiSuccess, type ApiError } from './fetchWithAuth';

const API_BASE = '/api';

const fetchApi = fetchWithAuth as <T>(url: string, options?: RequestInit) => Promise<ApiSuccess<T> | ApiError>;

export interface MilestoneRow {
  id: string;
  initiative_id: string;
  title: string;
  percent: number;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MilestonePayload {
  initiative_id: string;
  title: string;
  due_date?: string | null;
  sort_order?: number;
}

export async function listMilestones(initiativeId: string) {
  return fetchApi<MilestoneRow[]>(`${API_BASE}/milestones?initiativeId=${encodeURIComponent(initiativeId)}`);
}

export async function createMilestone(payload: MilestonePayload) {
  return fetchApi<MilestoneRow>(`${API_BASE}/milestones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMilestone(id: string, payload: Partial<Omit<MilestonePayload, 'initiative_id'> & { percent?: number }>) {
  return fetchApi<MilestoneRow>(`${API_BASE}/milestones?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function completeMilestone(id: string) {
  return fetchApi<MilestoneRow>(`${API_BASE}/milestones?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'complete' }),
  });
}

export async function deleteMilestone(id: string) {
  return fetchApi<{ deleted: boolean }>(`${API_BASE}/milestones?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
