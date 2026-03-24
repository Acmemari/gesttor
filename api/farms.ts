/**
 * API de fazendas (CRUD completo).
 *
 * GET  /api/farms?id=xxx                              → busca 1 fazenda
 * GET  /api/farms?organizationId=xxx                  → lista fazendas da org
 *   Params opcionais: search, offset, limit, includeInactive
 * POST /api/farms                                     → criar fazenda
 * PATCH /api/farms                                    → atualizar fazenda (body.id obrigatório)
 * DELETE /api/farms?id=xxx                            → soft delete (ativo=false)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { db } from '../src/DB/index.js';
import { userProfiles, organizations, organizationAnalysts, farms as farmsTable } from '../src/DB/schema.js';
import {
  getFarm,
  getFarms,
  createFarm,
  updateFarm,
  deactivateFarm,
  type CreateFarmInput,
  type UpdateFarmInput,
} from '../src/DB/repositories/hierarchy.js';
import { mapFarmFromDatabase, mapFarmsFromDatabase } from '../lib/utils/farmMapper.js';

/** Gera slug de exibição a partir do nome da fazenda e da organização. */
function generateFarmSlug(farmName: string, orgName: string): string {
  return `${orgName}-${farmName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function getUserRole(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return p?.role ?? null;
}

/** Verifica se analista tem acesso à organização (principal ou secundário). */
async function analystCanAccessOrg(analystId: string, orgId: string): Promise<boolean> {
  // Analista principal
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.analystId, analystId)))
    .limit(1);
  if (org) return true;

  // Analista secundário
  const [sec] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, orgId), eq(organizationAnalysts.analystId, analystId)))
    .limit(1);
  return !!sec;
}

/** Verifica se analista tem acesso à fazenda via organização. */
async function analystCanAccessFarm(analystId: string, farmId: string): Promise<boolean> {
  const farm = await getFarm(farmId);
  if (!farm?.organizationId) return false;
  return analystCanAccessOrg(analystId, farm.organizationId);
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

  const role = await getUserRole(userId);
  if (!role) {
    jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
    return;
  }

  const isAdmin = role === 'administrador';
  const isAnalyst = role === 'analista' || isAdmin;
  if (!isAnalyst) {
    jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
    return;
  }

  // ─── Rate limiting ──────────────────────────────────────────────────────────
  if (req.method !== 'GET') {
    const rl = await checkCrudRateLimit({ userId });
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)));
      jsonError(res, 'Muitas requisições. Tente novamente em instantes.', { status: 429 });
      return;
    }
  }

  // ─── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    const orgIdParam = typeof req.query?.organizationId === 'string' ? req.query.organizationId : null;

    // GET por ID
    if (idParam) {
      if (!isAdmin && !(await analystCanAccessFarm(userId, idParam))) {
        jsonError(res, 'Acesso negado a esta fazenda', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const row = await getFarm(idParam);
      if (!row) {
        jsonError(res, 'Fazenda não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      jsonSuccess(res, mapFarmFromDatabase(row));
      return;
    }

    // GET lista por organização
    if (orgIdParam) {
      if (!isAdmin && !(await analystCanAccessOrg(userId, orgIdParam))) {
        jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const offset = Math.max(0, Number(req.query?.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      const search = typeof req.query?.search === 'string' ? req.query.search : null;
      const includeInactive = req.query?.includeInactive === 'true';

      const { rows, hasMore } = await getFarms(orgIdParam, { offset, limit, search, includeInactive });
      jsonSuccess(res, mapFarmsFromDatabase(rows), { offset, limit, hasMore });
      return;
    }

    jsonError(res, 'Parâmetro id ou organizationId obrigatório', { status: 400 });
    return;
  }

  // ─── POST (criar) ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Partial<CreateFarmInput> & { name?: string; organizationId?: string };

    const farmName = body?.name?.trim() ?? '';
    if (!farmName) {
      jsonError(res, 'Campo name é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (farmName.length > 255) {
      jsonError(res, 'name deve ter no máximo 255 caracteres', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!body?.organizationId) {
      jsonError(res, 'Campo organizationId é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const farmCity = body?.city?.trim() ?? '';
    if (!farmCity) {
      jsonError(res, 'Campo city é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }

    // Validate numeric fields (must be non-negative if provided)
    const numericFields = [
      'totalArea', 'pastureArea', 'agricultureArea', 'forageProductionArea',
      'agricultureAreaOwned', 'agricultureAreaLeased', 'otherCrops', 'infrastructure',
      'reserveAndAPP', 'otherArea', 'propertyValue', 'operationPecuary',
      'operationAgricultural', 'otherOperations', 'averageHerd', 'herdValue',
    ] as const;
    for (const field of numericFields) {
      const val = body[field];
      if (val !== null && val !== undefined) {
        const num = Number(val);
        if (isNaN(num) || num < 0) {
          jsonError(res, `Campo ${field} deve ser um número não-negativo`, { code: 'VALIDATION', status: 400 });
          return;
        }
      }
    }

    // Validate enum fields
    const validPropertyTypes = ['Própria', 'Arrendada'];
    if (body.propertyType && !validPropertyTypes.includes(body.propertyType)) {
      jsonError(res, `propertyType inválido. Use: ${validPropertyTypes.join(', ')}`, { code: 'VALIDATION', status: 400 });
      return;
    }
    const validWeightMetrics = ['Arroba (@)', 'Quilograma (Kg)'];
    if (body.weightMetric && !validWeightMetrics.includes(body.weightMetric)) {
      jsonError(res, `weightMetric inválido. Use: ${validWeightMetrics.join(', ')}`, { code: 'VALIDATION', status: 400 });
      return;
    }

    if (!isAdmin && !(await analystCanAccessOrg(userId, body.organizationId))) {
      jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    // Buscar nome da organização para gerar slug
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);

    const slug = generateFarmSlug(farmName, org?.name ?? body.organizationId);

    try {
      const farmData: CreateFarmInput = {
        id: crypto.randomUUID(),
        slug,
        name: farmName,
        country: body.country ?? 'Brasil',
        state: body.state ?? null,
        city: farmCity,
        organizationId: body.organizationId,
        totalArea: body.totalArea ?? null,
        pastureArea: body.pastureArea ?? null,
        agricultureArea: body.agricultureArea ?? null,
        forageProductionArea: body.forageProductionArea ?? null,
        agricultureAreaOwned: body.agricultureAreaOwned ?? null,
        agricultureAreaLeased: body.agricultureAreaLeased ?? null,
        otherCrops: body.otherCrops ?? null,
        infrastructure: body.infrastructure ?? null,
        reserveAndAPP: body.reserveAndAPP ?? null,
        otherArea: body.otherArea ?? null,
        propertyValue: body.propertyValue ?? null,
        operationPecuary: body.operationPecuary ?? null,
        operationAgricultural: body.operationAgricultural ?? null,
        otherOperations: body.otherOperations ?? null,
        agricultureVariation: body.agricultureVariation ?? 0,
        propertyType: body.propertyType ?? 'Própria',
        weightMetric: body.weightMetric ?? 'Arroba (@)',
        averageHerd: body.averageHerd ?? null,
        herdValue: body.herdValue ?? null,
        commercializesGenetics: body.commercializesGenetics ?? false,
        productionSystem: body.productionSystem ?? null,
        ativo: body.ativo ?? true,
      };

      const created = await createFarm(farmData, userId);
      jsonSuccess(res, mapFarmFromDatabase(created));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        jsonError(res, 'Já existe uma fazenda com este nome nesta organização', { code: 'VALIDATION', status: 400 });
        return;
      }
      console.error('[farms POST] erro ao criar fazenda');
      jsonError(res, 'Erro ao criar fazenda', { status: 500 });
    }
    return;
  }

  // ─── PATCH (atualizar) ────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as { id?: string } & UpdateFarmInput;

    const farmId = body?.id;
    if (!farmId) {
      jsonError(res, 'Campo id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }

    if (!isAdmin && !(await analystCanAccessFarm(userId, farmId))) {
      jsonError(res, 'Acesso negado a esta fazenda', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    const { id: _id, ...updates } = body as { id: string } & UpdateFarmInput;
    try {
      const updated = await updateFarm(farmId, updates);
      if (!updated) {
        jsonError(res, 'Fazenda não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      jsonSuccess(res, mapFarmFromDatabase(updated));
    } catch {
      console.error('[farms PATCH] erro ao atualizar fazenda');
      jsonError(res, 'Erro ao atualizar fazenda', { status: 500 });
    }
    return;
  }

  // ─── DELETE (soft delete) ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const farmId = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!farmId) {
      jsonError(res, 'Parâmetro id obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }

    if (!isAdmin && !(await analystCanAccessFarm(userId, farmId))) {
      jsonError(res, 'Acesso negado a esta fazenda', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    try {
      await deactivateFarm(farmId);
      jsonSuccess(res, { id: farmId, ativo: false });
    } catch {
      console.error('[farms DELETE] erro ao desativar fazenda');
      jsonError(res, 'Erro ao desativar fazenda', { status: 500 });
    }
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
