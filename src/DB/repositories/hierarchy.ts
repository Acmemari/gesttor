import { eq, and, ilike, or, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import { farms, organizations, userProfiles, analystFarms, organizationAnalysts } from '../schema.js';

export async function getFarm(id: string) {
  const [row] = await db.select().from(farms).where(eq(farms.id, id)).limit(1);
  return row;
}

export async function getFarms(params: {
  organizationId?: string;
  clientId?: string;
  analystId?: string;
  search?: string;
  includeInactive?: boolean;
  offset?: number;
  limit?: number;
}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (!params.includeInactive) conditions.push(eq(farms.ativo, true));
  if (params.clientId) conditions.push(eq(farms.clientId, params.clientId as any));

  let query = db.select().from(farms).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function createFarm(data: Record<string, unknown>) {
  const [row] = await db.insert(farms).values(data as any).returning();
  return row;
}

export async function updateFarm(id: string, data: Record<string, unknown>) {
  const [row] = await db.update(farms).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(farms.id, id)).returning();
  return row;
}

export async function deactivateFarm(id: string) {
  const [row] = await db.update(farms).set({ ativo: false, updatedAt: new Date() })
    .where(eq(farms.id, id)).returning();
  return row;
}

export async function getAnalystsForAdmin(params: {
  search?: string;
  offset?: number;
  limit?: number;
}) {
  let query = db.select().from(userProfiles)
    .where(eq(userProfiles.role, 'analista'))
    .$dynamic();
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function getOrganizations(params: {
  analystId?: string;
  search?: string;
  offset?: number;
  limit?: number;
  includeInactive?: boolean;
}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (!params.includeInactive) conditions.push(eq(organizations.ativo, true));
  if (params.analystId) conditions.push(eq(organizations.analystId, params.analystId));

  let query = db.select().from(organizations).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function validateHierarchy(_params: unknown) {
  return { valid: true };
}
