/**
 * Lib cliente de iniciativas — usa o backend Drizzle via /api/initiatives, /api/milestones, /api/tasks.
 * Mantém assinaturas compatíveis com o código existente.
 */
import * as initiativesApi from './api/initiativesClient';
import * as milestonesApi from './api/milestonesClient';
import * as tasksApi from './api/tasksClient';
import { sanitizeText } from './inputSanitizer';

// ─── Tipos (mantidos para compatibilidade) ────────────────────────────────────

export interface InitiativeRow {
  id: string;
  created_by: string;
  name: string;
  tags: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  leader: string | null;
  internal_leader: string | null;
  delivery_id: string;
  organization_id: string | null;
  /** @deprecated use organization_id */
  client_id: string | null;
  farm_id: string | null;
  percent: number;
  weight: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface InitiativeTaskRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  activity_date: string | null;
  duration_days: number | null;
  responsible_person_id: string | null;
  kanban_status: KanbanStatus;
  kanban_order: number;
  sort_order: number;
  weight: string;
  created_at: string;
  updated_at: string;
}

export type KanbanStatus = 'A Fazer' | 'Andamento' | 'Pausado' | 'Concluído';

export interface InitiativeMilestoneRow {
  id: string;
  initiative_id: string;
  title: string;
  percent: number;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  due_date: string | null;
  tasks?: InitiativeTaskRow[];
}

export interface InitiativeWithProgress extends InitiativeRow {
  progress: number;
  milestones?: InitiativeMilestoneRow[];
}

export interface InitiativeWithTeam extends InitiativeWithProgress {
  team: { name: string; role: string }[];
}

export interface FetchInitiativesFilters {
  clientId?: string;
  farmId?: string;
  orgId?: string;
}

export interface CreateInitiativePayload {
  name: string;
  tags?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  leader?: string;
  internal_leader?: string;
  delivery_id: string;
  client_id?: string | null;
  organization_id?: string | null;
  farm_id?: string | null;
  percent?: number;
  weight?: string | number;
  team: string[];
  milestones: { title: string; percent: number; due_date?: string | null; completed?: boolean }[];
}

export interface CreateInitiativeTaskPayload {
  title: string;
  description?: string;
  due_date?: string | null;
  activity_date?: string | null;
  duration_days?: number | null;
  responsible_person_id?: string | null;
  kanban_status?: KanbanStatus;
  kanban_order?: number;
  sort_order?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }, fallback: string): T {
  if (!result.ok) throw new Error((result as { ok: false; error: string }).error || fallback);
  return (result as { ok: true; data: T }).data;
}

function mapInitiativeRow(r: initiativesApi.InitiativeRow): InitiativeRow {
  return { ...r, client_id: r.organization_id };
}

function calcProgress(milestones: InitiativeMilestoneRow[]): number {
  const allTasks = milestones.flatMap(m => m.tasks ?? []);
  if (allTasks.length === 0) return 0;
  return Math.round((allTasks.filter(t => t.completed).length / allTasks.length) * 100);
}

// ─── Busca ────────────────────────────────────────────────────────────────────

/**
 * Busca iniciativas de uma entrega, com milestones e tarefas aninhadas.
 */
export async function fetchInitiativesByDelivery(deliveryId: string): Promise<InitiativeWithProgress[]> {
  if (!deliveryId?.trim()) return [];
  const result = await fetch(
    `/api/initiatives?deliveryId=${encodeURIComponent(deliveryId)}&withTree=true`,
    { headers: await getAuthHeaders() },
  );
  const json = await result.json() as { ok: boolean; data: unknown };
  if (!json.ok) throw new Error((json as { error?: string }).error || 'Erro ao carregar iniciativas.');
  const rows = json.data as Array<InitiativeRow & { milestones: InitiativeMilestoneRow[]; progress: number }>;
  return rows.map(r => ({ ...mapInitiativeRow(r), milestones: r.milestones, progress: r.progress }));
}

/**
 * Busca iniciativas de múltiplas entregas (otimizado: paralelo por entrega).
 */
export async function fetchInitiativesByDeliveries(deliveryIds: string[]): Promise<InitiativeWithProgress[]> {
  if (!deliveryIds?.length) return [];
  const results = await Promise.all(deliveryIds.map(id => fetchInitiativesByDelivery(id)));
  return results.flat();
}

/**
 * Busca iniciativas por organização.
 */
export async function fetchInitiatives(
  _effectiveUserId: string,
  filters?: FetchInitiativesFilters,
): Promise<InitiativeWithProgress[]> {
  const orgId = filters?.orgId ?? filters?.clientId;
  if (!orgId?.trim()) return [];
  const rows = unwrap(await initiativesApi.listInitiativesByOrg(orgId), 'Erro ao carregar iniciativas.');
  return rows.map(r => ({ ...mapInitiativeRow(r), progress: r.percent }));
}

/**
 * Busca iniciativa detalhada com time e marcos para edição.
 */
export async function fetchInitiativeForEdit(initiativeId: string): Promise<{
  initiative: InitiativeRow;
  team: string[];
  milestones: { id: string; title: string; percent: number; due_date?: string | null; completed?: boolean }[];
}> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');

  const [initiativeResult, milestones, team] = await Promise.all([
    initiativesApi.getInitiativeById(initiativeId),
    milestonesApi.listMilestones(initiativeId),
    initiativesApi.listTeamMembers(initiativeId),
  ]);

  const initiative = unwrap(initiativeResult, 'Iniciativa não encontrada.');

  const milestonesData = unwrap(milestones, 'Erro ao carregar marcos.').map(m => ({
    id: m.id,
    title: m.title,
    percent: m.percent,
    due_date: m.due_date,
    completed: m.completed,
  }));

  const teamData = unwrap(team, 'Erro ao carregar equipe.').map(t => t.name);

  return {
    initiative: mapInitiativeRow(initiative),
    team: teamData,
    milestones: milestonesData,
  };
}

export async function fetchInitiativesWithTeams(
  effectiveUserId: string,
  filters?: FetchInitiativesFilters,
): Promise<InitiativeWithTeam[]> {
  const rows = await fetchInitiatives(effectiveUserId, filters);
  // Buscar times em paralelo
  const withTeams = await Promise.all(
    rows.map(async (initiative) => {
      const teamResult = await initiativesApi.listTeamMembers(initiative.id);
      const team = teamResult.ok
        ? (teamResult as { ok: true; data: initiativesApi.TeamMemberRow[] }).data.map(t => ({ name: t.name, role: t.role }))
        : [];
      return { ...initiative, team };
    }),
  );
  return withTeams;
}

export async function fetchInitiativeDetail(
  initiativeId: string,
): Promise<InitiativeWithProgress & { team: { name: string; role: string }[] }> {
  const [milestonesResult, teamResult] = await Promise.all([
    milestonesApi.listMilestones(initiativeId),
    initiativesApi.listTeamMembers(initiativeId),
  ]);

  const milestones = unwrap(milestonesResult, 'Erro ao carregar marcos.');
  const team = unwrap(teamResult, 'Erro ao carregar equipe.');

  const milestonesWithTasks = await Promise.all(
    milestones.map(async (m) => {
      const tasksResult = await tasksApi.listTasksByMilestone(m.id);
      const tasks = tasksResult.ok ? (tasksResult as { ok: true; data: tasksApi.TaskRow[] }).data as InitiativeTaskRow[] : [];
      return { ...m, tasks };
    }),
  );

  const progress = calcProgress(milestonesWithTasks);

  return {
    id: initiativeId,
    progress,
    milestones: milestonesWithTasks,
    team: team.map(t => ({ name: t.name, role: t.role })),
  } as unknown as InitiativeWithProgress & { team: { name: string; role: string }[] };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createInitiative(_createdBy: string, payload: CreateInitiativePayload): Promise<InitiativeRow> {
  if (!payload.name?.trim()) throw new Error('Nome da iniciativa é obrigatório.');
  if (!payload.delivery_id?.trim()) throw new Error('delivery_id é obrigatório.');

  const row = unwrap(
    await initiativesApi.createInitiative({
      delivery_id: payload.delivery_id,
      name: sanitizeText(payload.name),
      organization_id: payload.organization_id ?? payload.client_id ?? null,
      farm_id: payload.farm_id ?? null,
      tags: payload.tags ? sanitizeText(payload.tags) : null,
      description: payload.description ? sanitizeText(payload.description) : null,
      start_date: payload.start_date ?? null,
      end_date: payload.end_date ?? null,
      leader: payload.leader?.trim() ?? null,
      internal_leader: payload.internal_leader?.trim() ?? null,
      weight: payload.weight ? String(payload.weight) : '1',
    }),
    'Erro ao criar iniciativa.',
  );

  // Time
  const teamNames = (payload.team ?? []).filter(n => n?.trim());
  await Promise.all(
    teamNames.map((name, i) =>
      initiativesApi.addTeamMember(row.id, {
        name: name.trim(),
        role: i === 0 ? 'RESPONSÁVEL' : 'APOIO',
      }),
    ),
  );

  // Marcos
  const validMilestones = (payload.milestones ?? []).filter(m => m.title?.trim());
  await Promise.all(
    validMilestones.map((m, i) =>
      milestonesApi.createMilestone({
        initiative_id: row.id,
        title: m.title.trim(),
        due_date: m.due_date ?? null,
        sort_order: i,
      }),
    ),
  );

  return mapInitiativeRow(row);
}

export async function updateInitiative(initiativeId: string, payload: CreateInitiativePayload): Promise<InitiativeRow> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');
  if (!payload.name?.trim()) throw new Error('Nome da iniciativa é obrigatório.');

  const row = unwrap(
    await initiativesApi.updateInitiative(initiativeId, {
      name: sanitizeText(payload.name),
      tags: payload.tags ? sanitizeText(payload.tags) : null,
      description: payload.description ? sanitizeText(payload.description) : null,
      start_date: payload.start_date ?? null,
      end_date: payload.end_date ?? null,
      leader: payload.leader?.trim() ?? null,
      internal_leader: payload.internal_leader?.trim() ?? null,
      farm_id: payload.farm_id ?? null,
      organization_id: payload.organization_id ?? payload.client_id ?? null,
      weight: payload.weight ? String(payload.weight) : undefined,
    }),
    'Erro ao atualizar iniciativa.',
  );

  return mapInitiativeRow(row);
}

export async function deleteInitiative(initiativeId: string): Promise<void> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');
  unwrap(await initiativesApi.deleteInitiative(initiativeId), 'Erro ao excluir iniciativa.');
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export async function toggleMilestoneCompleted(milestoneId: string): Promise<void> {
  if (!milestoneId) throw new Error('ID do marco é obrigatório.');
  // Completa o marco via action='complete'. Para desfazer, usa updateMilestone com completed=false via updateMilestone.
  await milestonesApi.completeMilestone(milestoneId);
}

// ─── Tarefas ──────────────────────────────────────────────────────────────────

export async function listTasksByMilestone(milestoneId: string): Promise<InitiativeTaskRow[]> {
  if (!milestoneId?.trim()) throw new Error('Marco inválido.');
  const result = await tasksApi.listTasksByMilestone(milestoneId);
  return unwrap(result, 'Erro ao carregar tarefas.') as InitiativeTaskRow[];
}

export async function createTask(milestoneId: string, payload: CreateInitiativeTaskPayload): Promise<InitiativeTaskRow> {
  if (!payload.title?.trim()) throw new Error('Título da tarefa é obrigatório.');
  const result = await tasksApi.createTask({
    milestone_id: milestoneId,
    title: sanitizeText(payload.title),
    description: payload.description?.trim() ? sanitizeText(payload.description) : null,
    due_date: payload.due_date ?? null,
    activity_date: payload.activity_date ?? null,
    duration_days: payload.duration_days ?? null,
    responsible_person_id: payload.responsible_person_id ?? null,
    kanban_status: payload.kanban_status ?? 'A Fazer',
    kanban_order: payload.kanban_order ?? 0,
    sort_order: payload.sort_order ?? 0,
  });
  return unwrap(result, 'Erro ao criar tarefa.') as InitiativeTaskRow;
}

export async function updateTask(
  taskId: string,
  payload: Partial<{
    title: string;
    description: string | null;
    due_date: string | null;
    activity_date: string | null;
    duration_days: number | null;
    responsible_person_id: string | null;
    kanban_status: KanbanStatus;
    kanban_order: number;
    completed: boolean;
    sort_order: number;
  }>,
): Promise<InitiativeTaskRow> {
  const result = await tasksApi.updateTask(taskId, payload);
  return unwrap(result, 'Erro ao atualizar tarefa.') as InitiativeTaskRow;
}

export async function updateTasksKanban(
  updates: Array<{ id: string; kanban_status: KanbanStatus; kanban_order: number; completed?: boolean }>,
): Promise<void> {
  if (!updates.length) return;
  await Promise.all(
    updates.map(item => tasksApi.updateTaskKanban(item.id, item.kanban_status, item.kanban_order)),
  );
}

export async function toggleTaskCompleted(taskId: string): Promise<void> {
  if (!taskId?.trim()) throw new Error('ID da tarefa é obrigatório.');
  // Marca tarefa como concluída; para desfazer, chame updateTask com kanban_status='A Fazer'
  await tasksApi.updateTaskKanban(taskId, 'Concluído', 0);
}

export async function deleteTask(taskId: string): Promise<void> {
  if (!taskId?.trim()) throw new Error('ID da tarefa é obrigatório.');
  unwrap(await tasksApi.deleteTask(taskId), 'Erro ao excluir tarefa.');
}

export async function fetchTasksByInitiative(initiativeId: string): Promise<InitiativeTaskRow[]> {
  if (!initiativeId?.trim()) throw new Error('ID da iniciativa é obrigatório.');
  const result = await tasksApi.listTasksByInitiative(initiativeId);
  return unwrap(result, 'Erro ao carregar tarefas.') as InitiativeTaskRow[];
}

export async function ensureDefaultMilestone(initiativeId: string): Promise<string> {
  if (!initiativeId?.trim()) throw new Error('ID da iniciativa é obrigatório.');
  const existing = unwrap(await milestonesApi.listMilestones(initiativeId), 'Erro ao verificar marcos.');
  if (existing.length > 0) return existing[0].id;

  const created = unwrap(
    await milestonesApi.createMilestone({ initiative_id: initiativeId, title: 'Atividades', sort_order: 0 }),
    'Erro ao criar marco padrão.',
  );
  return created.id;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  // Reutiliza o mesmo helper que os outros clients
  const { getAuthHeaders: h } = await import('./session');
  return h();
}
