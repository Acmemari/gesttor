/**
 * API de projetos. GET list, POST create, PATCH update, DELETE.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { assertOrgAccess } from './_lib/orgAccess.js';
import { eq } from 'drizzle-orm';
import { db } from '../src/DB/index.js';
import { userProfiles, projects as projectsTable } from '../src/DB/schema.js';
import {
  fetchProjectsByCreatedBy,
  fetchProjectsForOrganization,
  createProject,
  updateProject,
  deleteProject,
  getNextSortOrder,
} from '../src/DB/repositories/projects.js';

const MAX_NAME_LENGTH = 300;
const MAX_STAKEHOLDER_ROWS = 50;
const MAX_TRANSFORMATIONS_LENGTH = 10000;
const VALID_PROGRAM_TYPES = ['assessoria', 'fazenda'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(val: string): string {
  return String(val ?? '').trim();
}

function isValidISODate(s: string): boolean {
  return ISO_DATE_RE.test(s) && !isNaN(new Date(s).getTime());
}

/** Converte row do Drizzle (camelCase) para formato snake_case esperado pelo frontend. */
function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    created_by: r.createdBy ?? r.created_by ?? null,
    organization_id: r.organizationId ?? r.organization_id ?? null,
    name: r.name,
    description: r.description ?? null,
    transformations_achievements: r.transformationsAchievements ?? r.transformations_achievements ?? null,
    success_evidence: r.successEvidence ?? r.success_evidence ?? [],
    start_date: r.startDate ?? r.start_date ?? null,
    end_date: r.endDate ?? r.end_date ?? null,
    stakeholder_matrix: r.stakeholderMatrix ?? r.stakeholder_matrix ?? [],
    program_type: r.programType ?? r.program_type ?? 'assessoria',
    sort_order: r.sortOrder ?? r.sort_order ?? 0,
    percent: r.percent ?? 0,
    created_at: r.createdAt ?? r.created_at ?? null,
    updated_at: r.updatedAt ?? r.updated_at ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  const [profile] = await db
    .select({ role: userProfiles.role, organizationId: userProfiles.organizationId })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) {
    jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
    return;
  }

  // No Neon, role='cliente' identifica usuários do tipo cliente
  const isClientRole = (profile.role ?? '') === 'cliente';
  const isAdmin = (profile.role ?? '') === 'administrador' || (profile.role ?? '') === 'admin';

  if (req.method === 'GET') {
    const clientMode = req.query?.clientMode === 'true';
    const organizationId = (typeof req.query?.organizationId === 'string' ? req.query.organizationId : undefined) || (typeof req.query?.clientId === 'string' ? req.query.clientId : undefined);
    const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;

    if (clientMode && organizationId && isClientRole) {
      // Verificar que o cliente pertence à organização solicitada
      if (profile.organizationId !== organizationId) {
        jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const rows = await fetchProjectsForOrganization(organizationId, { offset: 0, limit: 100 });
      jsonSuccess(res, rows.map(mapRow));
      return;
    }

    if (organizationId) {
      if (!isAdmin) {
        if (isClientRole) {
          // Cliente só pode acessar sua própria organização
          if (profile.organizationId !== organizationId) {
            jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
            return;
          }
        } else {
          await assertOrgAccess(organizationId, userId, profile.role ?? 'visitante');
        }
      }
      const rows = await fetchProjectsForOrganization(organizationId, { offset: 0, limit: 1000 });
      jsonSuccess(res, rows.map(mapRow));
      return;
    }

    const rows = await fetchProjectsByCreatedBy(userId, { organizationId });
    jsonSuccess(res, rows.map(mapRow));
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const name = sanitize(String(body?.name ?? ''));
    if (!name) {
      jsonError(res, 'Nome do projeto é obrigatório', { status: 400 });
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      jsonError(res, `Nome muito longo (máx ${MAX_NAME_LENGTH})`, { status: 400 });
      return;
    }

    const stakeholder = Array.isArray(body?.stakeholder_matrix)
      ? body.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
      : [];
    const successEvidence = Array.isArray(body?.success_evidence)
      ? body.success_evidence.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
      : [];

    // Validate program_type
    if (body?.program_type && !VALID_PROGRAM_TYPES.includes(String(body.program_type))) {
      jsonError(res, `program_type inválido. Use: ${VALID_PROGRAM_TYPES.join(', ')}`, { status: 400 });
      return;
    }

    // Validate dates
    if (body?.start_date && !isValidISODate(String(body.start_date))) {
      jsonError(res, 'start_date com formato inválido (esperado AAAA-MM-DD)', { status: 400 });
      return;
    }
    if (body?.end_date && !isValidISODate(String(body.end_date))) {
      jsonError(res, 'end_date com formato inválido (esperado AAAA-MM-DD)', { status: 400 });
      return;
    }
    if (body?.start_date && body?.end_date && String(body.start_date) > String(body.end_date)) {
      jsonError(res, 'Data de início não pode ser posterior à data final', { status: 400 });
      return;
    }

    if (body?.transformations_achievements && String(body.transformations_achievements).length > MAX_TRANSFORMATIONS_LENGTH) {
      jsonError(res, 'Descrição das transformações muito longa (máx 10.000 caracteres)', { status: 400 });
      return;
    }

    const organizationIdForProject = (body?.organization_id as string) || (body?.client_id as string) || null;
    if (organizationIdForProject && !isAdmin) {
      await assertOrgAccess(organizationIdForProject, userId, profile.role ?? 'visitante');
    }

    const nextOrder = await getNextSortOrder(userId, organizationIdForProject);
    const row = await createProject({
      created_by: userId,
      organization_id: organizationIdForProject,
      name,
      description: body?.description ? sanitize(String(body.description)) : null,
      transformations_achievements: body?.transformations_achievements
        ? sanitize(String(body.transformations_achievements))
        : null,
      success_evidence: successEvidence,
      start_date: body?.start_date ? String(body.start_date) : null,
      end_date: body?.end_date ? String(body.end_date) : null,
      sort_order: nextOrder,
      stakeholder_matrix: stakeholder,
      program_type: body?.program_type ? String(body.program_type) : 'assessoria',
    });
    jsonSuccess(res, mapRow(row));
    return;
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const projectId = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
    if (!projectId) {
      jsonError(res, 'ID do projeto é obrigatório', { status: 400 });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const stakeholder = Array.isArray(body?.stakeholder_matrix)
      ? body.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
      : undefined;
    const successEvidence = Array.isArray(body?.success_evidence)
      ? body.success_evidence.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
      : undefined;

    // Validate program_type
    if (body?.program_type !== undefined && body.program_type !== null &&
        !VALID_PROGRAM_TYPES.includes(String(body.program_type))) {
      jsonError(res, `program_type inválido. Use: ${VALID_PROGRAM_TYPES.join(', ')}`, { status: 400 });
      return;
    }

    // Validate dates
    if (body?.start_date && !isValidISODate(String(body.start_date))) {
      jsonError(res, 'start_date com formato inválido (esperado AAAA-MM-DD)', { status: 400 });
      return;
    }
    if (body?.end_date && !isValidISODate(String(body.end_date))) {
      jsonError(res, 'end_date com formato inválido (esperado AAAA-MM-DD)', { status: 400 });
      return;
    }
    if (body?.start_date && body?.end_date && String(body.start_date) > String(body.end_date)) {
      jsonError(res, 'Data de início não pode ser posterior à data final', { status: 400 });
      return;
    }

    if (body?.transformations_achievements !== undefined && body.transformations_achievements &&
        String(body.transformations_achievements).length > MAX_TRANSFORMATIONS_LENGTH) {
      jsonError(res, 'Descrição das transformações muito longa (máx 10.000 caracteres)', { status: 400 });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (body?.name !== undefined) {
      const name = sanitize(String(body.name));
      if (!name) {
        jsonError(res, 'Nome do projeto é obrigatório', { status: 400 });
        return;
      }
      if (name.length > MAX_NAME_LENGTH) {
        jsonError(res, `Nome muito longo (máx ${MAX_NAME_LENGTH})`, { status: 400 });
        return;
      }
      payload.name = name;
    }
    if (body?.description !== undefined) payload.description = body.description ? sanitize(String(body.description)) : null;
    if (body?.transformations_achievements !== undefined)
      payload.transformations_achievements = body.transformations_achievements ? sanitize(String(body.transformations_achievements)) : null;
    if (successEvidence !== undefined) payload.success_evidence = successEvidence;
    if (body?.start_date !== undefined) payload.start_date = body.start_date ? String(body.start_date) : null;
    if (body?.end_date !== undefined) payload.end_date = body.end_date ? String(body.end_date) : null;
    if (stakeholder !== undefined) payload.stakeholder_matrix = stakeholder;
    if (body?.organization_id !== undefined || body?.client_id !== undefined) {
      payload.organization_id = body.organization_id || body.client_id || null;
    }
    if (body?.sort_order !== undefined) payload.sort_order = Number(body.sort_order);
    if (body?.program_type !== undefined) payload.program_type = String(body.program_type);

    if (!isAdmin) {
      const [proj] = await db
        .select({ createdBy: projectsTable.createdBy, organizationId: projectsTable.organizationId })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      if (!proj) {
        jsonError(res, 'Projeto não encontrado', { status: 404 });
        return;
      }
      if (proj.organizationId) {
        try {
          await assertOrgAccess(proj.organizationId, userId, profile.role ?? 'visitante');
        } catch (e: unknown) {
          const err = e as { status?: number; code?: string; message?: string };
          jsonError(res, err.message ?? 'Acesso negado', { code: err.code ?? 'FORBIDDEN', status: err.status ?? 403 });
          return;
        }
      } else if (proj.createdBy !== userId) {
        jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
        return;
      }
    }

    const row = await updateProject(projectId, payload);
    jsonSuccess(res, mapRow(row));
    return;
  }

  if (req.method === 'DELETE') {
    const projectId = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
    if (!projectId) {
      jsonError(res, 'ID do projeto é obrigatório', { status: 400 });
      return;
    }

    if (!isAdmin) {
      const [proj] = await db
        .select({ createdBy: projectsTable.createdBy, organizationId: projectsTable.organizationId })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      if (!proj) {
        jsonError(res, 'Projeto não encontrado', { status: 404 });
        return;
      }
      if (proj.organizationId) {
        try {
          await assertOrgAccess(proj.organizationId, userId, profile.role ?? 'visitante');
        } catch (e: unknown) {
          const err = e as { status?: number; code?: string; message?: string };
          jsonError(res, err.message ?? 'Acesso negado', { code: err.code ?? 'FORBIDDEN', status: err.status ?? 403 });
          return;
        }
      } else if (proj.createdBy !== userId) {
        jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
        return;
      }
    }

    await deleteProject(projectId);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
