/**
 * API route for tipos de chifre (aspas) do rebanho.
 *
 *   GET    ?organizationId=xxx                            — list tipos for org
 *   POST   { organizationId, nome, descricao? }           — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }    — reorder
 *   PATCH  { id, nome?, descricao?, ativo? }              — update
 *   DELETE ?id=xxx                                        — delete
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
} from '../src/DB/repositories/tipos-chifre.js';

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
      const { organizationId, nome, descricao } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        descricao: descricao !== undefined && descricao !== null ? String(descricao).trim() || null : null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, descricao, ativo } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }

      const payload: Record<string, any> = {};
      if (nome !== undefined) {
        if (!String(nome).trim()) {
          jsonError(res, 'nome não pode ser vazio', { status: 400 });
          return;
        }
        payload.nome = String(nome).trim();
      }
      if (descricao !== undefined) payload.descricao = descricao === null ? null : (String(descricao).trim() || null);
      if (ativo !== undefined) payload.ativo = Boolean(ativo);

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
    console.error('[tipos-chifre] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
