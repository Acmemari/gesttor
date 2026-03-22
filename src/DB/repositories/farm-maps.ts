import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { farmMaps } from '../schema.js';

export async function getFarmMaps(farmId: string) {
  return db.select().from(farmMaps).where(eq(farmMaps.farmId, farmId));
}

export async function getFarmMap(mapId: string) {
  const [row] = await db.select().from(farmMaps).where(eq(farmMaps.id, mapId as any)).limit(1);
  return row;
}

export async function createFarmMap(data: {
  farmId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  geojson?: unknown;
}) {
  const [row] = await db.insert(farmMaps).values({
    farmId: data.farmId,
    fileName: data.fileName,
    originalName: data.originalName,
    fileType: data.fileType,
    fileSize: data.fileSize,
    storagePath: data.storagePath,
    geojson: (data.geojson ?? null) as any,
  }).returning();
  return row;
}

export async function deleteFarmMap(mapId: string) {
  await db.delete(farmMaps).where(eq(farmMaps.id, mapId as any));
}
