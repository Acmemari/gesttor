import { eq, ilike, and, ne } from 'drizzle-orm';
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
  if (params.analystId) conditions.push(eq(organizations.analystId, params.analystId));
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
  if (valid.length === 0) return;
  await db.insert(organizationOwners).values(
    valid.map((o, i) => ({
      organizationId: orgId,
      name: o.name.trim(),
      email: o.email ?? null,
      phone: o.phone ?? null,
      cpf: o.cpf ?? null,
      sortOrder: i,
    })),
  );
}

export async function getOrganizationOwners(orgId: string) {
  return db
    .select()
    .from(organizationOwners)
    .where(eq(organizationOwners.organizationId, orgId))
    .orderBy(organizationOwners.sortOrder);
}

export async function getOrganizationDocuments(_orgId: string) {
  return [];
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
  return db.select().from(organizationAnalysts).where(eq(organizationAnalysts.organizationId, orgId));
}

export async function addOrgAnalyst(orgId: string, analystId: string, permissions: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(organizationAnalysts)
    .values({ organizationId: orgId, analystId, permissions: permissions as any })
    .returning();
  return row;
}

/** Remove analyst by link ID (organizationAnalysts.id). */
export async function removeOrgAnalyst(linkId: string) {
  await db.delete(organizationAnalysts).where(eq(organizationAnalysts.id, linkId as any));
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
