/**
 * API de hierarquia: analistas, clientes, fazendas.
 * GET ?level=analysts|clients|farms & offset, limit, search, analystId (opcional), clientId (para farms)
 * POST (validate) body: { analystId, clientId, farmId }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, exists, or } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { userProfiles, organizations, organizationAnalysts } from '../src/DB/schema.js';
import {
  getAnalystsForAdmin,
  getOrganizations,
  getFarms,
  validateHierarchy,
  type AnalystRow,
  type OrganizationRow,
  type FarmRow,
} from '../src/DB/repositories/hierarchy.js';
import { mapFarmsFromDatabase } from '../lib/utils/farmMapper.js';

function mapAnalystRow(r: AnalystRow) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: (r.role as 'admin' | 'client') || 'client',
    qualification: (r.qualification as 'visitante' | 'cliente' | 'analista') || 'visitante',
  };
}

function mapOrganizationRow(r: OrganizationRow) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    email: r.email,
    analystId: r.analystId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Deriva (role app-level, qualification) do role armazenado no Neon.
 * DB role: 'administrador' | 'analista' | 'cliente' | 'visitante'
 */
function deriveProfile(dbRole: string): { role: string; qualification: string } {
  switch ((dbRole ?? '').toLowerCase()) {
    case 'administrador':
      return { role: 'admin', qualification: 'analista' };
    case 'analista':
      return { role: 'client', qualification: 'analista' };
    case 'cliente':
      return { role: 'client', qualification: 'cliente' };
    default:
      return { role: 'client', qualification: 'visitante' };
  }
}

async function loadUserProfile(userId: string): Promise<{
  role: string;
  qualification: string;
  clientId: string | null;
} | null> {
  const [p] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  if (!p) return null;
  const derived = deriveProfile(p.role ?? 'visitante');

  let clientId: string | null = null;
  if ((p.role ?? '') === 'cliente') {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);
    clientId = org?.id ?? null;
  }

  return {
    role: derived.role,
    qualification: derived.qualification,
    clientId,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as { analystId?: string | null; clientId?: string | null; farmId?: string | null } | undefined;
    const analystId = body?.analystId ?? null;
    const clientId = body?.clientId ?? null;
    const farmId = body?.farmId ?? null;

    // Carrega perfil para verificar autorização dos IDs enviados
    const postProfile = await loadUserProfile(userId);
    if (!postProfile) {
      jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
      return;
    }

    if (postProfile.qualification === 'cliente') {
      if (clientId && postProfile.clientId && clientId !== postProfile.clientId) {
        jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
        return;
      }
    } else if (postProfile.qualification === 'analista' && postProfile.role !== 'admin') {
      if (clientId) {
        const [org] = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(and(
            eq(organizations.id, clientId),
            or(
              eq(organizations.analystId, userId),
              exists(
                db.select().from(organizationAnalysts)
                  .where(and(
                    eq(organizationAnalysts.organizationId, organizations.id),
                    eq(organizationAnalysts.analystId, userId),
                  ))
              ),
            ),
          ))
          .limit(1);
        if (!org) {
          jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
          return;
        }
      }
    }
    // admin: acesso irrestrito

    const result = await validateHierarchy({ analystId, clientId, farmId });
    jsonSuccess(res, result);
    return;
  }

  if (req.method !== 'GET') {
    jsonError(res, 'Método não permitido', { status: 405 });
    return;
  }

  const level = typeof req.query?.level === 'string' ? req.query.level : '';
  if (!['analysts', 'clients', 'farms'].includes(level)) {
    jsonError(res, 'Parâmetro level inválido (analysts|clients|farms)', { status: 400 });
    return;
  }

  const profile = await loadUserProfile(userId);
  if (!profile) {
    jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
    return;
  }

  const offset = Math.max(0, Number(req.query?.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
  const search = (typeof req.query?.search === 'string' ? req.query.search : '').trim() || null;
  const analystIdParam = typeof req.query?.analystId === 'string' ? req.query.analystId : null;
  const clientIdParam = typeof req.query?.clientId === 'string' ? req.query.clientId : null;

  if (level === 'analysts') {
    if (profile.role !== 'admin') {
      jsonError(res, 'Apenas admin pode listar analistas', { code: 'FORBIDDEN', status: 403 });
      return;
    }
    const { rows, hasMore } = await getAnalystsForAdmin(userId, { offset, limit, search });
    const data = rows.map(mapAnalystRow);
    jsonSuccess(res, data, { offset, limit, hasMore });
    return;
  }

  if (level === 'clients') {
    const isClientUser = profile.qualification === 'cliente' || !!profile.clientId;
    let analystId: string | null = null;
    let organizationId: string | null = null;
    if (isClientUser && profile.clientId) {
      organizationId = profile.clientId;
    } else if (profile.role === 'admin' && analystIdParam) {
      analystId = analystIdParam;
    } else if (profile.qualification === 'analista') {
      analystId = userId;
    }
    const { rows, hasMore } = await getOrganizations({ analystId, organizationId, offset, limit, search });
    const data = rows.map(mapOrganizationRow);
    jsonSuccess(res, data, { offset, limit, hasMore });
    return;
  }

  // level === 'farms'
  const clientIdForFarms = clientIdParam;
  if (!clientIdForFarms) {
    jsonError(res, 'clientId obrigatório para listar fazendas', { status: 400 });
    return;
  }

  // Verifica que o usuário tem acesso à organização solicitada
  if (profile.qualification === 'cliente') {
    if (!profile.clientId || clientIdForFarms !== profile.clientId) {
      jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
      return;
    }
  } else if (profile.qualification === 'analista' && profile.role !== 'admin') {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(
        eq(organizations.id, clientIdForFarms),
        or(
          eq(organizations.analystId, userId),
          exists(
            db.select().from(organizationAnalysts)
              .where(and(
                eq(organizationAnalysts.organizationId, organizations.id),
                eq(organizationAnalysts.analystId, userId),
              ))
          ),
        ),
      ))
      .limit(1);
    if (!org) {
      jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
      return;
    }
  }
  // admin: acesso irrestrito

  const includeInactive = req.query?.includeInactive === 'true';
  const { rows, hasMore } = await getFarms(clientIdForFarms, { offset, limit, search, includeInactive });
  const data = mapFarmsFromDatabase(rows as Parameters<typeof mapFarmsFromDatabase>[0]);
  jsonSuccess(res, data, { offset, limit, hasMore });
}
