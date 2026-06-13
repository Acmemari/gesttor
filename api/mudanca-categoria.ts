/**
 * API route para Movimentação › Mudança de Categoria.
 *
 *   GET    ?organizationId=xxx   — lista movimentos de mudança de categoria (com fichas)
 *   GET    ?id=xxx               — busca um movimento pelo id (com fichas)
 *   POST   { action:'change', organizationId, data, farmId?, localId?, retiro?,
 *            proprietarioId?, safra?, apelido?, rfid?, categoriaOrigemId?,
 *            categoriaDestinoId, peso?, valor?, sexo?, nascimentoFichaId?, obs? }
 *                                — muda a categoria de UM animal (upsert em fichas_animal).
 *   POST   { action:'declare', organizationId, data, farmId?, localId?, retiro?,
 *            proprietarioId?, safra?, categoriaOrigemId?, categoriaDestinoId,
 *            qtd, peso?, valor?, obs? }
 *                                — declara uma mudança coletiva (por quantidade).
 *   DELETE ?id=xxx               — exclui o movimento (não reverte categorias)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listMovimentosByOrg,
  getMovimentoById,
  changeCategoryAnimal,
  declareCategoryChange,
  deleteMovimento,
} from '../src/DB/repositories/mudancaCategoria.js';

/** Normaliza numérico: aceita vírgula decimal; vazio/inválido → null. */
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

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body ?? {};
      const { action } = body;

      if (action !== 'change' && action !== 'declare') {
        jsonError(res, "action inválida (esperado 'change' ou 'declare')", { status: 400 });
        return;
      }

      const {
        organizationId, farmId, localId, proprietarioId, data, safra, retiro,
        categoriaOrigemId, categoriaDestinoId, peso, valor, obs,
      } = body;

      if (!organizationId || !data) {
        jsonError(res, 'Campos obrigatórios: organizationId, data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      if (!categoriaDestinoId) {
        jsonError(res, 'Campo obrigatório: categoriaDestinoId (entrada)', { status: 400 });
        return;
      }

      // ── action: 'change' (por animal) ──────────────────────────────────────
      if (action === 'change') {
        const { apelido, rfid, sexo, nascimentoFichaId } = body;
        if (!apelido && !rfid) {
          jsonError(res, 'Informe o animal (apelido ou rfid)', { status: 400 });
          return;
        }
        const row = await changeCategoryAnimal({
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
          valor: normalizeNumeric(valor),
          sexo: sexo || null,
          nascimentoFichaId: nascimentoFichaId || null,
          obs: obs || null,
          criadoPor: userId,
        });
        jsonSuccess(res, row);
        return;
      }

      // ── action: 'declare' (coletivo) ───────────────────────────────────────
      const qtd = Math.trunc(Number(body.qtd) || 0);
      if (!qtd || qtd <= 0) {
        jsonError(res, 'Informe a quantidade (qtd > 0)', { status: 400 });
        return;
      }
      const row = await declareCategoryChange({
        organizationId,
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        categoriaOrigemId: categoriaOrigemId || null,
        categoriaDestinoId,
        qtd,
        peso: normalizeNumeric(peso),
        valor: normalizeNumeric(valor),
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
    console.error('[mudanca-categoria] error:', err);
    jsonError(res, 'Erro ao processar mudança de categoria. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
