import { eq, asc, max, desc, and } from 'drizzle-orm';
import { db } from '../index.js';
import { regimesAlimentares, regimesAlimentaresHistorico, regimesAlimentaresGmd } from '../schema.js';

export async function listByOrganization(organizationId: string) {
  return db.select().from(regimesAlimentares)
    .where(eq(regimesAlimentares.organizationId, organizationId))
    .orderBy(asc(regimesAlimentares.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  codigoCurto: string;
  tipo: string;
  produtoFormulado?: string | null;
  nivelIngestaoValor?: string | number | null;
  nivelIngestaoTipo?: string | null;
  custoQuilo?: string | number | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
  produtos?: any | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(regimesAlimentares.ordem) })
    .from(regimesAlimentares)
    .where(eq(regimesAlimentares.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  let costToUse = data.custoQuilo !== undefined && data.custoQuilo !== null ? String(data.custoQuilo) : null;
  if (data.produtos && Array.isArray(data.produtos) && data.produtos.length > 0) {
    costToUse = String(data.produtos[0].custoQuilo);
  }

  const [row] = await db.insert(regimesAlimentares).values({
    organizationId: data.organizationId,
    nome: data.nome,
    codigoCurto: data.codigoCurto,
    tipo: data.tipo,
    produtoFormulado: data.produtoFormulado ?? null,
    nivelIngestaoValor: data.nivelIngestaoValor !== undefined && data.nivelIngestaoValor !== null ? String(data.nivelIngestaoValor) : null,
    nivelIngestaoTipo: data.nivelIngestaoTipo ?? null,
    custoQuilo: costToUse,
    anexoUrl: data.anexoUrl ?? null,
    anexoNome: data.anexoNome ?? null,
    produtos: data.produtos ?? null,
    ordem: nextOrdem,
  }).returning();

  // If a cost was provided or calculated, create the initial history entry
  if (costToUse !== null) {
    const todayStr = new Date().toISOString().split('T')[0];
    await db.insert(regimesAlimentaresHistorico).values({
      regimeAlimentarId: row.id,
      dataVigencia: todayStr,
      custoQuilo: costToUse,
      formulacao: 'Formulação inicial',
      anexoUrl: data.anexoUrl ?? null,
      anexoNome: data.anexoNome ?? null,
    });
  }

  return row;
}

export async function update(id: string, data: {
  nome?: string;
  codigoCurto?: string;
  tipo?: string;
  produtoFormulado?: string | null;
  nivelIngestaoValor?: string | number | null;
  nivelIngestaoTipo?: string | null;
  custoQuilo?: string | number | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
  produtos?: any | null;
  ativo?: boolean;
}) {
  const payload: Record<string, any> = { ...data, updatedAt: new Date() };
  if (data.nivelIngestaoValor !== undefined) {
    payload.nivelIngestaoValor = data.nivelIngestaoValor !== null ? String(data.nivelIngestaoValor) : null;
  }
  
  if (data.produtos !== undefined) {
    payload.produtos = data.produtos ?? null;
    if (Array.isArray(data.produtos) && data.produtos.length > 0) {
      payload.custoQuilo = String(data.produtos[0].custoQuilo);
    } else {
      payload.custoQuilo = null;
    }
  } else if (data.custoQuilo !== undefined) {
    payload.custoQuilo = data.custoQuilo !== null ? String(data.custoQuilo) : null;
  }

  const [row] = await db.update(regimesAlimentares)
    .set(payload)
    .where(eq(regimesAlimentares.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(regimesAlimentares).where(eq(regimesAlimentares.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(regimesAlimentares)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(regimesAlimentares.id, item.id as any));
    }
  });
}

// ── Histórico de Preços e Formulações ──────────────────────────────────────────

export async function listHistory(regimeAlimentarId: string) {
  return db.select()
    .from(regimesAlimentaresHistorico)
    .where(eq(regimesAlimentaresHistorico.regimeAlimentarId, regimeAlimentarId))
    .orderBy(desc(regimesAlimentaresHistorico.dataVigencia), desc(regimesAlimentaresHistorico.createdAt));
}

export async function addHistoryEntry(data: {
  regimeAlimentarId: string;
  dataVigencia: string;
  custoQuilo: string | number;
  formulacao?: string | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
}) {
  const [row] = await db.insert(regimesAlimentaresHistorico).values({
    regimeAlimentarId: data.regimeAlimentarId,
    dataVigencia: data.dataVigencia,
    custoQuilo: String(data.custoQuilo),
    formulacao: data.formulacao ?? null,
    anexoUrl: data.anexoUrl ?? null,
    anexoNome: data.anexoNome ?? null,
  }).returning();

  await updateMainCache(data.regimeAlimentarId);
  return row;
}

export async function removeHistoryEntry(id: string, regimeAlimentarId: string) {
  await db.delete(regimesAlimentaresHistorico)
    .where(eq(regimesAlimentaresHistorico.id, id as any));
  await updateMainCache(regimeAlimentarId);
}

export async function updateMainCache(regimeAlimentarId: string) {
  const [latest] = await db.select()
    .from(regimesAlimentaresHistorico)
    .where(eq(regimesAlimentaresHistorico.regimeAlimentarId, regimeAlimentarId))
    .orderBy(desc(regimesAlimentaresHistorico.dataVigencia), desc(regimesAlimentaresHistorico.createdAt))
    .limit(1);

  if (latest) {
    await db.update(regimesAlimentares)
      .set({
        custoQuilo: latest.custoQuilo,
        anexoUrl: latest.anexoUrl,
        anexoNome: latest.anexoNome,
        updatedAt: new Date()
      })
      .where(eq(regimesAlimentares.id, regimeAlimentarId as any));
  } else {
    await db.update(regimesAlimentares)
      .set({
        custoQuilo: null,
        anexoUrl: null,
        anexoNome: null,
        updatedAt: new Date()
      })
      .where(eq(regimesAlimentares.id, regimeAlimentarId as any));
  }
}

// ── GMD (Ganho Médio Diário) Helpers ──────────────────────────────────────────

export async function listGmdConfigs(regimeAlimentarId: string) {
  return db.select()
    .from(regimesAlimentaresGmd)
    .where(eq(regimesAlimentaresGmd.regimeAlimentarId, regimeAlimentarId));
}

export async function setGmdConfig(data: {
  regimeAlimentarId: string;
  categoriaId: string;
  estacao: string;
  gmd: string | number;
}) {
  const existing = await db.select()
    .from(regimesAlimentaresGmd)
    .where(
      and(
        eq(regimesAlimentaresGmd.regimeAlimentarId, data.regimeAlimentarId),
        eq(regimesAlimentaresGmd.categoriaId, data.categoriaId),
        eq(regimesAlimentaresGmd.estacao, data.estacao)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db.update(regimesAlimentaresGmd)
      .set({
        gmd: String(data.gmd),
        updatedAt: new Date()
      })
      .where(eq(regimesAlimentaresGmd.id, existing[0].id))
      .returning();
    return row;
  } else {
    const [row] = await db.insert(regimesAlimentaresGmd).values({
      regimeAlimentarId: data.regimeAlimentarId,
      categoriaId: data.categoriaId,
      estacao: data.estacao,
      gmd: String(data.gmd),
    }).returning();
    return row;
  }
}

export async function removeGmdConfig(id: string) {
  await db.delete(regimesAlimentaresGmd).where(eq(regimesAlimentaresGmd.id, id as any));
}
