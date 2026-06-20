/**
 * API route for estação de monta.
 *
 *   GET    ?organizationId=xxx                                        — list for org
 *   POST   { organizationId, montaInicio, montaFim, farmId?, retiro? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }                — reorder
 *   PATCH  { id, montaInicio?, montaFim?, farmId?, retiro? }           — update
 *   DELETE ?id=xxx                                                    — delete
 *
 * Período de Nascimento e Safra são derivados no repositório (monta + 281 dias,
 * safra julho→julho) — o cliente não precisa enviá-los.
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
} from '../src/DB/repositories/estacao-monta.js';

/** Valida 'YYYY-MM-DD'. */
const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
      const { organizationId, farmId, retiro, montaInicio, montaFim } = req.body ?? {};
      if (!organizationId) {
        jsonError(res, 'Campo obrigatório: organizationId', { status: 400 });
        return;
      }
      if (!isISODate(montaInicio) || !isISODate(montaFim)) {
        jsonError(res, 'Período da Monta obrigatório (montaInicio e montaFim em YYYY-MM-DD)', { status: 400 });
        return;
      }
      if (montaFim < montaInicio) {
        jsonError(res, 'Fim da monta não pode ser anterior ao início', { status: 400 });
        return;
      }

      const optTxt = (v: unknown) =>
        v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;

      const row = await create({
        organizationId,
        farmId: optTxt(farmId),
        retiro: optTxt(retiro),
        montaInicio,
        montaFim,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, farmId, retiro, montaInicio, montaFim } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      if (montaInicio !== undefined && !isISODate(montaInicio)) {
        jsonError(res, 'montaInicio inválida (YYYY-MM-DD)', { status: 400 });
        return;
      }
      if (montaFim !== undefined && !isISODate(montaFim)) {
        jsonError(res, 'montaFim inválida (YYYY-MM-DD)', { status: 400 });
        return;
      }

      const payload: Record<string, any> = {};
      if (farmId !== undefined) payload.farmId = farmId === null ? null : (String(farmId).trim() || null);
      if (retiro !== undefined) payload.retiro = retiro === null ? null : (String(retiro).trim() || null);
      if (montaInicio !== undefined) payload.montaInicio = montaInicio;
      if (montaFim !== undefined) payload.montaFim = montaFim;

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
    console.error('[estacao-monta] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
