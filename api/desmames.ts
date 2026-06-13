/**
 * API route para Movimentação › Desmame.
 *
 *   GET    ?organizationId=xxx   — lista movimentos de desmame da org (com fichas)
 *   GET    ?id=xxx               — busca um movimento pelo id (com fichas)
 *   POST   { action:'wean', organizationId, data, farmId?, localId?, retiro?,
 *            proprietarioId?, safra?, apelido?, rfid?, categoriaOrigemId?,
 *            categoriaDestinoId, peso?, sexo?, nascimentoFichaId?, obs? }
 *                                — desmama um animal: muda a categoria atual
 *                                  (upsert em fichas_animal) e registra o evento.
 *   DELETE ?id=xxx               — exclui o movimento (não reverte categorias)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listMovimentosByOrg,
  getMovimentoById,
  weanAnimal,
  deleteMovimento,
} from '../src/DB/repositories/desmames.js';

/** Normaliza peso em kg: aceita vírgula decimal; vazio/ inválido → null. */
function normalizeNumeric(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  return Number.isFinite(Number(s)) ? s : null;
}

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
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';

      if (id) {
        const row = await getMovimentoById(id);
        jsonSuccess(res, row);
        return;
      }
      if (organizationId) {
        const rows = await listMovimentosByOrg(organizationId);
        jsonSuccess(res, rows);
        return;
      }
      jsonError(res, 'Informe organizationId ou id', { status: 400 });
      return;
    }

    // ── POST (action: 'wean') ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body ?? {};
      const { action } = body;

      if (action !== 'wean') {
        jsonError(res, "action inválida (esperado 'wean')", { status: 400 });
        return;
      }

      const {
        organizationId, farmId, localId, proprietarioId, data, safra, retiro,
        apelido, rfid, categoriaOrigemId, categoriaDestinoId, peso, sexo,
        nascimentoFichaId, obs,
      } = body;

      if (!organizationId || !data) {
        jsonError(res, 'Campos obrigatórios: organizationId, data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      if (!apelido && !rfid) {
        jsonError(res, 'Informe o animal (apelido ou rfid)', { status: 400 });
        return;
      }
      if (!categoriaDestinoId) {
        jsonError(res, 'Campo obrigatório: categoriaDestinoId', { status: 400 });
        return;
      }

      const row = await weanAnimal({
        organizationId,
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        apelido: apelido ? String(apelido).trim() : null,
        rfid: rfid ? String(rfid).trim() : null,
        categoriaOrigemId: categoriaOrigemId || null,
        categoriaDestinoId,
        peso: normalizeNumeric(peso),
        sexo: sexo || null,
        nascimentoFichaId: nascimentoFichaId || null,
        obs: obs || null,
        criadoPor: userId,
      });
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
      await deleteMovimento(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[desmames] error:', err);
    jsonError(res, 'Erro ao processar desmame. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
