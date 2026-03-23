import { eq, and, inArray, or } from 'drizzle-orm';
import { db } from '../index.js';
import { farms, organizations, organizationAnalysts } from '../schema.js';

export async function getFarmPermissions(userId: string, farmId: string) {
  const [row] = await db.select({
    isPrimary: eq(organizations.analystId, userId),
    secPermissions: organizationAnalysts.permissions,
  })
    .from(farms)
    .innerJoin(organizations, eq(farms.organizationId, organizations.id))
    .leftJoin(organizationAnalysts, and(
      eq(organizationAnalysts.organizationId, organizations.id),
      eq(organizationAnalysts.analystId, userId)
    ))
    .where(and(
      eq(farms.id, farmId),
      or(
        eq(organizations.analystId, userId),
        eq(organizationAnalysts.analystId, userId)
      )
    ))
    .limit(1);

  if (!row) {
    return { is_responsible: false, permissions: {} };
  }

  return {
    is_responsible: row.isPrimary ?? false,
    permissions: row.secPermissions ?? {},
  };
}

export async function getFarmPermissionsBatch(userId: string, farmIds: string[]) {
  if (farmIds.length === 0) return [];
  const rows = await db.select({
    farmId: farms.id,
    isPrimary: eq(organizations.analystId, userId),
    secPermissions: organizationAnalysts.permissions,
  })
    .from(farms)
    .innerJoin(organizations, eq(farms.organizationId, organizations.id))
    .leftJoin(organizationAnalysts, and(
      eq(organizationAnalysts.organizationId, organizations.id),
      eq(organizationAnalysts.analystId, userId)
    ))
    .where(and(
      inArray(farms.id, farmIds),
      or(
        eq(organizations.analystId, userId),
        eq(organizationAnalysts.analystId, userId)
      )
    ));

  return farmIds.map(farmId => {
    const row = rows.find(r => r.farmId === farmId);
    return {
      farm_id: farmId,
      is_responsible: row?.isPrimary ?? false,
      permissions: row?.secPermissions ?? {},
    };
  });
}
