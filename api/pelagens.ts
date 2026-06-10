/**
 * API route for pelagens.
 *
 *   GET    ?organizationId=xxx              — list pelagens for org (auto-seed defaults if empty)
 *   POST   { organizationId, descricao, bovino, equideo, observacao? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] } — reorder
 *   PATCH  { id, descricao?, bovino?, equideo?, observacao? }          — update
 *   DELETE ?id=xxx                                      — delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listByOrganization,
  create,
  update,
  remove,
  reorder,
} from '../src/DB/repositories/pelagens.js';

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
    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';
      if (!organizationId) {
        jsonError(res, 'organizationId obrigatório', { status: 400 });
        return;
      }
      const rows = await listByOrganization(organizationId);
      jsonSuccess(res, rows);
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action } = req.body ?? {};

      // Reorder action
      if (action === 'reorder') {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          jsonError(res, 'items obrigatório (array de {id, ordem})', { status: 400 });
          return;
        }
        await reorder(items);
        jsonSuccess(res, { reordered: true });
        return;
      }

      // Create
      const { organizationId, descricao, bovino, equideo, observacao, imagens } = req.body ?? {};
      if (!organizationId || !descricao || !String(descricao).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, descricao', { status: 400 });
        return;
      }

      if (!bovino && !equideo) {
        jsonError(res, 'Deve selecionar pelo menos Bovino ou Equídeo', { status: 400 });
        return;
      }

      if (imagens !== undefined && !Array.isArray(imagens)) {
        jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        descricao: String(descricao).trim(),
        bovino: !!bovino,
        equideo: !!equideo,
        observacao: observacao !== undefined && observacao !== null ? String(observacao).trim() || null : null,
        imagens: Array.isArray(imagens) ? imagens.map(String) : [],
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, descricao, bovino, equideo, observacao, imagens } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }

      const payload: Record<string, any> = {};
      if (descricao !== undefined) {
        if (!String(descricao).trim()) {
          jsonError(res, 'descricao não pode ser vazia', { status: 400 });
          return;
        }
        payload.descricao = String(descricao).trim();
      }
      if (bovino !== undefined) payload.bovino = !!bovino;
      if (equideo !== undefined) payload.equideo = !!equideo;
      if (observacao !== undefined) payload.observacao = observacao === null ? null : (String(observacao).trim() || null);
      if (imagens !== undefined) {
        if (!Array.isArray(imagens)) {
          jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
          return;
        }
        payload.imagens = imagens.map(String);
      }

      const row = await update(id, payload);
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      await remove(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[pelagens] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
