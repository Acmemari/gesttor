/**
 * API route for farm retiros & locais.
 *
 * Retiros:
 *   GET    ?farmId=xxx                  — list retiros
 *   POST   { farmId, name, totalArea?, isDefault? }
 *   PATCH  { id, name?, totalArea?, isDefault? }
 *   DELETE ?retiroId=xxx
 *
 * Locais:
 *   GET    ?retiroId=xxx                — list locais for a retiro
 *   GET    ?farmIdLocais=xxx            — list all locais for a farm
 *   POST   { retiroId, farmId, name, area? }          (with type=local)
 *   PATCH  { id, name?, area? }                       (with type=local)
 *   DELETE ?localId=xxx
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  getRetiros,
  createRetiro,
  updateRetiro,
  deleteRetiro,
  getLocais,
  getLocaisByFarm,
  createLocal,
  updateLocal,
  deleteLocal,
} from '../src/DB/repositories/farm-locations.js';

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
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      const retiroId = typeof req.query?.retiroId === 'string' ? req.query.retiroId : '';
      const farmIdLocais = typeof req.query?.farmIdLocais === 'string' ? req.query.farmIdLocais : '';

      if (retiroId) {
        const rows = await getLocais(retiroId);
        jsonSuccess(res, rows);
        return;
      }
      if (farmIdLocais) {
        const rows = await getLocaisByFarm(farmIdLocais);
        jsonSuccess(res, rows);
        return;
      }
      if (farmId) {
        const rows = await getRetiros(farmId);
        jsonSuccess(res, rows);
        return;
      }
      jsonError(res, 'farmId, retiroId ou farmIdLocais obrigatório', { status: 400 });
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { type } = req.body ?? {};

      if (type === 'local') {
        const { retiroId, farmId, name, area } = req.body;
        if (!retiroId || !farmId || !name) {
          jsonError(res, 'Campos obrigatórios: retiroId, farmId, name', { status: 400 });
          return;
        }
        const row = await createLocal({ retiroId, farmId, name, area: area ?? null });
        jsonSuccess(res, row);
        return;
      }

      // default: retiro
      const { farmId, name, totalArea, isDefault } = req.body ?? {};
      if (!farmId || !name) {
        jsonError(res, 'Campos obrigatórios: farmId, name', { status: 400 });
        return;
      }
      const row = await createRetiro({ farmId, name, totalArea: totalArea ?? null, isDefault: isDefault ?? false });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { type, id } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }

      if (type === 'local') {
        const { name, area } = req.body;
        const row = await updateLocal(id, { name, area });
        jsonSuccess(res, row);
        return;
      }

      // default: retiro
      const { name, totalArea, isDefault } = req.body;
      const row = await updateRetiro(id, { name, totalArea, isDefault });
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const retiroId = typeof req.query?.retiroId === 'string' ? req.query.retiroId : '';
      const localId = typeof req.query?.localId === 'string' ? req.query.localId : '';

      if (localId) {
        await deleteLocal(localId);
        jsonSuccess(res, { deleted: true });
        return;
      }
      if (retiroId) {
        await deleteRetiro(retiroId);
        jsonSuccess(res, { deleted: true });
        return;
      }
      jsonError(res, 'retiroId ou localId obrigatório', { status: 400 });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[farm-locations] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
