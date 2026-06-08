import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { motivosMorte } from '../schema.js';

/**
 * Motivos de morte padrão do sistema. Toda organização recebe esta lista
 * pré-cadastrada na primeira vez que abre o cadastro (auto-seed quando vazio).
 * Mantida em ordem alfabética, com "OUTROS" por último (catch-all).
 */
export const DEFAULT_MOTIVOS_MORTE: string[] = [
  'ACIDENTE',
  'ANEMIA',
  'ATOLADO',
  'CLOSTRIDIOSES',
  'CURSO',
  'DESCONHECIDO',
  'ENROSCADO NA CERCA',
  'ENROSCADO NO PARTO',
  'FRAQUEZA',
  'FRATURA',
  'GABARRO',
  'GRIPE',
  'HEMORRAGIA',
  'INFECÇÃO UMBILICAL',
  'INTOXICAÇÃO',
  'MELA',
  'ONÇA',
  'PICADA DE COBRA',
  'PNEUMONIA',
  'RAIO',
  'REQUEIMA',
  'ROUBO',
  'TÉTANO',
  'TIMPANISMO',
  'TRISTEZA PARASITÁRIA',
  'URUBU',
  'OUTROS',
];

async function seedDefaults(organizationId: string) {
  await db.insert(motivosMorte).values(
    DEFAULT_MOTIVOS_MORTE.map((nome, i) => ({
      organizationId,
      nome,
      ordem: i,
    })),
  );
}

export async function listByOrganization(organizationId: string) {
  const rows = await db.select().from(motivosMorte)
    .where(eq(motivosMorte.organizationId, organizationId))
    .orderBy(asc(motivosMorte.ordem));

  // Auto-seed: na primeira vez que a org abre o cadastro, popula a lista padrão.
  if (rows.length === 0) {
    await seedDefaults(organizationId);
    return db.select().from(motivosMorte)
      .where(eq(motivosMorte.organizationId, organizationId))
      .orderBy(asc(motivosMorte.ordem));
  }

  return rows;
}

export async function create(data: {
  organizationId: string;
  nome: string;
  descricao?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(motivosMorte.ordem) })
    .from(motivosMorte)
    .where(eq(motivosMorte.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(motivosMorte).values({
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
}) {
  const [row] = await db.update(motivosMorte)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(motivosMorte.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(motivosMorte).where(eq(motivosMorte.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(motivosMorte)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(motivosMorte.id, item.id as any));
    }
  });
}
