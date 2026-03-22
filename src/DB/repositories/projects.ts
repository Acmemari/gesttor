import { eq, max, and } from 'drizzle-orm';
import { db } from '../index.js';
import { projects } from '../schema.js';

export async function fetchProjectsByCreatedBy(userId: string, params: { offset?: number; limit?: number } = {}) {
  let query = db.select().from(projects).where(eq(projects.createdBy, userId))
    .orderBy(projects.sortOrder).$dynamic();
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function fetchProjectsForClient(clientId: string, params: { offset?: number; limit?: number } = {}) {
  let query = db.select().from(projects).where(eq(projects.clientId, clientId as any))
    .orderBy(projects.sortOrder).$dynamic();
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function createProject(data: {
  name: string;
  created_by?: string;
  client_id?: string;
  organization_id?: string;
  description?: string;
  transformations_achievements?: string;
  success_evidence?: unknown;
  start_date?: string;
  end_date?: string;
  stakeholder_matrix?: unknown;
  sort_order?: number;
}) {
  const [row] = await db.insert(projects).values({
    name: data.name,
    createdBy: data.created_by ?? null,
    clientId: data.client_id as any ?? null,
    organizationId: data.organization_id ?? null,
    description: data.description ?? null,
    transformationsAchievements: data.transformations_achievements ?? null,
    successEvidence: (data.success_evidence ?? []) as any,
    startDate: data.start_date ?? null,
    endDate: data.end_date ?? null,
    stakeholderMatrix: (data.stakeholder_matrix ?? []) as any,
    sortOrder: data.sort_order ?? 0,
  }).returning();
  return row;
}

export async function updateProject(id: string, data: Record<string, unknown>) {
  const mapped: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) mapped.name = data.name;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.transformations_achievements !== undefined) mapped.transformationsAchievements = data.transformations_achievements;
  if (data.success_evidence !== undefined) mapped.successEvidence = data.success_evidence;
  if (data.start_date !== undefined) mapped.startDate = data.start_date;
  if (data.end_date !== undefined) mapped.endDate = data.end_date;
  if (data.stakeholder_matrix !== undefined) mapped.stakeholderMatrix = data.stakeholder_matrix;
  if (data.sort_order !== undefined) mapped.sortOrder = data.sort_order;
  if (data.client_id !== undefined) mapped.clientId = data.client_id;
  const [row] = await db.update(projects).set(mapped).where(eq(projects.id, id as any)).returning();
  return row;
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id as any));
}

export async function getNextSortOrder(userId: string): Promise<number> {
  const [result] = await db.select({ maxOrder: max(projects.sortOrder) })
    .from(projects).where(eq(projects.createdBy, userId));
  return (result?.maxOrder ?? -1) + 1;
}
