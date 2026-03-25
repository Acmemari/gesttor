/**
 * API de marcos de iniciativas (initiative_milestones).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertInitiativeAccess, assertMilestoneAccess } from './_lib/orgAccess.js';
import {
  listMilestonesByInitiative,
  createMilestone,
  updateMilestone,
  completeMilestone,
  deleteMilestone,
} from '../src/DB/repositories/milestones.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  try {
    const role = await getUserRole(userId);

    if (req.method === 'GET') {
      const initiativeId = typeof req.query?.initiativeId === 'string' ? req.query.initiativeId : null;
      if (!initiativeId) { jsonError(res, 'initiativeId é obrigatório', { status: 400 }); return; }
      await assertInitiativeAccess(initiativeId, userId, role);
      const rows = await listMilestonesByInitiative(initiativeId);
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;
      const title = String(body?.title ?? '').trim();
      const initiativeId = String(body?.initiative_id ?? '').trim();
      if (!title) { jsonError(res, 'title é obrigatório', { status: 400 }); return; }
      if (!initiativeId) { jsonError(res, 'initiative_id é obrigatório', { status: 400 }); return; }

      await assertInitiativeAccess(initiativeId, userId, role);

      const row = await createMilestone({
        initiative_id: initiativeId,
        title,
        due_date: body?.due_date ? String(body.due_date) : null,
        sort_order: body?.sort_order !== undefined ? Number(body.sort_order) : undefined,
      });
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertMilestoneAccess(id, userId, role);

      const body = (req.body || {}) as Record<string, unknown>;

      // Ação especial: completar marco
      if (body?.action === 'complete') {
        const row = await completeMilestone(id);
        jsonSuccess(res, row);
        return;
      }

      const payload: Record<string, unknown> = {};
      if (body?.title !== undefined) payload.title = String(body.title).trim();
      if (body?.due_date !== undefined) payload.due_date = body.due_date ? String(body.due_date) : null;
      if (body?.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
      if (body?.percent !== undefined) payload.percent = Number(body.percent);

      const row = await updateMilestone(id, payload);
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertMilestoneAccess(id, userId, role);
      await deleteMilestone(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    jsonError(res, e.message ?? 'Erro interno', { status: e.status ?? 500, code: e.code });
  }
}
