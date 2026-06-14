import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { morteMovimentos, morteFichas } from '../schema.js';
import { resolveDefaultLocalId } from './farm-locations.js';

export interface MorteFichaInput {
  apelido?: string | null;
  rfid?: string | null;
  categoriaId?: string | null;
  motivoId?: string | null;
  obs?: string | null;
  /** Valores dos Campos Personalizados (chaves `cp_*`). */
  extras?: Record<string, unknown>;
}

export interface MorteMovimentoInput {
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
  catDecl: { catId: string; qtd: number; motivoId?: string | null }[];
  obs?: string | null;
  fichas: MorteFichaInput[];
  criadoPor?: string | null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(morteMovimentos)
    .where(eq(morteMovimentos.organizationId, organizationId as any))
    .orderBy(desc(morteMovimentos.data), desc(morteMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const fichas = await db.select().from(morteFichas);
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
  const [row] = await db.select().from(morteMovimentos)
    .where(eq(morteMovimentos.id, id as any));
  if (!row) return null;
  const fichas = await db.select().from(morteFichas)
    .where(eq(morteFichas.movimentoId, id as any));
  return { ...row, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function createMovimento(data: MorteMovimentoInput) {
  const [mov] = await db.insert(morteMovimentos).values({
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
    obs: data.obs ?? null,
    criadoPor: data.criadoPor ?? null,
  }).returning();

  let fichas: any[] = [];
  if (data.fichas.length > 0) {
    fichas = await db.insert(morteFichas).values(
      data.fichas.map((f) => ({
        movimentoId: mov.id,
        categoriaId: (f.categoriaId ?? null) as any,
        motivoId: (f.motivoId ?? null) as any,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        obs: f.obs ?? null,
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
export async function addFicha(movimentoId: string, ficha: MorteFichaInput) {
  const [mov] = await db.select().from(morteMovimentos)
    .where(eq(morteMovimentos.id, movimentoId as any));
  if (!mov) return null;

  await db.insert(morteFichas).values({
    movimentoId: movimentoId as any,
    categoriaId: (ficha.categoriaId ?? null) as any,
    motivoId: (ficha.motivoId ?? null) as any,
    apelido: ficha.apelido ?? null,
    rfid: ficha.rfid ?? null,
    obs: ficha.obs ?? null,
    extras: (ficha.extras ?? {}) as any,
  });

  const naoIdentificados = Math.max(0, (mov.naoIdentificados ?? 0) - 1);
  const status = naoIdentificados > 0 ? 'pendente' : 'conciliado';
  await db.update(morteMovimentos)
    .set({ naoIdentificados, status, updatedAt: new Date() })
    .where(eq(morteMovimentos.id, movimentoId as any));

  return getMovimentoById(movimentoId);
}

/**
 * Atualiza um movimento existente e substitui integralmente suas fichas pelo
 * estado enviado (reflete o formulário reaberto na edição). Retorna o movimento
 * atualizado com as fichas, ou null se não existir.
 */
export async function updateMovimento(id: string, data: Omit<MorteMovimentoInput, 'organizationId' | 'criadoPor'>) {
  const [existing] = await db.select().from(morteMovimentos)
    .where(eq(morteMovimentos.id, id as any));
  if (!existing) return null;

  await db.update(morteMovimentos).set({
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
    obs: data.obs ?? null,
    updatedAt: new Date(),
  }).where(eq(morteMovimentos.id, id as any));

  // Substitui as fichas integralmente: o formulário reenvia o conjunto completo.
  await db.delete(morteFichas).where(eq(morteFichas.movimentoId, id as any));
  if (data.fichas.length > 0) {
    await db.insert(morteFichas).values(
      data.fichas.map((f) => ({
        movimentoId: id as any,
        categoriaId: (f.categoriaId ?? null) as any,
        motivoId: (f.motivoId ?? null) as any,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        obs: f.obs ?? null,
        extras: (f.extras ?? {}) as any,
      })),
    );
  }
  return getMovimentoById(id);
}

export async function deleteMovimento(id: string) {
  await db.delete(morteMovimentos).where(eq(morteMovimentos.id, id as any));
}
