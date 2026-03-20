import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole } from './_lib/orgAccess.js';
import { db } from '../src/DB/index.js';
import { savedQuestionnaires } from '../src/DB/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
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
    const { id, orgId, farmId } = req.query as Record<string, string>;

    // Single by id
    if (id) {
      const rows = await db
        .select()
        .from(savedQuestionnaires)
        .where(and(eq(savedQuestionnaires.id, id), eq(savedQuestionnaires.userId, effectiveUserId)));
      jsonSuccess(res, rows[0] ?? null);
      return;
    }

    // List with optional filters
    const conditions = [eq(savedQuestionnaires.userId, effectiveUserId)];

    if (orgId) {
      conditions.push(eq(savedQuestionnaires.organizationId, orgId));
    }
    if (farmId) {
      conditions.push(eq(savedQuestionnaires.farmId, farmId));
    }

    const rows = await db
      .select()
      .from(savedQuestionnaires)
      .where(and(...conditions))
      .orderBy(desc(savedQuestionnaires.createdAt));
    jsonSuccess(res, rows);
    return;
  }

  // POST — insert
  if (req.method === 'POST') {
    const body = req.body as {
      name: string;
      organizationId?: string;
      farmId?: string;
      farmName?: string;
      productionSystem?: string;
      questionnaireId?: string;
      answers?: unknown[];
    };

    if (!body.name) {
      jsonError(res, 'Campo obrigatório: name', { status: 400 });
      return;
    }

    const [row] = await db
      .insert(savedQuestionnaires)
      .values({
        userId,  // sempre do JWT
        name: body.name,
        organizationId: body.organizationId ?? null,
        farmId: body.farmId ?? null,
        farmName: body.farmName ?? null,
        productionSystem: body.productionSystem ?? null,
        questionnaireId: body.questionnaireId ?? null,
        answers: body.answers ?? [],
      })
      .returning();

    jsonSuccess(res, row);
    return;
  }

  // PATCH — update answers + name
  if (req.method === 'PATCH') {
    const { id } = req.query as Record<string, string>;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    const body = req.body as {
      name?: string;
      answers?: unknown[];
    };

    const updates: Partial<typeof savedQuestionnaires.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.answers !== undefined) updates.answers = body.answers;

    const [row] = await db
      .update(savedQuestionnaires)
      .set(updates)
      .where(and(eq(savedQuestionnaires.id, id), eq(savedQuestionnaires.userId, effectiveUserId)))
      .returning();

    if (!row) { jsonError(res, 'Questionário não encontrado', { status: 404 }); return; }
    jsonSuccess(res, row);
    return;
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = req.query as Record<string, string>;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    await db
      .delete(savedQuestionnaires)
      .where(and(eq(savedQuestionnaires.id, id), eq(savedQuestionnaires.userId, effectiveUserId)));

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
