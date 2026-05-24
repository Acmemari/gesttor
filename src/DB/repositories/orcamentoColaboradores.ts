/**
 * Repositório de colaboradores do orçamento (subset dos userProfiles da org).
 *
 * Sem invite por e-mail no MVP — só atribui papel/é-aprovador a usuários já
 * cadastrados na organização.
 */
import { and, eq, or, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../index.js';
import { orcamentoColaboradores, userProfiles, people, personFarms, farms } from '../schema.js';

export type ColaboradorRow = {
  id: string;
  orcamentoId: string;
  userId: string;
  papel: string;
  eAprovador: boolean;
  createdAt: Date;
  user: { id: string; name: string | null; email: string; role: string } | null;
};

export async function listColaboradoresDoOrcamento(orcamentoId: string): Promise<ColaboradorRow[]> {
  const rows = await db
    .select({
      id: orcamentoColaboradores.id,
      orcamentoId: orcamentoColaboradores.orcamentoId,
      userId: orcamentoColaboradores.userId,
      papel: orcamentoColaboradores.papel,
      eAprovador: orcamentoColaboradores.eAprovador,
      createdAt: orcamentoColaboradores.createdAt,
      userIdJoined: userProfiles.id,
      userName: userProfiles.name,
      userEmail: userProfiles.email,
      userRole: userProfiles.role,
    })
    .from(orcamentoColaboradores)
    .leftJoin(userProfiles, eq(userProfiles.id, orcamentoColaboradores.userId))
    .where(eq(orcamentoColaboradores.orcamentoId, orcamentoId));

  return rows.map((r) => ({
    id: r.id,
    orcamentoId: r.orcamentoId,
    userId: r.userId,
    papel: r.papel,
    eAprovador: r.eAprovador,
    createdAt: r.createdAt,
    user: r.userIdJoined
      ? { id: r.userIdJoined, name: r.userName, email: r.userEmail, role: r.userRole }
      : null,
  }));
}

/**
 * Usuários elegíveis a serem colaboradores de um orçamento.
 *
 * Fontes:
 *  1. `user_profiles` com `organization_id` = orgId (cliente/analista da org).
 *  2. `people` vinculados a fazendas da org via `person_farms`, que JÁ tenham
 *     conta criada (`people.user_id` não nulo). Sem conta não pode editar/aprovar.
 *
 * Retorna lista única (deduplicada por user_profiles.id), preferindo o nome de
 * `people.full_name` quando disponível (costuma estar mais completo que
 * `user_profiles.name`).
 */
export async function listUsuariosDisponiveis(organizationId: string) {
  // 1. Coleta IDs de user_profiles vindos via people → person_farms → farms da org.
  const idsViaFarm = await db
    .selectDistinct({ userId: people.userId, fullName: people.fullName })
    .from(people)
    .innerJoin(personFarms, eq(personFarms.pessoaId, people.id))
    .innerJoin(farms, eq(farms.id, personFarms.farmId))
    .where(
      and(
        eq(farms.organizationId, organizationId),
        eq(people.ativo, true),
        isNotNull(people.userId),
      ),
    );

  const userIdsFromFarm = idsViaFarm
    .map((r) => r.userId)
    .filter((v): v is string => !!v);
  const fullNameByUserId = new Map<string, string>();
  for (const r of idsViaFarm) {
    if (r.userId && r.fullName) fullNameByUserId.set(r.userId, r.fullName);
  }

  // 2. Une com user_profiles.organization_id direto.
  const condicoes = [eq(userProfiles.organizationId, organizationId)];
  if (userIdsFromFarm.length > 0) {
    condicoes.push(inArray(userProfiles.id, userIdsFromFarm));
  }

  const rows = await db
    .select({
      id: userProfiles.id,
      name: userProfiles.name,
      email: userProfiles.email,
      role: userProfiles.role,
    })
    .from(userProfiles)
    .where(and(eq(userProfiles.ativo, true), or(...condicoes)));

  // Aplica preferência por full_name vindo de people quando existir.
  return rows.map((r) => ({
    ...r,
    name: fullNameByUserId.get(r.id) ?? r.name,
  }));
}

export async function addColaborador(input: {
  orcamentoId: string;
  userId: string;
  papel: 'editor' | 'consultor';
  eAprovador?: boolean;
}) {
  const [row] = await db
    .insert(orcamentoColaboradores)
    .values({
      orcamentoId: input.orcamentoId,
      userId: input.userId,
      papel: input.papel,
      eAprovador: input.eAprovador ?? false,
    })
    .returning();
  return row;
}

export async function removeColaborador(id: string) {
  await db.delete(orcamentoColaboradores).where(eq(orcamentoColaboradores.id, id));
}
