import { eq, max, and } from 'drizzle-orm';
import { db } from '../index.js';
import { initiatives, initiativeTeam, initiativeParticipants, initiativeMilestones } from '../schema.js';

export async function listInitiativesByDelivery(deliveryId: string) {
  return db.select().from(initiatives)
    .where(eq(initiatives.deliveryId, deliveryId as any))
    .orderBy(initiatives.sortOrder);
}

export async function listInitiativesByOrg(orgId: string) {
  return db.select().from(initiatives)
    .where(eq(initiatives.organizationId, orgId))
    .orderBy(initiatives.sortOrder);
}

export async function getInitiativeById(id: string) {
  const [row] = await db.select().from(initiatives).where(eq(initiatives.id, id as any)).limit(1);
  if (!row) return undefined;
  const team = await db.select().from(initiativeTeam).where(eq(initiativeTeam.initiativeId, row.id as any));
  const milestones = await db.select().from(initiativeMilestones)
    .where(eq(initiativeMilestones.initiativeId, row.id as any))
    .orderBy(initiativeMilestones.sortOrder);
  const participants = await db.select().from(initiativeParticipants)
    .where(eq(initiativeParticipants.initiativeId, row.id as any));
  return { ...row, team, milestones, participants };
}

export async function createInitiative(data: Record<string, unknown>) {
  const [row] = await db.insert(initiatives).values({
    name: data.name as string,
    createdBy: data.created_by as string ?? null,
    deliveryId: data.delivery_id as any ?? null,
    organizationId: data.organization_id as string ?? null,
    farmId: data.farm_id as string ?? null,
    description: data.description as string ?? null,
    startDate: data.start_date as string ?? null,
    endDate: data.end_date as string ?? null,
    leader: data.leader as string ?? null,
    internalLeader: data.internal_leader as string ?? null,
    weight: data.weight as string ?? null,
    status: data.status as string ?? null,
    tags: (data.tags ?? []) as any,
    sortOrder: data.sort_order as number ?? 0,
    percent: data.percent as number ?? 0,
  }).returning();
  return row;
}

export async function createInitiativeWithTeamAndMilestones(data: Record<string, unknown>) {
  const initiative = await createInitiative(data);
  const teamMembers = (data.team as unknown[]) ?? [];
  const milestoneItems = (data.milestones as unknown[]) ?? [];
  if (teamMembers.length > 0) {
    await db.insert(initiativeTeam).values(
      teamMembers.map((m: any) => ({ initiativeId: initiative.id as any, name: m.name, role: m.role }))
    );
  }
  if (milestoneItems.length > 0) {
    await db.insert(initiativeMilestones).values(
      milestoneItems.map((m: any, i: number) => ({
        initiativeId: initiative.id as any,
        title: m.title,
        dueDate: m.due_date ?? null,
        sortOrder: m.sort_order ?? i,
        percent: m.percent ?? 0,
      }))
    );
  }
  return getInitiativeById(initiative.id);
}

export async function updateInitiative(id: string, data: Record<string, unknown>) {
  const mapped: Record<string, unknown> = { updatedAt: new Date() };
  const fieldMap: Record<string, string> = {
    name: 'name', description: 'description', start_date: 'startDate', end_date: 'endDate',
    leader: 'leader', internal_leader: 'internalLeader', weight: 'weight', status: 'status',
    tags: 'tags', sort_order: 'sortOrder', percent: 'percent', delivery_id: 'deliveryId',
    organization_id: 'organizationId', farm_id: 'farmId',
  };
  for (const [k, v] of Object.entries(fieldMap)) {
    if (data[k] !== undefined) mapped[v] = data[k];
  }
  const [row] = await db.update(initiatives).set(mapped).where(eq(initiatives.id, id as any)).returning();
  return row;
}

export async function deleteInitiative(id: string) {
  await db.delete(initiatives).where(eq(initiatives.id, id as any));
}

export async function listTeamMembers(initiativeId: string) {
  return db.select().from(initiativeTeam).where(eq(initiativeTeam.initiativeId, initiativeId as any));
}

export async function addTeamMember(data: { initiative_id: string; person_id?: string; name?: string; role?: string }) {
  const [row] = await db.insert(initiativeTeam).values({
    initiativeId: data.initiative_id as any,
    personId: data.person_id as any ?? null,
    name: data.name ?? null,
    role: data.role ?? null,
  }).returning();
  return row;
}

export async function removeTeamMember(id: string) {
  await db.delete(initiativeTeam).where(eq(initiativeTeam.id, id as any));
}

export async function getNextInitiativeSortOrder(deliveryId: string): Promise<number> {
  const [result] = await db.select({ maxOrder: max(initiatives.sortOrder) })
    .from(initiatives).where(eq(initiatives.deliveryId, deliveryId as any));
  return (result?.maxOrder ?? -1) + 1;
}

export async function listParticipants(initiativeId: string) {
  return db.select().from(initiativeParticipants)
    .where(eq(initiativeParticipants.initiativeId, initiativeId as any));
}

export async function replaceParticipants(initiativeId: string, personIds: string[]) {
  await db.delete(initiativeParticipants).where(eq(initiativeParticipants.initiativeId, initiativeId as any));
  if (personIds.length > 0) {
    await db.insert(initiativeParticipants).values(
      personIds.map(pid => ({ initiativeId: initiativeId as any, personId: pid as any }))
    );
  }
}
