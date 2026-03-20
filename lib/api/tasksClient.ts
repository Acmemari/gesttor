/**
 * Cliente HTTP para API de tarefas (initiative_tasks). Inclui kanban.
 */
import { fetchWithAuth, type ApiSuccess, type ApiError } from './fetchWithAuth';

const API_BASE = '/api';

const fetchApi = fetchWithAuth as <T>(url: string, options?: RequestInit) => Promise<ApiSuccess<T> | ApiError>;

export type KanbanStatus = 'A Fazer' | 'Andamento' | 'Pausado' | 'Concluído';

export interface TaskRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  sort_order: number;
  responsible_person_id: string | null;
  kanban_status: KanbanStatus;
  kanban_order: number;
  activity_date: string | null;
  duration_days: number | null;
  weight: string;
  created_at: string;
  updated_at: string;
}

export interface TaskPayload {
  milestone_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  sort_order?: number;
  responsible_person_id?: string | null;
  kanban_status?: KanbanStatus;
  kanban_order?: number;
  activity_date?: string | null;
  duration_days?: number | null;
  weight?: string | number;
}

export async function listTasksByMilestone(milestoneId: string) {
  return fetchApi<TaskRow[]>(`${API_BASE}/tasks?milestoneId=${encodeURIComponent(milestoneId)}`);
}

export async function listTasksByInitiative(initiativeId: string) {
  return fetchApi<TaskRow[]>(`${API_BASE}/tasks?initiativeId=${encodeURIComponent(initiativeId)}`);
}

export async function createTask(payload: TaskPayload) {
  return fetchApi<TaskRow>(`${API_BASE}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTask(id: string, payload: Partial<Omit<TaskPayload, 'milestone_id'>>) {
  return fetchApi<TaskRow>(`${API_BASE}/tasks?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Atualização otimizada para drag-and-drop no kanban.
 */
export async function updateTaskKanban(id: string, kanbanStatus: KanbanStatus, kanbanOrder: number) {
  return fetchApi<TaskRow>(`${API_BASE}/tasks?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'kanban', kanban_status: kanbanStatus, kanban_order: kanbanOrder }),
  });
}

export async function deleteTask(id: string) {
  return fetchApi<{ deleted: boolean }>(`${API_BASE}/tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
