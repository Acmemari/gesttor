/**
 * API de Empresas de Assessoria (admin-only).
 *
 * GET  /api/emp-ass           → lista todas ativas
 * GET  /api/emp-ass?id=xxx    → busca por id
 * POST /api/emp-ass           → criar
 * PATCH /api/emp-ass?id=xxx   → atualizar ou desativar (body.action='deactivate')
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { userProfiles, empAss } from '../src/DB/schema.js';

async function getUserRole(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return p?.role ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  const role = await getUserRole(userId);
  if (!role) {
    jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
    return;
  }

  if (role !== 'administrador') {
    jsonError(res, 'Acesso restrito a administradores', { code: 'FORBIDDEN', status: 403 });
    return;
  }

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;

    if (id && typeof id === 'string') {
      const [row] = await db
        .select()
        .from(empAss)
        .where(eq(empAss.id, id))
        .limit(1);
      if (!row) {
        jsonError(res, 'Empresa não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      jsonSuccess(res, row);
      return;
    }

    const rows = await db
      .select()
      .from(empAss)
      .where(eq(empAss.ativo, true))
      .orderBy(empAss.nome);
    jsonSuccess(res, rows);
    return;
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, analistas } = req.body ?? {};
    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      jsonError(res, 'Nome da empresa é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const [created] = await db
      .insert(empAss)
      .values({
        nome: nome.trim(),
        analistas: analistas ?? [],
        ativo: true,
      })
      .returning();
    jsonSuccess(res, created);
    return;
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      jsonError(res, 'ID obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }

    const { action, nome, analistas } = req.body ?? {};

    if (action === 'deactivate') {
      const [updated] = await db
        .update(empAss)
        .set({ ativo: false, updatedAt: new Date() })
        .where(eq(empAss.id, id))
        .returning();
      if (!updated) {
        jsonError(res, 'Empresa não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      jsonSuccess(res, updated);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (nome && typeof nome === 'string' && nome.trim()) updates['nome'] = nome.trim();
    if (analistas !== undefined) updates['analistas'] = analistas;

    const [updated] = await db
      .update(empAss)
      .set(updates)
      .where(eq(empAss.id, id))
      .returning();
    if (!updated) {
      jsonError(res, 'Empresa não encontrada', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    jsonSuccess(res, updated);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
