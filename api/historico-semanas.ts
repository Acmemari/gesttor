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
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import {
  listHistoricoByFarm,
  createHistorico,
  getHistoricoById,
  deleteHistorico,
} from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  let role: string;
  try {
    role = await getUserRole(userId);
  } catch (err: any) {
    jsonError(res, err.message, { status: err.status ?? 401 });
    return;
  }

  if (req.method === 'GET') {
    const farmId = typeof req.query?.farmId === 'string' && req.query.farmId !== ''
      ? req.query.farmId
      : null;
    if (farmId) {
      try { await assertFarmAccess(farmId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
    } else if (role !== 'admin' && role !== 'administrador') {
      jsonError(res, 'farmId é obrigatório', { status: 400 }); return;
    }
    const rows = await listHistoricoByFarm(farmId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const semana_numero = Number(body?.semana_numero ?? 0);
    if (!semana_numero) { jsonError(res, 'semana_numero é obrigatório', { status: 400 }); return; }
    const farm_id = body?.farm_id ? String(body.farm_id) : null;
    if (farm_id) {
      try { await assertFarmAccess(farm_id, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
    } else if (role !== 'admin' && role !== 'administrador') {
      jsonError(res, 'farm_id é obrigatório', { status: 400 }); return;
    }
    const row = await createHistorico({
      semana_id: body?.semana_id ? String(body.semana_id) : null,
      farm_id,
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
    const registro = await getHistoricoById(id);
    if (!registro) { jsonError(res, 'Registro não encontrado', { status: 404 }); return; }
    if (registro.farmId) {
      try { await assertFarmAccess(registro.farmId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
    } else if (role !== 'admin' && role !== 'administrador') {
      jsonError(res, 'Sem permissão', { status: 403 }); return;
    }
    await deleteHistorico(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
