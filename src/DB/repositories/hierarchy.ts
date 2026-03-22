import { eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../index.js';
import { farms, organizations, userProfiles, analystFarms, organizationAnalysts } from '../schema.js';

export type AnalystRow = typeof userProfiles.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type FarmRow = typeof farms.$inferSelect;

export type CreateFarmInput = {
  id: string;
  name: string;
  country: string;
  state?: string | null;
  city: string;
  organizationId?: string | null;
  clientId?: string | null;
  totalArea?: string | number | null;
  pastureArea?: string | number | null;
  agricultureArea?: string | number | null;
  forageProductionArea?: string | number | null;
  agricultureAreaOwned?: string | number | null;
  agricultureAreaLeased?: string | number | null;
  otherCrops?: string | number | null;
  infrastructure?: string | number | null;
  reserveAndAPP?: string | number | null;
  otherArea?: string | number | null;
  propertyValue?: string | number | null;
  operationPecuary?: string | number | null;
  operationAgricultural?: string | number | null;
  otherOperations?: string | number | null;
  agricultureVariation?: string | number | null;
  propertyType?: string | null;
  weightMetric?: string | null;
  averageHerd?: string | number | null;
  herdValue?: string | number | null;
  commercializesGenetics?: boolean;
  productionSystem?: string | null;
  ativo?: boolean;
};

export type UpdateFarmInput = Partial<Omit<CreateFarmInput, 'id'>>;

export async function getFarm(id: string) {
  const [row] = await db.select().from(farms).where(eq(farms.id, id)).limit(1);
  return row;
}

export async function getFarms(
  orgId: string,
  opts: { offset?: number; limit?: number; search?: string | null; includeInactive?: boolean } = {},
): Promise<{ rows: typeof farms.$inferSelect[]; hasMore: boolean }> {
  const { offset = 0, limit = 50, search, includeInactive = false } = opts;

  const conditions: ReturnType<typeof eq>[] = [eq(farms.organizationId, orgId)];
  if (!includeInactive) conditions.push(eq(farms.ativo, true));
  if (search) conditions.push(ilike(farms.name, `%${search}%`));

  const rows = await db
    .select()
    .from(farms)
    .where(and(...conditions))
    .offset(offset)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function createFarm(data: CreateFarmInput, _createdBy?: string) {
  const [row] = await db.insert(farms).values(data as any).returning();
  return row;
}

export async function updateFarm(id: string, data: UpdateFarmInput) {
  const [row] = await db
    .update(farms)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(farms.id, id))
    .returning();
  return row;
}

export async function deactivateFarm(id: string) {
  const [row] = await db
    .update(farms)
    .set({ ativo: false, updatedAt: new Date() })
    .where(eq(farms.id, id))
    .returning();
  return row;
}

export async function getAnalystsForAdmin(
  _userId: string,
  params: { search?: string | null; offset?: number; limit?: number } = {},
): Promise<{ rows: AnalystRow[]; hasMore: boolean }> {
  const { offset = 0, limit = 50, search } = params;

  let query = db.select().from(userProfiles).where(eq(userProfiles.role, 'analista')).$dynamic();
  if (search) query = query.where(and(eq(userProfiles.role, 'analista'), ilike(userProfiles.name, `%${search}%`)));
  query = query.offset(offset).limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function getOrganizations(params: {
  analystId?: string | null;
  organizationId?: string | null;
  search?: string | null;
  offset?: number;
  limit?: number;
  includeInactive?: boolean;
} = {}): Promise<{ rows: OrganizationRow[]; hasMore: boolean }> {
  const { offset = 0, limit = 50, search, analystId, organizationId, includeInactive = false } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (!includeInactive) conditions.push(eq(organizations.ativo, true));
  if (analystId) conditions.push(eq(organizations.analystId, analystId));
  if (organizationId) conditions.push(eq(organizations.id, organizationId));
  if (search) conditions.push(ilike(organizations.name, `%${search}%`));

  let query = db.select().from(organizations).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.offset(offset).limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function validateHierarchy(_params: unknown) {
  return { valid: true };
}
