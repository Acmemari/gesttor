/**
 * API route for reprodutores (Sêmen e Embriões).
 *
 *   GET    ?organizationId=xxx                          — list reprodutores for org
 *   POST   { organizationId, nome, registro?, dataNascimento?, tipo, raca?, central?, imagens?, genealogia?, observacao? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }  — reorder
 *   PATCH  { id, ...campos }                             — update
 *   DELETE ?id=xxx                                       — delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listByOrganization,
  create,
  update,
  remove,
  reorder,
} from '../src/DB/repositories/reprodutores.js';

const TIPOS = ['semen', 'embriao'];

/** Normaliza um nó da genealogia para { nome, registro } (strings). */
function sanitizeGenealogia(input: any): Record<string, { nome: string; registro: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, { nome: string; registro: string }> = {};
  for (const [key, val] of Object.entries(input)) {
    if (val && typeof val === 'object') {
      const nome = String((val as any).nome ?? '').trim();
      const registro = String((val as any).registro ?? '').trim();
      if (nome || registro) out[key] = { nome, registro };
    }
  }
  return out;
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
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';
      if (!organizationId) {
        jsonError(res, 'organizationId obrigatório', { status: 400 });
        return;
      }
      const rows = await listByOrganization(organizationId);
      jsonSuccess(res, rows);
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action } = req.body ?? {};

      // Reorder action
      if (action === 'reorder') {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          jsonError(res, 'items obrigatório (array de {id, ordem})', { status: 400 });
          return;
        }
        await reorder(items);
        jsonSuccess(res, { reordered: true });
        return;
      }

      // Create
      const { organizationId, nome, registro, dataNascimento, tipo, raca, central, imagens, genealogia, observacao } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }

      const tipoFinal = TIPOS.includes(tipo) ? tipo : 'semen';

      if (imagens !== undefined && !Array.isArray(imagens)) {
        jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        registro: registro !== undefined && registro !== null ? String(registro).trim() || null : null,
        dataNascimento: dataNascimento !== undefined && dataNascimento !== null ? String(dataNascimento).trim() || null : null,
        tipo: tipoFinal,
        raca: raca !== undefined && raca !== null ? String(raca).trim() || null : null,
        central: central !== undefined && central !== null ? String(central).trim() || null : null,
        imagens: Array.isArray(imagens) ? imagens.map(String) : [],
        genealogia: sanitizeGenealogia(genealogia),
        observacao: observacao !== undefined && observacao !== null ? String(observacao).trim() || null : null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, registro, dataNascimento, tipo, raca, central, imagens, genealogia, observacao } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }

      const payload: Record<string, any> = {};
      if (nome !== undefined) {
        if (!String(nome).trim()) {
          jsonError(res, 'nome não pode ser vazio', { status: 400 });
          return;
        }
        payload.nome = String(nome).trim();
      }
      if (registro !== undefined) payload.registro = registro === null ? null : (String(registro).trim() || null);
      if (dataNascimento !== undefined) payload.dataNascimento = dataNascimento === null ? null : (String(dataNascimento).trim() || null);
      if (tipo !== undefined) payload.tipo = TIPOS.includes(tipo) ? tipo : 'semen';
      if (raca !== undefined) payload.raca = raca === null ? null : (String(raca).trim() || null);
      if (central !== undefined) payload.central = central === null ? null : (String(central).trim() || null);
      if (observacao !== undefined) payload.observacao = observacao === null ? null : (String(observacao).trim() || null);
      if (imagens !== undefined) {
        if (!Array.isArray(imagens)) {
          jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
          return;
        }
        payload.imagens = imagens.map(String);
      }
      if (genealogia !== undefined) payload.genealogia = sanitizeGenealogia(genealogia);

      const row = await update(id, payload);
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      await remove(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[reprodutores] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
