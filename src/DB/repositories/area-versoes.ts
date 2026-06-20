import { eq, and, asc, isNull, lte, gt, or, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { areaVersoes, farmRetiros, farmSetores, farmLocais, farms } from '../schema.js';

/**
 * Repositório da linha do tempo das áreas (area_versoes).
 *
 * Cada versão é a "foto" (geometria + uso) vigente num intervalo meio-aberto
 * [valid_from, valid_to). valid_to = null ⇒ versão corrente/aberta. É DERIVADA do
 * ledger area_movimentos: cada operação que muda forma/uso FECHA a versão aberta
 * (closeOpenVersao) e ABRE uma nova (createVersao), na MESMA transação do evento.
 *
 * createVersao/closeOpenVersao são helpers tx-scoped consumidos por
 * area-movimentos.ts. reconstruct/listByArea são leituras (slider e histórico).
 */

export type Coords = [number, number][];
export type Nivel = 'retiro' | 'setor' | 'local';

/** Limpa um anel [lat,lng][] — porta server-side de util.cleanRing (sem turf). */
export function cleanRingServer(coords: unknown): Coords {
  if (!Array.isArray(coords)) return [];
  const out: Coords = [];
  for (const p of coords as any[]) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;            // sentinela nula
    out.push([lat, lng]);
  }
  return out;
}

export interface CreateVersaoInput {
  areaId: string;
  nivel: Nivel;
  organizationId: string;
  farmId: string;
  validFrom: string;                 // 'AAAA-MM-DD'
  geometry?: Coords | null;
  geometrySource?: string | null;
  uso?: string | null;
  areaHa?: string | null;            // numeric como string (convenção drizzle)
  movimentoId?: string | null;
}

/**
 * Abre uma nova versão (valid_to = null). Chamada DENTRO da tx do movimento.
 * Valida geometria quando informada (mín. 3 vértices após limpeza).
 */
export async function createVersao(tx: any, i: CreateVersaoInput) {
  let geometry = i.geometry ?? null;
  if (geometry != null) {
    const limpo = cleanRingServer(geometry);
    if (limpo.length < 3) throw new Error('GEOMETRY_INVALIDA');
    geometry = limpo;
  }
  const [row] = await tx.insert(areaVersoes).values({
    areaId: i.areaId as any,
    nivel: i.nivel,
    organizationId: i.organizationId as any,
    farmId: i.farmId,
    validFrom: i.validFrom,
    validTo: null,
    geometry: geometry as any,
    geometrySource: i.geometrySource ?? null,
    uso: i.uso ?? null,
    areaHa: (i.areaHa ?? null) as any,
    movimentoId: (i.movimentoId ?? null) as any,
  }).returning();
  return row;
}

/** Fecha a versão aberta de uma identidade (valid_to = validTo). No-op se não houver. */
export async function closeOpenVersao(tx: any, areaId: string, validTo: string) {
  const [row] = await tx.update(areaVersoes)
    .set({ validTo })
    .where(and(eq(areaVersoes.areaId, areaId as any), isNull(areaVersoes.validTo)))
    .returning();
  return row ?? null;
}

/** Lê a versão aberta de uma identidade (ou null). */
export async function getOpenVersao(tx: any, areaId: string) {
  const [row] = await tx.select().from(areaVersoes)
    .where(and(eq(areaVersoes.areaId, areaId as any), isNull(areaVersoes.validTo)));
  return row ?? null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Histórico completo (todas as versões) de uma identidade, mais antiga → recente. */
export async function listByArea(areaId: string) {
  return db.select().from(areaVersoes)
    .where(eq(areaVersoes.areaId, areaId as any))
    .orderBy(asc(areaVersoes.validFrom), asc(areaVersoes.createdAt));
}

/**
 * Reconstrução: estado de TODAS as áreas de uma fazenda numa data X.
 * Vigente em X ⇔ valid_from <= X AND (valid_to IS NULL OR valid_to > X).
 * Intervalo meio-aberto (valid_to > X): a versão que fecha exatamente em X já não
 * aparece em X — sua sucessora (valid_from = X) é a vigente.
 */
export async function reconstruct(farmId: string, date: string) {
  const vigente = and(
    eq(areaVersoes.farmId, farmId),
    lte(areaVersoes.validFrom, date),
    or(isNull(areaVersoes.validTo), gt(areaVersoes.validTo, date)),
  );

  const retiros = await db.select({
    areaId: areaVersoes.areaId,
    nivel: areaVersoes.nivel,
    validFrom: areaVersoes.validFrom,
    validTo: areaVersoes.validTo,
    geometry: areaVersoes.geometry,
    geometrySource: areaVersoes.geometrySource,
    uso: areaVersoes.uso,
    areaHa: areaVersoes.areaHa,
    name: farmRetiros.name,
    parentId: sql<string | null>`NULL`,
    tipo: sql<string | null>`NULL`,
  })
    .from(areaVersoes)
    .leftJoin(farmRetiros, eq(farmRetiros.id, areaVersoes.areaId))
    .where(and(vigente, eq(areaVersoes.nivel, 'retiro')));

  const setores = await db.select({
    areaId: areaVersoes.areaId,
    nivel: areaVersoes.nivel,
    validFrom: areaVersoes.validFrom,
    validTo: areaVersoes.validTo,
    geometry: areaVersoes.geometry,
    geometrySource: areaVersoes.geometrySource,
    uso: areaVersoes.uso,
    areaHa: areaVersoes.areaHa,
    name: farmSetores.name,
    parentId: farmSetores.retiroId,
    tipo: sql<string | null>`NULL`,
  })
    .from(areaVersoes)
    .leftJoin(farmSetores, eq(farmSetores.id, areaVersoes.areaId))
    .where(and(vigente, eq(areaVersoes.nivel, 'setor')));

  const locais = await db.select({
    areaId: areaVersoes.areaId,
    nivel: areaVersoes.nivel,
    validFrom: areaVersoes.validFrom,
    validTo: areaVersoes.validTo,
    geometry: areaVersoes.geometry,
    geometrySource: areaVersoes.geometrySource,
    uso: areaVersoes.uso,
    areaHa: areaVersoes.areaHa,
    name: farmLocais.name,
    // parent = setor ?? retiro (mesma ancoragem do modelo de localização).
    parentId: sql<string | null>`COALESCE(${farmLocais.setorId}, ${farmLocais.retiroId})`,
    tipo: farmLocais.tipo,
  })
    .from(areaVersoes)
    .leftJoin(farmLocais, eq(farmLocais.id, areaVersoes.areaId))
    .where(and(vigente, eq(areaVersoes.nivel, 'local')));

  // Perímetro da fazenda (não versionado neste momento — usado só p/ enquadrar o
  // mapa e mostrar o contorno na reconstrução).
  const [farm] = await db.select({
    name: farms.name,
    perimeterGeometry: farms.perimeterGeometry,
    perimeterSource: farms.perimeterSource,
  }).from(farms).where(eq(farms.id, farmId));

  const perimeter = farm?.perimeterGeometry
    ? { geometry: farm.perimeterGeometry, source: farm.perimeterSource ?? null }
    : null;

  return { farmId, date, farmName: farm?.name ?? null, perimeter, retiros, setores, locais };
}

/** Atalho "estado atual": X = hoje ⇒ todas as versões abertas (valid_to IS NULL). */
export async function reconstructCurrent(farmId: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  return reconstruct(farmId, hoje);
}
