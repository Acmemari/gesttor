/**
 * API route for regimes alimentares.
 *
 *   GET    ?organizationId=xxx                                                 — list for org
 *   POST   { organizationId, nome, codigoCurto, tipo, nivelIngestaoValor?, ...} — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }                         — reorder
 *   PATCH  { id, ...campos }                                                   — update
 *   DELETE ?id=xxx                                                             — delete
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
  listHistory,
  addHistoryEntry,
  removeHistoryEntry,
} from '../src/DB/repositories/regimes-alimentares.js';

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
      const action = typeof req.query?.action === 'string' ? req.query.action : '';
      if (action === 'history') {
        const regimeId = typeof req.query?.regimeId === 'string' ? req.query.regimeId : '';
        if (!regimeId) {
          jsonError(res, 'regimeId obrigatório', { status: 400 });
          return;
        }
        const history = await listHistory(regimeId);
        jsonSuccess(res, history);
        return;
      }

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

      // Add History entry
      if (action === 'add-history') {
        const {
          regimeAlimentarId,
          dataVigencia,
          custoQuilo,
          formulacao,
          anexoUrl,
          anexoNome,
        } = req.body;

        if (!regimeAlimentarId || !dataVigencia || custoQuilo === undefined || custoQuilo === null) {
          jsonError(res, 'Campos obrigatórios: regimeAlimentarId, dataVigencia, custoQuilo', { status: 400 });
          return;
        }

        const row = await addHistoryEntry({
          regimeAlimentarId,
          dataVigencia,
          custoQuilo,
          formulacao,
          anexoUrl,
          anexoNome,
        });
        jsonSuccess(res, row);
        return;
      }

      // Delete History entry
      if (action === 'delete-history') {
        const { id, regimeAlimentarId } = req.body;
        if (!id || !regimeAlimentarId) {
          jsonError(res, 'Campos obrigatórios: id, regimeAlimentarId', { status: 400 });
          return;
        }
        await removeHistoryEntry(id, regimeAlimentarId);
        jsonSuccess(res, { deleted: true });
        return;
      }

      // Create
      const {
        organizationId,
        nome,
        codigoCurto,
        tipo,
        nivelIngestaoValor,
        nivelIngestaoTipo,
        custoQuilo,
        anexoUrl,
        anexoNome,
      } = req.body ?? {};

      if (!organizationId || !nome || !String(nome).trim() || !codigoCurto || !String(codigoCurto).trim() || !tipo || !String(tipo).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome, codigoCurto, tipo', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        codigoCurto: String(codigoCurto).trim(),
        tipo: String(tipo).trim(),
        nivelIngestaoValor: nivelIngestaoValor !== undefined && nivelIngestaoValor !== null ? String(nivelIngestaoValor).trim() || null : null,
        nivelIngestaoTipo: nivelIngestaoTipo !== undefined && nivelIngestaoTipo !== null ? String(nivelIngestaoTipo).trim() || null : null,
        custoQuilo: custoQuilo !== undefined && custoQuilo !== null ? String(custoQuilo).trim() || null : null,
        anexoUrl: anexoUrl !== undefined && anexoUrl !== null ? String(anexoUrl).trim() || null : null,
        anexoNome: anexoNome !== undefined && anexoNome !== null ? String(anexoNome).trim() || null : null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const {
        id,
        nome,
        codigoCurto,
        tipo,
        nivelIngestaoValor,
        nivelIngestaoTipo,
        custoQuilo,
        anexoUrl,
        anexoNome,
        ativo,
      } = req.body ?? {};

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
      if (codigoCurto !== undefined) {
        if (!String(codigoCurto).trim()) {
          jsonError(res, 'codigoCurto não pode ser vazio', { status: 400 });
          return;
        }
        payload.codigoCurto = String(codigoCurto).trim();
      }
      if (tipo !== undefined) {
        if (!String(tipo).trim()) {
          jsonError(res, 'tipo não pode ser vazio', { status: 400 });
          return;
        }
        payload.tipo = String(tipo).trim();
      }
      if (nivelIngestaoValor !== undefined) {
        payload.nivelIngestaoValor = nivelIngestaoValor === null ? null : (String(nivelIngestaoValor).trim() || null);
      }
      if (nivelIngestaoTipo !== undefined) {
        payload.nivelIngestaoTipo = nivelIngestaoTipo === null ? null : (String(nivelIngestaoTipo).trim() || null);
      }
      if (custoQuilo !== undefined) {
        payload.custoQuilo = custoQuilo === null ? null : (String(custoQuilo).trim() || null);
      }
      if (anexoUrl !== undefined) {
        payload.anexoUrl = anexoUrl === null ? null : (String(anexoUrl).trim() || null);
      }
      if (anexoNome !== undefined) {
        payload.anexoNome = anexoNome === null ? null : (String(anexoNome).trim() || null);
      }
      if (ativo !== undefined) {
        payload.ativo = Boolean(ativo);
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
    console.error('[regimes-alimentares] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
