/**
 * API route for semana transcription documents.
 * GET    ?farmId=xxx  — list all transcriptions for a farm
 * POST   { action: 'extract-text', id } — extract text from a stored document
 * POST   { semanaId, farmId, organizationId, ... } — create a new transcription record
 * PATCH  ?id=xxx { processedResult } — save/update processed transcription result
 * DELETE ?id=xxx      — delete a transcription record (returns storagePath for client-side B2 cleanup)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listTranscricoesByFarm,
  getTranscricaoById,
  createTranscricao,
  updateTranscricaoProcessedResult,
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

    if (req.method === 'POST' && req.body?.action === 'extract-text') {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const { extractTranscricaoText } = await import('./_lib/extract-transcricao.js');
      const result = await extractTranscricaoText(id);
      if ('error' in result) {
        jsonError(res, result.error, { status: result.status });
        return;
      }
      jsonSuccess(res, { texto: result.texto });
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
        texto,
        tipo,
      } = req.body ?? {};

      const isAudio = tipo === 'audio';

      if (!semanaId || !farmId || !organizationId) {
        jsonError(res, 'Campos obrigatórios: semanaId, farmId, organizationId', { status: 400 });
        return;
      }

      if (!isAudio && (!fileName || !originalName || !fileType || !storagePath)) {
        jsonError(res, 'Campos obrigatórios para upload manual: fileName, originalName, fileType, storagePath', { status: 400 });
        return;
      }

      const row = await createTranscricao({
        semanaId,
        farmId,
        organizationId,
        uploadedBy: userId,
        fileName: fileName || 'transcricao-audio.txt',
        originalName: originalName || 'Transcrição de áudio',
        fileType: fileType || 'audio/transcription',
        fileSize: fileSize ?? 0,
        storagePath: storagePath || '',
        descricao: descricao ?? null,
        texto: texto ?? null,
        tipo: tipo ?? 'manual',
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
      const existing = await getTranscricaoById(id);
      if (!existing) {
        jsonError(res, 'Transcrição não encontrada', { status: 404 });
        return;
      }
      const { processedResult } = req.body ?? {};
      if (!processedResult) {
        jsonError(res, 'processedResult obrigatório', { status: 400 });
        return;
      }
      const row = await updateTranscricaoProcessedResult(id, processedResult);
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
