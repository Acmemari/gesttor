/**
 * API route for Padrão Racial e Grau de Sangue.
 *
 *   GET    ?organizationId=xxx              — list registros for org
 *   POST   { organizationId, nome, classificacao?, ceip?, grauSangue?, observacao?, ativo? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] } — reorder
 *   PATCH  { id, nome?, classificacao?, ceip?, grauSangue?, observacao?, ativo? }  — update
 *   DELETE ?id=xxx                                      — delete
 *
 * Regras de negócio:
 *   - classificacao (Padrão Racial) é exclusivo: 'PO' | 'PC' | 'LA' | 'Comercial' (qualquer outro valor → null).
 *   - ceip pode ficar sozinho ou em conjunto com PO/PC/LA, mas nunca com Comercial → com Comercial vira false.
 *   - grauSangue (Grau de Sangue) ∈ lista fixa (Puro, 1/2 sangue, ...); qualquer outro valor → null.
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
} from '../src/DB/repositories/padrao-racial.js';

const CLASSIFICACOES_VALIDAS = ['PO', 'PC', 'LA', 'Comercial'];
const GRAUS_SANGUE_VALIDOS = [
  'Puro',
  '1/2 sangue',
  '3/4 sangue',
  '5/8 sangue',
  '3/8 sangue',
  '7/8 sangue',
  '15/16 sangue',
];

function normalizeFromList(value: any, list: string[]): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return list.includes(t) ? t : null;
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
      const { organizationId, nome, classificacao, ceip, grauSangue, observacao, ativo } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }

      const classif = normalizeFromList(classificacao, CLASSIFICACOES_VALIDAS);
      // CEIP pode ficar sozinho ou junto de PO/PC/LA; nunca com Comercial.
      const ceipFinal = !!ceip && classif !== 'Comercial';
      const grau = normalizeFromList(grauSangue, GRAUS_SANGUE_VALIDOS);

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        classificacao: classif,
        ceip: ceipFinal,
        grauSangue: grau,
        observacao: observacao ? String(observacao).trim() : null,
        ativo: ativo !== undefined ? !!ativo : true,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, classificacao, ceip, grauSangue, observacao, ativo } = req.body ?? {};
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
      if (classificacao !== undefined) payload.classificacao = normalizeFromList(classificacao, CLASSIFICACOES_VALIDAS);
      if (ceip !== undefined) payload.ceip = !!ceip;
      if (grauSangue !== undefined) payload.grauSangue = normalizeFromList(grauSangue, GRAUS_SANGUE_VALIDOS);
      if (observacao !== undefined) payload.observacao = observacao ? String(observacao).trim() : null;
      if (ativo !== undefined) payload.ativo = !!ativo;

      // Regra: CEIP nunca combina com Comercial. Se o padrão racial passou a ser
      // Comercial nesta atualização, zera o CEIP (sozinho ou com PO/PC/LA é válido).
      if (payload.classificacao === 'Comercial') {
        payload.ceip = false;
      }

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
    console.error('[padrao-racial] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
