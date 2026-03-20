import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { aiTokenUsage } from '../src/DB/schema.js';
import { gte, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  if (req.method === 'GET') {
    const { period = 'all' } = req.query as Record<string, string>;

    let query = db
      .select({
        tokensInput: sql<number>`coalesce(sum(${aiTokenUsage.tokensInput}), 0)`.mapWith(Number),
        tokensOutput: sql<number>`coalesce(sum(${aiTokenUsage.tokensOutput}), 0)`.mapWith(Number),
        totalTokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)`.mapWith(Number),
      })
      .from(aiTokenUsage);

    if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.where(gte(aiTokenUsage.createdAt, today)) as typeof query;
    } else if (period === 'month') {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);
      query = query.where(gte(aiTokenUsage.createdAt, firstOfMonth)) as typeof query;
    }
    // 'all' — no filter

    const [result] = await query;
    jsonSuccess(res, result ?? { tokensInput: 0, tokensOutput: 0, totalTokens: 0 });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
