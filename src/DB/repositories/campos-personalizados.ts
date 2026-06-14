import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { camposPersonalizados } from '../schema.js';

/** Tipo de um campo personalizado. */
export type CampoTipo = 'texto' | 'numero' | 'lista';

/** Movimentos onde um campo personalizado pode aparecer. */
export type CampoMovimento = 'compra' | 'venda' | 'nascimento' | 'morte' | 'consumo';

export interface CampoPersonalizadoInput {
  organizationId: string;
  nome: string;
  tipo: CampoTipo;
  opcoes?: string[];
  movimentos?: CampoMovimento[];
  obrigatorio?: boolean;
}

export async function listByOrganization(organizationId: string) {
  return db.select().from(camposPersonalizados)
    .where(eq(camposPersonalizados.organizationId, organizationId))
    .orderBy(asc(camposPersonalizados.ordem));
}

export async function create(data: CampoPersonalizadoInput) {
  const [maxRow] = await db.select({ maxOrdem: max(camposPersonalizados.ordem) })
    .from(camposPersonalizados)
    .where(eq(camposPersonalizados.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(camposPersonalizados).values({
    organizationId: data.organizationId,
    nome: data.nome,
    tipo: data.tipo,
    opcoes: (data.opcoes ?? []) as any,
    movimentos: (data.movimentos ?? []) as any,
    obrigatorio: data.obrigatorio ?? false,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  tipo?: CampoTipo;
  opcoes?: string[];
  movimentos?: CampoMovimento[];
  obrigatorio?: boolean;
}) {
  const payload: Record<string, any> = { updatedAt: new Date() };
  if (data.nome !== undefined) payload.nome = data.nome;
  if (data.tipo !== undefined) payload.tipo = data.tipo;
  if (data.opcoes !== undefined) payload.opcoes = data.opcoes;
  if (data.movimentos !== undefined) payload.movimentos = data.movimentos;
  if (data.obrigatorio !== undefined) payload.obrigatorio = data.obrigatorio;

  const [row] = await db.update(camposPersonalizados)
    .set(payload)
    .where(eq(camposPersonalizados.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(camposPersonalizados).where(eq(camposPersonalizados.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(camposPersonalizados)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(camposPersonalizados.id, item.id as any));
    }
  });
}
