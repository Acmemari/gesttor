import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { atas, semanas } from '../schema.js';

export async function listAtasByFarm(farmId: string) {
  const sf = db.$with('sf').as(
    db.select({ id: semanas.id, numero: semanas.numero }).from(semanas),
  );
  const sa = db.$with('sa').as(
    db.select({ id: semanas.id, numero: semanas.numero }).from(semanas),
  );

  // Simple approach: select atas + join twice for week numbers
  const rows = await db
    .select({
      id: atas.id,
      semanaFechadaId: atas.semanaFechadaId,
      semanaAbertaId: atas.semanaAbertaId,
      farmId: atas.farmId,
      organizationId: atas.organizationId,
      createdBy: atas.createdBy,
      dataReuniao: atas.dataReuniao,
      conteudo: atas.conteudo,
      versao: atas.versao,
      createdAt: atas.createdAt,
      updatedAt: atas.updatedAt,
    })
    .from(atas)
    .where(eq(atas.farmId, farmId))
    .orderBy(desc(atas.dataReuniao));

  return rows;
}

export async function getAtaById(id: string) {
  const [row] = await db
    .select()
    .from(atas)
    .where(eq(atas.id, id as any))
    .limit(1);
  return row;
}

export async function createAta(data: {
  semanaFechadaId: string | null;
  semanaAbertaId: string | null;
  farmId: string;
  organizationId: string;
  createdBy: string | null;
  dataReuniao: string;
  conteudo: unknown;
}) {
  const [row] = await db
    .insert(atas)
    .values({
      semanaFechadaId: data.semanaFechadaId,
      semanaAbertaId: data.semanaAbertaId,
      farmId: data.farmId,
      organizationId: data.organizationId,
      createdBy: data.createdBy,
      dataReuniao: data.dataReuniao,
      conteudo: data.conteudo,
    })
    .returning();
  return row;
}

export async function updateAta(id: string, data: { conteudo: unknown; versao?: number }) {
  const [row] = await db
    .update(atas)
    .set({
      conteudo: data.conteudo,
      versao: data.versao,
      updatedAt: new Date(),
    })
    .where(eq(atas.id, id as any))
    .returning();
  return row;
}

export async function deleteAta(id: string) {
  const [row] = await db
    .delete(atas)
    .where(eq(atas.id, id as any))
    .returning();
  return row;
}
