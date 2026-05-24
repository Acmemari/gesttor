/**
 * API do Plano de Contas (centro de custo) global.
 * GET /api/plano-contas        → lista todas as contas ativas (cache 24h via header).
 *
 * Não há multi-tenancy: a tabela é global.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { listPlanoContas } from '../src/DB/repositories/planoContas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    jsonError(res, 'Método não permitido', { status: 405 });
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  const includeInativo = req.query?.includeInativo === 'true';
  const rows = await listPlanoContas(includeInativo);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  jsonSuccess(res, rows);
}
