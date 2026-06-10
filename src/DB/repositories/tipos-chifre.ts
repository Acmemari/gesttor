import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { tiposChifre } from '../schema.js';

export async function listByOrganization(organizationId: string) {
  return db.select().from(tiposChifre)
    .where(eq(tiposChifre.organizationId, organizationId))
    .orderBy(asc(tiposChifre.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  descricao?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(tiposChifre.ordem) })
    .from(tiposChifre)
    .where(eq(tiposChifre.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(tiposChifre).values({
    organizationId: data.organizationId,
    nome: data.nome,
    descricao: data.descricao ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  descricao?: string | null;
  ativo?: boolean;
}) {
  const [row] = await db.update(tiposChifre)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tiposChifre.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(tiposChifre).where(eq(tiposChifre.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(tiposChifre)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(tiposChifre.id, item.id as any));
    }
  });
}
