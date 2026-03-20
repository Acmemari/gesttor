/**
 * API de semanas de trabalho.
 *
 * GET  /api/semanas?modo=&farmId=&current=true  → semana mais recente
 * GET  /api/semanas?id=...                       → por ID
 * GET  /api/semanas?numero=&modo=&farmId=        → verifica existência
 * POST /api/semanas                              → cria semana
 * PATCH /api/semanas?id=...                      → atualiza semana
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  getCurrentSemana,
  getSemanaById,
  getSemanaByNumero,
  createSemana,
  updateSemana,
  deleteSemana,
} from '../src/DB/repositories/semanas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  if (req.method === 'GET') {
    const { id, modo, farmId, current, numero } = req.query as Record<string, string | undefined>;

    if (id) {
      const row = await getSemanaById(id);
      jsonSuccess(res, row);
      return;
    }

    if (numero && modo) {
      const fid = farmId ?? null;
      const row = await getSemanaByNumero(Number(numero), modo, fid);
      jsonSuccess(res, row);
      return;
    }

    if (current && modo) {
      const fid = farmId ?? null;
      const row = await getCurrentSemana(modo, fid);
      jsonSuccess(res, row);
      return;
    }

    jsonError(res, 'Parâmetros insuficientes', { status: 400 });
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const { numero, modo, aberta, data_inicio, data_fim, farm_id } = body;
    if (!numero || !modo || !data_inicio || !data_fim) {
      jsonError(res, 'numero, modo, data_inicio e data_fim são obrigatórios', { status: 400 });
      return;
    }
    const row = await createSemana({
      numero: Number(numero),
      modo: String(modo),
      aberta: aberta !== undefined ? Boolean(aberta) : true,
      data_inicio: String(data_inicio),
      data_fim: String(data_fim),
      farm_id: farm_id ? String(farm_id) : null,
    });
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const partial: Record<string, unknown> = {};
    if (body.aberta !== undefined) partial.aberta = Boolean(body.aberta);
    if (body.data_inicio !== undefined) partial.data_inicio = String(body.data_inicio);
    if (body.data_fim !== undefined) partial.data_fim = String(body.data_fim);
    const row = await updateSemana(id, partial);
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    await deleteSemana(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
