import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { farmRetiros, farmSetores, farmLocais, farmLocationLevels } from '../schema.js';

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

// ── Setores ──────────────────────────────────────────────────────────────────
// Nível opcional entre Retiro e Local. `retiroId` é nulo quando o nível Retiro
// está desativado (o setor ancora direto na fazenda).

export async function getSetores(farmId: string) {
  return db.select().from(farmSetores).where(eq(farmSetores.farmId, farmId));
}

export async function getSetoresByRetiro(retiroId: string) {
  return db.select().from(farmSetores).where(eq(farmSetores.retiroId, retiroId as any));
}

export async function createSetor(data: {
  farmId: string;
  retiroId?: string | null;
  name: string;
  area?: string | null;
}) {
  const [row] = await db.insert(farmSetores).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
  }).returning();
  return row;
}

export async function updateSetor(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  const [row] = await db.update(farmSetores)
    .set(set)
    .where(eq(farmSetores.id, id as any))
    .returning();
  return row;
}

export async function deleteSetor(id: string) {
  await db.delete(farmSetores).where(eq(farmSetores.id, id as any));
}

// ── Locais ───────────────────────────────────────────────────────────────────

export async function getLocais(retiroId: string) {
  return db.select().from(farmLocais).where(eq(farmLocais.retiroId, retiroId as any));
}

export async function getLocaisBySetor(setorId: string) {
  return db.select().from(farmLocais).where(eq(farmLocais.setorId, setorId as any));
}

export async function getLocaisByFarm(farmId: string) {
  return db.select({
    id: farmLocais.id,
    retiroId: farmLocais.retiroId,
    setorId: farmLocais.setorId,
    farmId: farmLocais.farmId,
    name: farmLocais.name,
    area: farmLocais.area,
    createdAt: farmLocais.createdAt,
    updatedAt: farmLocais.updatedAt,
    retiroName: farmRetiros.name,
    setorName: farmSetores.name,
  })
  .from(farmLocais)
  .leftJoin(farmRetiros, eq(farmLocais.retiroId, farmRetiros.id))
  .leftJoin(farmSetores, eq(farmLocais.setorId, farmSetores.id))
  .where(eq(farmLocais.farmId, farmId));
}

export async function createLocal(data: {
  farmId: string;
  retiroId?: string | null;
  setorId?: string | null;
  name: string;
  area?: string | null;
}) {
  const [row] = await db.insert(farmLocais).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    setorId: (data.setorId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
  }).returning();
  return row;
}

export async function updateLocal(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  if (data.setorId !== undefined) set.setorId = data.setorId;
  const [row] = await db.update(farmLocais)
    .set(set)
    .where(eq(farmLocais.id, id as any))
    .returning();
  return row;
}

export async function deleteLocal(id: string) {
  await db.delete(farmLocais).where(eq(farmLocais.id, id as any));
}

// ── Níveis ativos por fazenda ─────────────────────────────────────────────────
// A Fazenda é sempre a raiz; aqui guardamos apenas quais níveis intermediários/
// folha estão ativos. Sem linha ⇒ default sensato (retiro on, setor off, local on),
// com a exceção: se a fazenda só tem um retiro padrão (legado "sem retiro"),
// o nível Retiro começa desativado para refletir a UX anterior.

export interface LocationLevels {
  retiro: boolean;
  setor: boolean;
  local: boolean;
}

export async function getLevels(farmId: string): Promise<LocationLevels> {
  const [row] = await db.select().from(farmLocationLevels).where(eq(farmLocationLevels.farmId, farmId));
  if (row) return { retiro: row.retiro, setor: row.setor, local: row.local };

  // Sem config explícita: deriva um default a partir dos dados existentes.
  const retiros = await db.select().from(farmRetiros).where(eq(farmRetiros.farmId, farmId));
  const soPadrao = retiros.length === 1 && retiros[0].isDefault === true;
  const semRetiros = retiros.length === 0;
  return { retiro: !(soPadrao || semRetiros), setor: false, local: true };
}

export async function setLevels(farmId: string, levels: LocationLevels): Promise<LocationLevels> {
  const [row] = await db.insert(farmLocationLevels)
    .values({ farmId, retiro: levels.retiro, setor: levels.setor, local: levels.local })
    .onConflictDoUpdate({
      target: farmLocationLevels.farmId,
      set: { retiro: levels.retiro, setor: levels.setor, local: levels.local, updatedAt: new Date() },
    })
    .returning();
  return { retiro: row.retiro, setor: row.setor, local: row.local };
}

// ── Bundle: tudo o que a aba "Locais" precisa numa chamada ─────────────────────

export async function getFarmLocationBundle(farmId: string) {
  const [retiros, setores, locais, levels] = await Promise.all([
    getRetiros(farmId),
    getSetores(farmId),
    getLocaisByFarm(farmId),
    getLevels(farmId),
  ]);
  return { retiros, setores, locais, levels };
}
