/**
 * API de histórico de semanas.
 *
 * GET    /api/historico-semanas?farmId=...   → listar por farm (null = sem farm)
 * POST   /api/historico-semanas              → criar registro
 * DELETE /api/historico-semanas?id=...       → deletar
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listHistoricoByFarm,
  createHistorico,
  deleteHistorico,
} from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  if (req.method === 'GET') {
    const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;
    const rows = await listHistoricoByFarm(farmId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const semana_numero = Number(body?.semana_numero ?? 0);
    if (!semana_numero) { jsonError(res, 'semana_numero é obrigatório', { status: 400 }); return; }
    const row = await createHistorico({
      semana_id: body?.semana_id ? String(body.semana_id) : null,
      farm_id: body?.farm_id ? String(body.farm_id) : null,
      semana_numero,
      total: Number(body?.total ?? 0),
      concluidas: Number(body?.concluidas ?? 0),
      pendentes: Number(body?.pendentes ?? 0),
    });
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    await deleteHistorico(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
