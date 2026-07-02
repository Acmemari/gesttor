/**
 * API route for farm maps (KMZ/KML uploads).
 * GET   ?farmId=xxx  — list maps for a farm
 * POST  { farmId, fileName, originalName, fileType, fileSize, storagePath, geojson,
 *         correctedStoragePath?, correctedFileName?, correctedFileSize?, correcaoReport? }
 * PATCH ?id=xxx { geojson?, correctedStoragePath?, correctedFileName?, correctedFileSize?, correcaoReport? }
 * DELETE ?id=xxx    — delete a map
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import {
  getFarmMaps,
  createFarmMap,
  updateFarmMap,
  deleteFarmMap,
  getFarmMap,
} from '../src/DB/repositories/farm-maps.js';

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
    // Papel do usuário (admin passa direto; demais precisam ter acesso à org da
    // fazenda). Carregado uma vez e reusado nas checagens por método.
    const role = await getUserRole(userId);

    if (req.method === 'GET') {
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      if (!farmId) {
        jsonError(res, 'farmId obrigatório', { status: 400 });
        return;
      }
      await assertFarmAccess(farmId, userId, role);
      const rows = await getFarmMaps(farmId);
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const {
        farmId, fileName, originalName, fileType, fileSize, storagePath, geojson,
        correctedStoragePath, correctedFileName, correctedFileSize, correcaoReport,
      } = req.body ?? {};
      if (!farmId || !fileName || !originalName || !fileType || !storagePath) {
        jsonError(res, 'Campos obrigatórios: farmId, fileName, originalName, fileType, storagePath', {
          status: 400,
        });
        return;
      }
      await assertFarmAccess(farmId, userId, role);
      const row = await createFarmMap({
        farmId,
        uploadedBy: userId,
        fileName,
        originalName,
        fileType,
        fileSize: fileSize ?? 0,
        storagePath,
        geojson: geojson ?? null,
        correctedStoragePath: correctedStoragePath ?? null,
        correctedFileName: correctedFileName ?? null,
        correctedFileSize: correctedFileSize ?? null,
        correcaoReport: correcaoReport ?? null,
      });
      jsonSuccess(res, row);
      return;
    }

    if (req.method === 'PATCH') {
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
      // Autoriza pela fazenda DO REGISTRO (não confia em farmId do cliente).
      await assertFarmAccess(existing.farmId, userId, role);
      const { geojson, correctedStoragePath, correctedFileName, correctedFileSize, correcaoReport } =
        req.body ?? {};
      const patch: Record<string, unknown> = {};
      if (geojson !== undefined) patch.geojson = geojson;
      if (correctedStoragePath !== undefined) patch.correctedStoragePath = correctedStoragePath;
      if (correctedFileName !== undefined) patch.correctedFileName = correctedFileName;
      if (correctedFileSize !== undefined) patch.correctedFileSize = correctedFileSize;
      if (correcaoReport !== undefined) patch.correcaoReport = correcaoReport;
      const row = await updateFarmMap(id, patch);
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
      // Autoriza pela fazenda DO REGISTRO (não confia em farmId vindo do cliente).
      await assertFarmAccess(existing.farmId, userId, role);
      await deleteFarmMap(id);
      // A linha do Drizzle vem em camelCase (storagePath); o cliente usa esses
      // caminhos para apagar os arquivos (original + corrigido) no storage (B2).
      jsonSuccess(res, {
        deleted: true,
        storagePath: existing.storagePath,
        correctedStoragePath: (existing as { correctedStoragePath?: string | null }).correctedStoragePath ?? null,
      });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err) {
    // Honra o status/código lançado pelos helpers de autorização (401/403/404);
    // só loga como erro de servidor o que for 5xx.
    const status = (err as { status?: number })?.status ?? 500;
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : 'Erro interno';
    if (status >= 500) console.error('[api/farm-maps]', message);
    jsonError(res, message, { status, ...(code ? { code } : {}) });
  }
}
