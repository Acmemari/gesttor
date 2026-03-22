import { eq, asc } from 'drizzle-orm';
import { db } from '../index.js';
import { initiativeTasks, initiativeMilestones } from '../schema.js';

export async function listTasksByMilestone(milestoneId: string) {
  return db.select().from(initiativeTasks)
    .where(eq(initiativeTasks.milestoneId, milestoneId as any))
    .orderBy(asc(initiativeTasks.sortOrder));
}

export async function listTasksByInitiative(initiativeId: string) {
  return db.select({ task: initiativeTasks })
    .from(initiativeTasks)
    .innerJoin(initiativeMilestones, eq(initiativeTasks.milestoneId, initiativeMilestones.id))
    .where(eq(initiativeMilestones.initiativeId, initiativeId as any))
    .orderBy(asc(initiativeTasks.sortOrder))
    .then(rows => rows.map(r => r.task));
}

export async function createTask(data: {
  milestone_id: string;
  title: string;
  description?: string;
  due_date?: string;
  sort_order?: number;
  responsible_person_id?: string;
  kanban_status?: string;
  kanban_order?: number;
  activity_date?: string;
  duration_days?: number;
}) {
  const [row] = await db.insert(initiativeTasks).values({
    milestoneId: data.milestone_id as any,
    title: data.title,
    description: data.description ?? null,
    dueDate: data.due_date ?? null,
    sortOrder: data.sort_order ?? 0,
    responsiblePersonId: data.responsible_person_id as any ?? null,
    kanbanStatus: data.kanban_status ?? 'A Fazer',
    kanbanOrder: data.kanban_order ?? 0,
    activityDate: data.activity_date ?? null,
    durationDays: data.duration_days ?? null,
  }).returning();
  return row;
}

export async function updateTask(id: string, data: Record<string, unknown>) {
  const mapped: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) mapped.title = data.title;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.due_date !== undefined) mapped.dueDate = data.due_date;
  if (data.sort_order !== undefined) mapped.sortOrder = data.sort_order;
  if (data.responsible_person_id !== undefined) mapped.responsiblePersonId = data.responsible_person_id;
  if (data.kanban_status !== undefined) mapped.kanbanStatus = data.kanban_status;
  if (data.kanban_order !== undefined) mapped.kanbanOrder = data.kanban_order;
  if (data.activity_date !== undefined) mapped.activityDate = data.activity_date;
  if (data.duration_days !== undefined) mapped.durationDays = data.duration_days;
  if (data.completed !== undefined) {
    mapped.completed = data.completed;
    if (data.completed) mapped.completedAt = new Date();
  }
  const [row] = await db.update(initiativeTasks).set(mapped)
    .where(eq(initiativeTasks.id, id as any)).returning();
  return row;
}

export async function updateTaskKanban(id: string, data: { kanban_status: string; kanban_order: number }) {
  const [row] = await db.update(initiativeTasks)
    .set({ kanbanStatus: data.kanban_status, kanbanOrder: data.kanban_order, updatedAt: new Date() })
    .where(eq(initiativeTasks.id, id as any)).returning();
  return row;
}

export async function deleteTask(id: string) {
  await db.delete(initiativeTasks).where(eq(initiativeTasks.id, id as any));
}
