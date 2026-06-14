/**
 * API route para Movimentação › Consumo/Doação.
 *
 *   GET    ?organizationId=xxx   — lista movimentos de consumo/doação da org (com fichas)
 *   GET    ?id=xxx               — busca um movimento pelo id (com fichas)
 *   POST   { organizationId, farmId?, localId?, proprietarioId?, data, safra?,
 *            retiro?, qtd, naoIdentificados, status, catDecl[], obs?, fichas[] }
 *                                — cria movimento + fichas individuais
 *   POST   { action:'add-ficha', movimentoId, apelido?, rfid?, categoriaId?,
 *            tipo?, pesoVivo?, pesoMorto?, valor?, obs? }
 *                                — adiciona uma ficha e reconcilia o movimento
 *   PUT    ?id=xxx { ...mesma forma do create (sem organizationId) }
 *                                — atualiza movimento + substitui suas fichas
 *   DELETE ?id=xxx               — exclui movimento
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listMovimentosByOrg,
  getMovimentoById,
  createMovimento,
  updateMovimento,
  addFicha,
  deleteMovimento,
} from '../src/DB/repositories/consumo.js';

const VALID_STATUS = ['pendente', 'conciliado'];

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Converte para number ou null (campos opcionais de peso/valor). */
function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

      if (action === 'add-ficha') {
        const { movimentoId, apelido, rfid, categoriaId, tipo, pesoVivo, pesoMorto, valor, obs } = body;
        if (!movimentoId || (!apelido && !rfid)) {
          jsonError(res, 'Campos obrigatórios: movimentoId e (apelido ou rfid)', { status: 400 });
          return;
        }
        const updated = await addFicha(movimentoId, {
          apelido: apelido ? String(apelido).trim() : null,
          rfid: rfid ? String(rfid).trim() : null,
          categoriaId: categoriaId || null,
          tipo: tipo || null,
          pesoVivo: toNumOrNull(pesoVivo),
          pesoMorto: toNumOrNull(pesoMorto),
          valor: toNumOrNull(valor),
          obs: obs || null,
        });
        if (!updated) {
          jsonError(res, 'Movimento não encontrado', { status: 404 });
          return;
        }
        jsonSuccess(res, updated);
        return;
      }

      // Create movimento
      const {
        organizationId, farmId, localId, proprietarioId, data, safra, retiro,
        qtd, naoIdentificados, status, catDecl, obs, fichas,
      } = body;

      if (!organizationId || !data) {
        jsonError(res, 'Campos obrigatórios: organizationId, data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      if (status && !VALID_STATUS.includes(status)) {
        jsonError(res, `status inválido. Valores: ${VALID_STATUS.join(', ')}`, { status: 400 });
        return;
      }

      const fichasArr = Array.isArray(fichas) ? fichas : [];
      const row = await createMovimento({
        organizationId,
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        qtd: Math.max(0, Math.trunc(toNum(qtd))),
        naoIdentificados: Math.max(0, Math.trunc(toNum(naoIdentificados))),
        status: status || 'pendente',
        catDecl: Array.isArray(catDecl)
          ? catDecl.map((c: any) => ({
              catId: String(c.catId),
              qtd: Math.max(0, Math.trunc(toNum(c.qtd))),
              tipo: c.tipo || null,
              pesoVivo: toNumOrNull(c.pesoVivo),
              pesoMorto: toNumOrNull(c.pesoMorto),
              valor: toNumOrNull(c.valor),
            }))
          : [],
        obs: obs || null,
        fichas: fichasArr.map((f: any) => ({
          apelido: f.apelido ? String(f.apelido).trim() : null,
          rfid: f.rfid ? String(f.rfid).trim() : null,
          categoriaId: f.catId || f.categoriaId || null,
          tipo: f.tipo || null,
          pesoVivo: toNumOrNull(f.pesoVivo),
          pesoMorto: toNumOrNull(f.pesoMorto),
          valor: toNumOrNull(f.valor),
          obs: f.obs || null,
        })),
        criadoPor: userId,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const body = req.body ?? {};
      const {
        farmId, localId, proprietarioId, data, safra, retiro,
        qtd, naoIdentificados, status, catDecl, obs, fichas,
      } = body;

      if (!data) {
        jsonError(res, 'Campo obrigatório: data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      if (status && !VALID_STATUS.includes(status)) {
        jsonError(res, `status inválido. Valores: ${VALID_STATUS.join(', ')}`, { status: 400 });
        return;
      }

      const fichasArr = Array.isArray(fichas) ? fichas : [];
      const updated = await updateMovimento(id, {
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        qtd: Math.max(0, Math.trunc(toNum(qtd))),
        naoIdentificados: Math.max(0, Math.trunc(toNum(naoIdentificados))),
        status: status || 'pendente',
        catDecl: Array.isArray(catDecl)
          ? catDecl.map((c: any) => ({
              catId: String(c.catId),
              qtd: Math.max(0, Math.trunc(toNum(c.qtd))),
              tipo: c.tipo || null,
              pesoVivo: toNumOrNull(c.pesoVivo),
              pesoMorto: toNumOrNull(c.pesoMorto),
              valor: toNumOrNull(c.valor),
            }))
          : [],
        obs: obs || null,
        fichas: fichasArr.map((f: any) => ({
          apelido: f.apelido ? String(f.apelido).trim() : null,
          rfid: f.rfid ? String(f.rfid).trim() : null,
          categoriaId: f.catId || f.categoriaId || null,
          tipo: f.tipo || null,
          pesoVivo: toNumOrNull(f.pesoVivo),
          pesoMorto: toNumOrNull(f.pesoMorto),
          valor: toNumOrNull(f.valor),
          obs: f.obs || null,
        })),
      });
      if (!updated) {
        jsonError(res, 'Movimento não encontrado', { status: 404 });
        return;
      }
      jsonSuccess(res, updated);
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
    console.error('[consumo] error:', err);
    jsonError(res, 'Erro ao processar consumo/doação. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
