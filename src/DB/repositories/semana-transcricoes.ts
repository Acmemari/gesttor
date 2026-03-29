import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { semanaTranscricoes, semanas } from '../schema.js';

export async function listTranscricoesByFarm(farmId: string) {
  return db
    .select({
      id: semanaTranscricoes.id,
      semanaId: semanaTranscricoes.semanaId,
      semanaNumero: semanas.numero,
      farmId: semanaTranscricoes.farmId,
      organizationId: semanaTranscricoes.organizationId,
      uploadedBy: semanaTranscricoes.uploadedBy,
      fileName: semanaTranscricoes.fileName,
      originalName: semanaTranscricoes.originalName,
      fileType: semanaTranscricoes.fileType,
      fileSize: semanaTranscricoes.fileSize,
      storagePath: semanaTranscricoes.storagePath,
      descricao: semanaTranscricoes.descricao,
      texto: semanaTranscricoes.texto,
      tipo: semanaTranscricoes.tipo,
      createdAt: semanaTranscricoes.createdAt,
    })
    .from(semanaTranscricoes)
    .leftJoin(semanas, eq(semanaTranscricoes.semanaId, semanas.id))
    .where(eq(semanaTranscricoes.farmId, farmId))
    .orderBy(desc(semanaTranscricoes.createdAt));
}

export async function getTranscricaoById(id: string) {
  const [row] = await db
    .select()
    .from(semanaTranscricoes)
    .where(eq(semanaTranscricoes.id, id as any))
    .limit(1);
  return row;
}

export async function createTranscricao(data: {
  semanaId: string;
  farmId: string;
  organizationId: string;
  uploadedBy: string | null;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  descricao?: string | null;
  texto?: string | null;
  tipo?: string;
}) {
  const [row] = await db
    .insert(semanaTranscricoes)
    .values({
      semanaId: data.semanaId,
      farmId: data.farmId,
      organizationId: data.organizationId,
      uploadedBy: data.uploadedBy ?? null,
      fileName: data.fileName,
      originalName: data.originalName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      storagePath: data.storagePath,
      descricao: data.descricao ?? null,
      texto: data.texto ?? null,
      tipo: data.tipo ?? 'manual',
    })
    .returning();
  return row;
}

export async function deleteTranscricao(id: string) {
  const [row] = await db
    .delete(semanaTranscricoes)
    .where(eq(semanaTranscricoes.id, id as any))
    .returning();
  return row;
}
