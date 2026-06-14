/**
 * API route para Movimentação › Compras (Compra Peso Vivo · versão lote).
 *
 *   GET    ?organizationId=xxx   — lista compras da org (com itens)
 *   GET    ?id=xxx               — busca uma compra pelo id (com itens)
 *   POST   { organizationId, farmId?, localId?, proprietarioId?, clienteId?, data,
 *            safra?, retiro?, tipoVenda, tipoPeso, obs?,
 *            itens[{ categoriaId?, qtd, idadeMeses?, pesoVivoKg?, valorArroba?, pesoMortoTotal? }],
 *            fichas[{ categoriaId?, idManejo?, idEletronico?, pesoVivoKg?, pesoMortoKg?, valorArroba? }] }
 *                                — cria a compra + itens (coletivo) + fichas (individual/Com ID)
 *   PUT    ?id=xxx { ...mesma forma do create (sem organizationId) }
 *   DELETE ?id=xxx               — exclui a compra
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listMovimentosByOrg,
  getMovimentoById,
  createMovimento,
  updateMovimento,
  deleteMovimento,
  type CompraItemInput,
  type CompraFichaInput,
} from '../src/DB/repositories/compras.js';

const VALID_STATUS = ['pendente', 'conciliado'];
const VALID_TIPO_VENDA = ['abate', 'pe'];
const VALID_TIPO_PESO = ['arroba', 'kg'];

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Número opcional: null quando vazio/ausente, senão o número finito. */
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza os itens recebidos do corpo. */
function normalizeItens(raw: unknown): CompraItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it: any) => ({
    categoriaId: it.categoriaId || it.catId || null,
    qtd: Math.max(0, Math.trunc(toNum(it.qtd))),
    idadeMeses: it.idadeMeses != null && it.idadeMeses !== '' ? Math.max(0, Math.trunc(toNum(it.idadeMeses))) : null,
    pesoVivoKg: toNumOrNull(it.pesoVivoKg),
    valorArroba: toNumOrNull(it.valorArroba),
    pesoMortoTotal: toNumOrNull(it.pesoMortoTotal),
    desconto: toNumOrNull(it.desconto),
  }));
}

/** Normaliza as fichas (animais detalhados por ID) recebidas do corpo. */
function normalizeFichas(raw: unknown): CompraFichaInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f: any) => ({
      categoriaId: f.categoriaId || f.catId || null,
      apelido: (f.apelido ?? f.idManejo ?? '').toString().trim() || null,
      rfid: (f.rfid ?? f.idEletronico ?? '').toString().trim() || null,
      pesoVivoKg: toNumOrNull(f.pesoVivoKg),
      pesoMortoKg: toNumOrNull(f.pesoMortoKg),
      valorArroba: toNumOrNull(f.valorArroba),
      extras: f.extras && typeof f.extras === 'object' && !Array.isArray(f.extras) ? f.extras : {},
    }))
    .filter((f) => f.apelido || f.rfid);
}

/**
 * Cálculos consolidados da Compra (Peso Vivo / R$/kg).
 */
function computeCompra(itens: CompraItemInput[], tipoVenda: string, tipoPeso: string, descontoPercent: number | null) {
  const qtd = itens.reduce((a, it) => a + (it.qtd || 0), 0);

  const totalPesoLiquido = itens.reduce((a, it) => {
    const desc = it.desconto ?? descontoPercent ?? 0;
    const pBruto = it.pesoMortoTotal ?? 0;
    return a + pBruto * (1 - desc / 100);
  }, 0);

  const valorTotalRaw = itens.reduce((a, it) => {
    const desc = it.desconto ?? descontoPercent ?? 0;
    const pBruto = it.pesoMortoTotal ?? 0;
    const pLiquido = pBruto * (1 - desc / 100);
    const vKg = it.valorArroba ?? 0;
    return a + (pLiquido > 0 && vKg > 0 ? pLiquido * vKg : 0);
  }, 0);

  const valorTotal = valorTotalRaw > 0 ? valorTotalRaw : null;
  const valorKgMedio = valorTotal != null && totalPesoLiquido > 0 ? valorTotal / totalPesoLiquido : null;

  return {
    qtd,
    valorArroba: valorKgMedio,
    pesoMortoTotal: totalPesoLiquido > 0 ? totalPesoLiquido : null,
    pesoMortoArroba: null,
    valorTotal,
    rendimento: null,
  };
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

    // ── POST (create) ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body ?? {};
      const {
        organizationId, farmId, localId, proprietarioId, clienteId, data, safra, retiro,
        tipoVenda, tipoPeso, status, obs, itens, fichas, desconto,
      } = body;

      if (!organizationId || !data) {
        jsonError(res, 'Campos obrigatórios: organizationId, data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      const tv = tipoVenda || 'pe';
      const tp = tipoPeso || 'kg';

      const itensArr = normalizeItens(itens);
      const fichasArr = normalizeFichas(fichas);
      const calc = computeCompra(itensArr, tv, tp, toNumOrNull(desconto));

      const row = await createMovimento({
        organizationId,
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        clienteId: clienteId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        tipoVenda: tv,
        tipoPeso: tp,
        valorArroba: calc.valorArroba,
        pesoMortoTotal: calc.pesoMortoTotal,
        qtd: calc.qtd + fichasArr.length,
        valorTotal: calc.valorTotal,
        pesoMortoArroba: calc.pesoMortoArroba,
        rendimento: calc.rendimento,
        status: status || 'conciliado',
        obs: obs || null,
        desconto: toNumOrNull(desconto),
        itens: itensArr,
        fichas: fichasArr,
        criadoPor: userId,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PUT (update) ───────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const body = req.body ?? {};
      const {
        farmId, localId, proprietarioId, clienteId, data, safra, retiro,
        tipoVenda, tipoPeso, status, obs, itens, fichas, desconto,
      } = body;

      if (!data) {
        jsonError(res, 'Campo obrigatório: data', { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }
      const tv = tipoVenda || 'pe';
      const tp = tipoPeso || 'kg';

      const itensArr = normalizeItens(itens);
      const fichasArr = normalizeFichas(fichas);
      const calc = computeCompra(itensArr, tv, tp, toNumOrNull(desconto));

      const updated = await updateMovimento(id, {
        farmId: farmId || null,
        localId: localId || null,
        proprietarioId: proprietarioId || null,
        clienteId: clienteId || null,
        data,
        safra: safra || null,
        retiro: retiro || null,
        tipoVenda: tv,
        tipoPeso: tp,
        valorArroba: calc.valorArroba,
        pesoMortoTotal: calc.pesoMortoTotal,
        qtd: calc.qtd + fichasArr.length,
        valorTotal: calc.valorTotal,
        pesoMortoArroba: calc.pesoMortoArroba,
        rendimento: calc.rendimento,
        status: status || 'conciliado',
        obs: obs || null,
        desconto: toNumOrNull(desconto),
        itens: itensArr,
        fichas: fichasArr,
      });
      if (!updated) {
        jsonError(res, 'Compra não encontrada', { status: 404 });
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
    console.error('[compras] error:', err);
    jsonError(res, 'Erro ao processar compras. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
