import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole } from './_lib/orgAccess.js';
import { db } from '../src/DB/index.js';
import { cattleScenarios } from '../src/DB/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  try {
  const role = await getUserRole(userId);
  const isAdmin = role === 'administrador';

  // Resolve o userId efetivo: admin pode consultar qualquer, demais apenas o próprio
  const qUserId = typeof (req.query as Record<string, string>)?.userId === 'string'
    ? (req.query as Record<string, string>).userId
    : null;
  const effectiveUserId = isAdmin && qUserId ? qUserId : userId;

  // GET
  if (req.method === 'GET') {
    const { id, orgId, farmId, countOnly } = req.query as Record<string, string>;

    // Single by id
    if (id) {
      const rows = await db
        .select()
        .from(cattleScenarios)
        .where(and(eq(cattleScenarios.id, id), eq(cattleScenarios.userId, effectiveUserId)));
      jsonSuccess(res, rows[0] ?? null);
      return;
    }

    // Count only (for limit check)
    if (countOnly === 'true') {
      const rows = await db
        .select()
        .from(cattleScenarios)
        .where(eq(cattleScenarios.userId, effectiveUserId));
      jsonSuccess(res, { count: rows.length });
      return;
    }

    // List with optional filters
    const conditions = [eq(cattleScenarios.userId, effectiveUserId)];

    if (orgId) {
      conditions.push(eq(cattleScenarios.organizationId, orgId));
    }
    if (farmId) {
      conditions.push(eq(cattleScenarios.farmId, farmId));
    }

    const rows = await db
      .select()
      .from(cattleScenarios)
      .where(and(...conditions))
      .orderBy(desc(cattleScenarios.createdAt));
    jsonSuccess(res, rows);
    return;
  }

  // POST — insert
  if (req.method === 'POST') {
    const body = req.body as {
      name: string;
      inputs: object;
      results?: object;
      organizationId?: string;
      farmId?: string;
      farmName?: string;
    };

    if (!body.name || !body.inputs) {
      jsonError(res, 'Campos obrigatórios: name, inputs', { status: 400 });
      return;
    }

    const [row] = await db
      .insert(cattleScenarios)
      .values({
        userId,  // sempre do JWT
        name: body.name,
        inputs: body.inputs,
        results: body.results ?? null,
        organizationId: body.organizationId ?? null,
        farmId: body.farmId ?? null,
        farmName: body.farmName ?? null,
      })
      .returning();

    jsonSuccess(res, row);
    return;
  }

  // PATCH — update
  if (req.method === 'PATCH') {
    const { id } = req.query as Record<string, string>;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    const body = req.body as {
      name?: string;
      inputs?: object;
      results?: object;
    };

    const updates: Partial<typeof cattleScenarios.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.inputs !== undefined) updates.inputs = body.inputs;
    if (body.results !== undefined) updates.results = body.results;

    const [row] = await db
      .update(cattleScenarios)
      .set(updates)
      .where(and(eq(cattleScenarios.id, id), eq(cattleScenarios.userId, effectiveUserId)))
      .returning();

    if (!row) { jsonError(res, 'Cenário não encontrado', { status: 404 }); return; }
    jsonSuccess(res, row);
    return;
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = req.query as Record<string, string>;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    await db
      .delete(cattleScenarios)
      .where(and(eq(cattleScenarios.id, id), eq(cattleScenarios.userId, effectiveUserId)));

    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    if (!res.headersSent) {
      jsonError(res, e.message ?? 'Erro interno', { status: e.status ?? 500, code: e.code });
    }
  }
}
