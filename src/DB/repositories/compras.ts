import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { compraMovimentos, compraItens, compraFichas } from '../schema.js';
import { resolveDefaultLocalId } from './farm-locations.js';

/**
 * Repositório de Movimentação › Compras (Compra Peso Vivo, versão lote).
 * Cabeçalho com snapshots consolidados (valor/kg médio, peso vivo total + demais
 * derivados) + tabela filha compra_itens com a quebra por categoria, onde valor/kg
 * e peso vivo total são informados por categoria.
 *
 * Colunas `numeric` viajam como string no Drizzle: gravamos com String(n) e os
 * consumidores convertem de volta com Number() na leitura.
 */

/** Converte número → string para colunas numeric (null preservado). */
const numStr = (n: number | null | undefined): string | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : String(n);

export interface CompraItemInput {
  categoriaId?: string | null;
  qtd: number;
  idadeMeses?: number | null;
  pesoVivoKg?: number | null;
  valorArroba?: number | null; // Valor por kg
  pesoMortoTotal?: number | null; // Peso vivo total
  desconto?: number | null;
}

/** Animal detalhado por ID (modo individual / "Com ID"). */
export interface CompraFichaInput {
  categoriaId?: string | null;
  apelido?: string | null;
  rfid?: string | null;
  pesoVivoKg?: number | null;
  pesoMortoKg?: number | null;
  valorArroba?: number | null; // Valor por kg
  /** Valores dos Campos Personalizados (chaves `cp_*`). */
  extras?: Record<string, unknown>;
}

export interface CompraMovimentoInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  clienteId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  tipoVenda: string;
  tipoPeso: string;
  valorArroba?: number | null; // valor/kg médio
  pesoMortoTotal?: number | null; // peso vivo total
  qtd: number;
  valorTotal?: number | null;
  pesoMortoArroba?: number | null;
  rendimento?: number | null;
  status: string;
  obs?: string | null;
  desconto?: number | null;
  itens: CompraItemInput[];
  fichas: CompraFichaInput[];
  criadoPor?: string | null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(compraMovimentos)
    .where(eq(compraMovimentos.organizationId, organizationId as any))
    .orderBy(desc(compraMovimentos.data), desc(compraMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const itens = await db.select().from(compraItens);
  const byMov = new Map<string, typeof itens>();
  for (const it of itens) {
    if (!ids.includes(it.movimentoId)) continue;
    const arr = byMov.get(it.movimentoId) ?? [];
    arr.push(it);
    byMov.set(it.movimentoId, arr);
  }

  const fichas = await db.select().from(compraFichas);
  const fichasByMov = new Map<string, typeof fichas>();
  for (const f of fichas) {
    if (!ids.includes(f.movimentoId)) continue;
    const arr = fichasByMov.get(f.movimentoId) ?? [];
    arr.push(f);
    fichasByMov.set(f.movimentoId, arr);
  }

  return movs.map((m) => ({ ...m, itens: byMov.get(m.id) ?? [], fichas: fichasByMov.get(m.id) ?? [] }));
}

export async function getMovimentoById(id: string) {
  const [row] = await db.select().from(compraMovimentos)
    .where(eq(compraMovimentos.id, id as any));
  if (!row) return null;
  const itens = await db.select().from(compraItens)
    .where(eq(compraItens.movimentoId, id as any));
  const fichas = await db.select().from(compraFichas)
    .where(eq(compraFichas.movimentoId, id as any));
  return { ...row, itens, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function createMovimento(data: CompraMovimentoInput) {
  const [mov] = await db.insert(compraMovimentos).values({
    organizationId: data.organizationId as any,
    farmId: data.farmId ?? null,
    localId: (data.localId ?? (data.farmId ? await resolveDefaultLocalId(data.farmId) : null)) as any,
    proprietarioId: (data.proprietarioId ?? null) as any,
    clienteId: (data.clienteId ?? null) as any,
    data: data.data,
    safra: data.safra ?? null,
    retiro: data.retiro ?? null,
    tipoVenda: data.tipoVenda,
    tipoPeso: data.tipoPeso,
    valorArroba: numStr(data.valorArroba),
    pesoMortoTotal: numStr(data.pesoMortoTotal),
    qtd: data.qtd,
    valorTotal: numStr(data.valorTotal),
    pesoMortoArroba: numStr(data.pesoMortoArroba),
    rendimento: numStr(data.rendimento),
    status: data.status,
    obs: data.obs ?? null,
    desconto: numStr(data.desconto),
    criadoPor: data.criadoPor ?? null,
  }).returning();

  let itens: any[] = [];
  if (data.itens.length > 0) {
    itens = await db.insert(compraItens).values(
      data.itens.map((it) => ({
        movimentoId: mov.id,
        categoriaId: (it.categoriaId ?? null) as any,
        qtd: it.qtd,
        idadeMeses: it.idadeMeses ?? null,
        pesoVivoKg: numStr(it.pesoVivoKg),
        valorArroba: numStr(it.valorArroba),
        pesoMortoTotal: numStr(it.pesoMortoTotal),
        desconto: numStr(it.desconto),
      })),
    ).returning();
  }

  let fichas: any[] = [];
  if (data.fichas.length > 0) {
    fichas = await db.insert(compraFichas).values(
      data.fichas.map((f) => ({
        movimentoId: mov.id,
        categoriaId: (f.categoriaId ?? null) as any,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        pesoVivoKg: numStr(f.pesoVivoKg),
        pesoMortoKg: numStr(f.pesoMortoKg),
        valorArroba: numStr(f.valorArroba),
        extras: (f.extras ?? {}) as any,
      })),
    ).returning();
  }
  return { ...mov, itens, fichas };
}

/**
 * Atualiza um movimento e substitui integralmente seus itens pelo estado
 * enviado (reflete o formulário reaberto na edição). Retorna o movimento
 * atualizado com os itens, ou null se não existir.
 */
export async function updateMovimento(id: string, data: Omit<CompraMovimentoInput, 'organizationId' | 'criadoPor'>) {
  const [existing] = await db.select().from(compraMovimentos)
    .where(eq(compraMovimentos.id, id as any));
  if (!existing) return null;

  await db.update(compraMovimentos).set({
    farmId: data.farmId ?? null,
    localId: (data.localId ?? (data.farmId ? await resolveDefaultLocalId(data.farmId) : null)) as any,
    proprietarioId: (data.proprietarioId ?? null) as any,
    clienteId: (data.clienteId ?? null) as any,
    data: data.data,
    safra: data.safra ?? null,
    retiro: data.retiro ?? null,
    tipoVenda: data.tipoVenda,
    tipoPeso: data.tipoPeso,
    valorArroba: numStr(data.valorArroba),
    pesoMortoTotal: numStr(data.pesoMortoTotal),
    qtd: data.qtd,
    valorTotal: numStr(data.valorTotal),
    pesoMortoArroba: numStr(data.pesoMortoArroba),
    rendimento: numStr(data.rendimento),
    status: data.status,
    obs: data.obs ?? null,
    desconto: numStr(data.desconto),
    updatedAt: new Date(),
  }).where(eq(compraMovimentos.id, id as any));

  // Substitui os itens integralmente: o formulário reenvia o conjunto completo.
  await db.delete(compraItens).where(eq(compraItens.movimentoId, id as any));
  if (data.itens.length > 0) {
    await db.insert(compraItens).values(
      data.itens.map((it) => ({
        movimentoId: id as any,
        categoriaId: (it.categoriaId ?? null) as any,
        qtd: it.qtd,
        idadeMeses: it.idadeMeses ?? null,
        pesoVivoKg: numStr(it.pesoVivoKg),
        valorArroba: numStr(it.valorArroba),
        pesoMortoTotal: numStr(it.pesoMortoTotal),
        desconto: numStr(it.desconto),
      })),
    );
  }

  // Substitui as fichas (animais detalhados por ID) integralmente.
  await db.delete(compraFichas).where(eq(compraFichas.movimentoId, id as any));
  if (data.fichas.length > 0) {
    await db.insert(compraFichas).values(
      data.fichas.map((f) => ({
        movimentoId: id as any,
        categoriaId: (f.categoriaId ?? null) as any,
        apelido: f.apelido ?? null,
        rfid: f.rfid ?? null,
        pesoVivoKg: numStr(f.pesoVivoKg),
        pesoMortoKg: numStr(f.pesoMortoKg),
        valorArroba: numStr(f.valorArroba),
        extras: (f.extras ?? {}) as any,
      })),
    );
  }
  return getMovimentoById(id);
}

export async function deleteMovimento(id: string) {
  await db.delete(compraMovimentos).where(eq(compraMovimentos.id, id as any));
}
