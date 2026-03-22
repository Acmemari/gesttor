import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { analystFarms } from '../schema.js';

export async function getFarmPermissions(userId: string, farmId: string) {
  const [row] = await db.select()
    .from(analystFarms)
    .where(and(eq(analystFarms.analystId, userId), eq(analystFarms.farmId, farmId)))
    .limit(1);
  return {
    is_responsible: row?.isResponsible ?? false,
    permissions: row?.permissions ?? {},
  };
}

export async function getFarmPermissionsBatch(userId: string, farmIds: string[]) {
  if (farmIds.length === 0) return [];
  const rows = await db.select().from(analystFarms)
    .where(and(eq(analystFarms.analystId, userId), inArray(analystFarms.farmId, farmIds)));
  return farmIds.map(farmId => {
    const row = rows.find(r => r.farmId === farmId);
    return {
      farm_id: farmId,
      is_responsible: row?.isResponsible ?? false,
      permissions: row?.permissions ?? {},
    };
  });
}
