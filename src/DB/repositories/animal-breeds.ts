import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { animalBreeds } from '../schema.js';

export async function listByOrganization(organizationId: string) {
  return db.select().from(animalBreeds)
    .where(eq(animalBreeds.organizationId, organizationId))
    .orderBy(asc(animalBreeds.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  ativo?: boolean;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(animalBreeds.ordem) })
    .from(animalBreeds)
    .where(eq(animalBreeds.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(animalBreeds).values({
    organizationId: data.organizationId,
    nome: data.nome,
    ativo: data.ativo ?? true,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  ativo?: boolean;
}) {
  const [row] = await db.update(animalBreeds)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(animalBreeds.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(animalBreeds).where(eq(animalBreeds.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(animalBreeds)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(animalBreeds.id, item.id as any));
    }
  });
}
