/**
 * API route for animal categories (categorias de animais).
 *
 *   GET    ?organizationId=xxx              — list categories for org
 *   POST   { organizationId, nome, sexo, grupo, ... }  — create
 *   POST   { action: 'reorder', items: [{id, ordem}] } — reorder
 *   PATCH  { id, nome?, sexo?, grupo?, ... }            — update
 *   DELETE ?id=xxx                                      — delete
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
} from '../src/DB/repositories/animal-categories.js';

const VALID_SEXO = ['macho', 'femea'];
const VALID_GRUPO = [
  'matrizes_reproducao', 'novilhas', 'matrizes_descarte',
  'bezerros_mamando', 'garrotes_bois', 'touros', 'outros',
];
const VALID_IDADE_FAIXA = ['ate_12', '13_24', '25_36', 'mais_36'];

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
      const { organizationId, nome, sexo, grupo, idadeFaixa, pesoKg, complemento } = req.body ?? {};
      if (!organizationId || !nome || !sexo || !grupo) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome, sexo, grupo', { status: 400 });
        return;
      }
      if (!VALID_SEXO.includes(sexo)) {
        jsonError(res, `sexo inválido. Valores: ${VALID_SEXO.join(', ')}`, { status: 400 });
        return;
      }
      if (!VALID_GRUPO.includes(grupo)) {
        jsonError(res, `grupo inválido. Valores: ${VALID_GRUPO.join(', ')}`, { status: 400 });
        return;
      }
      if (idadeFaixa && !VALID_IDADE_FAIXA.includes(idadeFaixa)) {
        jsonError(res, `idadeFaixa inválida. Valores: ${VALID_IDADE_FAIXA.join(', ')}`, { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: nome.trim(),
        complemento: complemento?.trim() || null,
        sexo,
        grupo,
        idadeFaixa: idadeFaixa || null,
        pesoKg: pesoKg != null ? String(pesoKg) : null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, sexo, grupo, idadeFaixa, pesoKg, complemento } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      if (sexo && !VALID_SEXO.includes(sexo)) {
        jsonError(res, `sexo inválido`, { status: 400 });
        return;
      }
      if (grupo && !VALID_GRUPO.includes(grupo)) {
        jsonError(res, `grupo inválido`, { status: 400 });
        return;
      }
      if (idadeFaixa && !VALID_IDADE_FAIXA.includes(idadeFaixa)) {
        jsonError(res, `idadeFaixa inválida`, { status: 400 });
        return;
      }

      const payload: Record<string, any> = {};
      if (nome !== undefined) payload.nome = nome.trim();
      if (complemento !== undefined) payload.complemento = complemento?.trim() || null;
      if (sexo !== undefined) payload.sexo = sexo;
      if (grupo !== undefined) payload.grupo = grupo;
      if (idadeFaixa !== undefined) payload.idadeFaixa = idadeFaixa || null;
      if (pesoKg !== undefined) payload.pesoKg = pesoKg != null ? String(pesoKg) : null;

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
    console.error('[animal-categories] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
