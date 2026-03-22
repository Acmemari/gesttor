import { eq, asc } from 'drizzle-orm';
import { db } from '../index.js';
import { initiativeMilestones } from '../schema.js';

export async function listMilestonesByInitiative(initiativeId: string) {
  return db.select().from(initiativeMilestones)
    .where(eq(initiativeMilestones.initiativeId, initiativeId as any))
    .orderBy(asc(initiativeMilestones.sortOrder));
}

export async function createMilestone(data: {
  initiative_id: string;
  title: string;
  due_date?: string;
  sort_order?: number;
  percent?: number;
}) {
  const [row] = await db.insert(initiativeMilestones).values({
    initiativeId: data.initiative_id as any,
    title: data.title,
    dueDate: data.due_date ?? null,
    sortOrder: data.sort_order ?? 0,
    percent: data.percent ?? 0,
  }).returning();
  return row;
}

export async function updateMilestone(id: string, data: Record<string, unknown>) {
  const mapped: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) mapped.title = data.title;
  if (data.due_date !== undefined) mapped.dueDate = data.due_date;
  if (data.sort_order !== undefined) mapped.sortOrder = data.sort_order;
  if (data.percent !== undefined) mapped.percent = data.percent;
  const [row] = await db.update(initiativeMilestones).set(mapped)
    .where(eq(initiativeMilestones.id, id as any)).returning();
  return row;
}

export async function completeMilestone(id: string) {
  const [row] = await db.update(initiativeMilestones)
    .set({ completed: true, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(initiativeMilestones.id, id as any)).returning();
  return row;
}

export async function deleteMilestone(id: string) {
  await db.delete(initiativeMilestones).where(eq(initiativeMilestones.id, id as any));
}
