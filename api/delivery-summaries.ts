import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { deliveryAiSummaries } from '../src/DB/schema.js';
import { inArray, eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  // GET — fetch by delivery IDs
  if (req.method === 'GET') {
    const { deliveryIds } = req.query as Record<string, string>;
    if (!deliveryIds) {
      jsonError(res, 'Parâmetro deliveryIds obrigatório (separados por vírgula)', { status: 400 });
      return;
    }

    const ids = deliveryIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      jsonSuccess(res, []);
      return;
    }

    const rows = await db
      .select({
        deliveryId: deliveryAiSummaries.deliveryId,
        summary: deliveryAiSummaries.summary,
        sourceHash: deliveryAiSummaries.sourceHash,
      })
      .from(deliveryAiSummaries)
      .where(inArray(deliveryAiSummaries.deliveryId, ids));

    jsonSuccess(res, rows);
    return;
  }

  // POST — upsert
  if (req.method === 'POST') {
    const body = req.body as {
      deliveryId: string;
      summary: string;
      sourceHash: string;
    };

    if (!body.deliveryId || !body.summary || !body.sourceHash) {
      jsonError(res, 'Campos obrigatórios: deliveryId, summary, sourceHash', { status: 400 });
      return;
    }

    const [row] = await db
      .insert(deliveryAiSummaries)
      .values({
        deliveryId: body.deliveryId,
        summary: body.summary,
        sourceHash: body.sourceHash,
      })
      .onConflictDoUpdate({
        target: deliveryAiSummaries.deliveryId,
        set: {
          summary: body.summary,
          sourceHash: body.sourceHash,
          updatedAt: new Date(),
        },
      })
      .returning();

    jsonSuccess(res, row);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
