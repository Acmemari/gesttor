/**
 * API route for the "Defina seus campos" field configuration of Compra/Venda/Morte
 * movements (per organization + movement type). Births keep their own endpoint
 * (nascimento-field-config); this one is discriminated by `tipo`.
 *
 *   GET    ?organizationId=xxx&tipo=compra        — current config row (or { config: null })
 *   POST   { organizationId, tipo, config }        — upsert config blob { places, order, autonum }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getByOrgAndTipo, save, type MovimentoTipo } from '../src/DB/repositories/movimentoFieldConfig.js';

const TIPOS: MovimentoTipo[] = ['compra', 'venda', 'morte'];
const isTipo = (v: unknown): v is MovimentoTipo => typeof v === 'string' && (TIPOS as string[]).includes(v);

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
      const tipo = req.query?.tipo;
      if (!organizationId) {
        jsonError(res, 'organizationId obrigatório', { status: 400 });
        return;
      }
      if (!isTipo(tipo)) {
        jsonError(res, 'tipo inválido (compra|venda|morte)', { status: 400 });
        return;
      }
      const row = await getByOrgAndTipo(organizationId, tipo);
      jsonSuccess(res, row ?? { config: null });
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { organizationId, tipo, config } = req.body ?? {};
      if (!organizationId || !isTipo(tipo) || !config || typeof config !== 'object') {
        jsonError(res, 'Campos obrigatórios: organizationId, tipo (compra|venda|morte), config', { status: 400 });
        return;
      }
      const row = await save(organizationId, tipo, {
        places: config.places ?? {},
        order: Array.isArray(config.order) ? config.order : [],
        autonum: !!config.autonum,
      });
      jsonSuccess(res, row);
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[movimento-field-config] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
