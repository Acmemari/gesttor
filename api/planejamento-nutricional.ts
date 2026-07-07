/**
 * API route do Planejamento Nutricional por lote (planejamento_nutricional).
 *
 *   GET  ?loteId=xxx  — retorna o plano do lote (ou null)
 *   PUT  { organizationId, loteId, pesoInicial?, pesoVivoAbate?, rendimentoCarcaca?,
 *          metaValorVenda?, fases? } — upsert do plano (1 por lote)
 *
 * Os valores derivados (peso morto, @, peso por fase, data de abate prevista)
 * NÃO são persistidos — são calculados no front.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getByLote, upsert } from '../src/DB/repositories/planejamento-nutricional.js';

const toNumOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
      const loteId = typeof req.query?.loteId === 'string' ? req.query.loteId : '';
      if (!loteId) {
        jsonError(res, 'Informe loteId', { status: 400 });
        return;
      }
      const row = await getByLote(loteId);
      jsonSuccess(res, row);
      return;
    }

    // ── PUT / POST (upsert do plano) ─────────────────────────────────────────
    if (req.method === 'PUT' || req.method === 'POST') {
      const {
        organizationId, loteId,
        pesoInicial, pesoVivoAbate, rendimentoCarcaca, metaValorVenda, fases,
      } = req.body ?? {};

      if (!organizationId || !loteId) {
        jsonError(res, 'Campos obrigatórios: organizationId, loteId', { status: 400 });
        return;
      }

      const row = await upsert({
        organizationId,
        loteId,
        pesoInicial: toNumOrNull(pesoInicial),
        pesoVivoAbate: toNumOrNull(pesoVivoAbate),
        rendimentoCarcaca: toNumOrNull(rendimentoCarcaca),
        metaValorVenda: toNumOrNull(metaValorVenda),
        fases: Array.isArray(fases) ? fases : [],
        criadoPor: userId,
      });
      jsonSuccess(res, row);
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[planejamento-nutricional] error:', err);
    jsonError(res, err?.message || 'Erro ao salvar o planejamento nutricional. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
