/**
 * API de participantes de reunião semanal.
 *
 * GET  /api/semana-participantes?semanaId=xxx
 *   → lista participantes salvos para a semana
 *
 * POST /api/semana-participantes
 *   body: { semanaId: string, participantes: [{ pessoaId, presenca, modalidade }] }
 *   → salva/atualiza participação em bulk
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertFarmAccess } from './_lib/orgAccess.js';
import {
  getSemanaById,
  listSemanaParticipantes,
  bulkUpsertSemanaParticipantes,
} from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  let role: string;
  try {
    role = await getUserRole(userId);
  } catch (err: any) {
    jsonError(res, err.message, { status: err.status ?? 401 });
    return;
  }

  if (req.method === 'GET') {
    const semanaId = typeof req.query?.semanaId === 'string' ? req.query.semanaId : null;
    if (!semanaId) { jsonError(res, 'semanaId é obrigatório', { status: 400 }); return; }

    const semana = await getSemanaById(semanaId);
    if (!semana) { jsonError(res, 'Semana não encontrada', { status: 404 }); return; }
    if (semana.farmId) {
      try { await assertFarmAccess(semana.farmId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
    } else if (role !== 'admin' && role !== 'administrador') {
      jsonError(res, 'Sem permissão', { status: 403 }); return;
    }

    const rows = await listSemanaParticipantes(semanaId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const semanaId = body.semanaId ? String(body.semanaId) : null;
    if (!semanaId) { jsonError(res, 'semanaId é obrigatório', { status: 400 }); return; }

    const semana = await getSemanaById(semanaId);
    if (!semana) { jsonError(res, 'Semana não encontrada', { status: 404 }); return; }
    if (semana.farmId) {
      try { await assertFarmAccess(semana.farmId, userId, role); } catch (err: any) {
        jsonError(res, err.message, { status: err.status ?? 403 }); return;
      }
    } else if (role !== 'admin' && role !== 'administrador') {
      jsonError(res, 'Sem permissão', { status: 403 }); return;
    }

    const participantes = Array.isArray(body.participantes) ? body.participantes : [];
    const validated = participantes
      .filter((p: any) => p && typeof p.pessoaId === 'string')
      .map((p: any) => ({
        pessoaId: String(p.pessoaId),
        presenca: Boolean(p.presenca),
        modalidade: p.modalidade === 'online' ? 'online' : 'presencial',
      }));

    const rows = await bulkUpsertSemanaParticipantes(semanaId, validated);
    jsonSuccess(res, rows);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
