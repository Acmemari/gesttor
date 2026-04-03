import { eq, inArray, asc } from 'drizzle-orm';
import { db } from '../index.js';
import { projectTransformations } from '../schema.js';

export interface TransformationInput {
  text: string;
  evidence: string[];
}

export async function fetchByProjectId(projectId: string) {
  return db.select().from(projectTransformations)
    .where(eq(projectTransformations.projectId, projectId))
    .orderBy(asc(projectTransformations.sortOrder));
}

export async function fetchByProjectIds(projectIds: string[]) {
  if (!projectIds.length) return [];
  return db.select().from(projectTransformations)
    .where(inArray(projectTransformations.projectId, projectIds))
    .orderBy(asc(projectTransformations.sortOrder));
}

export async function upsertForProject(projectId: string, items: TransformationInput[]) {
  const filtered = items.filter(i => i.text.trim());
  await db.delete(projectTransformations).where(eq(projectTransformations.projectId, projectId));
  if (!filtered.length) return [];
  const rows = filtered.map((item, idx) => ({
    projectId,
    text: item.text.trim(),
    evidence: item.evidence.filter(e => typeof e === 'string' && e.trim()).map(e => e.trim()) as unknown as string[],
    sortOrder: idx,
  }));
  return db.insert(projectTransformations).values(rows).returning();
}
