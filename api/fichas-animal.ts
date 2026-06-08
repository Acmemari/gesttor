/**
 * API route da Ficha Animal (Pecuário › Cadastros › Ficha Animal).
 *
 *   GET    ?organizationId=xxx   — lista as fichas da organização
 *   POST   { organizationId, apelido, ...campos }  — cria
 *   PATCH  { id, ...campos }     — atualiza (parcial)
 *   DELETE ?id=xxx               — remove
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listByOrganization,
  create,
  update,
  remove,
  type FichaAnimalWritable,
} from '../src/DB/repositories/fichas-animal.js';

/** Colunas de texto aceitas no corpo. Vazio → null. */
const TEXT_FIELDS = [
  'farmId', 'nascimentoFichaId', 'nome', 'categoriaId', 'sexo', 'raca', 'grau',
  'pelagem', 'chifre', 'frame', 'categoriaGenealogica', 'ceip', 'porte', 'lote',
  'rfid', 'sisbov', 'rgn', 'rgd', 'serie', 'pesagem', 'obs', 'eventoEntrada',
  'dataEntrada', 'data', 'colostro', 'parto', 'fazendaNascimento', 'pai',
  'mae', 'avoPaterno', 'avoMaterno',
] as const;

/** Colunas numéricas (peso em Kg). Aceita vírgula decimal; inválido → null. */
const NUMERIC_FIELDS = ['peso', 'pesoNascer'] as const;

function normalizeNumeric(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  return Number.isFinite(Number(s)) ? s : null;
}

/** Monta o objeto gravável a partir do corpo, normalizando '' → null. */
function buildWritable(body: any): FichaAnimalWritable {
  const out: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) {
      const v = body[f];
      out[f] = v === null || String(v).trim() === '' ? null : String(v).trim();
    }
  }
  for (const f of NUMERIC_FIELDS) {
    if (body[f] !== undefined) out[f] = normalizeNumeric(body[f]);
  }
  if (body.situacao !== undefined) out.situacao = String(body.situacao || 'ativo');
  if (body.extras !== undefined && body.extras !== null && typeof body.extras === 'object') {
    out.extras = body.extras;
  }
  return out as FichaAnimalWritable;
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

    // ── POST (create) ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { organizationId, apelido } = req.body ?? {};
      if (!organizationId || !apelido || !String(apelido).trim()) {
        jsonError(res, 'Campos obrigatórios: organizationId, apelido (ID Manejo)', { status: 400 });
        return;
      }
      const row = await create({
        organizationId,
        apelido: String(apelido).trim(),
        criadoPor: userId,
        ...buildWritable(req.body),
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH (update) ─────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, apelido } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const payload = buildWritable(req.body);
      if (apelido !== undefined) {
        if (!String(apelido).trim()) {
          jsonError(res, 'apelido (ID Manejo) não pode ser vazio', { status: 400 });
          return;
        }
        payload.apelido = String(apelido).trim();
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
    console.error('[fichas-animal] error:', err);
    // Violação do unique (apelido por org) → mensagem amigável.
    if (err?.code === '23505') {
      jsonError(res, 'Já existe uma ficha com este ID Manejo nesta organização', { status: 409 });
      return;
    }
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
