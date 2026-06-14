import { and, eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { resolveDefaultLocalId } from './farm-locations.js';
import { nascimentoMovimentos, nascimentoFichas } from '../schema.js';

export interface NascFichaInput {
  apelido: string;
  categoriaId?: string | null;
  rfid?: string | null;
  sisbov?: string | null;
  porte?: string | null;
  raca?: string | null;
  peso?: number | null;
  /** Valores dos Campos Personalizados (chaves `cp_*`). */
  extras?: Record<string, unknown>;
}

export interface NascMovimentoInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  qtd: number;
  naoIdentificados: number;
  status: 'pendente' | 'conciliado';
  catDecl: { catId: string; qtd: number }[];
  sanitario: unknown[];
  fichas: NascFichaInput[];
  criadoPor?: string | null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(nascimentoMovimentos)
    .where(eq(nascimentoMovimentos.organizationId, organizationId as any))
    .orderBy(desc(nascimentoMovimentos.data), desc(nascimentoMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const fichas = await db.select().from(nascimentoFichas);
  const byMov = new Map<string, typeof fichas>();
  for (const f of fichas) {
    if (!ids.includes(f.movimentoId)) continue;
    const arr = byMov.get(f.movimentoId) ?? [];
    arr.push(f);
    byMov.set(f.movimentoId, arr);
  }
  return movs.map((m) => ({ ...m, fichas: byMov.get(m.id) ?? [] }));
}

export async function getMovimentoById(id: string) {
  const [row] = await db.select().from(nascimentoMovimentos)
    .where(eq(nascimentoMovimentos.id, id as any));
  if (!row) return null;
  const fichas = await db.select().from(nascimentoFichas)
    .where(eq(nascimentoFichas.movimentoId, id as any));
  return { ...row, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function createMovimento(data: NascMovimentoInput) {
  const [mov] = await db.insert(nascimentoMovimentos).values({
    organizationId: data.organizationId as any,
    farmId: data.farmId ?? null,
    localId: (data.localId ?? (data.farmId ? await resolveDefaultLocalId(data.farmId) : null)) as any,
    proprietarioId: (data.proprietarioId ?? null) as any,
    data: data.data,
    safra: data.safra ?? null,
    retiro: data.retiro ?? null,
    qtd: data.qtd,
    naoIdentificados: data.naoIdentificados,
    status: data.status,
    catDecl: data.catDecl as any,
    sanitario: data.sanitario as any,
    criadoPor: data.criadoPor ?? null,
  }).returning();

  let fichas: any[] = [];
  if (data.fichas.length > 0) {
    fichas = await db.insert(nascimentoFichas).values(
      data.fichas.map((f) => ({
        movimentoId: mov.id,
        categoriaId: (f.categoriaId ?? null) as any,
        apelido: f.apelido,
        rfid: f.rfid ?? null,
        sisbov: f.sisbov ?? null,
        porte: f.porte ?? null,
        raca: f.raca ?? null,
        peso: f.peso != null ? String(f.peso) : null,
        extras: (f.extras ?? {}) as any,
      })),
    ).returning();
  }
  return { ...mov, fichas };
}

/**
 * Adiciona uma ficha individual a um movimento e decrementa naoIdentificados,
 * recalculando o status. Retorna o movimento atualizado com as fichas.
 */
export async function addFicha(movimentoId: string, ficha: NascFichaInput) {
  const [mov] = await db.select().from(nascimentoMovimentos)
    .where(eq(nascimentoMovimentos.id, movimentoId as any));
  if (!mov) return null;

  await db.insert(nascimentoFichas).values({
    movimentoId: movimentoId as any,
    categoriaId: (ficha.categoriaId ?? null) as any,
    apelido: ficha.apelido,
    rfid: ficha.rfid ?? null,
    sisbov: ficha.sisbov ?? null,
    porte: ficha.porte ?? null,
    raca: ficha.raca ?? null,
    peso: ficha.peso != null ? String(ficha.peso) : null,
    extras: (ficha.extras ?? {}) as any,
  });

  const naoIdentificados = Math.max(0, (mov.naoIdentificados ?? 0) - 1);
  const status = naoIdentificados > 0 ? 'pendente' : 'conciliado';
  await db.update(nascimentoMovimentos)
    .set({ naoIdentificados, status, updatedAt: new Date() })
    .where(eq(nascimentoMovimentos.id, movimentoId as any));

  return getMovimentoById(movimentoId);
}

/**
 * Atualiza um movimento existente e substitui integralmente suas fichas pelo
 * estado enviado (reflete o formulário reaberto na edição). Retorna o movimento
 * atualizado com as fichas, ou null se não existir.
 */
export async function updateMovimento(id: string, data: Omit<NascMovimentoInput, 'organizationId' | 'criadoPor'>) {
  const [existing] = await db.select().from(nascimentoMovimentos)
    .where(eq(nascimentoMovimentos.id, id as any));
  if (!existing) return null;

  await db.update(nascimentoMovimentos).set({
    farmId: data.farmId ?? null,
    localId: (data.localId ?? (data.farmId ? await resolveDefaultLocalId(data.farmId) : null)) as any,
    proprietarioId: (data.proprietarioId ?? null) as any,
    data: data.data,
    safra: data.safra ?? null,
    retiro: data.retiro ?? null,
    qtd: data.qtd,
    naoIdentificados: data.naoIdentificados,
    status: data.status,
    catDecl: data.catDecl as any,
    sanitario: data.sanitario as any,
    updatedAt: new Date(),
  }).where(eq(nascimentoMovimentos.id, id as any));

  // Substitui as fichas integralmente: o formulário reenvia o conjunto completo.
  await db.delete(nascimentoFichas).where(eq(nascimentoFichas.movimentoId, id as any));
  if (data.fichas.length > 0) {
    await db.insert(nascimentoFichas).values(
      data.fichas.map((f) => ({
        movimentoId: id as any,
        categoriaId: (f.categoriaId ?? null) as any,
        apelido: f.apelido,
        rfid: f.rfid ?? null,
        sisbov: f.sisbov ?? null,
        porte: f.porte ?? null,
        raca: f.raca ?? null,
        peso: f.peso != null ? String(f.peso) : null,
        extras: (f.extras ?? {}) as any,
      })),
    );
  }
  return getMovimentoById(id);
}

export async function deleteMovimento(id: string) {
  await db.delete(nascimentoMovimentos).where(eq(nascimentoMovimentos.id, id as any));
}
