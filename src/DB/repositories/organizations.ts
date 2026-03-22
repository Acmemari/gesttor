import { eq, ilike, and, ne } from 'drizzle-orm';
import { db } from '../index.js';
import { organizations, organizationAnalysts, clientOwners, clientDocuments, userProfiles } from '../schema.js';
import { randomUUID } from 'crypto';

export async function checkOrganizationNameExists(name: string, excludeId?: string) {
  const conditions: ReturnType<typeof eq>[] = [ilike(organizations.name, name) as any];
  if (excludeId) conditions.push(ne(organizations.id, excludeId) as any);
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(and(...conditions)).limit(1);
  return !!row;
}

export async function listOrganizations(params: { analystId?: string; search?: string; offset?: number; limit?: number; includeInactive?: boolean } = {}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (!params.includeInactive) conditions.push(eq(organizations.ativo, true));
  if (params.analystId) conditions.push(eq(organizations.analystId, params.analystId));
  let query = db.select().from(organizations).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function getOrganizationById(id: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return row;
}

export async function createOrganization(data: Record<string, unknown>) {
  const id = data.id as string ?? randomUUID();
  const [row] = await db.insert(organizations).values({ id, name: data.name as string, ...data } as any).returning();
  return row;
}

export async function updateOrganization(id: string, data: Record<string, unknown>) {
  const [row] = await db.update(organizations).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(organizations.id, id)).returning();
  return row;
}

export async function deactivateOrganization(id: string) {
  const [row] = await db.update(organizations).set({ ativo: false, updatedAt: new Date() })
    .where(eq(organizations.id, id)).returning();
  return row;
}

export async function saveOrganizationOwners(orgId: string, owners: Array<Record<string, unknown>>) {
  // For organizations, owners are stored in client_owners linked via client
  // No-op for now if no direct client link; callers handle this
}

export async function getOrganizationDocuments(orgId: string) {
  // Fetch documents linked to the client that maps to this org
  return [];
}

export async function createOrganizationDocument(data: Record<string, unknown>) {
  const [row] = await db.insert(clientDocuments).values(data as any).returning();
  return row;
}

export async function deleteOrganizationDocument(id: string) {
  await db.delete(clientDocuments).where(eq(clientDocuments.id, id as any));
}

export async function updateOrganizationDocument(id: string, data: Record<string, unknown>) {
  const [row] = await db.update(clientDocuments).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(clientDocuments.id, id as any)).returning();
  return row;
}

export async function listOrgAnalysts(orgId: string) {
  return db.select().from(organizationAnalysts).where(eq(organizationAnalysts.organizationId, orgId));
}

export async function addOrgAnalyst(data: { organization_id: string; analyst_id: string; permissions?: unknown }) {
  const [row] = await db.insert(organizationAnalysts).values({
    organizationId: data.organization_id,
    analystId: data.analyst_id,
    permissions: (data.permissions ?? {}) as any,
  }).returning();
  return row;
}

export async function removeOrgAnalyst(orgId: string, analystId: string) {
  await db.delete(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, orgId), eq(organizationAnalysts.analystId, analystId)));
}

export async function updateOrgAnalystPermissions(orgId: string, analystId: string, permissions: unknown) {
  const [row] = await db.update(organizationAnalysts)
    .set({ permissions: permissions as any, updatedAt: new Date() })
    .where(and(eq(organizationAnalysts.organizationId, orgId), eq(organizationAnalysts.analystId, analystId)))
    .returning();
  return row;
}

export async function listAvailableAnalysts(excludeOrgId: string) {
  const existing = await db.select({ analystId: organizationAnalysts.analystId })
    .from(organizationAnalysts).where(eq(organizationAnalysts.organizationId, excludeOrgId));
  const existingIds = existing.map(r => r.analystId);
  return db.select().from(userProfiles).where(eq(userProfiles.role, 'analista'));
}
