import { eq, max } from 'drizzle-orm';
import { db } from '../index.js';
import { deliveries } from '../schema.js';

export async function listDeliveriesByProject(projectId: string) {
  return db.select().from(deliveries)
    .where(eq(deliveries.projectId, projectId as any))
    .orderBy(deliveries.sortOrder);
}

export async function createDelivery(data: {
  name: string;
  project_id?: string;
  client_id?: string;
  organization_id?: string;
  description?: string;
  transformations_achievements?: string;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  sort_order?: number;
  stakeholder_matrix?: unknown;
  created_by?: string;
}) {
  const [row] = await db.insert(deliveries).values({
    name: data.name,
    projectId: data.project_id as any ?? null,
    clientId: data.client_id as any ?? null,
    organizationId: data.organization_id ?? null,
    description: data.description ?? null,
    transformationsAchievements: data.transformations_achievements ?? null,
    dueDate: data.due_date ?? null,
    startDate: data.start_date ?? null,
    endDate: data.end_date ?? null,
    sortOrder: data.sort_order ?? 0,
    stakeholderMatrix: (data.stakeholder_matrix ?? []) as any,
    createdBy: data.created_by ?? null,
  }).returning();
  return row;
}

export async function updateDelivery(id: string, data: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  if (data.name !== undefined) mapped.name = data.name;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.transformations_achievements !== undefined) mapped.transformationsAchievements = data.transformations_achievements;
  if (data.due_date !== undefined) mapped.dueDate = data.due_date;
  if (data.start_date !== undefined) mapped.startDate = data.start_date;
  if (data.end_date !== undefined) mapped.endDate = data.end_date;
  if (data.sort_order !== undefined) mapped.sortOrder = data.sort_order;
  if (data.stakeholder_matrix !== undefined) mapped.stakeholderMatrix = data.stakeholder_matrix;
  if (data.project_id !== undefined) mapped.projectId = data.project_id;
  if (data.client_id !== undefined) mapped.clientId = data.client_id;
  mapped.updatedAt = new Date();
  const [row] = await db.update(deliveries).set(mapped).where(eq(deliveries.id, id as any)).returning();
  return row;
}

export async function deleteDelivery(id: string) {
  await db.delete(deliveries).where(eq(deliveries.id, id as any));
}

export async function getNextDeliverySortOrder(projectId: string): Promise<number> {
  const [result] = await db.select({ maxOrder: max(deliveries.sortOrder) })
    .from(deliveries)
    .where(eq(deliveries.projectId, projectId as any));
  return (result?.maxOrder ?? -1) + 1;
}
