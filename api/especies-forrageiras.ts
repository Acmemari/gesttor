/**
 * API route for espécies forrageiras.
 *
 *   GET    ?organizationId=xxx                                   — list for org
 *   POST   { organizationId, nome, nomeCientifico?, alturas?, imagens?, descricao? } — create
 *   POST   { action: 'reorder', items: [{id, ordem}] }           — reorder
 *   PATCH  { id, ...campos }                                      — update
 *   DELETE ?id=xxx                                               — delete
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
  type AlturasPastejo,
} from '../src/DB/repositories/especies-forrageiras.js';

/** Converte para número finito ou null (aceita vírgula decimal e string vazia). */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Normaliza as alturas-alvo de pastejo, descartando regimes/campos vazios. */
function sanitizeAlturas(input: any): AlturasPastejo {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: AlturasPastejo = {};

  const continuo = input.continuo;
  if (continuo && typeof continuo === 'object') {
    // Campo único atual; idealMin/idealMax aceitos como dados legados.
    const ideal = numOrNull(continuo.ideal ?? continuo.idealMin);
    if (ideal !== null) out.continuo = { ideal };
  }

  const rotacionado = input.rotacionado;
  if (rotacionado && typeof rotacionado === 'object') {
    const entrada = numOrNull(rotacionado.entrada);
    const saida = numOrNull(rotacionado.saida);
    if (entrada !== null || saida !== null) out.rotacionado = { entrada, saida };
  }

  const rotatinuo = input.rotatinuo;
  if (rotatinuo && typeof rotatinuo === 'object') {
    const entrada = numOrNull(rotatinuo.entrada);
    const saida = numOrNull(rotatinuo.saida);
    if (entrada !== null || saida !== null) out.rotatinuo = { entrada, saida };
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
      const { organizationId, nome, nomeCientifico, alturas, imagens, descricao } = req.body ?? {};
      if (!organizationId || !nome || !String(nome).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
        return;
      }
      if (imagens !== undefined && !Array.isArray(imagens)) {
        jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
        return;
      }

      const row = await create({
        organizationId,
        nome: String(nome).trim(),
        nomeCientifico: nomeCientifico !== undefined && nomeCientifico !== null ? String(nomeCientifico).trim() || null : null,
        alturas: sanitizeAlturas(alturas),
        imagens: Array.isArray(imagens) ? imagens.map(String) : [],
        descricao: descricao !== undefined && descricao !== null ? String(descricao).trim() || null : null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, nome, nomeCientifico, alturas, imagens, descricao } = req.body ?? {};
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
      if (nomeCientifico !== undefined) payload.nomeCientifico = nomeCientifico === null ? null : (String(nomeCientifico).trim() || null);
      if (descricao !== undefined) payload.descricao = descricao === null ? null : (String(descricao).trim() || null);
      if (alturas !== undefined) payload.alturas = sanitizeAlturas(alturas);
      if (imagens !== undefined) {
        if (!Array.isArray(imagens)) {
          jsonError(res, 'imagens deve ser um array de strings', { status: 400 });
          return;
        }
        payload.imagens = imagens.map(String);
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
    console.error('[especies-forrageiras] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
