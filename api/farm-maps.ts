/**
 * API route for farm maps (KMZ/KML uploads).
 * GET  ?farmId=xxx        — list maps for a farm
 * POST { farmId, fileName, originalName, fileType, fileSize, storagePath, geojson }
 * DELETE ?id=xxx           — delete a map
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  getFarmMaps,
  createFarmMap,
  deleteFarmMap,
  getFarmMap,
} from '../src/DB/repositories/farm-maps.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
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
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      if (!farmId) {
        jsonError(res, 'farmId obrigatório', { status: 400 });
        return;
      }
      const rows = await getFarmMaps(farmId);
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const { farmId, fileName, originalName, fileType, fileSize, storagePath, geojson } =
        req.body ?? {};
      if (!farmId || !fileName || !originalName || !fileType || !storagePath) {
        jsonError(res, 'Campos obrigatórios: farmId, fileName, originalName, fileType, storagePath', {
          status: 400,
        });
        return;
      }
      const row = await createFarmMap({
        farmId,
        uploadedBy: userId,
        fileName,
        originalName,
        fileType,
        fileSize: fileSize ?? 0,
        storagePath,
        geojson: geojson ?? null,
      });
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const existing = await getFarmMap(id);
      if (!existing) {
        jsonError(res, 'Mapa não encontrado', { status: 404 });
        return;
      }
      await deleteFarmMap(id);
      jsonSuccess(res, { deleted: true, storagePath: existing.storage_path });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[api/farm-maps]', message);
    jsonError(res, message, { status: 500 });
  }
}
