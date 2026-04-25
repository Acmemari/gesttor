import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole } from './_lib/orgAccess.js';
import { db } from '../src/DB/index.js';
import { engordaSimulations } from '../src/DB/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  try {
    const role = await getUserRole(userId);
    const isAdmin = role === 'administrador';

    const qUserId = typeof (req.query as Record<string, string>)?.userId === 'string'
      ? (req.query as Record<string, string>).userId
      : null;
    const effectiveUserId = isAdmin && qUserId ? qUserId : userId;

    if (req.method === 'GET') {
      const { id, orgId, farmId, countOnly } = req.query as Record<string, string>;

      if (id) {
        const rows = await db
          .select()
          .from(engordaSimulations)
          .where(and(eq(engordaSimulations.id, id), eq(engordaSimulations.userId, effectiveUserId)));
        jsonSuccess(res, rows[0] ?? null);
        return;
      }

      if (countOnly === 'true') {
        const rows = await db
          .select()
          .from(engordaSimulations)
          .where(eq(engordaSimulations.userId, effectiveUserId));
        jsonSuccess(res, { count: rows.length });
        return;
      }

      const conditions = [eq(engordaSimulations.userId, effectiveUserId)];
      if (orgId) conditions.push(eq(engordaSimulations.organizationId, orgId));
      if (farmId) conditions.push(eq(engordaSimulations.farmId, farmId));

      const rows = await db
        .select()
        .from(engordaSimulations)
        .where(and(...conditions))
        .orderBy(desc(engordaSimulations.createdAt));
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body as {
        name: string;
        category: 'macho' | 'femea';
        inputs: object;
        results?: object;
        reportMarkdown?: string;
        organizationId?: string;
        farmId?: string;
        farmName?: string;
      };

      if (!body.name || !body.category || !body.inputs) {
        jsonError(res, 'Campos obrigatórios: name, category, inputs', { status: 400 });
        return;
      }

      const [row] = await db
        .insert(engordaSimulations)
        .values({
          userId,
          name: body.name,
          category: body.category,
          inputs: body.inputs,
          results: body.results ?? null,
          reportMarkdown: body.reportMarkdown ?? null,
          organizationId: body.organizationId ?? null,
          farmId: body.farmId ?? null,
          farmName: body.farmName ?? null,
        })
        .returning();

      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'PATCH') {
      const { id } = req.query as Record<string, string>;
      if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

      const body = req.body as {
        name?: string;
        inputs?: object;
        results?: object;
        reportMarkdown?: string;
      };

      const updates: Partial<typeof engordaSimulations.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.name !== undefined) updates.name = body.name;
      if (body.inputs !== undefined) updates.inputs = body.inputs;
      if (body.results !== undefined) updates.results = body.results;
      if (body.reportMarkdown !== undefined) updates.reportMarkdown = body.reportMarkdown;

      const [row] = await db
        .update(engordaSimulations)
        .set(updates)
        .where(and(eq(engordaSimulations.id, id), eq(engordaSimulations.userId, effectiveUserId)))
        .returning();

      if (!row) { jsonError(res, 'Simulação não encontrada', { status: 404 }); return; }
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'DELETE') {
      const { id } = req.query as Record<string, string>;
      if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

      await db
        .delete(engordaSimulations)
        .where(and(eq(engordaSimulations.id, id), eq(engordaSimulations.userId, effectiveUserId)));

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
