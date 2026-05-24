/**
 * API de Versões de Orçamento.
 *
 * GET   /api/orcamentos-versoes?orcamentoId=xxx   → lista versões do orçamento
 * GET   /api/orcamentos-versoes?id=xxx            → busca 1 versão
 * PATCH /api/orcamentos-versoes                    → renomear (body: { id, nome })
 *
 * Phase 2 adicionará: POST (criar Forecast), POST aprovar (vira baseline imutável).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertOrgAccess, getUserRole } from './_lib/orgAccess.js';
import { getOrcamentoById } from '../src/DB/repositories/orcamentos.js';
import {
  listVersoesByOrcamento,
  getVersaoById,
  renameVersao,
} from '../src/DB/repositories/orcamentoVersoes.js';

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

  if (req.method === 'GET') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    const orcamentoId = typeof req.query?.orcamentoId === 'string' ? req.query.orcamentoId : null;

    if (idParam) {
      const versao = await getVersaoById(idParam);
      if (!versao) {
        jsonError(res, 'Versão não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      const orc = await getOrcamentoById(versao.orcamentoId);
      if (!orc) {
        jsonError(res, 'Orçamento associado não encontrado', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      try { await assertOrgAccess(orc.organizationId, userId, role); }
      catch (err) {
        const e = err as { status?: number; code?: string; message: string };
        jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
        return;
      }
      jsonSuccess(res, versao);
      return;
    }

    if (orcamentoId) {
      const orc = await getOrcamentoById(orcamentoId);
      if (!orc) {
        jsonError(res, 'Orçamento não encontrado', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      try { await assertOrgAccess(orc.organizationId, userId, role); }
      catch (err) {
        const e = err as { status?: number; code?: string; message: string };
        jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
        return;
      }
      const versoes = await listVersoesByOrcamento(orcamentoId);
      jsonSuccess(res, versoes);
      return;
    }

    jsonError(res, 'Parâmetro id ou orcamentoId obrigatório', { status: 400 });
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body as { id?: string; nome?: string };
    if (!body?.id || !body?.nome?.trim()) {
      jsonError(res, 'id e nome são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    const versao = await getVersaoById(body.id);
    if (!versao) {
      jsonError(res, 'Versão não encontrada', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    if (versao.imutavel) {
      jsonError(res, 'Versão imutável (Baseline) não pode ser renomeada', { code: 'VALIDATION', status: 400 });
      return;
    }
    const orc = await getOrcamentoById(versao.orcamentoId);
    if (!orc) {
      jsonError(res, 'Orçamento associado não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    try { await assertOrgAccess(orc.organizationId, userId, role); }
    catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    const updated = await renameVersao(body.id, body.nome.trim());
    jsonSuccess(res, updated);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
