/**
 * API de atividades de semanas.
 *
 * GET    /api/atividades?semanaId=...           → listar por semana
 * POST   /api/atividades                        → criar atividade
 * POST   /api/atividades?bulk=true              → criar múltiplas (carry-over)
 * PATCH  /api/atividades?id=...                 → atualizar
 * DELETE /api/atividades?id=...                 → deletar individual
 * DELETE /api/atividades?semanaId=...           → deletar todas de uma semana
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listAtividadesBySemana,
  createAtividade,
  createAtividadesBulk,
  updateAtividade,
  deleteAtividade,
  deleteAtividadesBySemana,
} from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  if (req.method === 'GET') {
    const semanaId = typeof req.query?.semanaId === 'string' ? req.query.semanaId : null;
    if (!semanaId) { jsonError(res, 'semanaId é obrigatório', { status: 400 }); return; }
    const rows = await listAtividadesBySemana(semanaId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const bulk = req.query?.bulk === 'true';
    const body = req.body as Record<string, unknown>;

    if (bulk) {
      const items = body?.items as Array<Record<string, unknown>>;
      if (!Array.isArray(items) || items.length === 0) {
        jsonError(res, 'items é obrigatório para bulk', { status: 400 });
        return;
      }
      const rows = await createAtividadesBulk(
        items.map(item => ({
          semana_id: String(item.semana_id ?? ''),
          titulo: String(item.titulo ?? ''),
          descricao: item.descricao ? String(item.descricao) : '',
          pessoa_id: item.pessoa_id ? String(item.pessoa_id) : null,
          data_termino: item.data_termino ? String(item.data_termino) : null,
          tag: item.tag ? String(item.tag) : '#planejamento',
          status: 'a fazer',
        })),
      );
      jsonSuccess(res, rows);
      return;
    }

    const semana_id = String(body?.semana_id ?? '').trim();
    const titulo = String(body?.titulo ?? '').trim();
    if (!semana_id || !titulo) {
      jsonError(res, 'semana_id e titulo são obrigatórios', { status: 400 });
      return;
    }
    const row = await createAtividade({
      semana_id,
      titulo,
      descricao: body?.descricao ? String(body.descricao) : '',
      pessoa_id: body?.pessoa_id ? String(body.pessoa_id) : null,
      data_termino: body?.data_termino ? String(body.data_termino) : null,
      tag: body?.tag ? String(body.tag) : '#planejamento',
      status: body?.status ? String(body.status) : 'a fazer',
    });
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const partial: Record<string, unknown> = {};
    if (body.titulo !== undefined) partial.titulo = String(body.titulo);
    if (body.descricao !== undefined) partial.descricao = String(body.descricao);
    if (body.pessoa_id !== undefined) partial.pessoa_id = body.pessoa_id ? String(body.pessoa_id) : null;
    if (body.data_termino !== undefined) partial.data_termino = body.data_termino ? String(body.data_termino) : null;
    if (body.tag !== undefined) partial.tag = String(body.tag);
    if (body.status !== undefined) partial.status = String(body.status);
    const row = await updateAtividade(id, partial);
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    const semanaId = typeof req.query?.semanaId === 'string' ? req.query.semanaId : null;
    if (semanaId) {
      await deleteAtividadesBySemana(semanaId);
      jsonSuccess(res, { deleted: true });
      return;
    }
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id ou semanaId é obrigatório', { status: 400 }); return; }
    await deleteAtividade(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
