/**
 * API de Auditoria do Orçamento (read-only).
 * GET /api/orcamentos-auditoria?orcamentoId=xxx&versaoId=yyy&limit=50
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { assertOrgAccess, getUserRole } from './_lib/orgAccess.js';
import { getOrcamentoById } from '../src/DB/repositories/orcamentos.js';
import { listAuditoria } from '../src/DB/repositories/auditoriaOrcamento.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    jsonError(res, 'Método não permitido', { status: 405 });
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
  try {
    await assertOrgAccess(orc.organizationId, userId, role);
  } catch (err) {
    const e = err as { status?: number; code?: string; message: string };
    jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
    return;
  }

  const versaoId = typeof req.query?.versaoId === 'string' ? req.query.versaoId : null;
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));

  const eventos = await listAuditoria({ orcamentoId, versaoId, limit });
  jsonSuccess(res, eventos);
}
