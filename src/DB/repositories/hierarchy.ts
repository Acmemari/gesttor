import { eq, and, ilike, or, exists } from 'drizzle-orm';
import { db } from '../index.js';
import { farms, organizations, userProfiles, organizationAnalysts } from '../schema.js';

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

export async function createFarm(data: CreateFarmInput, createdBy?: string) {
  const [row] = await db.insert(farms).values({
    id: data.id,
    name: data.name,
    country: data.country,
    state: data.state ?? null,
    city: data.city,
    organizationId: data.organizationId ?? null,
    totalArea: data.totalArea != null ? String(data.totalArea) : null,
    pastureArea: data.pastureArea != null ? String(data.pastureArea) : null,
    agricultureArea: data.agricultureArea != null ? String(data.agricultureArea) : null,
    forageProductionArea: data.forageProductionArea != null ? String(data.forageProductionArea) : null,
    agricultureAreaOwned: data.agricultureAreaOwned != null ? String(data.agricultureAreaOwned) : null,
    agricultureAreaLeased: data.agricultureAreaLeased != null ? String(data.agricultureAreaLeased) : null,
    otherCrops: data.otherCrops != null ? String(data.otherCrops) : null,
    infrastructure: data.infrastructure != null ? String(data.infrastructure) : null,
    reserveAndAPP: data.reserveAndAPP != null ? String(data.reserveAndAPP) : null,
    otherArea: data.otherArea != null ? String(data.otherArea) : null,
    propertyValue: data.propertyValue != null ? String(data.propertyValue) : null,
    operationPecuary: data.operationPecuary != null ? String(data.operationPecuary) : null,
    operationAgricultural: data.operationAgricultural != null ? String(data.operationAgricultural) : null,
    otherOperations: data.otherOperations != null ? String(data.otherOperations) : null,
    agricultureVariation: data.agricultureVariation != null ? String(data.agricultureVariation) : '0',
    propertyType: data.propertyType ?? 'Própria',
    weightMetric: data.weightMetric ?? 'Arroba (@)',
    averageHerd: data.averageHerd != null ? String(data.averageHerd) : null,
    herdValue: data.herdValue != null ? String(data.herdValue) : null,
    commercializesGenetics: data.commercializesGenetics ?? false,
    productionSystem: data.productionSystem ?? null,
    ativo: data.ativo ?? true,
    createdBy: createdBy ?? null,
  }).returning();
  return row;
}

export async function updateFarm(id: string, data: UpdateFarmInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.country !== undefined) updates.country = data.country;
  if (data.state !== undefined) updates.state = data.state;
  if (data.city !== undefined) updates.city = data.city;
  if (data.organizationId !== undefined) updates.organizationId = data.organizationId;
  if (data.propertyType !== undefined) updates.propertyType = data.propertyType;
  if (data.weightMetric !== undefined) updates.weightMetric = data.weightMetric;
  if (data.productionSystem !== undefined) updates.productionSystem = data.productionSystem;
  if (data.commercializesGenetics !== undefined) updates.commercializesGenetics = data.commercializesGenetics;
  if (data.ativo !== undefined) updates.ativo = data.ativo;
  // Numeric fields — coerce to string for Drizzle numeric columns
  const numericFields = [
    'totalArea', 'pastureArea', 'agricultureArea', 'forageProductionArea',
    'agricultureAreaOwned', 'agricultureAreaLeased', 'otherCrops', 'infrastructure',
    'reserveAndAPP', 'otherArea', 'propertyValue', 'operationPecuary',
    'operationAgricultural', 'otherOperations', 'agricultureVariation',
    'averageHerd', 'herdValue',
  ] as const;
  for (const field of numericFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field] != null ? String(data[field]) : null;
    }
  }
  const [row] = await db
    .update(farms)
    .set(updates)
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
  if (analystId) conditions.push(
    or(
      eq(organizations.analystId, analystId),
      exists(
        db.select().from(organizationAnalysts)
          .where(and(
            eq(organizationAnalysts.organizationId, organizations.id),
            eq(organizationAnalysts.analystId, analystId),
          ))
      ),
    ) as ReturnType<typeof eq>,
  );
  if (organizationId) conditions.push(eq(organizations.id, organizationId));
  if (search) conditions.push(ilike(organizations.name, `%${search}%`));

  let query = db.select().from(organizations).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.offset(offset).limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function validateHierarchy(params: {
  analystId?: string | null;
  organizationId?: string | null;
  farmId?: string | null;
}): Promise<{ analyst_valid: boolean; organization_valid: boolean; farm_valid: boolean }> {
  const { analystId, organizationId, farmId } = params;

  let analyst_valid = false;
  let organization_valid = false;
  let farm_valid = false;

  if (analystId) {
    const [row] = await db.select({ id: userProfiles.id })
      .from(userProfiles)
      .where(and(eq(userProfiles.id, analystId), eq(userProfiles.role, 'analista')))
      .limit(1);
    analyst_valid = !!row;
  }

  if (organizationId) {
    const [row] = await db.select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), eq(organizations.ativo, true)))
      .limit(1);
    organization_valid = !!row;
  }

  if (farmId) {
    const [row] = await db.select({ id: farms.id })
      .from(farms)
      .where(and(eq(farms.id, farmId), eq(farms.ativo, true)))
      .limit(1);
    farm_valid = !!row;
  }

  return { analyst_valid, organization_valid, farm_valid };
}
