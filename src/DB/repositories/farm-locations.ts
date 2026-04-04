import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { farmRetiros, farmLocais } from '../schema.js';

// ── Retiros ──────────────────────────────────────────────────────────────────

export async function getRetiros(farmId: string) {
  return db.select().from(farmRetiros).where(eq(farmRetiros.farmId, farmId));
}

export async function createRetiro(data: {
  farmId: string;
  name: string;
  totalArea?: string | null;
  isDefault?: boolean;
}) {
  const [row] = await db.insert(farmRetiros).values({
    farmId: data.farmId,
    name: data.name,
    totalArea: data.totalArea ?? null,
    isDefault: data.isDefault ?? false,
  }).returning();
  return row;
}

export async function updateRetiro(id: string, data: {
  name?: string;
  totalArea?: string | null;
  isDefault?: boolean;
}) {
  const [row] = await db.update(farmRetiros)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(farmRetiros.id, id as any))
    .returning();
  return row;
}

export async function deleteRetiro(id: string) {
  await db.delete(farmRetiros).where(eq(farmRetiros.id, id as any));
}

// ── Locais ───────────────────────────────────────────────────────────────────

export async function getLocais(retiroId: string) {
  return db.select().from(farmLocais).where(eq(farmLocais.retiroId, retiroId as any));
}

export async function getLocaisByFarm(farmId: string) {
  return db.select().from(farmLocais).where(eq(farmLocais.farmId, farmId));
}

export async function createLocal(data: {
  retiroId: string;
  farmId: string;
  name: string;
  area?: string | null;
}) {
  const [row] = await db.insert(farmLocais).values({
    retiroId: data.retiroId as any,
    farmId: data.farmId,
    name: data.name,
    area: data.area ?? null,
  }).returning();
  return row;
}

export async function updateLocal(id: string, data: {
  name?: string;
  area?: string | null;
}) {
  const [row] = await db.update(farmLocais)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(farmLocais.id, id as any))
    .returning();
  return row;
}

export async function deleteLocal(id: string) {
  await db.delete(farmLocais).where(eq(farmLocais.id, id as any));
}
