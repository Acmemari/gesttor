import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { animalCategories } from '../schema.js';

export async function listByOrganization(organizationId: string) {
  return db.select().from(animalCategories)
    .where(eq(animalCategories.organizationId, organizationId))
    .orderBy(asc(animalCategories.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  complemento?: string | null;
  sexo: string;
  grupo: string;
  idadeFaixa?: string | null;
  pesoKg?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(animalCategories.ordem) })
    .from(animalCategories)
    .where(eq(animalCategories.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(animalCategories).values({
    organizationId: data.organizationId,
    nome: data.nome,
    complemento: data.complemento ?? null,
    sexo: data.sexo,
    grupo: data.grupo,
    idadeFaixa: data.idadeFaixa ?? null,
    pesoKg: data.pesoKg ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  complemento?: string | null;
  sexo?: string;
  grupo?: string;
  idadeFaixa?: string | null;
  pesoKg?: string | null;
}) {
  const [row] = await db.update(animalCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(animalCategories.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(animalCategories).where(eq(animalCategories.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(animalCategories)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(animalCategories.id, item.id as any));
    }
  });
}
