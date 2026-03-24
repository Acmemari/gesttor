/**
 * API de organizações (CRUD completo).
 *
 * GET  /api/organizations                              → lista com filtros
 * GET  /api/organizations?id=xxx                       → org + owners
 * GET  /api/organizations?action=check-name&name=xxx   → verifica nome único
 * POST /api/organizations                              → criar
 * PATCH /api/organizations                             → atualizar (inclui owners)
 * PATCH /api/organizations (body.action='deactivate')  → soft delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, and } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { userProfiles, organizations, organizationAnalysts, people } from '../src/DB/schema.js';
import {
  checkOrganizationNameExists,
  listOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deactivateOrganization,
  saveOrganizationOwners,
  getOrganizationDocuments,
  createOrganizationDocument,
  deleteOrganizationDocument,
  updateOrganizationDocument,
  listOrgAnalysts,
  addOrgAnalyst,
  removeOrgAnalyst,
  updateOrgAnalystPermissions,
  listAvailableAnalysts,
  getOrganizationOwners,
  type OrgOwnerInput,
} from '../src/DB/repositories/organizations.js';

/** Converte erros de constraint única do Postgres em mensagens legíveis. */
function mapDbConstraintError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  if (e['code'] !== '23505') return null; // não é unique_violation
  const detail = String(e['detail'] ?? e['constraint'] ?? '').toLowerCase();
  if (detail.includes('email')) return 'Este e-mail já está em uso por outra organização.';
  if (detail.includes('cnpj')) return 'Este CNPJ já está cadastrado em outra organização.';
  if (detail.includes('name')) return 'Nome de organização já está em uso.';
  return 'Já existe um registro com esses dados. Verifique e-mail ou CNPJ.';
}

async function getUserRole(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return p?.role ?? null;
}

/** Cria automaticamente um registro incompleto em `people` para um analista vinculado a uma org. */
async function autoCreatePessoaForAnalyst(analystUserId: string, organizationId: string): Promise<void> {
  const [profile] = await db
    .select({ name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles)
    .where(eq(userProfiles.id, analystUserId))
    .limit(1);
  if (!profile) return;

  const [existing] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, analystUserId), eq(people.organizationId, organizationId)))
    .limit(1);
  if (existing) return;

  await db.insert(people).values({
    id: crypto.randomUUID(),
    fullName: profile.name ?? 'Analista',
    email: profile.email ?? null,
    phoneWhatsapp: null,
    organizationId,
    userId: analystUserId,
    ativo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/** Verifica se o analista (não-admin) tem acesso à organização: principal ou secundário. */
async function assertAnalystOrgAccess(analystId: string, orgId: string, res: VercelResponse): Promise<boolean> {
  const [orgCheck] = await db
    .select({ analystId: organizations.analystId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (orgCheck?.analystId === analystId) return true;
  const [sec] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, orgId), eq(organizationAnalysts.analystId, analystId)))
    .limit(1);
  if (sec) return true;
  jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
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

  const isAdmin = role === 'administrador';
  const isAnalyst = role === 'analista' || isAdmin;
  if (!isAnalyst) {
    jsonError(res, 'Acesso restrito a analistas', { code: 'FORBIDDEN', status: 403 });
    return;
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const q = req.query as Record<string, string | undefined>;
    const { action, id, name, excludeId, search, status, state } = q;
    const offset = Math.max(0, Number(q.offset) || 0);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));

    // Verificação de nome único
    if (action === 'check-name') {
      if (!name) {
        jsonError(res, 'Parâmetro name obrigatório', { code: 'VALIDATION', status: 400 });
        return;
      }
      const exists = await checkOrganizationNameExists(name, excludeId || undefined);
      jsonSuccess(res, { exists });
      return;
    }

    // Organização única com owners
    if (id) {
      const org = await getOrganizationById(id);
      if (!org) {
        jsonError(res, 'Organização não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      if (!isAdmin && org.analystId !== userId) {
        jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const owners = await getOrganizationOwners(id);
      jsonSuccess(res, { ...org, owners, ownersCount: owners.length });
      return;
    }

    // Lista de documentos
    if (action === 'documents' && q.organizationId) {
      if (!isAdmin && !(await assertAnalystOrgAccess(userId, q.organizationId, res))) return;
      const docs = await getOrganizationDocuments(q.organizationId);
      jsonSuccess(res, docs);
      return;
    }

    // Lista de analistas da organização
    if (action === 'analysts' && q.organizationId) {
      if (!isAdmin && !(await assertAnalystOrgAccess(userId, q.organizationId, res))) return;
      const analysts = await listOrgAnalysts(q.organizationId);
      jsonSuccess(res, analysts);
      return;
    }

    // Lista de analistas disponíveis para adicionar à organização
    if (action === 'available-analysts' && q.organizationId) {
      if (!isAdmin && !(await assertAnalystOrgAccess(userId, q.organizationId, res))) return;
      const available = await listAvailableAnalysts(q.organizationId, q.excludeUserId);
      jsonSuccess(res, available);
      return;
    }

    // Lista de organizações
    const analystId = isAdmin ? (q.analystId ?? null) : userId;
    const result = await listOrganizations({
      analystId,
      search: search || null,
      status: status || null,
      state: state || null,
      offset,
      limit,
    });
    jsonSuccess(res, result.rows, { hasMore: result.hasMore, offset, limit });
    return;
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as {
      action?: string;
      name?: string;
      email?: string;
      phone?: string | null;
      cnpj?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      plan?: string;
      owners?: OrgOwnerInput[];
      // Para documentos
      organizationId?: string;
      uploadedBy?: string;
      fileName?: string;
      originalName?: string;
      fileType?: string;
      fileSize?: number;
      storagePath?: string;
      category?: string;
      description?: string;
    };

    // Criar documento
    if (body.action === 'create-document') {
      if (!body.organizationId || !body.storagePath || !body.originalName || !body.fileType || !body.fileSize) {
        jsonError(res, 'Campos obrigatórios: organizationId, storagePath, originalName, fileType, fileSize', { code: 'VALIDATION', status: 400 });
        return;
      }
      const doc = await createOrganizationDocument({
        organizationId: body.organizationId,
        uploadedBy: userId,
        fileName: body.fileName || body.storagePath,
        originalName: body.originalName,
        fileType: body.fileType,
        fileSize: body.fileSize,
        storagePath: body.storagePath,
        category: body.category,
        description: body.description,
      });
      jsonSuccess(res, doc);
      return;
    }

    // Adicionar analista à organização
    if (body.action === 'add-analyst') {
      const { organizationId, analystId, permissions } = body as { organizationId?: string; analystId?: string; permissions?: Record<string, unknown> };
      if (!organizationId || !analystId) {
        jsonError(res, 'organizationId e analystId obrigatórios', { code: 'VALIDATION', status: 400 });
        return;
      }
      if (!isAdmin) {
        // Apenas o analista principal da org pode adicionar outros analistas
        const [org] = await db.select({ analystId: organizations.analystId }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        if (org?.analystId !== userId) {
          jsonError(res, 'Apenas o analista principal pode adicionar analistas', { code: 'FORBIDDEN', status: 403 });
          return;
        }
      }
      const row = await addOrgAnalyst(organizationId, analystId, permissions ?? {});
      await autoCreatePessoaForAnalyst(analystId, organizationId);
      jsonSuccess(res, row);
      return;
    }

    // Criar organização
    if (!body.name?.trim()) {
      jsonError(res, 'name é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    // email is optional — defaults to empty string if not provided

    const nameExists = await checkOrganizationNameExists(body.name.trim());
    if (nameExists) {
      jsonError(res, 'Nome de organização já está em uso', { code: 'VALIDATION', status: 400 });
      return;
    }

    try {
      const org = await createOrganization({
        name: body.name.trim(),
        email: (body.email ?? '').trim(),
        phone: body.phone ?? null,
        cnpj: body.cnpj ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        plan: body.plan ?? 'essencial',
        analystId: userId,
      });

      const savedOwners = body.owners?.length
        ? await saveOrganizationOwners(org.id, body.owners) ?? []
        : [];

      await autoCreatePessoaForAnalyst(userId, org.id);

      jsonSuccess(res, {
        ...org,
        createdAt: org.createdAt?.toISOString() ?? '',
        updatedAt: org.updatedAt?.toISOString() ?? '',
        owners: savedOwners,
        ownersCount: savedOwners.length,
        farmsCount: 0,
      });
    } catch (err) {
      const friendly = mapDbConstraintError(err);
      if (friendly) {
        jsonError(res, friendly, { code: 'CONFLICT', status: 409 });
      } else {
        throw err;
      }
    }
    return;
  }

  // ── PATCH ──────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as {
      id?: string;
      action?: string;
      documentId?: string;
      category?: string;
      description?: string;
      name?: string;
      email?: string;
      phone?: string | null;
      cnpj?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      status?: string;
      plan?: string;
      ativo?: boolean;
      analystId?: string;
      owners?: OrgOwnerInput[];
    };

    // Atualizar permissões de analista secundário
    if (body.action === 'update-analyst-permissions') {
      const { id: analystLinkId, permissions } = body as { id?: string; permissions?: Record<string, unknown> };
      if (!analystLinkId) {
        jsonError(res, 'id obrigatório', { code: 'VALIDATION', status: 400 });
        return;
      }
      if (!isAdmin) {
        // Busca a org pelo vínculo e verifica se o caller é o analista principal
        const [link] = await db
          .select({ organizationId: organizationAnalysts.organizationId })
          .from(organizationAnalysts)
          .where(eq(organizationAnalysts.id, analystLinkId))
          .limit(1);
        if (!link) {
          jsonError(res, 'Vínculo não encontrado', { code: 'NOT_FOUND', status: 404 });
          return;
        }
        const [orgCheck] = await db
          .select({ analystId: organizations.analystId })
          .from(organizations)
          .where(eq(organizations.id, link.organizationId))
          .limit(1);
        if (!orgCheck || orgCheck.analystId !== userId) {
          jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
          return;
        }
      }
      await updateOrgAnalystPermissions(analystLinkId, permissions ?? {});
      jsonSuccess(res, { updated: true });
      return;
    }

    // Atualizar documento (category / description)
    if (body.action === 'update-document') {
      if (!body.documentId) {
        jsonError(res, 'documentId é obrigatório', { code: 'VALIDATION', status: 400 });
        return;
      }
      await updateOrganizationDocument(body.documentId, {
        category: body.category,
        description: body.description,
      });
      jsonSuccess(res, { updated: true });
      return;
    }

    if (!body.id) {
      jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }

    // Verificar propriedade da org antes de qualquer mutação
    if (!isAdmin) {
      const [orgCheck] = await db
        .select({ analystId: organizations.analystId })
        .from(organizations)
        .where(eq(organizations.id, body.id))
        .limit(1);
      if (!orgCheck || orgCheck.analystId !== userId) {
        jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
        return;
      }
    }

    // Soft delete
    if (body.action === 'deactivate') {
      const org = await deactivateOrganization(body.id);
      jsonSuccess(res, { ...org, createdAt: org.createdAt?.toISOString() ?? '', updatedAt: org.updatedAt?.toISOString() ?? '' });
      return;
    }

    // Verificar nome único se mudou
    if (body.name?.trim()) {
      const nameExists = await checkOrganizationNameExists(body.name.trim(), body.id);
      if (nameExists) {
        jsonError(res, 'Nome de organização já está em uso', { code: 'VALIDATION', status: 400 });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.email !== undefined) updates.email = body.email.trim();
    if ('phone' in body) updates.phone = body.phone ?? null;
    if ('cnpj' in body) updates.cnpj = body.cnpj ?? null;
    if ('address' in body) updates.address = body.address ?? null;
    if ('city' in body) updates.city = body.city ?? null;
    if ('state' in body) updates.state = body.state ?? null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.plan !== undefined) updates.plan = body.plan;
    if (body.ativo !== undefined) updates.ativo = body.ativo;
    if (isAdmin && body.analystId !== undefined) {
      const [targetProfile] = await db
        .select({ role: userProfiles.role })
        .from(userProfiles)
        .where(eq(userProfiles.id, body.analystId))
        .limit(1);
      if (!targetProfile) {
        jsonError(res, 'Usuário não encontrado para o analystId informado', { code: 'VALIDATION', status: 400 });
        return;
      }
      if (targetProfile.role !== 'analista') {
        jsonError(res, 'O usuário informado não possui o perfil de analista', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.analystId = body.analystId;
    }

    try {
      const org = await updateOrganization(body.id, updates as Parameters<typeof updateOrganization>[1]);

      if (body.owners !== undefined) {
        await saveOrganizationOwners(body.id, body.owners);
      }

      jsonSuccess(res, {
        ...org,
        createdAt: org.createdAt?.toISOString() ?? '',
        updatedAt: org.updatedAt?.toISOString() ?? '',
      });
    } catch (err) {
      const friendly = mapDbConstraintError(err);
      if (friendly) {
        jsonError(res, friendly, { code: 'CONFLICT', status: 409 });
      } else {
        throw err;
      }
    }
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const q = req.query as Record<string, string | undefined>;

    // Remover analista da organização
    if (q.action === 'remove-analyst' && q.id) {
      if (!isAdmin) {
        // Verifica que o caller é o analista principal da organização
        const [link] = await db
          .select({ organizationId: organizationAnalysts.organizationId })
          .from(organizationAnalysts)
          .where(eq(organizationAnalysts.id, q.id))
          .limit(1);
        if (!link) {
          jsonError(res, 'Vínculo não encontrado', { code: 'NOT_FOUND', status: 404 });
          return;
        }
        const [orgCheck] = await db
          .select({ analystId: organizations.analystId })
          .from(organizations)
          .where(eq(organizations.id, link.organizationId))
          .limit(1);
        if (!orgCheck || orgCheck.analystId !== userId) {
          jsonError(res, 'Apenas o analista principal pode remover analistas', { code: 'FORBIDDEN', status: 403 });
          return;
        }
      }
      const result = await removeOrgAnalyst(q.id);
      if (!result.deleted) {
        jsonError(res, result.error ?? 'Não foi possível remover o analista', { code: 'FORBIDDEN', status: 400 });
        return;
      }
      jsonSuccess(res, { deleted: true });
      return;
    }

    // Excluir documento do banco, retorna storagePath para remoção do B2
    if (q.action === 'delete-document' && q.documentId) {
      const storagePath = await deleteOrganizationDocument(q.documentId);
      jsonSuccess(res, { deleted: true, storagePath });
      return;
    }

    // Soft delete de organização por id (apenas admin)
    if (q.id) {
      if (!isAdmin) {
        jsonError(res, 'Apenas administradores podem excluir organizações', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      await db
        .update(organizations)
        .set({ ativo: false, updatedAt: new Date() })
        .where(eq(organizations.id, q.id));
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Ação inválida', { code: 'VALIDATION', status: 400 });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[api/organizations] unhandled error:', message);
    if (!res.headersSent) {
      jsonError(res, message, { status: 500 });
    }
  }
}
