import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { agentRegistry } from '../src/DB/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  // GET — list active agents
  if (req.method === 'GET') {
    const rows = await db
      .select({
        id: agentRegistry.id,
        version: agentRegistry.version,
        name: agentRegistry.name,
        description: agentRegistry.description,
        systemPrompt: agentRegistry.systemPrompt,
      })
      .from(agentRegistry)
      .where(eq(agentRegistry.status, 'active'));

    jsonSuccess(res, rows);
    return;
  }

  // PATCH — update system_prompt
  if (req.method === 'PATCH') {
    const { id, version } = req.query as Record<string, string>;
    if (!id || !version) {
      jsonError(res, 'Parâmetros id e version obrigatórios', { status: 400 });
      return;
    }

    const body = req.body as { systemPrompt: string };
    if (body.systemPrompt === undefined) {
      jsonError(res, 'Campo systemPrompt obrigatório', { status: 400 });
      return;
    }

    const [row] = await db
      .update(agentRegistry)
      .set({ systemPrompt: body.systemPrompt, updatedAt: new Date() })
      .where(and(eq(agentRegistry.id, id), eq(agentRegistry.version, version)))
      .returning();

    if (!row) { jsonError(res, 'Agente não encontrado', { status: 404 }); return; }
    jsonSuccess(res, row);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
