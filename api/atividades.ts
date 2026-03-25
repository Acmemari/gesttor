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
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import {
  listAtividadesBySemana,
  getAtividadeById,
  getSemanaById,
  createAtividade,
  createAtividadesBulk,
  updateAtividade,
  deleteAtividade,
  deleteAtividadesBySemana,
} from '../src/DB/repositories/semanas.js';

const VALID_STATUS = ['a fazer', 'em andamento', 'pausada', 'concluída'] as const;
type Status = typeof VALID_STATUS[number];

function isValidStatus(s: string): s is Status {
  return (VALID_STATUS as readonly string[]).includes(s);
}

/** Verifica acesso a uma semana pelo seu ID. */
async function assertSemanaAccess(semanaId: string, userId: string, role: string): Promise<void> {
  const semana = await getSemanaById(semanaId);
  if (!semana) {
    throw Object.assign(new Error('Semana não encontrada'), { status: 404 });
  }
  if (semana.farmId) {
    await assertFarmAccess(semana.farmId, userId, role);
  } else if (role !== 'admin' && role !== 'administrador') {
    throw Object.assign(new Error('Sem permissão'), { status: 403 });
  }
}

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
    const semanaId = typeof req.query?.semanaId === 'string' ? req.query.semanaId : null;
    if (!semanaId) { jsonError(res, 'semanaId é obrigatório', { status: 400 }); return; }
    try { await assertSemanaAccess(semanaId, userId, role); } catch (err: any) {
      jsonError(res, err.message, { status: err.status ?? 403 }); return;
    }
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
      // Verifica acesso pela semana do primeiro item (todos devem ser da mesma semana)
      const firstSemanaId = String(items[0]?.semana_id ?? '');
      if (!firstSemanaId) { jsonError(res, 'semana_id é obrigatório', { status: 400 }); return; }
      try { await assertSemanaAccess(firstSemanaId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
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
    try { await assertSemanaAccess(semana_id, userId, role); } catch (err: any) {
      jsonError(res, err.message, { status: err.status ?? 403 }); return;
    }
    const statusRaw = body?.status ? String(body.status) : 'a fazer';
    if (!isValidStatus(statusRaw)) {
      jsonError(res, `status inválido: ${statusRaw}`, { status: 400 }); return;
    }
    try {
      const row = await createAtividade({
        semana_id,
        titulo,
        descricao: body?.descricao ? String(body.descricao) : '',
        pessoa_id: body?.pessoa_id ? String(body.pessoa_id) : null,
        data_termino: body?.data_termino ? String(body.data_termino) : null,
        tag: body?.tag ? String(body.tag) : '#planejamento',
        status: statusRaw,
      });
      jsonSuccess(res, row);
      return;
    } catch (err: any) {
      console.error("ERRO AO CRIAR ATIVIDADE:", err);
      jsonError(res, `Erro interno: ${err.message}`, { status: 500 });
      return;
    }
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    const atividade = await getAtividadeById(id);
    if (!atividade) { jsonError(res, 'Atividade não encontrada', { status: 404 }); return; }
    try { await assertSemanaAccess(atividade.semanaId, userId, role); } catch (err: any) {
      jsonError(res, err.message, { status: err.status ?? 403 }); return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const partial: Record<string, unknown> = {};
    if (body.titulo !== undefined) partial.titulo = String(body.titulo);
    if (body.descricao !== undefined) partial.descricao = String(body.descricao);
    if (body.pessoa_id !== undefined) partial.pessoa_id = body.pessoa_id ? String(body.pessoa_id) : null;
    if (body.data_termino !== undefined) partial.data_termino = body.data_termino ? String(body.data_termino) : null;
    if (body.tag !== undefined) partial.tag = String(body.tag);
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!isValidStatus(s)) { jsonError(res, `status inválido: ${s}`, { status: 400 }); return; }
      partial.status = s;
    }
    const row = await updateAtividade(id, partial);
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    const semanaId = typeof req.query?.semanaId === 'string' ? req.query.semanaId : null;
    if (semanaId) {
      try { await assertSemanaAccess(semanaId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
      await deleteAtividadesBySemana(semanaId);
      jsonSuccess(res, { deleted: true });
      return;
    }
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id ou semanaId é obrigatório', { status: 400 }); return; }
    const atividade = await getAtividadeById(id);
    if (!atividade) { jsonError(res, 'Atividade não encontrada', { status: 404 }); return; }
    try { await assertSemanaAccess(atividade.semanaId, userId, role); } catch (err: any) {
      jsonError(res, err.message, { status: err.status ?? 403 }); return;
    }
    await deleteAtividade(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
