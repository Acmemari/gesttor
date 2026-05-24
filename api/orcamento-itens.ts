/**
 * API de itens de orçamento (planilha de despesas).
 *
 * GET   /api/orcamento-itens?versaoId=xxx&farmId=yyy&numeroRaiz=5
 *   → { ok, data: PlanilhaResult } (contas + itens existentes + versao + orcamento)
 *
 * PATCH /api/orcamento-itens
 *   body: { versaoId, farmId, edicoes: [{ planoContaId, valoresMensais }] }
 *   → { ok, data: { atualizadas, criadas, removidas } }
 *   Bloqueia 409 se versao.imutavel=true ou versao.tipo='em_aprovacao'.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertFarmAccess, getUserRole } from './_lib/orgAccess.js';
import {
  listarPlanilha,
  getOrcamentoIdByVersao,
  type EdicaoInput,
} from '../src/DB/repositories/itensOrcamento.js';
import { upsertShadowFromCelula } from '../src/DB/repositories/lancamentosOrcamento.js';
import { appendAudit } from '../src/DB/repositories/auditoriaOrcamento.js';
import { db } from '../src/DB/index.js';
import { orcamentoVersoes } from '../src/DB/schema.js';

const RAIZES_VALIDAS = ['2', '3', '4', '5', '6', '8'];
const MAX_EDICOES = 1000;

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

  let role: string;
  try {
    role = await getUserRole(userId);
  } catch (err) {
    const e = err as { status?: number; code?: string; message: string };
    jsonError(res, e.message, { code: e.code, status: e.status ?? 401 });
    return;
  }

  if (req.method !== 'GET') {
    const rl = await checkCrudRateLimit({ userId });
    if (!rl.allowed) {
      jsonError(res, 'Muitas requisições.', { status: 429 });
      return;
    }
  }

  // ─── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const versaoId = typeof req.query?.versaoId === 'string' ? req.query.versaoId : null;
    const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;
    const numeroRaiz = typeof req.query?.numeroRaiz === 'string' ? req.query.numeroRaiz : null;

    if (!versaoId || !farmId) {
      jsonError(res, 'versaoId e farmId são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (numeroRaiz && !RAIZES_VALIDAS.includes(numeroRaiz)) {
      jsonError(res, `numeroRaiz inválido. Use: ${RAIZES_VALIDAS.join(', ')}`, {
        code: 'VALIDATION',
        status: 400,
      });
      return;
    }

    try {
      await assertFarmAccess(farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    // Sem numeroRaiz → traz todas as raízes de despesa.
    const numerosRaizes = numeroRaiz ? [numeroRaiz] : RAIZES_VALIDAS;
    const result = await listarPlanilha({ versaoId, farmId, numerosRaizes });
    if (!result) {
      jsonError(res, 'Versão ou orçamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    jsonSuccess(res, result);
    return;
  }

  // ─── PATCH ───────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as { versaoId?: string; farmId?: string; edicoes?: EdicaoInput[] };

    if (!body?.versaoId || !body?.farmId) {
      jsonError(res, 'versaoId e farmId são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!Array.isArray(body?.edicoes)) {
      jsonError(res, 'edicoes deve ser um array', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (body.edicoes.length === 0) {
      jsonSuccess(res, { atualizadas: 0, criadas: 0, removidas: 0 });
      return;
    }
    if (body.edicoes.length > MAX_EDICOES) {
      jsonError(res, `máximo de ${MAX_EDICOES} edições por requisição`, {
        code: 'VALIDATION',
        status: 400,
      });
      return;
    }
    for (const e of body.edicoes) {
      if (!e?.planoContaId || typeof e.valoresMensais !== 'object' || e.valoresMensais === null) {
        jsonError(res, 'cada edição deve ter { planoContaId, valoresMensais }', {
          code: 'VALIDATION',
          status: 400,
        });
        return;
      }
      for (const [chave, valor] of Object.entries(e.valoresMensais)) {
        // chave esperada: 'YYYY-MM-DD'
        if (!/^\d{4}-\d{2}-\d{2}$/.test(chave)) {
          jsonError(res, `chave de mês inválida: ${chave}`, { code: 'VALIDATION', status: 400 });
          return;
        }
        if (valor !== null && (typeof valor !== 'number' || !Number.isFinite(valor))) {
          jsonError(res, `valor inválido para ${chave}`, { code: 'VALIDATION', status: 400 });
          return;
        }
        if (typeof valor === 'number' && Math.abs(valor) > 1e12) {
          jsonError(res, `valor fora de range para ${chave}`, { code: 'VALIDATION', status: 400 });
          return;
        }
      }
    }

    try {
      await assertFarmAccess(body.farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    // Verifica trava da versão
    const [versao] = await db
      .select({
        id: orcamentoVersoes.id,
        orcamentoId: orcamentoVersoes.orcamentoId,
        tipo: orcamentoVersoes.tipo,
        imutavel: orcamentoVersoes.imutavel,
      })
      .from(orcamentoVersoes)
      .where(eq(orcamentoVersoes.id, body.versaoId))
      .limit(1);
    if (!versao) {
      jsonError(res, 'Versão não encontrada', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    if (versao.imutavel || versao.tipo === 'em_aprovacao' || versao.tipo === 'arquivado') {
      jsonError(res, 'Esta versão está travada e não pode ser editada', {
        code: 'VERSAO_TRAVADA',
        status: 409,
      });
      return;
    }

    try {
      // Cada edição vira upsert num lançamento shadow (tipoOrigem='planilha').
      // O shadow centraliza valores editados direto na célula; recalcularItem é
      // chamado por edição e atualiza itens_orcamento (soma de todos lançamentos).
      let atualizadas = 0;
      let criadas = 0;
      let removidas = 0;
      for (const e of body.edicoes) {
        const delta: Record<string, number | null> = {};
        let countNull = 0;
        let countSet = 0;
        for (const [mes, valor] of Object.entries(e.valoresMensais)) {
          delta[mes] = valor;
          if (valor === null) countNull++;
          else countSet++;
        }
        await upsertShadowFromCelula({
          versaoId: body.versaoId,
          farmId: body.farmId,
          planoContaId: e.planoContaId,
          delta,
          userId,
        });
        // Aproximação dos contadores (mantém compat com cliente atual)
        if (countSet > 0) atualizadas++;
        if (countNull > 0) removidas++;
      }
      const result = { atualizadas, criadas, removidas };

      const orcamentoId = await getOrcamentoIdByVersao(body.versaoId);
      if (orcamentoId) {
        await appendAudit({
          orcamentoId,
          versaoId: body.versaoId,
          usuarioId: userId,
          acao: 'editar_itens_despesa',
          entidade: 'itens_orcamento',
          entidadeId: null,
          before: null,
          after: {
            farmId: body.farmId,
            qtdEdicoes: body.edicoes.length,
            atualizadas,
            removidas,
          },
        });
      }

      jsonSuccess(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      console.error('[orcamento-itens PATCH] erro:', msg);
      jsonError(res, 'Erro ao salvar valores', { status: 500 });
    }
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
