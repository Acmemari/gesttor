/**
 * API route for animal breeds (raças de animais).
 *
 *   GET    ?organizationId=xxx              — list breeds for org
 *   POST   { organizationId, nome, codigoAsbia?, observacao?, classificacaoRegistro?, ceip?, semCadastroAsbia?, ativo? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] } — reorder
 *   PATCH  { id, nome?, codigoAsbia?, observacao?, ativo?, ... }  — update (raça padrão do sistema: só 'ativo')
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
} from '../src/DB/repositories/animal-breeds.js';

type ComposicaoRacialItem = { breedId: string | null; nome: string; percentual: number; principal: boolean };

/**
 * Normaliza e valida a composição racial.
 * Regras: pelo menos um componente, soma dos percentuais = 100% e exatamente um `principal`.
 */
function normalizeComposicao(
  value: any,
): { ok: boolean; data: ComposicaoRacialItem[]; error: string | null } {
  if (!Array.isArray(value)) return { ok: false, data: [], error: 'Composição racial inválida' };

  const items: ComposicaoRacialItem[] = value
    .map((c: any) => ({
      breedId: typeof c?.breedId === 'string' && c.breedId ? c.breedId : null,
      nome: typeof c?.nome === 'string' ? c.nome.trim() : '',
      percentual: Math.round(Number(c?.percentual) * 100) / 100,
      principal: !!c?.principal,
    }))
    .filter((c) => c.nome && Number.isFinite(c.percentual) && c.percentual > 0);

  if (items.length === 0) return { ok: false, data: [], error: 'Informe a composição racial (mínimo uma raça)' };

  const total = Math.round(items.reduce((s, c) => s + c.percentual, 0) * 100) / 100;
  if (total !== 100) return { ok: false, data: items, error: 'A soma dos percentuais da composição deve ser 100%' };

  const principais = items.filter((c) => c.principal).length;
  if (principais !== 1) return { ok: false, data: items, error: 'Marque exatamente uma raça principal na composição' };

  return { ok: true, data: items, error: null };
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
      const { organizationId, nome, classificacaoRegistro, codigoAsbia, ceip, semCadastroAsbia, composicaoRacial, observacao, ativo } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }

      // Composição racial é obrigatória na criação.
      const comp = normalizeComposicao(composicaoRacial);
      if (!comp.ok) {
        jsonError(res, comp.error || 'Composição racial inválida', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        classificacaoRegistro: classificacaoRegistro ? String(classificacaoRegistro).trim() : null,
        codigoAsbia: codigoAsbia ? String(codigoAsbia).trim().toUpperCase().slice(0, 2) : null,
        ceip: ceip !== undefined ? !!ceip : false,
        semCadastroAsbia: semCadastroAsbia !== undefined ? !!semCadastroAsbia : false,
        composicaoRacial: comp.data,
        observacao: observacao ? String(observacao).trim() : null,
        ativo: ativo !== undefined ? !!ativo : true,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, classificacaoRegistro, codigoAsbia, ceip, semCadastroAsbia, composicaoRacial, observacao, ativo } = req.body ?? {};
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
      if (classificacaoRegistro !== undefined) {
        payload.classificacaoRegistro = classificacaoRegistro ? String(classificacaoRegistro).trim() : null;
      }
      if (codigoAsbia !== undefined) {
        payload.codigoAsbia = codigoAsbia ? String(codigoAsbia).trim().toUpperCase().slice(0, 2) : null;
      }
      if (ceip !== undefined) payload.ceip = !!ceip;
      if (semCadastroAsbia !== undefined) payload.semCadastroAsbia = !!semCadastroAsbia;
      if (composicaoRacial !== undefined) {
        const compUpd = normalizeComposicao(composicaoRacial);
        if (!compUpd.ok) {
          jsonError(res, compUpd.error || 'Composição racial inválida', { status: 400 });
          return;
        }
        payload.composicaoRacial = compUpd.data;
      }
      if (observacao !== undefined) payload.observacao = observacao ? String(observacao).trim() : null;
      if (ativo !== undefined) payload.ativo = !!ativo;

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
    console.error('[animal-breeds] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
