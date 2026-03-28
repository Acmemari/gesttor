/**
 * API route for semana transcription documents.
 * GET    ?farmId=xxx  — list all transcriptions for a farm
 * POST   { semanaId, farmId, organizationId, fileName, originalName, fileType, fileSize, storagePath, descricao? }
 * DELETE ?id=xxx      — delete a transcription record (returns storagePath for client-side B2 cleanup)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listTranscricoesByFarm,
  getTranscricaoById,
  createTranscricao,
  deleteTranscricao,
} from '../src/DB/repositories/semana-transcricoes.js';

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
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      if (!farmId) {
        jsonError(res, 'farmId obrigatório', { status: 400 });
        return;
      }
      const rows = await listTranscricoesByFarm(farmId);
      jsonSuccess(res, rows);
      return;
    }

    if (req.method === 'POST') {
      const {
        semanaId,
        farmId,
        organizationId,
        fileName,
        originalName,
        fileType,
        fileSize,
        storagePath,
        descricao,
      } = req.body ?? {};

      if (!semanaId || !farmId || !organizationId || !fileName || !originalName || !fileType || !storagePath) {
        jsonError(res, 'Campos obrigatórios: semanaId, farmId, organizationId, fileName, originalName, fileType, storagePath', {
          status: 400,
        });
        return;
      }

      const row = await createTranscricao({
        semanaId,
        farmId,
        organizationId,
        uploadedBy: userId,
        fileName,
        originalName,
        fileType,
        fileSize: fileSize ?? 0,
        storagePath,
        descricao: descricao ?? null,
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
      const existing = await getTranscricaoById(id);
      if (!existing) {
        jsonError(res, 'Transcrição não encontrada', { status: 404 });
        return;
      }
      await deleteTranscricao(id);
      jsonSuccess(res, { deleted: true, storagePath: existing.storagePath });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[api/semana-transcricoes]', message);
    jsonError(res, message, { status: 500 });
  }
}
