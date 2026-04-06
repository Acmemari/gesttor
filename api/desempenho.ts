/**
 * GET /api/desempenho?farmId=&dataInicio=&dataFim=
 * Retorna estatísticas de desempenho por colaborador no período indicado.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
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

  const { farmId, dataInicio, dataFim, prioridade } = req.query as Record<string, string | undefined>;

  if (!farmId || !dataInicio || !dataFim) {
    jsonError(res, 'farmId, dataInicio e dataFim são obrigatórios', { status: 400 });
    return;
  }

  if (prioridade && !['alta', 'média', 'baixa'].includes(prioridade)) {
    jsonError(res, 'prioridade deve ser alta, média ou baixa', { status: 400 });
    return;
  }

  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRe.test(dataInicio) || !isoDateRe.test(dataFim)
      || isNaN(Date.parse(dataInicio)) || isNaN(Date.parse(dataFim))) {
    jsonError(res, 'dataInicio e dataFim devem estar no formato YYYY-MM-DD', { status: 400 });
    return;
  }

  const rl = await checkCrudRateLimit({ userId });
  if (!rl.allowed) {
    jsonError(res, 'Muitas requisições. Tente novamente em breve.', { status: 429 });
    return;
  }

  try {
    await assertFarmAccess(farmId, userId, role);
  } catch (err: any) {
    jsonError(res, err.message, { status: err.status ?? 403 });
    return;
  }

  const data = await getDesempenhoByPeriod(farmId, dataInicio, dataFim, prioridade);
  jsonSuccess(res, data);
}
