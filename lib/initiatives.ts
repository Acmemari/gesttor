import { supabase } from './supabase';
import { sanitizeText } from './inputSanitizer';
import { storageRemove } from './storage';

// ─── Tipos ──────────────────────────────────────────────────────────────────

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
  delivery_id: string | null;
  client_id: string | null;
  farm_id: string | null;
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
}

export interface CreateInitiativePayload {
  name: string;
  tags?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  leader?: string;
  delivery_id: string;
  client_id?: string | null;
  farm_id?: string | null;
  team: string[];
  milestones: { title: string; percent: number; due_date?: string | null; completed?: boolean }[];
}

// ─── Validação local ────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(id: string, fieldName: string): void {
  if (!id || !UUID_REGEX.test(id)) {
    throw new Error(`${fieldName} inválido.`);
  }
}

function isValidISODate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const reg = /^\d{4}-\d{2}-\d{2}$/;
  if (!reg.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
}

function validatePayload(payload: CreateInitiativePayload): void {
  if (!payload.name?.trim()) {
    throw new Error('O nome da iniciativa é obrigatório.');
  }
  if (payload.name.trim().length > 300) {
    throw new Error('O nome da iniciativa é muito longo (máx 300 caracteres).');
  }

  // No back-end (Supabase), as datas devem vir no formato YYYY-MM-DD
  if (!payload.start_date || !isValidISODate(payload.start_date)) {
    throw new Error('Data de início inválida ou faltando (esperado AAAA-MM-DD).');
  }
  if (!payload.end_date || !isValidISODate(payload.end_date)) {
    throw new Error('Data final inválida ou faltando (esperado AAAA-MM-DD).');
  }

  if (!payload.leader?.trim()) {
    throw new Error('O responsável (líder) é obrigatório.');
  }
  if (!payload.delivery_id?.trim()) {
    throw new Error('A entrega vinculada é obrigatória.');
  }
  validateUUID(payload.delivery_id, 'Entrega');

  if (payload.farm_id && !payload.client_id) {
    throw new Error('Não é possível vincular uma fazenda sem informar o cliente.');
  }

  if (payload.start_date > payload.end_date) {
    throw new Error('A data de início não pode ser posterior à data final.');
  }

  if (payload.description && payload.description.length > 5000) {
    throw new Error('A descrição é muito longa (máx 5000 caracteres).');
  }

  if (payload.milestones.length > 50) {
    throw new Error('Máximo de 50 marcos por iniciativa.');
  }

  const totalPercent = payload.milestones.filter(m => m.title?.trim()).reduce((s, m) => s + (m.percent || 0), 0);

  if (totalPercent > 100) {
    throw new Error(`A soma dos marcos (${totalPercent}%) excede 100%.`);
  }

  for (const m of payload.milestones.filter(mil => mil.title?.trim() && mil.due_date)) {
    if (!isValidISODate(m.due_date)) {
      throw new Error(`Data do marco "${m.title}" está em formato inválido.`);
    }
    if (m.due_date! < payload.start_date) {
      throw new Error(`Data limite do marco "${m.title}" não pode ser anterior ao início da iniciativa.`);
    }
    if (m.due_date! > payload.end_date) {
      throw new Error(`Data limite do marco "${m.title}" não pode ser posterior ao fim da iniciativa.`);
    }
  }
}

// ─── Funções ────────────────────────────────────────────────────────────────

/**
 * Busca iniciativas de um analista (effectiveUserId = created_by).
 * Admin passa o ID do analista selecionado; analista passa o próprio ID.
 * RLS garante que admin vê tudo e analista só vê as suas.
 * Aceita filtros opcionais por client_id e farm_id.
 */
export async function fetchInitiatives(
  effectiveUserId: string,
  filters?: FetchInitiativesFilters,
): Promise<InitiativeWithProgress[]> {
  if (!effectiveUserId?.trim()) return [];

  let q = supabase
    .from('initiatives')
    .select(
      `
      *,
      initiative_milestones (
        id, initiative_id, title, percent, completed, completed_at, sort_order, due_date,
        initiative_tasks (
          id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at
        )
      )
    `,
    )
    .eq('created_by', effectiveUserId)
    .order('start_date', { ascending: true, nullsFirst: false });

  if (filters?.clientId?.trim()) {
    q = q.or(`client_id.eq.${filters.clientId},client_id.is.null`);
  }
  if (filters?.farmId?.trim()) {
    q = q.or(`farm_id.eq.${filters.farmId},farm_id.is.null`);
  }

  const { data: initiatives, error: initError } = await q;

  if (initError) throw initError;
  if (!initiatives?.length) return [];

  return initiatives.map(
    (
      i: InitiativeRow & {
        initiative_milestones?: Array<InitiativeMilestoneRow & { initiative_tasks?: InitiativeTaskRow[] }>;
      },
    ) => {
      const list = (i.initiative_milestones || [])
        .map(m => {
          const { initiative_tasks, ...rest } = m;
          return {
            ...rest,
            tasks: (initiative_tasks || []).sort((a, b) => a.sort_order - b.sort_order),
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order);

      const progress = Math.min(
        100,
        Math.max(
          0,
          list.filter(m => m.completed === true).reduce((s, m) => s + (m.percent ?? 0), 0),
        ),
      );

      // Cleanup keys that came nested
      const { initiative_milestones, ...initData } = i;

      return {
        ...initData,
        progress,
        milestones: list,
      } as InitiativeWithProgress;
    },
  );
}

/**
 * Busca iniciativas vinculadas a uma entrega específica, com milestones.
 * Usado pelo ProgramaWorkbench para carregamento sob demanda por coluna.
 */
export async function fetchInitiativesByDelivery(deliveryId: string): Promise<InitiativeWithProgress[]> {
  if (!deliveryId?.trim()) return [];

  const { data: initiatives, error: initError } = await supabase
    .from('initiatives')
    .select(
      `
      *,
      initiative_milestones (
        id, initiative_id, title, percent, completed, completed_at, sort_order, due_date
      )
    `,
    )
    .eq('delivery_id', deliveryId)
    .order('sort_order', { ascending: true })
    .order('start_date', { ascending: true, nullsFirst: false });

  if (initError) throw initError;
  if (!initiatives?.length) return [];

  return initiatives.map((i: any) => {
    const list = (i.initiative_milestones || [])
      .map((m: any) => {
        const { ...rest } = m;
        return rest;
      })
      .sort((a: any, b: any) => a.sort_order - b.sort_order) as InitiativeMilestoneRow[];

    const progress = Math.min(
      100,
      Math.max(
        0,
        list.filter(m => m.completed === true).reduce((s, m) => s + (m.percent ?? 0), 0),
      ),
    );

    // Cleanup keys
    const { initiative_milestones, ...initData } = i;

    return {
      ...initData,
      progress,
      milestones: list,
    } as InitiativeWithProgress;
  });
}

/**
 * Busca iniciativas com time e marcos para relatórios/telas de estrutura.
 * Reaproveita fetchInitiatives para manter regras de filtro/RLS em um único ponto.
 */
export async function fetchInitiativesWithTeams(
  effectiveUserId: string,
  filters?: FetchInitiativesFilters,
): Promise<InitiativeWithTeam[]> {
  if (!effectiveUserId?.trim()) return [];

  let q = supabase
    .from('initiatives')
    .select(
      `
      *,
      initiative_milestones (
        id, initiative_id, title, percent, completed, completed_at, sort_order, due_date,
        initiative_tasks (
          id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at
        )
      ),
      initiative_team (initiative_id, name, role, sort_order)
    `,
    )
    .eq('created_by', effectiveUserId)
    .order('start_date', { ascending: true, nullsFirst: false });

  if (filters?.clientId?.trim()) {
    q = q.or(`client_id.eq.${filters.clientId},client_id.is.null`);
  }
  if (filters?.farmId?.trim()) {
    q = q.or(`farm_id.eq.${filters.farmId},farm_id.is.null`);
  }

  const { data: initiatives, error: initError } = await q;

  if (initError) throw initError;
  if (!initiatives?.length) return [];

  return initiatives.map((i: any) => {
    const list = (i.initiative_milestones || [])
      .map((m: any) => {
        const { initiative_tasks, ...rest } = m;
        return {
          ...rest,
          tasks: (initiative_tasks || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        };
      })
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    const progress = Math.min(
      100,
      Math.max(
        0,
        list.filter((m: any) => m.completed === true).reduce((s: any, m: any) => s + (m.percent ?? 0), 0),
      ),
    );

    const team = (i.initiative_team || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((t: any) => ({ name: t.name || '', role: t.role || '' }));

    const { initiative_milestones, initiative_team, ...initData } = i;

    return {
      ...initData,
      progress,
      milestones: list,
      team,
    } as InitiativeWithTeam;
  });
}

/**
 * Busca iniciativa com team e milestones para edição.
 * RLS garante que apenas criador ou admin acessem.
 */
export async function fetchInitiativeForEdit(initiativeId: string): Promise<{
  initiative: InitiativeRow;
  team: string[];
  milestones: { id: string; title: string; percent: number; due_date?: string | null; completed?: boolean }[];
}> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');

  const { data: initiative, error: initError } = await supabase
    .from('initiatives')
    .select(
      `
      *,
      initiative_team (name, sort_order),
      initiative_milestones (id, title, percent, due_date, completed, sort_order)
    `,
    )
    .eq('id', initiativeId)
    .single();

  if (initError || !initiative) throw new Error('Iniciativa não encontrada');

  const { initiative_team, initiative_milestones, ...initData } = initiative as any;

  return {
    initiative: initData as InitiativeRow,
    team: (initiative_team || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((r: any) => r.name || ''),
    milestones: (initiative_milestones || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((m: any) => ({
        id: m.id,
        title: m.title || '',
        percent: m.percent ?? 0,
        due_date: m.due_date ?? null,
        completed: m.completed ?? false,
      })),
  };
}

/**
 * Cria iniciativa, time e marcos.
 * @param createdBy - ID do analista dono da iniciativa (admin informa o analista selecionado).
 * RLS: INSERT permite created_by = auth.uid() OU admin.
 * DB trigger valida: client pertence ao analyst, farm pertence ao client.
 */
export async function createInitiative(createdBy: string, payload: CreateInitiativePayload): Promise<InitiativeRow> {
  validatePayload(payload);

  const sanitizedName = sanitizeText(payload.name);

  const { data: initiative, error: initError } = await supabase
    .from('initiatives')
    .insert({
      created_by: createdBy,
      name: sanitizedName,
      tags: payload.tags ? sanitizeText(payload.tags) : null,
      description: payload.description ? sanitizeText(payload.description) : null,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      status: payload.status || 'Não Iniciado',
      leader: payload.leader?.trim() || null,
      delivery_id: payload.delivery_id,
      client_id: payload.client_id || null,
      farm_id: payload.farm_id || null,
    })
    .select()
    .single();

  if (initError) {
    const msg = initError.message || 'Erro ao criar iniciativa.';
    throw new Error(msg);
  }
  if (!initiative) throw new Error('Iniciativa não retornada');

  const initiativeId = initiative.id;

  // Time
  const teamNames = (payload.team || []).filter(n => n?.trim());
  if (teamNames.length > 0) {
    const teamRows = teamNames.map((name, i) => ({
      initiative_id: initiativeId,
      name: name.trim(),
      role: i === 0 ? 'RESPONSÁVEL' : 'APOIO',
      sort_order: i,
    }));
    const { error: teamError } = await supabase.from('initiative_team').insert(teamRows);
    if (teamError) throw teamError;
  }

  // Marcos
  const milestoneRows = (payload.milestones || [])
    .filter(m => m.title?.trim())
    .map((m, i) => ({
      initiative_id: initiativeId,
      title: m.title.trim(),
      percent: Math.round(Math.min(100, Math.max(0, m.percent || 0))),
      completed: false,
      sort_order: i,
      due_date: m.due_date?.trim() || null,
    }));

  if (milestoneRows.length > 0) {
    const { error: milError } = await supabase.from('initiative_milestones').insert(milestoneRows);
    if (milError) throw milError;
  }

  return initiative as InitiativeRow;
}

/**
 * Atualiza iniciativa existente (dados básicos, time e marcos).
 * RLS garante que apenas criador ou admin atualizem.
 * DB trigger `set_updated_at` atualiza updated_at automaticamente.
 * DB trigger `validate_initiative_references` valida client/farm.
 */
export async function updateInitiative(initiativeId: string, payload: CreateInitiativePayload): Promise<InitiativeRow> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');
  validatePayload(payload);

  const sanitizedName = sanitizeText(payload.name);

  const { data: initiative, error: initError } = await supabase
    .from('initiatives')
    .update({
      name: sanitizedName,
      tags: payload.tags ? sanitizeText(payload.tags) : null,
      description: payload.description ? sanitizeText(payload.description) : null,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      status: payload.status || 'Não Iniciado',
      leader: payload.leader?.trim() || null,
      delivery_id: payload.delivery_id,
      client_id: payload.client_id || null,
      farm_id: payload.farm_id || null,
    })
    .eq('id', initiativeId)
    .select()
    .single();

  if (initError) {
    const msg = initError.message || 'Erro ao atualizar iniciativa.';
    throw new Error(msg);
  }
  if (!initiative) throw new Error('Iniciativa não encontrada');

  // Recria time
  const { error: delTeamErr } = await supabase.from('initiative_team').delete().eq('initiative_id', initiativeId);
  if (delTeamErr) throw delTeamErr;

  const teamNames = (payload.team || []).filter(n => n?.trim());
  if (teamNames.length > 0) {
    const teamRows = teamNames.map((name, i) => ({
      initiative_id: initiativeId,
      name: name.trim(),
      role: i === 0 ? 'RESPONSÁVEL' : 'APOIO',
      sort_order: i,
    }));
    const { error: teamError } = await supabase.from('initiative_team').insert(teamRows);
    if (teamError) throw teamError;
  }

  // Recria marcos
  const { error: delMilErr } = await supabase.from('initiative_milestones').delete().eq('initiative_id', initiativeId);
  if (delMilErr) throw delMilErr;

  const milestoneRows = (payload.milestones || [])
    .filter(m => m.title?.trim())
    .map((m, i) => ({
      initiative_id: initiativeId,
      title: m.title.trim(),
      percent: Math.round(Math.min(100, Math.max(0, m.percent || 0))),
      completed: m.completed ?? false,
      sort_order: i,
      due_date: m.due_date?.trim() || null,
    }));

  if (milestoneRows.length > 0) {
    const { error: milError } = await supabase.from('initiative_milestones').insert(milestoneRows);
    if (milError) throw milError;
  }

  return initiative as InitiativeRow;
}

/**
 * Exclui iniciativa por ID.
 * FKs estão configuradas com ON DELETE CASCADE para team, milestones e evidências.
 * Também remove (best-effort) arquivos do bucket de evidências.
 */
export async function deleteInitiative(initiativeId: string): Promise<void> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');

  // Buscar caminhos de arquivos antes do DELETE em cascata.
  const { data: milestoneRows, error: milestoneErr } = await supabase
    .from('initiative_milestones')
    .select('id')
    .eq('initiative_id', initiativeId);
  if (milestoneErr) throw milestoneErr;

  let storagePaths: string[] = [];

  const milestoneIds = (milestoneRows || []).map(m => m.id);
  if (milestoneIds.length > 0) {
    const { data: evidenceRows, error: evidenceErr } = await supabase
      .from('milestone_evidence')
      .select('id')
      .in('milestone_id', milestoneIds);
    if (evidenceErr) throw evidenceErr;

    const evidenceIds = (evidenceRows || []).map(e => e.id);
    if (evidenceIds.length > 0) {
      const { data: fileRows, error: filesErr } = await supabase
        .from('milestone_evidence_files')
        .select('storage_path')
        .in('evidence_id', evidenceIds);
      if (filesErr) throw filesErr;
      storagePaths = (fileRows || []).map(f => f.storage_path).filter(Boolean);
    }
  }

  const { error: delErr } = await supabase.from('initiatives').delete().eq('id', initiativeId);
  if (delErr) throw delErr;

  // Limpeza best-effort no Storage (não bloqueia sucesso da exclusão principal).
  if (storagePaths.length > 0) {
    await storageRemove('milestone-evidence', storagePaths);
  }
}

/**
 * Alterna o status de conclusão de um marco.
 * RLS garante que apenas criador ou admin acessem.
 * O trigger DB `sync_initiative_status_from_milestones` recalcula
 * automaticamente o status da iniciativa — não é necessário fazer manualmente.
 */
export async function toggleMilestoneCompleted(milestoneId: string): Promise<void> {
  if (!milestoneId) throw new Error('ID do marco é obrigatório.');

  // Ler estado atual (RLS filtra)
  const { data: current, error: fetchErr } = await supabase
    .from('initiative_milestones')
    .select('id, completed')
    .eq('id', milestoneId)
    .single();

  if (fetchErr || !current) throw new Error('Marco não encontrado');

  const newCompleted = !current.completed;

  // Atualizar — trigger set_updated_at cuida do updated_at,
  // trigger sync_initiative_status cuida de recalcular o status da iniciativa.
  const { error: updErr } = await supabase
    .from('initiative_milestones')
    .update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    })
    .eq('id', milestoneId);

  if (updErr) throw updErr;
}

/**
 * Busca iniciativa completa para a tela de gestão (com team e milestones).
 * RLS garante que apenas criador ou admin acessem.
 */
export async function fetchInitiativeDetail(
  initiativeId: string,
): Promise<InitiativeWithProgress & { team: { name: string; role: string }[] }> {
  if (!initiativeId) throw new Error('ID da iniciativa é obrigatório.');

  const { data: initiative, error: initError } = await supabase
    .from('initiatives')
    .select(
      `
      *,
      initiative_team (name, role, sort_order),
      initiative_milestones (
        id, initiative_id, title, percent, completed, completed_at, sort_order, due_date,
        initiative_tasks (
          id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at
        )
      )
    `,
    )
    .eq('id', initiativeId)
    .single();

  if (initError || !initiative) throw new Error('Iniciativa não encontrada');

  const { initiative_team, initiative_milestones, ...initData } = initiative as any;

  const milestonesList = (initiative_milestones || [])
    .map((m: any) => {
      const { initiative_tasks, ...rest } = m;
      return {
        ...rest,
        tasks: (initiative_tasks || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      };
    })
    .sort((a: any, b: any) => a.sort_order - b.sort_order);

  const progress = Math.min(
    100,
    Math.max(
      0,
      milestonesList.filter((m: any) => m.completed === true).reduce((s: any, m: any) => s + (m.percent ?? 0), 0),
    ),
  );

  return {
    ...initData,
    progress,
    milestones: milestonesList,
    team: (initiative_team || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((r: any) => ({ name: r.name || '', role: r.role || '' })),
  } as InitiativeWithProgress & { team: { name: string; role: string }[] };
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

function validateTaskTitle(title: string): void {
  if (!title?.trim()) {
    throw new Error('O título da tarefa é obrigatório.');
  }
  if (title.trim().length > 300) {
    throw new Error('O título da tarefa é muito longo (máx 300 caracteres).');
  }
}

export async function listTasksByMilestone(milestoneId: string): Promise<InitiativeTaskRow[]> {
  validateUUID(milestoneId, 'Marco');
  const { data, error } = await supabase
    .from('initiative_tasks')
    .select(
      'id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at',
    )
    .eq('milestone_id', milestoneId)
    .order('sort_order');
  if (error) throw error;
  return (data || []) as InitiativeTaskRow[];
}

export async function createTask(
  milestoneId: string,
  payload: CreateInitiativeTaskPayload,
): Promise<InitiativeTaskRow> {
  validateUUID(milestoneId, 'Marco');
  validateTaskTitle(payload.title);
  if (payload.responsible_person_id?.trim()) {
    validateUUID(payload.responsible_person_id, 'Responsável');
  }

  const { data, error } = await supabase
    .from('initiative_tasks')
    .insert({
      milestone_id: milestoneId,
      title: sanitizeText(payload.title),
      description: payload.description?.trim() ? sanitizeText(payload.description) : null,
      due_date: payload.due_date?.trim() || null,
      activity_date: payload.activity_date?.trim() || null,
      duration_days: typeof payload.duration_days === 'number' ? Math.max(0, Math.floor(payload.duration_days)) : null,
      responsible_person_id: payload.responsible_person_id?.trim() || null,
      kanban_status: payload.kanban_status || 'A Fazer',
      kanban_order: Number.isFinite(payload.kanban_order) ? Number(payload.kanban_order) : 0,
      sort_order: Number.isFinite(payload.sort_order) ? Number(payload.sort_order) : 0,
    })
    .select(
      'id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar tarefa.');
  return data as InitiativeTaskRow;
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
  validateUUID(taskId, 'Tarefa');
  const updateData: Record<string, unknown> = {};

  if (typeof payload.title === 'string') {
    validateTaskTitle(payload.title);
    updateData.title = sanitizeText(payload.title);
  }
  if (payload.description !== undefined) {
    updateData.description = payload.description?.trim() ? sanitizeText(payload.description) : null;
  }
  if (payload.due_date !== undefined) {
    updateData.due_date = payload.due_date?.trim() || null;
  }
  if (payload.activity_date !== undefined) {
    updateData.activity_date = payload.activity_date?.trim() || null;
  }
  if (payload.duration_days !== undefined) {
    updateData.duration_days =
      typeof payload.duration_days === 'number' ? Math.max(0, Math.floor(payload.duration_days)) : null;
  }
  if (payload.responsible_person_id !== undefined) {
    if (payload.responsible_person_id?.trim()) {
      validateUUID(payload.responsible_person_id, 'Responsável');
    }
    updateData.responsible_person_id = payload.responsible_person_id?.trim() || null;
  }
  if (payload.kanban_status !== undefined) {
    updateData.kanban_status = payload.kanban_status;
  }
  if (typeof payload.kanban_order === 'number') {
    updateData.kanban_order = payload.kanban_order;
  }
  if (typeof payload.sort_order === 'number') {
    updateData.sort_order = payload.sort_order;
  }
  if (typeof payload.completed === 'boolean') {
    updateData.completed = payload.completed;
    updateData.completed_at = payload.completed ? new Date().toISOString() : null;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('Nenhum campo válido para atualizar tarefa.');
  }

  const { data, error } = await supabase
    .from('initiative_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select(
      'id, milestone_id, title, description, completed, completed_at, due_date, activity_date, duration_days, responsible_person_id, kanban_status, kanban_order, sort_order, created_at, updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao atualizar tarefa.');
  return data as InitiativeTaskRow;
}

export async function updateTasksKanban(
  updates: Array<{ id: string; kanban_status: KanbanStatus; kanban_order: number; completed?: boolean }>,
): Promise<void> {
  if (!updates.length) return;
  for (const item of updates) {
    validateUUID(item.id, 'Tarefa');
  }

  const promises = updates.map(item =>
    updateTask(item.id, {
      kanban_status: item.kanban_status,
      kanban_order: item.kanban_order,
      ...(typeof item.completed === 'boolean' ? { completed: item.completed } : {}),
    }),
  );

  await Promise.all(promises);
}

export async function toggleTaskCompleted(taskId: string): Promise<void> {
  validateUUID(taskId, 'Tarefa');
  const { data: current, error: fetchError } = await supabase
    .from('initiative_tasks')
    .select('id, completed')
    .eq('id', taskId)
    .single();
  if (fetchError || !current) throw new Error('Tarefa não encontrada.');

  const nextCompleted = !current.completed;
  const { error } = await supabase
    .from('initiative_tasks')
    .update({
      completed: nextCompleted,
      completed_at: nextCompleted ? new Date().toISOString() : null,
    })
    .eq('id', taskId);
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  validateUUID(taskId, 'Tarefa');
  const { error } = await supabase.from('initiative_tasks').delete().eq('id', taskId);
  if (error) throw error;
}

/**
 * Carrega todas as tarefas de uma iniciativa (across all milestones).
 * Usado pelo ProgramaWorkbench quando a coluna "Macro Atividades" mostra iniciativas.
 */
export async function fetchTasksByInitiative(initiativeId: string): Promise<InitiativeTaskRow[]> {
  validateUUID(initiativeId, 'Iniciativa');
  const { data, error } = await supabase.rpc('get_tasks_by_initiative', {
    p_initiative_id: initiativeId,
  });
  if (error) throw error;
  return (data || []) as InitiativeTaskRow[];
}

/**
 * Garante que uma iniciativa tenha pelo menos um milestone padrão.
 * Retorna o ID do milestone existente ou criado.
 */
export async function ensureDefaultMilestone(initiativeId: string): Promise<string> {
  validateUUID(initiativeId, 'Iniciativa');

  const { data: existing } = await supabase
    .from('initiative_milestones')
    .select('id')
    .eq('initiative_id', initiativeId)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from('initiative_milestones')
    .insert({
      initiative_id: initiativeId,
      title: 'Atividades',
      percent: 100,
      completed: false,
      sort_order: 0,
    })
    .select('id')
    .single();

  if (error || !created?.id) throw new Error(error?.message || 'Erro ao criar milestone padrão.');
  return created.id;
}
