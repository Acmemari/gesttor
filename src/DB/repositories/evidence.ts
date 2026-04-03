import { eq, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { evidence, evidenceFiles } from '../schema.js';

export async function listEvidenceByMilestone(milestoneId: string) {
  const evidenceRows = await db.select().from(evidence)
    .where(eq(evidence.milestoneId, milestoneId as any));

  if (evidenceRows.length === 0) return [];

  // Buscar TODOS os files de uma vez (elimina N+1)
  const evidenceIds = evidenceRows.map(e => e.id);
  const allFiles = await db.select().from(evidenceFiles)
    .where(inArray(evidenceFiles.evidenceId, evidenceIds as any));

  // Agrupar em memoria
  const filesByEvidenceId = new Map<string, typeof allFiles>();
  for (const f of allFiles) {
    const eid = f.evidenceId as string;
    const list = filesByEvidenceId.get(eid) ?? [];
    list.push(f);
    filesByEvidenceId.set(eid, list);
  }

  return evidenceRows.map(e => ({
    ...e,
    files: filesByEvidenceId.get(e.id as string) ?? [],
  }));
}

export async function getEvidenceById(evidenceId: string) {
  const [row] = await db.select().from(evidence).where(eq(evidence.id, evidenceId as any)).limit(1);
  if (!row) return undefined;
  const files = await db.select().from(evidenceFiles).where(eq(evidenceFiles.evidenceId, row.id as any));
  return { ...row, files };
}

export async function createEvidence(data: { milestone_id: string; notes?: string }) {
  const [row] = await db.insert(evidence).values({
    milestoneId: data.milestone_id as any,
    notes: data.notes ?? null,
  }).returning();
  return row;
}

export async function addEvidenceFile(evidenceId: string, file: {
  file_name: string;
  storage_path: string;
  file_type?: string;
  file_size?: number;
}) {
  const [row] = await db.insert(evidenceFiles).values({
    evidenceId: evidenceId as any,
    fileName: file.file_name,
    storagePath: file.storage_path,
    fileType: file.file_type ?? null,
    fileSize: file.file_size ?? null,
  }).returning();
  return row;
}

export async function updateEvidenceNotes(evidenceId: string, notes: string) {
  const [row] = await db.update(evidence)
    .set({ notes, updatedAt: new Date() })
    .where(eq(evidence.id, evidenceId as any))
    .returning();
  return row;
}

export async function deleteEvidenceFile(evidenceId: string, fileId: string) {
  await db.delete(evidenceFiles)
    .where(eq(evidenceFiles.id, fileId as any));
}

export async function deleteEvidence(evidenceId: string) {
  await db.delete(evidence).where(eq(evidence.id, evidenceId as any));
}
