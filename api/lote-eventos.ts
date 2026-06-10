/**
 * API route do ledger de eventos da Gestão de Lotes (lote_eventos).
 *
 *   GET    ?organizationId=xxx   — lista eventos da org (para derivar estados de todos os lotes)
 *   GET    ?loteId=xxx           — lista eventos de um lote
 *   POST   { organizationId, loteId, tipo, data, resp?, dados, syncFichas? } — empilha um evento
 *
 * Eventos são IMUTÁVEIS — sem PUT/DELETE. Correções são novos eventos.
 * Alocação entre lotes gera um evento espelho no outro lote (ver repositório).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listByOrganization,
  listByLote,
  create,
} from '../src/DB/repositories/lote-eventos.js';

const VALID_TIPOS = ['alocacao', 'transferencia', 'manejo', 'repro'];

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
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';
      if (loteId) {
        const rows = await listByLote(loteId);
        jsonSuccess(res, rows);
        return;
      }
      if (organizationId) {
        const rows = await listByOrganization(organizationId);
        jsonSuccess(res, rows);
        return;
      }
      jsonError(res, 'Informe organizationId ou loteId', { status: 400 });
      return;
    }

    // ── POST (empilha evento) ────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { organizationId, loteId, tipo, data, resp, dados, syncFichas } = req.body ?? {};

      if (!organizationId || !loteId || !tipo || !data) {
        jsonError(res, 'Campos obrigatórios: organizationId, loteId, tipo, data', { status: 400 });
        return;
      }
      if (!VALID_TIPOS.includes(tipo)) {
        jsonError(res, `tipo inválido. Suportado: ${VALID_TIPOS.join(', ')}`, { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      const dadosObj = dados && typeof dados === 'object' ? dados : {};

      // Regra de negócio: "saída" exige um lote de destino (outroLoteId).
      if (tipo === 'alocacao' && dadosObj.sentido === 'saida' && !dadosObj.outroLoteId) {
        jsonError(res, 'Alocação de saída exige um lote de destino', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        loteId,
        tipo,
        data: String(data),
        resp: resp != null && String(resp).trim() ? String(resp).trim() : null,
        dados: dadosObj,
        criadoPor: userId,
        syncFichas: !!syncFichas,
      });
      jsonSuccess(res, row);
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[lote-eventos] error:', err);
    jsonError(res, err?.message || 'Erro ao processar eventos do lote. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
