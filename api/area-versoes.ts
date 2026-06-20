/**
 * API route da linha do tempo das áreas (area_versoes).
 *
 *   GET ?farmId=xxx&date=AAAA-MM-DD  — reconstrói o mapa da fazenda naquela data
 *   GET ?farmId=xxx                  — estado atual (hoje; versões abertas)
 *   GET ?areaId=xxx                  — histórico de versões de uma área
 *
 * Reconstrução: versões vigentes em X (valid_from <= X AND (valid_to IS NULL OR
 * valid_to > X)), em todos os níveis (retiro/setor/local). Só leitura — as
 * versões são geradas pelas operações do ledger (/api/area-movimentos).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { reconstruct, reconstructCurrent, listByArea } from '../src/DB/repositories/area-versoes.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  try {
    if (req.method === 'GET') {
      const areaId = typeof req.query?.areaId === 'string' ? req.query.areaId : '';
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      const date = typeof req.query?.date === 'string' ? req.query.date : '';

      if (areaId) {
        jsonSuccess(res, await listByArea(areaId));
        return;
      }
      if (!farmId) {
        jsonError(res, 'Informe farmId (com date opcional) ou areaId', { status: 400 });
        return;
      }
      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          jsonError(res, 'date deve estar no formato AAAA-MM-DD', { status: 400 });
          return;
        }
        jsonSuccess(res, await reconstruct(farmId, date));
        return;
      }
      jsonSuccess(res, await reconstructCurrent(farmId));
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[area-versoes] error:', err);
    jsonError(res, err?.message || 'Erro ao reconstruir o mapa.', { code: 'INTERNAL', status: 500 });
  }
}
