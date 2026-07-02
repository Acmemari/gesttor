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
  uploadedBy: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  geojson?: unknown;
  correctedStoragePath?: string | null;
  correctedFileName?: string | null;
  correctedFileSize?: number | null;
  correcaoReport?: unknown;
}) {
  const [row] = await db.insert(farmMaps).values({
    farmId: data.farmId,
    uploadedBy: data.uploadedBy,
    fileName: data.fileName,
    originalName: data.originalName,
    fileType: data.fileType,
    fileSize: data.fileSize,
    storagePath: data.storagePath,
    geojson: (data.geojson ?? null) as any,
    correctedStoragePath: data.correctedStoragePath ?? null,
    correctedFileName: data.correctedFileName ?? null,
    correctedFileSize: data.correctedFileSize ?? null,
    correcaoReport: (data.correcaoReport ?? null) as any,
  }).returning();
  return row;
}

/** Atualiza o GeoJSON e/ou os artefatos da correção de um mapa existente
 *  (re-persistência das ações desfazer/converter mesmo assim — não cria linha nova). */
export async function updateFarmMap(
  mapId: string,
  data: {
    geojson?: unknown;
    correctedStoragePath?: string | null;
    correctedFileName?: string | null;
    correctedFileSize?: number | null;
    correcaoReport?: unknown;
  },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if ('geojson' in data) patch.geojson = data.geojson ?? null;
  if ('correctedStoragePath' in data) patch.correctedStoragePath = data.correctedStoragePath ?? null;
  if ('correctedFileName' in data) patch.correctedFileName = data.correctedFileName ?? null;
  if ('correctedFileSize' in data) patch.correctedFileSize = data.correctedFileSize ?? null;
  if ('correcaoReport' in data) patch.correcaoReport = data.correcaoReport ?? null;
  const [row] = await db.update(farmMaps).set(patch as any).where(eq(farmMaps.id, mapId as any)).returning();
  return row;
}

export async function deleteFarmMap(mapId: string) {
  await db.delete(farmMaps).where(eq(farmMaps.id, mapId as any));
}
