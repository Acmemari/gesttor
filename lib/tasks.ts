/**
 * Lib cliente de tarefas (initiative_tasks). Inclui operações kanban.
 */
import * as tasksApi from './api/tasksClient';

export type { TaskRow, TaskPayload, KanbanStatus } from './api/tasksClient';

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }, fallback: string): T {
  if (!result.ok) throw new Error((result as { ok: false; error: string }).error || fallback);
  return (result as { ok: true; data: T }).data;
}

export async function fetchTasksByMilestone(milestoneId: string) {
  if (!milestoneId?.trim()) throw new Error('ID do marco é obrigatório.');
  return unwrap(await tasksApi.listTasksByMilestone(milestoneId), 'Erro ao carregar tarefas.');
}

export async function fetchTasksByInitiative(initiativeId: string) {
  if (!initiativeId?.trim()) throw new Error('ID da iniciativa é obrigatório.');
  return unwrap(await tasksApi.listTasksByInitiative(initiativeId), 'Erro ao carregar tarefas.');
}

export async function createTask(payload: tasksApi.TaskPayload) {
  if (!payload.title?.trim()) throw new Error('Título da tarefa é obrigatório.');
  if (!payload.milestone_id?.trim()) throw new Error('milestone_id é obrigatório.');
  return unwrap(await tasksApi.createTask(payload), 'Erro ao criar tarefa.');
}

export async function updateTask(id: string, payload: Partial<Omit<tasksApi.TaskPayload, 'milestone_id'>>) {
  if (!id?.trim()) throw new Error('ID da tarefa é obrigatório.');
  return unwrap(await tasksApi.updateTask(id, payload), 'Erro ao atualizar tarefa.');
}

/**
 * Atualização otimizada para drag-and-drop no kanban.
 */
export async function updateTaskKanban(id: string, kanbanStatus: tasksApi.KanbanStatus, kanbanOrder: number) {
  if (!id?.trim()) throw new Error('ID da tarefa é obrigatório.');
  return unwrap(await tasksApi.updateTaskKanban(id, kanbanStatus, kanbanOrder), 'Erro ao mover tarefa.');
}

export async function deleteTask(id: string) {
  if (!id?.trim()) throw new Error('ID da tarefa é obrigatório.');
  unwrap(await tasksApi.deleteTask(id), 'Erro ao excluir tarefa.');
}
