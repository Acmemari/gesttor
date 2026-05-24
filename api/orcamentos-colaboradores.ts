/**
 * API de Colaboradores do Orçamento (sem invite por e-mail no MVP).
 *
 * GET    /api/orcamentos-colaboradores?orcamentoId=xxx          → lista colaboradores do orçamento
 * GET    /api/orcamentos-colaboradores?disponiveis=1&organizationId=xxx → lista usuários da org elegíveis
 * POST   /api/orcamentos-colaboradores                          → adicionar (body: { orcamentoId, userId, papel, eAprovador? })
 * DELETE /api/orcamentos-colaboradores?id=xxx                   → remover vínculo
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertOrgAccess, getUserRole } from './_lib/orgAccess.js';
import { getOrcamentoById } from '../src/DB/repositories/orcamentos.js';
import {
  listColaboradoresDoOrcamento,
  listUsuariosDisponiveis,
  addColaborador,
  removeColaborador,
} from '../src/DB/repositories/orcamentoColaboradores.js';
import { db } from '../src/DB/index.js';
import { orcamentoColaboradores } from '../src/DB/schema.js';
import { eq } from 'drizzle-orm';

const PAPEIS_VALIDOS = ['editor', 'consultor'] as const;
type Papel = typeof PAPEIS_VALIDOS[number];

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
    const disponiveisFlag = req.query?.disponiveis === '1' || req.query?.disponiveis === 'true';

    if (disponiveisFlag) {
      const orgId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : null;
      if (!orgId) {
        jsonError(res, 'organizationId é obrigatório', { code: 'VALIDATION', status: 400 });
        return;
      }
      try { await assertOrgAccess(orgId, userId, role); }
      catch (err) {
        const e = err as { status?: number; code?: string; message: string };
        jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
        return;
      }
      const users = await listUsuariosDisponiveis(orgId);
      jsonSuccess(res, users);
      return;
    }

    const orcamentoId = typeof req.query?.orcamentoId === 'string' ? req.query.orcamentoId : null;
    if (!orcamentoId) {
      jsonError(res, 'orcamentoId é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
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
    const colabs = await listColaboradoresDoOrcamento(orcamentoId);
    jsonSuccess(res, colabs);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as { orcamentoId?: string; userId?: string; papel?: Papel; eAprovador?: boolean };
    if (!body?.orcamentoId || !body?.userId || !body?.papel) {
      jsonError(res, 'orcamentoId, userId e papel são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!PAPEIS_VALIDOS.includes(body.papel)) {
      jsonError(res, `papel inválido. Use: ${PAPEIS_VALIDOS.join(', ')}`, { code: 'VALIDATION', status: 400 });
      return;
    }
    const orc = await getOrcamentoById(body.orcamentoId);
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

    try {
      const created = await addColaborador({
        orcamentoId: body.orcamentoId,
        userId: body.userId,
        papel: body.papel,
        eAprovador: body.eAprovador ?? false,
      });
      jsonSuccess(res, created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        jsonError(res, 'Este usuário já é colaborador deste orçamento', { code: 'VALIDATION', status: 400 });
        return;
      }
      console.error('[orcamentos-colaboradores POST] erro:', msg);
      jsonError(res, 'Erro ao adicionar colaborador', { status: 500 });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!idParam) {
      jsonError(res, 'Parâmetro id obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const [colab] = await db
      .select({ orcamentoId: orcamentoColaboradores.orcamentoId })
      .from(orcamentoColaboradores)
      .where(eq(orcamentoColaboradores.id, idParam))
      .limit(1);
    if (!colab) {
      jsonError(res, 'Colaborador não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    const orc = await getOrcamentoById(colab.orcamentoId);
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
    await removeColaborador(idParam);
    jsonSuccess(res, { id: idParam, removed: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
