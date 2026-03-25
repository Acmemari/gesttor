import { eq, asc, and, gte, lte, or } from 'drizzle-orm';
import { db } from '../index.js';
import {
  initiativeTasks,
  initiativeMilestones,
  initiatives,
  deliveries,
  projects,
  organizationAnalysts,
  userProfiles,
} from '../schema.js';

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

/**
 * Busca initiative_tasks com activity_date dentro do intervalo da semana.
 * Retorna todas as tarefas das iniciativas acessíveis pelo userId,
 * enriquecidas com nome da iniciativa para exibição na rotina semanal.
 */
export async function listTasksByWeek(
  userId: string,
  weekStart: string,
  weekEnd: string,
) {
  const [profile] = await db
    .select({ organizationId: userProfiles.organizationId, role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) return [];

  const isAdmin = profile.role === 'admin' || profile.role === 'administrador';

  const secondaryOrgs = await db
    .select({ organizationId: organizationAnalysts.organizationId })
    .from(organizationAnalysts)
    .where(eq(organizationAnalysts.analystId, userId));

  const orgIds = Array.from(new Set([
    ...(profile.organizationId ? [profile.organizationId] : []),
    ...secondaryOrgs.map(o => o.organizationId),
  ])) as string[];

  const dateFilter = and(
    gte(initiativeTasks.activityDate, weekStart as any),
    lte(initiativeTasks.activityDate, weekEnd as any),
  );

  const orgFilter = isAdmin
    ? undefined
    : orgIds.length > 0
      ? or(...orgIds.map(id => eq(projects.organizationId, id as any)))
      : eq(projects.id, '' as any); // nenhuma org → retorna vazio

  const rows = await db
    .select({
      id: initiativeTasks.id,
      milestoneId: initiativeTasks.milestoneId,
      title: initiativeTasks.title,
      description: initiativeTasks.description,
      completed: initiativeTasks.completed,
      completedAt: initiativeTasks.completedAt,
      dueDate: initiativeTasks.dueDate,
      sortOrder: initiativeTasks.sortOrder,
      responsiblePersonId: initiativeTasks.responsiblePersonId,
      kanbanStatus: initiativeTasks.kanbanStatus,
      kanbanOrder: initiativeTasks.kanbanOrder,
      activityDate: initiativeTasks.activityDate,
      durationDays: initiativeTasks.durationDays,
      createdAt: initiativeTasks.createdAt,
      updatedAt: initiativeTasks.updatedAt,
      initiativeName: initiatives.name,
      initiativeId: initiatives.id,
    })
    .from(initiativeTasks)
    .innerJoin(initiativeMilestones, eq(initiativeTasks.milestoneId, initiativeMilestones.id))
    .innerJoin(initiatives, eq(initiativeMilestones.initiativeId, initiatives.id))
    .innerJoin(deliveries, eq(initiatives.deliveryId, deliveries.id))
    .innerJoin(projects, eq(deliveries.projectId, projects.id))
    .where(orgFilter ? and(dateFilter, orgFilter) : dateFilter)
    .orderBy(asc(initiativeTasks.activityDate), asc(initiativeTasks.sortOrder));

  return rows;
}

export async function createTask(data: {
  milestone_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  sort_order?: number;
  responsible_person_id?: string | null;
  kanban_status?: string;
  kanban_order?: number;
  activity_date?: string | null;
  duration_days?: number | null;
  weight?: string;
}) {
  const [row] = await db.insert(initiativeTasks).values({
    milestoneId: data.milestone_id as any,
    title: data.title,
    description: data.description ?? null,
    dueDate: data.due_date ?? null,
    sortOrder: data.sort_order ?? 0,
    responsiblePersonId: data.responsible_person_id as any ?? null,
    kanbanStatus: data.kanban_status ?? 'a fazer',
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
