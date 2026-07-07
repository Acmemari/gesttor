import { and, eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { mapaRebanhoHeaders, mapaRebanhoLancamentos } from '../schema.js';

// ── Headers ──────────────────────────────────────────────────────────────────

export async function listHeadersByOrg(organizationId: string) {
  return db.select().from(mapaRebanhoHeaders)
    .where(eq(mapaRebanhoHeaders.organizationId, organizationId))
    .orderBy(desc(mapaRebanhoHeaders.dataReferencia));
}

export async function listHeadersByFarm(farmId: string) {
  return db.select().from(mapaRebanhoHeaders)
    .where(eq(mapaRebanhoHeaders.farmId, farmId))
    .orderBy(desc(mapaRebanhoHeaders.dataReferencia));
}

export async function getHeaderById(id: string) {
  const [row] = await db.select().from(mapaRebanhoHeaders)
    .where(eq(mapaRebanhoHeaders.id, id as any));
  return row ?? null;
}

export async function getHeaderByFarmDate(farmId: string, dataReferencia: string) {
  const [row] = await db.select().from(mapaRebanhoHeaders)
    .where(and(
      eq(mapaRebanhoHeaders.farmId, farmId),
      eq(mapaRebanhoHeaders.dataReferencia, dataReferencia),
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
  const [row] = await db.insert(mapaRebanhoHeaders).values({
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
  distribuicaoModo?: 'pasto' | 'categoria' | null;
}) {
  const [row] = await db.update(mapaRebanhoHeaders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mapaRebanhoHeaders.id, id as any))
    .returning();
  return row;
}

export async function deleteHeader(id: string) {
  await db.delete(mapaRebanhoHeaders).where(eq(mapaRebanhoHeaders.id, id as any));
}

// ── Lançamentos (células da matriz) ──────────────────────────────────────────

export async function listLancamentosByHeader(mapaHeaderId: string) {
  return db.select().from(mapaRebanhoLancamentos)
    .where(eq(mapaRebanhoLancamentos.mapaHeaderId, mapaHeaderId as any));
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
  const [existing] = await db.select().from(mapaRebanhoLancamentos)
    .where(and(
      eq(mapaRebanhoLancamentos.mapaHeaderId, data.mapaHeaderId as any),
      eq(mapaRebanhoLancamentos.localId, data.localId as any),
      eq(mapaRebanhoLancamentos.categoriaId, data.categoriaId as any),
    ));

  if (existing) {
    const [row] = await db.update(mapaRebanhoLancamentos)
      .set({
        quantidade: data.quantidade,
        pesoKgCabeca: data.pesoKgCabeca,
        updatedAt: new Date(),
      })
      .where(eq(mapaRebanhoLancamentos.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db.insert(mapaRebanhoLancamentos).values({
    mapaHeaderId: data.mapaHeaderId as any,
    localId: data.localId as any,
    categoriaId: data.categoriaId as any,
    quantidade: data.quantidade,
    pesoKgCabeca: data.pesoKgCabeca,
  }).returning();
  return row;
}
