import { and, eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { mapaoHeaders, mapaoLancamentos } from '../schema.js';

// ── Headers ──────────────────────────────────────────────────────────────────
// Diferença para o Estoque de Partida: o Mapão permite N mapas por fazenda
// (um por data de referência), pois o usuário lança o mapa periodicamente.

export async function listHeadersByOrg(organizationId: string) {
  return db.select().from(mapaoHeaders)
    .where(eq(mapaoHeaders.organizationId, organizationId))
    .orderBy(desc(mapaoHeaders.dataReferencia));
}

export async function listHeadersByFarm(farmId: string) {
  return db.select().from(mapaoHeaders)
    .where(eq(mapaoHeaders.farmId, farmId))
    .orderBy(desc(mapaoHeaders.dataReferencia));
}

export async function getHeaderById(id: string) {
  const [row] = await db.select().from(mapaoHeaders)
    .where(eq(mapaoHeaders.id, id as any));
  return row ?? null;
}

export async function getHeaderByFarmDate(farmId: string, dataReferencia: string) {
  const [row] = await db.select().from(mapaoHeaders)
    .where(and(
      eq(mapaoHeaders.farmId, farmId),
      eq(mapaoHeaders.dataReferencia, dataReferencia),
    ));
  return row ?? null;
}

export async function createHeader(data: {
  organizationId: string;
  farmId: string;
  dataReferencia: string;
  observacao?: string | null;
  criadoPor?: string | null;
}) {
  const [row] = await db.insert(mapaoHeaders).values({
    organizationId: data.organizationId as any,
    farmId: data.farmId,
    dataReferencia: data.dataReferencia,
    observacao: data.observacao ?? null,
    criadoPor: data.criadoPor ?? null,
  }).returning();
  return row;
}

export async function updateHeader(id: string, data: {
  status?: 'rascunho' | 'salvo';
  observacao?: string | null;
  dataReferencia?: string;
}) {
  const [row] = await db.update(mapaoHeaders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mapaoHeaders.id, id as any))
    .returning();
  return row;
}

export async function deleteHeader(id: string) {
  await db.delete(mapaoHeaders).where(eq(mapaoHeaders.id, id as any));
}

// ── Lançamentos (células da matriz) ──────────────────────────────────────────

export async function listLancamentosByHeader(mapaHeaderId: string) {
  return db.select().from(mapaoLancamentos)
    .where(eq(mapaoLancamentos.mapaHeaderId, mapaHeaderId as any));
}

/**
 * Insere ou atualiza uma célula (mapaHeaderId × localId × categoriaId).
 * Quantidade=0 e peso=0 ainda persistem a célula (permite distinguir "vazio" de "zerado").
 */
export async function upsertLancamento(data: {
  mapaHeaderId: string;
  localId: string;
  categoriaId: string;
  quantidade: number;
  pesoKgCabeca: string;
}) {
  const [existing] = await db.select().from(mapaoLancamentos)
    .where(and(
      eq(mapaoLancamentos.mapaHeaderId, data.mapaHeaderId as any),
      eq(mapaoLancamentos.localId, data.localId as any),
      eq(mapaoLancamentos.categoriaId, data.categoriaId as any),
    ));

  if (existing) {
    const [row] = await db.update(mapaoLancamentos)
      .set({
        quantidade: data.quantidade,
        pesoKgCabeca: data.pesoKgCabeca,
        updatedAt: new Date(),
      })
      .where(eq(mapaoLancamentos.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db.insert(mapaoLancamentos).values({
    mapaHeaderId: data.mapaHeaderId as any,
    localId: data.localId as any,
    categoriaId: data.categoriaId as any,
    quantidade: data.quantidade,
    pesoKgCabeca: data.pesoKgCabeca,
  }).returning();
  return row;
}
