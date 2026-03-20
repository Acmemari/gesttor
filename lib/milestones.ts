/**
 * Lib cliente de marcos (initiative_milestones).
 */
import * as milestonesApi from './api/milestonesClient';

export type { MilestoneRow, MilestonePayload } from './api/milestonesClient';

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }, fallback: string): T {
  if (!result.ok) throw new Error((result as { ok: false; error: string }).error || fallback);
  return (result as { ok: true; data: T }).data;
}

export async function fetchMilestones(initiativeId: string) {
  if (!initiativeId?.trim()) throw new Error('ID da iniciativa é obrigatório.');
  return unwrap(await milestonesApi.listMilestones(initiativeId), 'Erro ao carregar marcos.');
}

export async function createMilestone(payload: milestonesApi.MilestonePayload) {
  if (!payload.title?.trim()) throw new Error('Título do marco é obrigatório.');
  if (!payload.initiative_id?.trim()) throw new Error('initiative_id é obrigatório.');
  return unwrap(await milestonesApi.createMilestone(payload), 'Erro ao criar marco.');
}

export async function updateMilestone(
  id: string,
  payload: Partial<Omit<milestonesApi.MilestonePayload, 'initiative_id'> & { percent?: number }>,
) {
  if (!id?.trim()) throw new Error('ID do marco é obrigatório.');
  return unwrap(await milestonesApi.updateMilestone(id, payload), 'Erro ao atualizar marco.');
}

export async function completeMilestone(id: string) {
  if (!id?.trim()) throw new Error('ID do marco é obrigatório.');
  return unwrap(await milestonesApi.completeMilestone(id), 'Erro ao completar marco.');
}

export async function deleteMilestone(id: string) {
  if (!id?.trim()) throw new Error('ID do marco é obrigatório.');
  unwrap(await milestonesApi.deleteMilestone(id), 'Erro ao excluir marco.');
}
