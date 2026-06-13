import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { lotes } from '../schema.js';

/**
 * Repositório de Lotes. Diferente de Pelagens, não há lista padrão do sistema:
 * os lotes são sempre criados pelo usuário (sem auto-seed).
 */

export async function listByOrganization(organizationId: string) {
  return db.select().from(lotes)
    .where(eq(lotes.organizationId, organizationId))
    .orderBy(asc(lotes.ordem));
}

export async function create(data: {
  organizationId: string;
  farmId?: string | null;
  retiro?: string | null;
  nome: string;
  codigo?: string | null;
  finalidade?: string | null;
  sistema?: string | null;
  dataInicio: string;
  finalizado: boolean;
  descricao?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(lotes.ordem) })
    .from(lotes)
    .where(eq(lotes.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(lotes).values({
    organizationId: data.organizationId,
    farmId: data.farmId ?? null,
    retiro: data.retiro ?? null,
    nome: data.nome,
    codigo: data.codigo ?? null,
    finalidade: data.finalidade ?? null,
    sistema: data.sistema ?? null,
    dataInicio: data.dataInicio,
    finalizado: data.finalizado,
    descricao: data.descricao ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  farmId?: string | null;
  retiro?: string | null;
  nome?: string;
  codigo?: string | null;
  finalidade?: string | null;
  sistema?: string | null;
  dataInicio?: string;
  finalizado?: boolean;
  descricao?: string | null;
}) {
  const [row] = await db.update(lotes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(lotes.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(lotes).where(eq(lotes.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(lotes)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(lotes.id, item.id as any));
    }
  });
}
