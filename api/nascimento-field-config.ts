/**
 * API route for the births "Lançamento Rápido" field configuration (per organization).
 *
 *   GET    ?organizationId=xxx        — current config row (or { config: null })
 *   POST   { organizationId, config } — upsert config blob { places, order, autonum }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getByOrg, save } from '../src/DB/repositories/nascimentoFieldConfig.js';

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
      const row = await getByOrg(organizationId);
      jsonSuccess(res, row ?? { config: null });
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { organizationId, config } = req.body ?? {};
      if (!organizationId || !config || typeof config !== 'object') {
        jsonError(res, 'Campos obrigatórios: organizationId, config', { status: 400 });
        return;
      }
      const row = await save(organizationId, {
        places: config.places ?? {},
        order: Array.isArray(config.order) ? config.order : [],
        autonum: !!config.autonum,
      });
      jsonSuccess(res, row);
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[nascimento-field-config] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
