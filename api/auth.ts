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
import { getUserRole } from './_lib/orgAccess.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db, pool, userProfiles, organizations, people } from '../src/DB/index.js';

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

    // Self-healing: se organization_id está nulo mas owner_id está correto, sincroniza
    if (!profile.organizationId && clientId) {
      await db
        .update(userProfiles)
        .set({ organizationId: clientId, updatedAt: new Date() })
        .where(eq(userProfiles.id, userId));
      profile.organizationId = clientId;
    }
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
    let profile = await getProfileWithClientId(userId);

    // Reconciliação: se ba_user existe mas user_profiles não, criar automaticamente
    if (!profile) {
      try {
        const result = await pool.query<{ id: string; email: string; name: string }>(
          'SELECT id, email, name FROM ba_user WHERE id = $1',
          [userId],
        );
        const baUser = result.rows[0];
        if (baUser) {
          await db.insert(userProfiles).values({
            id: baUser.id,
            email: baUser.email,
            name: baUser.name ?? baUser.email.split('@')[0],
            role: 'visitante',
            status: 'active',
            ativo: true,
            avatar: (baUser.name ?? baUser.email).charAt(0).toUpperCase(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          profile = await getProfileWithClientId(userId);
        }
      } catch (err) {
        console.error('[auth] Erro na reconciliação de user_profiles:', err);
      }
    }

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

    const name = (body.name ?? '').trim().slice(0, 200);
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : null;
    const phone = body.phone !== undefined ? body.phone : undefined;
    const plan = body.plan;

    // Apenas administrador pode alterar o plan
    const userRole = await getUserRole(userId).catch(() => 'visitante');
    const safePlan = userRole === 'administrador' ? plan : undefined;

    try {
      await db
        .update(userProfiles)
        .set({
          ...(name ? { name } : {}),
          ...(imageUrl !== null ? { imageUrl, avatar: imageUrl } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(safePlan ? { plan: safePlan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, userId));

      // Propagar name/phone/imageUrl para todos os registros people vinculados
      const peopleSyncFields: Record<string, unknown> = { updatedAt: new Date() };
      if (name) peopleSyncFields.fullName = name;
      if (phone !== undefined) peopleSyncFields.phoneWhatsapp = phone;
      if (imageUrl !== null) peopleSyncFields.photoUrl = imageUrl;
      if (Object.keys(peopleSyncFields).length > 1) {
        await db.update(people).set(peopleSyncFields).where(eq(people.userId, userId)).catch(() => {});
      }

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
