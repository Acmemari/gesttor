/**
 * API de Orçamentos (CRUD + criação completa do wizard).
 *
 * GET    /api/orcamentos?id=xxx                  → busca 1 orçamento (+ versões, fazendas, colaboradores)
 * GET    /api/orcamentos?organizationId=xxx      → lista orçamentos da org
 *   Params opcionais: search, includeArquivados, offset, limit
 * POST   /api/orcamentos                         → criar orçamento (wizard agregado)
 * PATCH  /api/orcamentos                         → atualizar (body.id obrigatório)
 * DELETE /api/orcamentos?id=xxx                  → soft delete (arquivado=true)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertOrgAccess, getUserRole } from './_lib/orgAccess.js';
import {
  createOrcamentoCompleto,
  listOrcamentos,
  getOrcamentoById,
  getOrcamentoFarms,
  archiveOrcamento,
  updateOrcamento,
  type CreateOrcamentoInput,
} from '../src/DB/repositories/orcamentos.js';
import { listVersoesByOrcamento } from '../src/DB/repositories/orcamentoVersoes.js';
import { listColaboradoresDoOrcamento } from '../src/DB/repositories/orcamentoColaboradores.js';

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
      res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)));
      jsonError(res, 'Muitas requisições. Tente novamente em instantes.', { status: 429 });
      return;
    }
  }

  // ─── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    const orgIdParam = typeof req.query?.organizationId === 'string' ? req.query.organizationId : null;

    if (idParam) {
      const orc = await getOrcamentoById(idParam);
      if (!orc) {
        jsonError(res, 'Orçamento não encontrado', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      try {
        await assertOrgAccess(orc.organizationId, userId, role);
      } catch (err) {
        const e = err as { status?: number; code?: string; message: string };
        jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
        return;
      }
      const [farms, versoes, colaboradores] = await Promise.all([
        getOrcamentoFarms(idParam),
        listVersoesByOrcamento(idParam),
        listColaboradoresDoOrcamento(idParam),
      ]);
      jsonSuccess(res, { ...orc, farms, versoes, colaboradores });
      return;
    }

    if (orgIdParam) {
      try {
        await assertOrgAccess(orgIdParam, userId, role);
      } catch (err) {
        const e = err as { status?: number; code?: string; message: string };
        jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
        return;
      }
      const offset = Math.max(0, Number(req.query?.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      const search = typeof req.query?.search === 'string' ? req.query.search : null;
      const includeArquivados = req.query?.includeArquivados === 'true';

      const { rows, hasMore } = await listOrcamentos({
        organizationId: orgIdParam,
        search,
        includeArquivados,
        offset,
        limit,
      });
      jsonSuccess(res, rows, { offset, limit, hasMore });
      return;
    }

    jsonError(res, 'Parâmetro id ou organizationId obrigatório', { status: 400 });
    return;
  }

  // ─── POST ────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Partial<CreateOrcamentoInput>;

    if (!body?.organizationId) {
      jsonError(res, 'organizationId é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!body?.nome?.trim()) {
      jsonError(res, 'nome é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!body?.safra?.trim()) {
      jsonError(res, 'safra é obrigatória', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!body?.dataInicio || !body?.dataFim) {
      jsonError(res, 'dataInicio e dataFim são obrigatórias', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!Array.isArray(body.fazendas) || body.fazendas.length === 0) {
      jsonError(res, 'Pelo menos uma fazenda é obrigatória', { code: 'VALIDATION', status: 400 });
      return;
    }

    try {
      await assertOrgAccess(body.organizationId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    try {
      const result = await createOrcamentoCompleto({
        organizationId: body.organizationId,
        nome: body.nome.trim(),
        safra: body.safra.trim(),
        dataInicio: body.dataInicio,
        dataFim: body.dataFim,
        descricao: body.descricao ?? null,
        fazendas: body.fazendas,
        colaboradores: body.colaboradores ?? [],
        premissasIniciais: body.premissasIniciais ?? [],
        criadoPor: userId,
      });
      jsonSuccess(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      console.error('[orcamentos POST] erro:', msg);
      jsonError(res, 'Erro ao criar orçamento', { status: 500 });
    }
    return;
  }

  // ─── PATCH ───────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as { id?: string; nome?: string; descricao?: string | null };
    if (!body?.id) {
      jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const orc = await getOrcamentoById(body.id);
    if (!orc) {
      jsonError(res, 'Orçamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    try {
      await assertOrgAccess(orc.organizationId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    const updated = await updateOrcamento(body.id, {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(body.descricao !== undefined && { descricao: body.descricao }),
    });
    jsonSuccess(res, updated);
    return;
  }

  // ─── DELETE (soft) ───────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!idParam) {
      jsonError(res, 'Parâmetro id obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const orc = await getOrcamentoById(idParam);
    if (!orc) {
      jsonError(res, 'Orçamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    try {
      await assertOrgAccess(orc.organizationId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    await archiveOrcamento(idParam);
    jsonSuccess(res, { id: idParam, arquivado: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
