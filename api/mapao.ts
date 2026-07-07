/**
 * API route para Mapa Rebanho - Mapão (lançamento periódico).
 *
 * Mesma estrutura do Estoque de Partida, porém o usuário pode lançar o mapa
 * periodicamente: vários mapas por fazenda (um por data de referência).
 *
 * Headers (cabeçalho do mapa):
 *   GET    ?organizationId=xxx                    — lista todos os mapas da org
 *   GET    ?farmId=xxx                            — lista mapas da fazenda
 *   GET    ?headerId=xxx                          — busca um mapa pelo id
 *   GET    ?farmId=xxx&dataReferencia=AAAA-MM-DD  — busca mapa por fazenda+data
 *   POST   { organizationId, farmId, dataReferencia, observacao? } — cria
 *   PATCH  { id, status?, observacao?, dataReferencia? }           — atualiza
 *   DELETE ?headerId=xxx                          — exclui mapa
 *
 * Lançamentos (células da matriz):
 *   GET    ?lancamentosHeaderId=xxx                — lista células do mapa
 *   POST   { action:'upsert-lancamento', mapaHeaderId, localId, categoriaId, quantidade, pesoKgCabeca }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listHeadersByOrg,
  listHeadersByFarm,
  getHeaderById,
  getHeaderByFarmDate,
  createHeader,
  updateHeader,
  deleteHeader,
  listLancamentosByHeader,
  upsertLancamento,
} from '../src/DB/repositories/mapao.js';

const VALID_STATUS = ['rascunho', 'salvo'];
const VALID_DIST_MODO = ['pasto', 'categoria'];

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
      const lancamentosHeaderId = typeof req.query?.lancamentosHeaderId === 'string' ? req.query.lancamentosHeaderId : '';
      const headerId = typeof req.query?.headerId === 'string' ? req.query.headerId : '';
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      const dataReferencia = typeof req.query?.dataReferencia === 'string' ? req.query.dataReferencia : '';

      if (lancamentosHeaderId) {
        const rows = await listLancamentosByHeader(lancamentosHeaderId);
        jsonSuccess(res, rows);
        return;
      }
      if (headerId) {
        const row = await getHeaderById(headerId);
        jsonSuccess(res, row);
        return;
      }
      if (farmId && dataReferencia) {
        const row = await getHeaderByFarmDate(farmId, dataReferencia);
        jsonSuccess(res, row);
        return;
      }
      if (farmId) {
        const rows = await listHeadersByFarm(farmId);
        jsonSuccess(res, rows);
        return;
      }
      if (organizationId) {
        const rows = await listHeadersByOrg(organizationId);
        jsonSuccess(res, rows);
        return;
      }
      jsonError(res, 'Informe organizationId, farmId, headerId ou lancamentosHeaderId', { status: 400 });
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action } = req.body ?? {};

      if (action === 'upsert-lancamento') {
        const { mapaHeaderId, localId, categoriaId, quantidade, pesoKgCabeca } = req.body;
        if (!mapaHeaderId || !localId || !categoriaId) {
          jsonError(res, 'Campos obrigatórios: mapaHeaderId, localId, categoriaId', { status: 400 });
          return;
        }
        const header = await getHeaderById(mapaHeaderId);
        if (!header) {
          jsonError(res, 'Mapa não encontrado', { status: 404 });
          return;
        }
        if (header.status === 'salvo') {
          jsonError(res, 'Mapa está com status "salvo". Mude para "rascunho" para editar.', { status: 409 });
          return;
        }
        const qtd = Number.isFinite(Number(quantidade)) ? Math.max(0, Math.trunc(Number(quantidade))) : 0;
        const pesoNum = Number.isFinite(Number(pesoKgCabeca)) ? Math.max(0, Number(pesoKgCabeca)) : 0;
        const row = await upsertLancamento({
          mapaHeaderId,
          localId,
          categoriaId,
          quantidade: qtd,
          pesoKgCabeca: pesoNum.toFixed(2),
        });
        jsonSuccess(res, row);
        return;
      }

      // Create header
      const { organizationId, farmId, dataReferencia, observacao } = req.body ?? {};
      if (!organizationId || !farmId || !dataReferencia) {
        jsonError(res, 'Campos obrigatórios: organizationId, farmId, dataReferencia', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataReferencia))) {
        jsonError(res, 'dataReferencia deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      // Diferente do Estoque de Partida: permitimos N mapas por fazenda. Apenas
      // bloqueamos duplicidade de (fazenda, data de referência).
      const existing = await getHeaderByFarmDate(farmId, dataReferencia);
      if (existing) {
        jsonError(res, 'Já existe um mapa para esta fazenda nesta data de referência', { status: 409 });
        return;
      }
      const row = await createHeader({
        organizationId,
        farmId,
        dataReferencia,
        observacao: observacao?.trim() || null,
        criadoPor: userId,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, status, observacao, dataReferencia, distribuicaoModo } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      if (status && !VALID_STATUS.includes(status)) {
        jsonError(res, `status inválido. Valores: ${VALID_STATUS.join(', ')}`, { status: 400 });
        return;
      }
      if (
        distribuicaoModo !== undefined &&
        distribuicaoModo !== null &&
        !VALID_DIST_MODO.includes(distribuicaoModo)
      ) {
        jsonError(res, `distribuicaoModo inválido. Valores: ${VALID_DIST_MODO.join(', ')} ou null`, { status: 400 });
        return;
      }
      if (dataReferencia && !/^\d{4}-\d{2}-\d{2}$/.test(String(dataReferencia))) {
        jsonError(res, 'dataReferencia deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      // Se a data está sendo alterada, evita colidir com outro mapa da mesma fazenda.
      if (dataReferencia !== undefined) {
        const current = await getHeaderById(id);
        if (current) {
          const clash = await getHeaderByFarmDate(current.farmId, dataReferencia);
          if (clash && clash.id !== id) {
            jsonError(res, 'Já existe um mapa para esta fazenda nesta data de referência', { status: 409 });
            return;
          }
        }
      }
      const payload: Record<string, any> = {};
      if (status !== undefined) payload.status = status;
      if (observacao !== undefined) payload.observacao = observacao?.trim() || null;
      if (dataReferencia !== undefined) payload.dataReferencia = dataReferencia;
      if (distribuicaoModo !== undefined) payload.distribuicaoModo = distribuicaoModo ?? null;
      const row = await updateHeader(id, payload);
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const headerId = typeof req.query?.headerId === 'string' ? req.query.headerId : '';
      if (!headerId) {
        jsonError(res, 'headerId obrigatório', { status: 400 });
        return;
      }
      await deleteHeader(headerId);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[mapao] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
