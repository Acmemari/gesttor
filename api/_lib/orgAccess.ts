/**
 * Helpers de autorização para endpoints do plano de trabalho.
 *
 * Padrão: admin passa direto; analista deve ser principal (organizations.analystId)
 * ou secundário (organization_analysts). Extrai o padrão existente em api/farms.ts.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/DB/index.js';
import {
  userProfiles,
  organizations,
  organizationAnalysts,
  farms,
  projects as projectsTable,
  deliveries as deliveriesTable,
  initiatives as initiativesTable,
  initiativeMilestones,
  initiativeTasks,
} from '../../src/DB/schema.js';

/** Carrega o role do usuário. Lança erro 401 se perfil não encontrado. */
export async function getUserRole(userId: string): Promise<string> {
  const [profile] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  if (!profile) {
    throw Object.assign(new Error('Perfil não encontrado'), {
      status: 401,
      code: 'AUTH_PROFILE_NOT_FOUND',
    });
  }
  return profile.role ?? 'visitante';
}

/**
 * Verifica se o usuário tem acesso à organização.
 * Admin passa direto. Analista deve ser principal ou secundário.
 */
export async function assertOrgAccess(orgId: string, userId: string, role: string): Promise<void> {
  if (role === 'admin' || role === 'administrador') return;

  const [org] = await db
    .select({ analystId: organizations.analystId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw Object.assign(new Error('Organização não encontrada'), {
      status: 404,
      code: 'NOT_FOUND',
    });
  }
  if (org.analystId === userId) return;

  const [secondary] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(
      and(
        eq(organizationAnalysts.organizationId, orgId),
        eq(organizationAnalysts.analystId, userId),
      ),
    )
    .limit(1);

  if (!secondary) {
    throw Object.assign(new Error('Sem permissão para esta organização'), {
      status: 403,
      code: 'FORBIDDEN',
    });
  }
}

/**
 * Verifica se o usuário tem acesso à fazenda.
 * Admin passa direto. Demais roles precisam ter acesso à organização da fazenda.
 * Retorna o organizationId da fazenda.
 */
export async function assertFarmAccess(
  farmId: string,
  userId: string,
  role: string,
): Promise<string> {
  const [farm] = await db
    .select({ organizationId: farms.organizationId })
    .from(farms)
    .where(eq(farms.id, farmId))
    .limit(1);

  if (!farm) {
    throw Object.assign(new Error('Fazenda não encontrada'), {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  if (role !== 'admin' && role !== 'administrador') {
    await assertOrgAccess(farm.organizationId, userId, role);
  }

  return farm.organizationId;
}

/**
 * Resolve projeto → organização e verifica acesso.
 * Retorna o organizationId do projeto.
 */
export async function assertProjectAccess(
  projectId: string,
  userId: string,
  role: string,
): Promise<string> {
  if (role === 'admin' || role === 'administrador') {
    const [proj] = await db
      .select({ organizationId: projectsTable.organizationId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (!proj) throw Object.assign(new Error('Projeto não encontrado'), { status: 404, code: 'NOT_FOUND' });
    return proj.organizationId;
  }

  const [proj] = await db
    .select({ organizationId: projectsTable.organizationId })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!proj) {
    throw Object.assign(new Error('Projeto não encontrado'), { status: 404, code: 'NOT_FOUND' });
  }
  await assertOrgAccess(proj.organizationId, userId, role);
  return proj.organizationId;
}

/**
 * Resolve entrega → projeto → organização e verifica acesso.
 */
export async function assertDeliveryAccess(
  deliveryId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (role === 'admin' || role === 'administrador') return;

  const [delivery] = await db
    .select({ projectId: deliveriesTable.projectId })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) {
    throw Object.assign(new Error('Entrega não encontrada'), { status: 404, code: 'NOT_FOUND' });
  }
  await assertProjectAccess(delivery.projectId, userId, role);
}

/**
 * Resolve iniciativa → entrega → projeto → organização e verifica acesso.
 * Usa JOIN único em vez de queries sequenciais para evitar N round-trips ao banco.
 */
export async function assertInitiativeAccess(
  initiativeId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (role === 'admin' || role === 'administrador') return;

  const [row] = await db
    .select({ analystId: organizations.analystId, orgId: organizations.id })
    .from(initiativesTable)
    .innerJoin(deliveriesTable, eq(deliveriesTable.id, initiativesTable.deliveryId))
    .innerJoin(projectsTable, eq(projectsTable.id, deliveriesTable.projectId))
    .innerJoin(organizations, eq(organizations.id, projectsTable.organizationId))
    .where(eq(initiativesTable.id, initiativeId))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error('Iniciativa não encontrada'), { status: 404, code: 'NOT_FOUND' });
  }

  if (row.analystId === userId) return;

  const [secondary] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, row.orgId), eq(organizationAnalysts.analystId, userId)))
    .limit(1);

  if (!secondary) {
    throw Object.assign(new Error('Sem permissão para esta organização'), { status: 403, code: 'FORBIDDEN' });
  }
}

/**
 * Resolve marco → iniciativa → entrega → projeto → organização e verifica acesso.
 * Usa JOIN único em vez de queries sequenciais.
 */
export async function assertMilestoneAccess(
  milestoneId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (role === 'admin' || role === 'administrador') return;

  const [row] = await db
    .select({ analystId: organizations.analystId, orgId: organizations.id })
    .from(initiativeMilestones)
    .innerJoin(initiativesTable, eq(initiativesTable.id, initiativeMilestones.initiativeId))
    .innerJoin(deliveriesTable, eq(deliveriesTable.id, initiativesTable.deliveryId))
    .innerJoin(projectsTable, eq(projectsTable.id, deliveriesTable.projectId))
    .innerJoin(organizations, eq(organizations.id, projectsTable.organizationId))
    .where(eq(initiativeMilestones.id, milestoneId))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error('Marco não encontrado'), { status: 404, code: 'NOT_FOUND' });
  }

  if (row.analystId === userId) return;

  const [secondary] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, row.orgId), eq(organizationAnalysts.analystId, userId)))
    .limit(1);

  if (!secondary) {
    throw Object.assign(new Error('Sem permissão para esta organização'), { status: 403, code: 'FORBIDDEN' });
  }
}

/**
 * Resolve tarefa → marco → iniciativa → entrega → projeto → organização e verifica acesso.
 * Usa JOIN único (6 tabelas) em vez de 5–6 queries sequenciais.
 */
export async function assertTaskAccess(
  taskId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (role === 'admin' || role === 'administrador') return;

  const [row] = await db
    .select({ analystId: organizations.analystId, orgId: organizations.id })
    .from(initiativeTasks)
    .innerJoin(initiativeMilestones, eq(initiativeMilestones.id, initiativeTasks.milestoneId))
    .innerJoin(initiativesTable, eq(initiativesTable.id, initiativeMilestones.initiativeId))
    .innerJoin(deliveriesTable, eq(deliveriesTable.id, initiativesTable.deliveryId))
    .innerJoin(projectsTable, eq(projectsTable.id, deliveriesTable.projectId))
    .innerJoin(organizations, eq(organizations.id, projectsTable.organizationId))
    .where(eq(initiativeTasks.id, taskId))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error('Tarefa não encontrada'), { status: 404, code: 'NOT_FOUND' });
  }

  if (row.analystId === userId) return;

  const [secondary] = await db
    .select({ id: organizationAnalysts.id })
    .from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, row.orgId), eq(organizationAnalysts.analystId, userId)))
    .limit(1);

  if (!secondary) {
    throw Object.assign(new Error('Sem permissão para esta organização'), { status: 403, code: 'FORBIDDEN' });
  }
}
