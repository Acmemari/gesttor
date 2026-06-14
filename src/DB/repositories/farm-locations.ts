import { eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import {
  farmRetiros, farmSetores, farmLocais, farmLocationLevels,
  mapaRebanhoLancamentos, mapaoLancamentos,
} from '../schema.js';
import { getFarm } from './hierarchy.js';

// Geometria do mapa de áreas: anel [lat,lng][] cru (jsonb).
type Coords = [number, number][];

// ── Retiros ──────────────────────────────────────────────────────────────────

export async function getRetiros(farmId: string) {
  return db.select().from(farmRetiros).where(eq(farmRetiros.farmId, farmId));
}

export async function createRetiro(data: {
  farmId: string;
  name: string;
  totalArea?: string | null;
  isDefault?: boolean;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const [row] = await db.insert(farmRetiros).values({
    farmId: data.farmId,
    name: data.name,
    totalArea: data.totalArea ?? null,
    isDefault: data.isDefault ?? false,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
  }).returning();
  return row;
}

export async function updateRetiro(id: string, data: {
  name?: string;
  totalArea?: string | null;
  isDefault?: boolean;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.totalArea !== undefined) set.totalArea = data.totalArea;
  if (data.isDefault !== undefined) set.isDefault = data.isDefault;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
  const [row] = await db.update(farmRetiros)
    .set(set)
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
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const [row] = await db.insert(farmSetores).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
  }).returning();
  return row;
}

export async function updateSetor(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
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
    geometry: farmLocais.geometry,
    geometrySource: farmLocais.geometrySource,
    tipo: farmLocais.tipo,
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
  geometry?: Coords | null;
  geometrySource?: string | null;
  tipo?: string | null;
}) {
  const [row] = await db.insert(farmLocais).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    setorId: (data.setorId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
    tipo: data.tipo ?? null,
  }).returning();
  return row;
}

export async function updateLocal(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
  tipo?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  if (data.setorId !== undefined) set.setorId = data.setorId;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
  if (data.tipo !== undefined) set.tipo = data.tipo;
  const [row] = await db.update(farmLocais)
    .set(set)
    .where(eq(farmLocais.id, id as any))
    .returning();
  return row;
}

export async function deleteLocal(id: string) {
  await db.delete(farmLocais).where(eq(farmLocais.id, id as any));
}

/**
 * Conta lançamentos que seriam APAGADOS em cascata ao excluir um local
 * (mapa_rebanho/mapão são NOT NULL on delete cascade). As demais referências
 * (nascimento/morte/desmame/mudança/venda/compra) são `set null` — não somem.
 * Usado para avisar o usuário antes de excluir.
 */
export async function countLocalDependents(localId: string): Promise<{ mapaRebanho: number; mapao: number; total: number }> {
  const [mr] = await db.select({ c: sql<number>`count(*)::int` })
    .from(mapaRebanhoLancamentos).where(eq(mapaRebanhoLancamentos.localId, localId as any));
  const [mp] = await db.select({ c: sql<number>`count(*)::int` })
    .from(mapaoLancamentos).where(eq(mapaoLancamentos.localId, localId as any));
  const mapaRebanho = Number(mr?.c ?? 0);
  const mapao = Number(mp?.c ?? 0);
  return { mapaRebanho, mapao, total: mapaRebanho + mapao };
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
  const [retiros, setores, locais, levels, farm] = await Promise.all([
    getRetiros(farmId),
    getSetores(farmId),
    getLocaisByFarm(farmId),
    getLevels(farmId),
    getFarm(farmId),
  ]);
  const perimeter = farm
    ? { geometry: (farm as any).perimeterGeometry ?? null, source: (farm as any).perimeterSource ?? null }
    : { geometry: null, source: null };
  return { retiros, setores, locais, levels, perimeter };
}
