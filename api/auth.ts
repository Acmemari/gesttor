/**
 * API de perfil de usuário.
 * Login e signup agora são gerenciados pelo Better Auth em /api/auth/[...all].ts.
 *
 * GET  /api/auth  — (Bearer token) → { ok, data: profile }
 * POST /api/auth  — (Bearer token) → atualiza campos do perfil
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db, pool, userProfiles, organizations } from '../src/DB/index.js';

async function getProfileWithClientId(userId: string) {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) return null;

  let clientId: string | null = null;
  if (profile.role === 'cliente') {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);
    clientId = org?.id ?? null;
  }

  return { ...profile, client_id: clientId };
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

  // ── GET /api/auth — retorna perfil do usuário autenticado ───────────────────
  if (req.method === 'GET') {
    const profile = await getProfileWithClientId(userId);
    if (!profile) {
      jsonError(res, 'Perfil não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    jsonSuccess(res, profile);
    return;
  }

  // ── POST /api/auth — atualiza campos do perfil ──────────────────────────────
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      name?: string;
      imageUrl?: string | null;
      phone?: string | null;
      plan?: string;
    };

    const name = (body.name ?? '').trim();
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : null;
    const phone = body.phone !== undefined ? body.phone : undefined;
    const plan = body.plan;

    try {
      await db
        .update(userProfiles)
        .set({
          ...(name ? { name } : {}),
          ...(imageUrl !== null ? { imageUrl, avatar: imageUrl } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(plan ? { plan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, userId));

      const profile = await getProfileWithClientId(userId);
      if (!profile) {
        jsonError(res, 'Perfil não encontrado após atualização', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      jsonSuccess(res, profile);
    } catch (err) {
      jsonError(res, err instanceof Error ? err.message : String(err), { status: 500 });
    }
    return;
  }

  // ── DELETE /api/auth — exclui a conta do usuário autenticado ───────────────
  if (req.method === 'DELETE') {
    try {
      await db.delete(userProfiles).where(eq(userProfiles.id, userId));
      // ba_session e ba_account têm FK → ba_user com CASCADE, então basta deletar ba_user
      await pool.query('DELETE FROM ba_user WHERE id = $1', [userId]);
      jsonSuccess(res, { deleted: true });
    } catch (err) {
      jsonError(res, err instanceof Error ? err.message : String(err), { status: 500 });
    }
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
