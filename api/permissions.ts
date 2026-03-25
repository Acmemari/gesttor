/**
 * API de permissões de analista por fazenda (via organização).
 * GET ?farmId=xxx (single) ou ?farmIds=id1,id2 (batch)
 * Acesso derivado de organization_analysts ou organizations.analyst_id.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getFarmPermissions, getFarmPermissionsBatch } from '../src/DB/repositories/permissions.js';

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

  const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;
  const farmIdsParam = typeof req.query?.farmIds === 'string' ? req.query.farmIds : null;
  const farmIds = farmIdsParam ? farmIdsParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (farmId) {
    const row = await getFarmPermissions(farmId, userId);
    if (!row) {
      jsonSuccess(res, null);
      return;
    }
    jsonSuccess(res, {
      permissions: row.permissions,
      is_responsible: row.is_responsible,
    });
    return;
  }

  if (farmIds.length > 0) {
    const rows = await getFarmPermissionsBatch(farmIds, userId);
    jsonSuccess(res, rows);
    return;
  }

  jsonError(res, 'Especifique farmId ou farmIds', { status: 400 });
}
