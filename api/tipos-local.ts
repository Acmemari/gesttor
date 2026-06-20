/**
 * API route para Tipos de Locais (categorias + tipos, cadastro org-level).
 *
 *   GET    ?organizationId=xxx                                  — auto-seed + { categorias, tipos }
 *   POST   { action: 'create-categoria', organizationId, nome, cor?, icone? }
 *   POST   { action: 'create-tipo', organizationId, categoriaId, nome, cor?, icone?, descricao? }
 *   POST   { action: 'create-detalhe', organizationId, tipoId, nome, cor?, icone? }
 *   POST   { action: 'seed-detalhes', organizationId, tipoId }      — insere defaults do tipo
 *   POST   { action: 'reorder-categorias', items: [{id, ordem}] }
 *   POST   { action: 'reorder-tipos', items: [{id, ordem}] }
 *   POST   { action: 'reorder-detalhes', items: [{id, ordem}] }
 *   PATCH  { kind: 'categoria'|'tipo'|'detalhe', id, ...campos } — update
 *   DELETE ?kind=categoria|tipo|detalhe&id=xxx                  — delete (categoria/tipo fazem cascade)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  ensureSeed,
  listByOrganization,
  createCategoria,
  updateCategoria,
  removeCategoria,
  reorderCategorias,
  createTipo,
  updateTipo,
  removeTipo,
  reorderTipos,
  createDetalhe,
  updateDetalhe,
  removeDetalhe,
  reorderDetalhes,
  seedDetalhesForTipo,
} from '../src/DB/repositories/tipos-local.js';

/** String aparada ou null (trata undefined/null/'' como null). */
function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
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
      await ensureSeed(organizationId);
      const data = await listByOrganization(organizationId);
      jsonSuccess(res, data);
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action } = req.body ?? {};

      if (action === 'reorder-categorias' || action === 'reorder-tipos' || action === 'reorder-detalhes') {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          jsonError(res, 'items obrigatório (array de {id, ordem})', { status: 400 });
          return;
        }
        if (action === 'reorder-categorias') await reorderCategorias(items);
        else if (action === 'reorder-tipos') await reorderTipos(items);
        else await reorderDetalhes(items);
        jsonSuccess(res, { reordered: true });
        return;
      }

      if (action === 'create-categoria') {
        const { organizationId, nome, cor, icone } = req.body ?? {};
        if (!organizationId || !nome || !String(nome).trim()) {
          jsonError(res, 'Campos obrigatórios: organizationId, nome', { status: 400 });
          return;
        }
        const row = await createCategoria({
          organizationId,
          nome: String(nome).trim(),
          cor: strOrNull(cor),
          icone: strOrNull(icone),
        });
        jsonSuccess(res, row);
        return;
      }

      if (action === 'create-tipo') {
        const { organizationId, categoriaId, nome, cor, icone, descricao } = req.body ?? {};
        if (!organizationId || !categoriaId || !nome || !String(nome).trim()) {
          jsonError(res, 'Campos obrigatórios: organizationId, categoriaId, nome', { status: 400 });
          return;
        }
        const row = await createTipo({
          organizationId,
          categoriaId,
          nome: String(nome).trim(),
          cor: strOrNull(cor),
          icone: strOrNull(icone),
          descricao: strOrNull(descricao),
        });
        jsonSuccess(res, row);
        return;
      }

      if (action === 'create-detalhe') {
        const { organizationId, tipoId, nome, cor, icone } = req.body ?? {};
        if (!organizationId || !tipoId || !nome || !String(nome).trim()) {
          jsonError(res, 'Campos obrigatórios: organizationId, tipoId, nome', { status: 400 });
          return;
        }
        const row = await createDetalhe({
          organizationId,
          tipoId,
          nome: String(nome).trim(),
          cor: strOrNull(cor),
          icone: strOrNull(icone),
        });
        jsonSuccess(res, row);
        return;
      }

      if (action === 'seed-detalhes') {
        const { organizationId, tipoId } = req.body ?? {};
        if (!organizationId || !tipoId) {
          jsonError(res, 'Campos obrigatórios: organizationId, tipoId', { status: 400 });
          return;
        }
        const result = await seedDetalhesForTipo(organizationId, tipoId);
        jsonSuccess(res, result);
        return;
      }

      jsonError(res, 'action inválida', { status: 400 });
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { kind, id, nome, cor, icone, descricao, categoriaId, tipoId } = req.body ?? {};
      if (!id || (kind !== 'categoria' && kind !== 'tipo' && kind !== 'detalhe')) {
        jsonError(res, "id e kind ('categoria'|'tipo'|'detalhe') obrigatórios", { status: 400 });
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
      if (cor !== undefined) payload.cor = strOrNull(cor);
      if (icone !== undefined) payload.icone = strOrNull(icone);

      if (kind === 'categoria') {
        const row = await updateCategoria(id, payload);
        jsonSuccess(res, row);
        return;
      }

      if (kind === 'detalhe') {
        if (tipoId !== undefined) {
          if (!tipoId) {
            jsonError(res, 'tipoId não pode ser vazio', { status: 400 });
            return;
          }
          payload.tipoId = tipoId;
        }
        const row = await updateDetalhe(id, payload);
        jsonSuccess(res, row);
        return;
      }

      // kind === 'tipo'
      if (descricao !== undefined) payload.descricao = strOrNull(descricao);
      if (categoriaId !== undefined) {
        if (!categoriaId) {
          jsonError(res, 'categoriaId não pode ser vazio', { status: 400 });
          return;
        }
        payload.categoriaId = categoriaId;
      }
      const row = await updateTipo(id, payload);
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const kind = typeof req.query?.kind === 'string' ? req.query.kind : '';
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id || (kind !== 'categoria' && kind !== 'tipo' && kind !== 'detalhe')) {
        jsonError(res, "id e kind ('categoria'|'tipo'|'detalhe') obrigatórios", { status: 400 });
        return;
      }
      if (kind === 'categoria') await removeCategoria(id);
      else if (kind === 'tipo') await removeTipo(id);
      else await removeDetalhe(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    console.error('[tipos-local] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
