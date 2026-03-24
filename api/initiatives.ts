/**
 * API de iniciativas. GET list, POST create, PATCH update, DELETE.
 * Também gerencia equipe via /api/initiatives/team.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertDeliveryAccess, assertInitiativeAccess } from './_lib/orgAccess.js';
import {
  listInitiativesByDelivery,
  listInitiativesByOrg,
  getInitiativeById,
  createInitiative,
  createInitiativeWithTeamAndMilestones,
  updateInitiative,
  deleteInitiative,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  getNextInitiativeSortOrder,
  listParticipants,
  replaceParticipants,
} from '../src/DB/repositories/initiatives.js';
import { listMilestonesByInitiative } from '../src/DB/repositories/milestones.js';
import { listTasksByMilestone } from '../src/DB/repositories/tasks.js';

function sanitize(val: string): string {
  return String(val ?? '').trim();
}

function serializeInitiative(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    delivery_id: row.deliveryId ?? row.delivery_id,
    organization_id: row.organizationId ?? row.organization_id,
    farm_id: row.farmId ?? row.farm_id,
    created_by: row.createdBy ?? row.created_by,
    internal_leader: row.internalLeader ?? row.internal_leader,
    leader: row.leader,
    start_date: row.startDate ?? row.start_date,
    end_date: row.endDate ?? row.end_date,
    status: row.status,
    weight: row.weight,
    percent: row.percent,
    sort_order: row.sortOrder ?? row.sort_order,
    tags: Array.isArray(row.tags) ? (row.tags as string[]).join(' ') || null : (row.tags as string | null),
    created_at: row.createdAt ?? row.created_at,
    updated_at: row.updatedAt ?? row.updated_at,
  };
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

    // Sub-rotas: /api/initiatives/team e /api/initiatives/participants
    const subpath = typeof req.query?.subpath === 'string' ? req.query.subpath : '';
    if (subpath === 'team') {
      return handleTeam(req, res, userId, role);
    }
    if (subpath === 'participants') {
      return handleParticipants(req, res, userId, role);
    }

    if (req.method === 'GET') {
      const id = typeof req.query?.id === 'string' ? req.query.id : null;
      const deliveryId = typeof req.query?.deliveryId === 'string' ? req.query.deliveryId : null;
      const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId : null;
      const withTree = req.query?.withTree === 'true';

      if (id) {
        const row = await getInitiativeById(id);
        if (!row) { jsonError(res, 'Iniciativa não encontrada', { code: 'NOT_FOUND', status: 404 }); return; }
        jsonSuccess(res, serializeInitiative(row as Record<string, unknown>));
        return;
      }

      if (deliveryId) {
        await assertDeliveryAccess(deliveryId, userId, role);
        const rows = await listInitiativesByDelivery(deliveryId);
        if (!withTree) { jsonSuccess(res, rows.map(r => serializeInitiative(r as unknown as Record<string, unknown>))); return; }

        // withTree=true: incluir milestones e tasks para cada iniciativa (em paralelo)
        const withMilestones = await Promise.all(
          rows.map(async (initiative) => {
            const milestones = await listMilestonesByInitiative(initiative.id);
            const milestonesWithTasks = await Promise.all(
              milestones.map(async (m) => {
                const tasks = await listTasksByMilestone(m.id);
                return { ...m, tasks };
              }),
            );
            const allTasks = milestonesWithTasks.flatMap(m => m.tasks);
            const totalTasks = allTasks.length;
            const completedTasks = allTasks.filter(t => t.completed).length;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            return { ...serializeInitiative(initiative as unknown as Record<string, unknown>), milestones: milestonesWithTasks, progress };
          }),
        );
        jsonSuccess(res, withMilestones);
        return;
      }

      if (orgId) {
        const rows = await listInitiativesByOrg(orgId);
        jsonSuccess(res, rows.map(r => serializeInitiative(r as unknown as Record<string, unknown>)));
        return;
      }
      jsonError(res, 'deliveryId ou orgId é obrigatório', { status: 400 });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;
      const name = sanitize(String(body?.name ?? ''));
      const deliveryId = String(body?.delivery_id ?? '').trim();
      if (!name) { jsonError(res, 'Nome é obrigatório', { status: 400 }); return; }
      if (!deliveryId) { jsonError(res, 'delivery_id é obrigatório', { status: 400 }); return; }

      await assertDeliveryAccess(deliveryId, userId, role);

      const sortOrder = await getNextInitiativeSortOrder(deliveryId);
      const basePayload = {
        created_by: userId,
        delivery_id: deliveryId,
        organization_id: body?.organization_id ? String(body.organization_id) : null,
        farm_id: body?.farm_id ? String(body.farm_id) : null,
        name,
        tags: body?.tags !== undefined ? body.tags : null,
        description: body?.description ? sanitize(String(body.description)) : null,
        start_date: body?.start_date ? String(body.start_date) : null,
        end_date: body?.end_date ? String(body.end_date) : null,
        leader: body?.leader ? sanitize(String(body.leader)) : null,
        internal_leader: body?.internal_leader ? sanitize(String(body.internal_leader)) : null,
        weight: body?.weight !== undefined ? String(body.weight) : '1',
        status: body?.status ? String(body.status) : undefined,
        sort_order: sortOrder,
      };

      const teamPayload = Array.isArray(body?.team)
        ? (body.team as { name?: string; role?: string; pessoa_id?: string }[])
            .filter(m => m?.name?.trim())
            .map(m => ({ name: String(m.name), role: m.role, pessoaId: m.pessoa_id ?? null }))
        : [];
      const milestonesPayload = Array.isArray(body?.milestones)
        ? (body.milestones as { title?: string; due_date?: string }[])
            .filter(m => m?.title?.trim())
            .map(m => ({ title: String(m.title), due_date: m.due_date ?? null }))
        : [];

      // Usa transação quando há team ou milestones para garantir atomicidade
      const row = (teamPayload.length > 0 || milestonesPayload.length > 0)
        ? await createInitiativeWithTeamAndMilestones(basePayload, teamPayload, milestonesPayload)
        : await createInitiative(basePayload);

      jsonSuccess(res, serializeInitiative(row as unknown as Record<string, unknown>));
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertInitiativeAccess(id, userId, role);

      const body = (req.body || {}) as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      if (body?.name !== undefined) payload.name = sanitize(String(body.name));
      if (body?.tags !== undefined) payload.tags = body.tags ?? null;
      if (body?.description !== undefined) payload.description = body.description ? sanitize(String(body.description)) : null;
      if (body?.start_date !== undefined) payload.start_date = body.start_date ? String(body.start_date) : null;
      if (body?.end_date !== undefined) payload.end_date = body.end_date ? String(body.end_date) : null;
      if (body?.leader !== undefined) payload.leader = body.leader ? sanitize(String(body.leader)) : null;
      if (body?.internal_leader !== undefined) payload.internal_leader = body.internal_leader ? sanitize(String(body.internal_leader)) : null;
      if (body?.weight !== undefined) payload.weight = String(body.weight);
      if (body?.farm_id !== undefined) payload.farm_id = body.farm_id || null;
      if (body?.organization_id !== undefined) payload.organization_id = body.organization_id || null;
      if (body?.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
      if (body?.status !== undefined) payload.status = String(body.status);

      const row = await updateInitiative(id, payload);
      jsonSuccess(res, serializeInitiative(row as unknown as Record<string, unknown>));
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
      if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }

      await assertInitiativeAccess(id, userId, role);
      await deleteInitiative(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string; cause?: unknown };
    const cause = e.cause as { message?: string } | undefined;
    const message = cause?.message || e.message || 'Erro interno';
    jsonError(res, message, { status: e.status ?? 500, code: e.code });
  }
}

async function handleTeam(req: VercelRequest, res: VercelResponse, userId: string, role: string) {
  if (req.method === 'GET') {
    const initiativeId = typeof req.query?.initiativeId === 'string' ? req.query.initiativeId : null;
    if (!initiativeId) { jsonError(res, 'initiativeId é obrigatório', { status: 400 }); return; }
    await assertInitiativeAccess(initiativeId, userId, role);
    const rows = await listTeamMembers(initiativeId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const initiativeId = String(body?.initiative_id ?? '').trim();
    const name = String(body?.name ?? '').trim();
    if (!initiativeId) { jsonError(res, 'initiative_id é obrigatório', { status: 400 }); return; }
    if (!name) { jsonError(res, 'name é obrigatório', { status: 400 }); return; }
    await assertInitiativeAccess(initiativeId, userId, role);

    const row = await addTeamMember({
      initiative_id: initiativeId,
      name,
      role: body?.role ? String(body.role) : 'APOIO',
      person_id: body?.pessoa_id ? String(body.pessoa_id) : undefined,
    });
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    // Para DELETE precisamos do initiativeId para validar acesso
    const initiativeId = typeof req.query?.initiativeId === 'string' ? req.query.initiativeId : null;
    if (initiativeId) {
      await assertInitiativeAccess(initiativeId, userId, role);
    }
    await removeTeamMember(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}

async function handleParticipants(req: VercelRequest, res: VercelResponse, userId: string, role: string) {
  if (req.method === 'GET') {
    const initiativeId = typeof req.query?.initiativeId === 'string' ? req.query.initiativeId : null;
    if (!initiativeId) { jsonError(res, 'initiativeId é obrigatório', { status: 400 }); return; }
    await assertInitiativeAccess(initiativeId, userId, role);
    const personIds = await listParticipants(initiativeId);
    jsonSuccess(res, personIds);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const initiativeId = String(body?.initiativeId ?? '').trim();
    if (!initiativeId) { jsonError(res, 'initiativeId é obrigatório', { status: 400 }); return; }
    await assertInitiativeAccess(initiativeId, userId, role);
    const personIds = Array.isArray(body?.personIds) ? (body.personIds as string[]).filter(Boolean) : [];
    await replaceParticipants(initiativeId, personIds);
    jsonSuccess(res, { ok: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
