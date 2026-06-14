import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { consumoMovimentos, consumoFichas } from '../schema.js';

export interface ConsumoFichaInput {
  apelido?: string | null;
  rfid?: string | null;
  categoriaId?: string | null;
  tipo?: string | null;
  pesoVivo?: number | null;
  pesoMorto?: number | null;
  valor?: number | null;
  obs?: string | null;
}

export interface ConsumoCatDecl {
  catId: string;
  qtd: number;
  tipo?: string | null;
  pesoVivo?: number | null;
  pesoMorto?: number | null;
  valor?: number | null;
}

export interface ConsumoMovimentoInput {
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
  catDecl: ConsumoCatDecl[];
  obs?: string | null;
  fichas: ConsumoFichaInput[];
  criadoPor?: string | null;
}

/** numeric do pg volta como string; converte para number|null no shape de saída. */
function numStr(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(consumoMovimentos)
    .where(eq(consumoMovimentos.organizationId, organizationId as any))
    .orderBy(desc(consumoMovimentos.data), desc(consumoMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const fichas = await db.select().from(consumoFichas);
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
  const [row] = await db.select().from(consumoMovimentos)
    .where(eq(consumoMovimentos.id, id as any));
  if (!row) return null;
  const fichas = await db.select().from(consumoFichas)
    .where(eq(consumoFichas.movimentoId, id as any));
  return { ...row, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function createMovimento(data: ConsumoMovimentoInput) {
  const [mov] = await db.insert(consumoMovimentos).values({
    organizationId: data.organizationId as any,
    farmId: data.farmId ?? null,
    localId: (data.localId ?? null) as any,
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
    fichas = await db.insert(consumoFichas).values(
      data.fichas.map((f) => ({
        movimentoId: mov.id,
        categoriaId: (f.categoriaId ?? null) as any,
        tipo: f.tipo ?? null,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        pesoVivo: numStr(f.pesoVivo) as any,
        pesoMorto: numStr(f.pesoMorto) as any,
        valor: numStr(f.valor) as any,
        obs: f.obs ?? null,
      })),
    ).returning();
  }
  return { ...mov, fichas };
}

/**
 * Adiciona uma ficha individual a um movimento e decrementa naoIdentificados,
 * recalculando o status. Retorna o movimento atualizado com as fichas.
 */
export async function addFicha(movimentoId: string, ficha: ConsumoFichaInput) {
  const [mov] = await db.select().from(consumoMovimentos)
    .where(eq(consumoMovimentos.id, movimentoId as any));
  if (!mov) return null;

  await db.insert(consumoFichas).values({
    movimentoId: movimentoId as any,
    categoriaId: (ficha.categoriaId ?? null) as any,
    tipo: ficha.tipo ?? null,
    apelido: ficha.apelido ?? null,
    rfid: ficha.rfid ?? null,
    pesoVivo: numStr(ficha.pesoVivo) as any,
    pesoMorto: numStr(ficha.pesoMorto) as any,
    valor: numStr(ficha.valor) as any,
    obs: ficha.obs ?? null,
  });

  const naoIdentificados = Math.max(0, (mov.naoIdentificados ?? 0) - 1);
  const status = naoIdentificados > 0 ? 'pendente' : 'conciliado';
  await db.update(consumoMovimentos)
    .set({ naoIdentificados, status, updatedAt: new Date() })
    .where(eq(consumoMovimentos.id, movimentoId as any));

  return getMovimentoById(movimentoId);
}

/**
 * Atualiza um movimento existente e substitui integralmente suas fichas pelo
 * estado enviado (reflete o formulário reaberto na edição). Retorna o movimento
 * atualizado com as fichas, ou null se não existir.
 */
export async function updateMovimento(id: string, data: Omit<ConsumoMovimentoInput, 'organizationId' | 'criadoPor'>) {
  const [existing] = await db.select().from(consumoMovimentos)
    .where(eq(consumoMovimentos.id, id as any));
  if (!existing) return null;

  await db.update(consumoMovimentos).set({
    farmId: data.farmId ?? null,
    localId: (data.localId ?? null) as any,
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
  }).where(eq(consumoMovimentos.id, id as any));

  // Substitui as fichas integralmente: o formulário reenvia o conjunto completo.
  await db.delete(consumoFichas).where(eq(consumoFichas.movimentoId, id as any));
  if (data.fichas.length > 0) {
    await db.insert(consumoFichas).values(
      data.fichas.map((f) => ({
        movimentoId: id as any,
        categoriaId: (f.categoriaId ?? null) as any,
        tipo: f.tipo ?? null,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        pesoVivo: numStr(f.pesoVivo) as any,
        pesoMorto: numStr(f.pesoMorto) as any,
        valor: numStr(f.valor) as any,
        obs: f.obs ?? null,
      })),
    );
  }
  return getMovimentoById(id);
}

export async function deleteMovimento(id: string) {
  await db.delete(consumoMovimentos).where(eq(consumoMovimentos.id, id as any));
}
