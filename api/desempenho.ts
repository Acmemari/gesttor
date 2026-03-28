/**
 * GET /api/desempenho?farmId=&dataInicio=&dataFim=
 * Retorna estatísticas de desempenho por colaborador no período indicado.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import { getDesempenhoByPeriod } from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { jsonError(res, 'Método não permitido', { status: 405 }); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  let role: string;
  try {
    role = await getUserRole(userId);
  } catch (err: any) {
    jsonError(res, err.message, { status: err.status ?? 401 });
    return;
  }

  const { farmId, dataInicio, dataFim } = req.query as Record<string, string | undefined>;

  if (!farmId || !dataInicio || !dataFim) {
    jsonError(res, 'farmId, dataInicio e dataFim são obrigatórios', { status: 400 });
    return;
  }

  try {
    await assertFarmAccess(farmId, userId, role);
  } catch (err: any) {
    jsonError(res, err.message, { status: err.status ?? 403 });
    return;
  }

  const data = await getDesempenhoByPeriod(farmId, dataInicio, dataFim);
  jsonSuccess(res, data);
}
