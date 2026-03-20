/**
 * API de entregas. GET list, POST create, PATCH update, DELETE.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertProjectAccess, assertDeliveryAccess } from './_lib/orgAccess.js';
import {
  listDeliveriesByProject,
  createDelivery,
  updateDelivery,
  deleteDelivery,
  getNextDeliverySortOrder,
} from '../src/DB/repositories/deliveries.js';

function sanitize(val: string): string {
  return String(val ?? '').trim();
}

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
      const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : null;
      if (!projectId) {
        jsonError(res, 'projectId é obrigatório', { status: 400 });
        return;
      }
      await assertProjectAccess(projectId, userId, role);
      const rows = await listDeliveriesByProject(projectId);
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;
      const name = sanitize(String(body?.name ?? ''));
      const projectId = String(body?.project_id ?? '').trim();
      if (!name) { jsonError(res, 'Nome é obrigatório', { status: 400 }); return; }
      if (!projectId) { jsonError(res, 'project_id é obrigatório', { status: 400 }); return; }

      await assertProjectAccess(projectId, userId, role);

      const sortOrder = await getNextDeliverySortOrder(projectId);
      const row = await createDelivery({
        created_by: userId,
        project_id: projectId,
        organization_id: body?.organization_id ? String(body.organization_id) : null,
        name,
        description: body?.description ? sanitize(String(body.description)) : null,
        transformations_achievements: body?.transformations_achievements ? sanitize(String(body.transformations_achievements)) : null,
        stakeholder_matrix: Array.isArray(body?.stakeholder_matrix) ? body.stakeholder_matrix : [],
        due_date: body?.due_date ? String(body.due_date) : null,
        start_date: body?.start_date ? String(body.start_date) : null,
        end_date: body?.end_date ? String(body.end_date) : null,
        sort_order: sortOrder,
      });
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertDeliveryAccess(id, userId, role);

      const body = (req.body || {}) as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      if (body?.name !== undefined) payload.name = sanitize(String(body.name));
      if (body?.description !== undefined) payload.description = body.description ? sanitize(String(body.description)) : null;
      if (body?.transformations_achievements !== undefined) payload.transformations_achievements = body.transformations_achievements ? sanitize(String(body.transformations_achievements)) : null;
      if (body?.stakeholder_matrix !== undefined) payload.stakeholder_matrix = Array.isArray(body.stakeholder_matrix) ? body.stakeholder_matrix : [];
      if (body?.due_date !== undefined) payload.due_date = body.due_date ? String(body.due_date) : null;
      if (body?.start_date !== undefined) payload.start_date = body.start_date ? String(body.start_date) : null;
      if (body?.end_date !== undefined) payload.end_date = body.end_date ? String(body.end_date) : null;
      if (body?.organization_id !== undefined) payload.organization_id = body.organization_id || null;
      if (body?.sort_order !== undefined) payload.sort_order = Number(body.sort_order);

      const row = await updateDelivery(id, payload);
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertDeliveryAccess(id, userId, role);
      await deleteDelivery(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    jsonError(res, e.message ?? 'Erro interno', { status: e.status ?? 500, code: e.code });
  }
}
