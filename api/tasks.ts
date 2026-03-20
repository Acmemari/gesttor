/**
 * API de tarefas de marcos (initiative_tasks). Suporta kanban.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertMilestoneAccess, assertTaskAccess } from './_lib/orgAccess.js';
import {
  listTasksByMilestone,
  listTasksByInitiative,
  createTask,
  updateTask,
  updateTaskKanban,
  deleteTask,
} from '../src/DB/repositories/tasks.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  try {
    const role = await getUserRole(userId);

    if (req.method === 'GET') {
      const milestoneId = typeof req.query?.milestoneId === 'string' ? req.query.milestoneId : null;
      const initiativeId = typeof req.query?.initiativeId === 'string' ? req.query.initiativeId : null;

      if (milestoneId) {
        await assertMilestoneAccess(milestoneId, userId, role);
        const rows = await listTasksByMilestone(milestoneId);
        jsonSuccess(res, rows);
        return;
      }
      if (initiativeId) {
        const rows = await listTasksByInitiative(initiativeId);
        jsonSuccess(res, rows);
        return;
      }
      jsonError(res, 'milestoneId ou initiativeId é obrigatório', { status: 400 });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;
      const title = String(body?.title ?? '').trim();
      const milestoneId = String(body?.milestone_id ?? '').trim();
      if (!title) { jsonError(res, 'title é obrigatório', { status: 400 }); return; }
      if (!milestoneId) { jsonError(res, 'milestone_id é obrigatório', { status: 400 }); return; }

      await assertMilestoneAccess(milestoneId, userId, role);

      const row = await createTask({
        milestone_id: milestoneId,
        title,
        description: body?.description ? String(body.description).trim() : null,
        due_date: body?.due_date ? String(body.due_date) : null,
        sort_order: body?.sort_order !== undefined ? Number(body.sort_order) : undefined,
        responsible_person_id: body?.responsible_person_id ? String(body.responsible_person_id) : null,
        kanban_status: body?.kanban_status ? String(body.kanban_status) : 'A Fazer',
        kanban_order: body?.kanban_order !== undefined ? Number(body.kanban_order) : 0,
        activity_date: body?.activity_date ? String(body.activity_date) : null,
        duration_days: body?.duration_days !== undefined ? Number(body.duration_days) : null,
        weight: body?.weight !== undefined ? String(body.weight) : '1',
      });
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertTaskAccess(id, userId, role);

      const body = (req.body || {}) as Record<string, unknown>;

      // Atualização rápida kanban (drag-and-drop)
      if (body?.action === 'kanban') {
        const kanbanStatus = String(body?.kanban_status ?? 'A Fazer');
        const kanbanOrder = Number(body?.kanban_order ?? 0);
        const row = await updateTaskKanban(id, kanbanStatus, kanbanOrder);
        jsonSuccess(res, row);
        return;
      }

      const payload: Record<string, unknown> = {};
      if (body?.title !== undefined) payload.title = String(body.title).trim();
      if (body?.description !== undefined) payload.description = body.description ? String(body.description).trim() : null;
      if (body?.due_date !== undefined) payload.due_date = body.due_date ? String(body.due_date) : null;
      if (body?.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
      if (body?.responsible_person_id !== undefined) payload.responsible_person_id = body.responsible_person_id || null;
      if (body?.kanban_status !== undefined) payload.kanban_status = String(body.kanban_status);
      if (body?.kanban_order !== undefined) payload.kanban_order = Number(body.kanban_order);
      if (body?.activity_date !== undefined) payload.activity_date = body.activity_date ? String(body.activity_date) : null;
      if (body?.duration_days !== undefined) payload.duration_days = body.duration_days !== null ? Number(body.duration_days) : null;
      if (body?.weight !== undefined) payload.weight = String(body.weight);

      const row = await updateTask(id, payload);
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertTaskAccess(id, userId, role);
      await deleteTask(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    jsonError(res, e.message ?? 'Erro interno', { status: e.status ?? 500, code: e.code });
  }
}
