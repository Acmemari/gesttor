import { eq, ilike, and, ne, desc, or, exists } from 'drizzle-orm';
import { db } from '../index.js';
import { organizations, organizationAnalysts, organizationOwners, organizationDocuments, userProfiles } from '../schema.js';
import { randomUUID } from 'crypto';

export type OrgOwnerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
};

export async function checkOrganizationNameExists(name: string, excludeId?: string) {
  const conditions: ReturnType<typeof eq>[] = [ilike(organizations.name, name) as any];
  if (excludeId) conditions.push(ne(organizations.id, excludeId) as any);
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(and(...conditions)).limit(1);
  return !!row;
}

export async function listOrganizations(params: {
  analystId?: string | null;
  search?: string | null;
  status?: string | null;
  state?: string | null;
  offset?: number;
  limit?: number;
  includeInactive?: boolean;
} = {}): Promise<{ rows: typeof organizations.$inferSelect[]; hasMore: boolean }> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (!params.includeInactive) conditions.push(eq(organizations.ativo, true));
  if (params.analystId) {
    conditions.push(or(
      eq(organizations.analystId, params.analystId),
      exists(
        db.select({ id: organizationAnalysts.id })
          .from(organizationAnalysts)
          .where(and(
            eq(organizationAnalysts.organizationId, organizations.id),
            eq(organizationAnalysts.analystId, params.analystId),
          ))
      ),
    ) as any);
  }
  if (params.status) conditions.push(eq(organizations.status, params.status));
  if (params.state) conditions.push(eq(organizations.state, params.state));
  if (params.search) conditions.push(ilike(organizations.name, `%${params.search}%`) as any);

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  let query = db.select().from(organizations).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.offset(offset).limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function getOrganizationById(id: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return row;
}

export async function createOrganization(data: Record<string, unknown>) {
  const id = (data.id as string) ?? randomUUID();
  const [row] = await db.insert(organizations).values({ id, name: data.name as string, ...data } as any).returning();
  return row;
}

export async function updateOrganization(id: string, data: Record<string, unknown>) {
  const [row] = await db
    .update(organizations)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(organizations.id, id))
    .returning();
  return row;
}

export async function deactivateOrganization(id: string) {
  const [row] = await db
    .update(organizations)
    .set({ ativo: false, updatedAt: new Date() })
    .where(eq(organizations.id, id))
    .returning();
  return row;
}

export async function saveOrganizationOwners(orgId: string, owners: OrgOwnerInput[]) {
  await db.delete(organizationOwners).where(eq(organizationOwners.organizationId, orgId));
  const valid = owners.filter(o => o.name?.trim());
  if (valid.length === 0) return [];
  return db.insert(organizationOwners).values(
    valid.map((o, i) => ({
      organizationId: orgId,
      name: o.name.trim(),
      email: o.email ?? null,
      phone: o.phone ?? null,
      cpf: o.cpf ?? null,
      sortOrder: i,
    })),
  ).returning();
}

export async function getOrganizationOwners(orgId: string) {
  return db
    .select()
    .from(organizationOwners)
    .where(eq(organizationOwners.organizationId, orgId))
    .orderBy(organizationOwners.sortOrder);
}

export async function getOrganizationDocuments(orgId: string) {
  return db
    .select()
    .from(organizationDocuments)
    .where(eq(organizationDocuments.organizationId, orgId))
    .orderBy(desc(organizationDocuments.createdAt));
}

export async function createOrganizationDocument(data: Record<string, unknown>) {
  const [row] = await db.insert(organizationDocuments).values(data as any).returning();
  return row;
}

export async function deleteOrganizationDocument(id: string): Promise<string | null> {
  const [row] = await db
    .delete(organizationDocuments)
    .where(eq(organizationDocuments.id, id as any))
    .returning({ storagePath: organizationDocuments.storagePath });
  return row?.storagePath ?? null;
}

export async function updateOrganizationDocument(id: string, data: Record<string, unknown>) {
  const [row] = await db
    .update(organizationDocuments)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(organizationDocuments.id, id as any))
    .returning();
  return row;
}

export async function listOrgAnalysts(orgId: string) {
  const [org, rows] = await Promise.all([
    db.select({ analystId: organizations.analystId }).from(organizations).where(eq(organizations.id, orgId)).limit(1),
    db.select().from(organizationAnalysts).where(eq(organizationAnalysts.organizationId, orgId)),
  ]);
  const primaryAnalystId = org[0]?.analystId ?? null;

  const analystIds = rows.map(r => r.analystId);
  const profileResults = analystIds.length > 0
    ? await Promise.all(
        analystIds.map(id =>
          db.select({ id: userProfiles.id, name: userProfiles.name, email: userProfiles.email })
            .from(userProfiles)
            .where(eq(userProfiles.id, id))
            .limit(1)
            .then(r => r[0] ?? null)
        )
      )
    : [];
  const profileMap = Object.fromEntries(
    profileResults.filter(Boolean).map(p => [p!.id, p!])
  );

  return rows.map(r => ({
    id: r.id,
    analyst_id: r.analystId,
    organization_id: r.organizationId,
    permissions: (r.permissions ?? {}) as Record<string, string>,
    is_responsible: r.analystId === primaryAnalystId,
    analyst_name: profileMap[r.analystId]?.name ?? null,
    analyst_email: profileMap[r.analystId]?.email ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function addOrgAnalyst(orgId: string, analystId: string, permissions: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(organizationAnalysts)
    .values({ organizationId: orgId, analystId, permissions: permissions as any })
    .returning();
  return row;
}

/** Remove analyst by link ID (organizationAnalysts.id). Guards against removing the primary analyst. */
export async function removeOrgAnalyst(linkId: string): Promise<{ deleted: boolean; error?: string }> {
  const [link] = await db
    .select({ analystId: organizationAnalysts.analystId, organizationId: organizationAnalysts.organizationId })
    .from(organizationAnalysts)
    .where(eq(organizationAnalysts.id, linkId as any))
    .limit(1);
  if (!link) return { deleted: false, error: 'Vínculo não encontrado' };

  const [org] = await db
    .select({ analystId: organizations.analystId })
    .from(organizations)
    .where(eq(organizations.id, link.organizationId))
    .limit(1);
  if (org?.analystId === link.analystId) {
    return { deleted: false, error: 'Não é possível remover o analista responsável desta forma.' };
  }

  await db.delete(organizationAnalysts).where(eq(organizationAnalysts.id, linkId as any));
  return { deleted: true };
}

/** Update analyst permissions by link ID (organizationAnalysts.id). */
export async function updateOrgAnalystPermissions(linkId: string, permissions: Record<string, unknown>) {
  const [row] = await db
    .update(organizationAnalysts)
    .set({ permissions: permissions as any, updatedAt: new Date() })
    .where(eq(organizationAnalysts.id, linkId as any))
    .returning();
  return row;
}

export async function listAvailableAnalysts(orgId: string, _excludeUserId?: string) {
  const existing = await db
    .select({ analystId: organizationAnalysts.analystId })
    .from(organizationAnalysts)
    .where(eq(organizationAnalysts.organizationId, orgId));
  const existingIds = new Set(existing.map(r => r.analystId));

  const all = await db.select().from(userProfiles).where(eq(userProfiles.role, 'analista'));
  return all.filter(a => !existingIds.has(a.id));
}
