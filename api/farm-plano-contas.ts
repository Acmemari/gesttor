/**
 * API de configuração do plano de contas POR FAZENDA.
 *
 * GET   /api/farm-plano-contas?farmId=xxx                → lista todas as contas + flag ativoNaFazenda
 * PATCH /api/farm-plano-contas                           → batch upsert/delete da blacklist
 *   body: { farmId, ativacoes: [{ planoContaId, ativo }] }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertFarmAccess, getUserRole } from './_lib/orgAccess.js';
import {
  listPlanoContasComFlag,
  setAtivacoes,
  type AtivacaoInput,
} from '../src/DB/repositories/farmPlanoContas.js';
import { appendAudit } from '../src/DB/repositories/auditoriaOrcamento.js';
import { db } from '../src/DB/index.js';
import { orcamentos, orcamentoFarms } from '../src/DB/schema.js';
import { eq } from 'drizzle-orm';

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
    const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;
    if (!farmId) {
      jsonError(res, 'farmId é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    try {
      await assertFarmAccess(farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    const contas = await listPlanoContasComFlag(farmId);
    jsonSuccess(res, contas);
    return;
  }

  // ─── PATCH ───────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as { farmId?: string; ativacoes?: AtivacaoInput[] };
    if (!body?.farmId) {
      jsonError(res, 'farmId é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!Array.isArray(body?.ativacoes)) {
      jsonError(res, 'ativacoes deve ser um array', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (body.ativacoes.length === 0) {
      jsonSuccess(res, { atualizadas: 0 });
      return;
    }
    if (body.ativacoes.length > 1000) {
      jsonError(res, 'máximo de 1000 alterações por requisição', { code: 'VALIDATION', status: 400 });
      return;
    }
    for (const a of body.ativacoes) {
      if (!a?.planoContaId || typeof a.ativo !== 'boolean') {
        jsonError(res, 'cada ativação deve ter { planoContaId, ativo: boolean }', {
          code: 'VALIDATION',
          status: 400,
        });
        return;
      }
    }

    try {
      await assertFarmAccess(body.farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    try {
      const result = await setAtivacoes(body.farmId, body.ativacoes, userId);

      // Best-effort: registra audit em algum orçamento ativo da fazenda (se houver).
      // Auditoria é por orçamento; se não houver, registra em todos os orçamentos
      // da org que incluem esta fazenda.
      const orcsDaFarm = await db
        .select({ id: orcamentos.id })
        .from(orcamentos)
        .innerJoin(orcamentoFarms, eq(orcamentoFarms.orcamentoId, orcamentos.id))
        .where(eq(orcamentoFarms.farmId, body.farmId));

      for (const orc of orcsDaFarm) {
        await appendAudit({
          orcamentoId: orc.id,
          versaoId: null,
          usuarioId: userId,
          acao: 'editar_config_plano_contas',
          entidade: 'farm_plano_contas_inativas',
          entidadeId: null,
          before: { inativosIds: result.before },
          after: { inativosIds: result.after, alteracoes: body.ativacoes.length },
        });
      }

      jsonSuccess(res, { atualizadas: result.atualizadas });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      console.error('[farm-plano-contas PATCH] erro:', msg);
      jsonError(res, 'Erro ao salvar configuração', { status: 500 });
    }
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
