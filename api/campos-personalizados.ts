/**
 * API route for Campos Personalizados (campos extras do "Defina seus campos").
 *
 *   GET    ?organizationId=xxx                                  — list campos for org
 *   POST   { organizationId, nome, tipo, opcoes?, movimentos?, obrigatorio? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }         — reorder
 *   PATCH  { id, nome?, tipo?, opcoes?, movimentos?, obrigatorio? } — update
 *   DELETE ?id=xxx                                             — delete
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
} from '../src/DB/repositories/campos-personalizados.js';

const TIPOS = ['texto', 'numero', 'lista'];
const MOVIMENTOS = ['compra', 'venda', 'nascimento', 'morte', 'consumo'];

/** Normaliza opções: array de strings não-vazias, no máximo 4. */
function cleanOpcoes(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => String(o ?? '').trim())
    .filter((o) => o.length > 0)
    .slice(0, 4);
}

/** Normaliza movimentos: subconjunto válido e sem repetição. */
function cleanMovimentos(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((m) => String(m ?? '').trim()))].filter((m) => MOVIMENTOS.includes(m));
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
      const { organizationId, nome, tipo, opcoes, movimentos, obrigatorio } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }
      if (!TIPOS.includes(tipo)) {
        jsonError(res, "tipo inválido (use 'texto', 'numero' ou 'lista')", { status: 400 });
        return;
      }
      const opcoesClean = tipo === 'lista' ? cleanOpcoes(opcoes) : [];
      if (tipo === 'lista' && opcoesClean.length === 0) {
        jsonError(res, 'Informe ao menos uma opção para a lista suspensa', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        tipo,
        opcoes: opcoesClean,
        movimentos: cleanMovimentos(movimentos) as any,
        obrigatorio: !!obrigatorio,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, tipo, opcoes, movimentos, obrigatorio } = req.body ?? {};
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
      if (tipo !== undefined) {
        if (!TIPOS.includes(tipo)) {
          jsonError(res, "tipo inválido (use 'texto', 'numero' ou 'lista')", { status: 400 });
          return;
        }
        payload.tipo = tipo;
      }
      if (opcoes !== undefined) payload.opcoes = cleanOpcoes(opcoes);
      if (movimentos !== undefined) payload.movimentos = cleanMovimentos(movimentos);
      if (obrigatorio !== undefined) payload.obrigatorio = !!obrigatorio;

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
    console.error('[campos-personalizados] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
