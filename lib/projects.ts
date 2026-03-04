import { supabase } from './supabase';
import { sanitizeText } from './inputSanitizer';

export interface ProjectStakeholderRow {
  name: string;
  activity: string;
}

export interface ProjectRow {
  id: string;
  created_by: string;
  client_id: string | null;
  name: string;
  description: string | null;
  transformations_achievements: string | null;
  success_evidence: string[];
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  stakeholder_matrix: ProjectStakeholderRow[];
  created_at: string;
  updated_at: string;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  client_id?: string | null;
  transformations_achievements?: string | null;
  success_evidence?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  stakeholder_matrix?: ProjectStakeholderRow[];
}

export interface FetchProjectsFilters {
  clientId?: string;
  /** Quando presente, busca projetos vinculados ao client_id sem filtrar por created_by (modo cliente). */
  clientMode?: boolean;
}

const MAX_NAME_LENGTH = 300;
const MAX_TRANSFORMATIONS_LENGTH = 10000;
const MAX_STAKEHOLDER_ROWS = 50;

function normalizeStakeholderMatrix(raw: unknown): ProjectStakeholderRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_STAKEHOLDER_ROWS)
    .map(row => {
      if (row && typeof row === 'object' && 'name' in row && 'activity' in row) {
        return {
          name: String((row as { name: unknown }).name ?? '').trim(),
          activity: String((row as { activity: unknown }).activity ?? '').trim(),
        };
      }
      return { name: '', activity: '' };
    })
    .filter(r => r.name !== '' || r.activity !== '');
}

function mapProjectRow(data: Record<string, unknown>): ProjectRow {
  return {
    ...data,
    success_evidence: Array.isArray(data.success_evidence)
      ? data.success_evidence.filter((s: unknown): s is string => typeof s === 'string')
      : [],
    stakeholder_matrix: normalizeStakeholderMatrix(data.stakeholder_matrix),
    sort_order: Number.isFinite(data.sort_order) ? Number(data.sort_order) : 0,
  } as ProjectRow;
}

async function getNextProjectSortOrder(createdBy: string, clientId?: string | null): Promise<number> {
  let q = supabase
    .from('projects')
    .select('sort_order')
    .eq('created_by', createdBy)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1);

  if (clientId === null) {
    q = q.is('client_id', null);
  } else if (typeof clientId === 'string' && clientId.trim()) {
    q = q.eq('client_id', clientId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message || 'Erro ao calcular ordem do projeto.');
  const currentMax = Number(data?.[0]?.sort_order);
  return Number.isFinite(currentMax) ? currentMax + 1 : 0;
}

function validateUserId(userId: string): void {
  if (!userId?.trim()) throw new Error('ID do usuário é obrigatório.');
}

function validateProjectId(id: string): void {
  if (!id?.trim()) throw new Error('ID do projeto é obrigatório.');
}

function isValidISODate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const reg = /^\d{4}-\d{2}-\d{2}$/;
  if (!reg.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
}

function validatePayload(payload: ProjectPayload): void {
  const name = payload.name?.trim() || '';
  if (!name) throw new Error('O nome do projeto é obrigatório.');
  if (name.length > MAX_NAME_LENGTH)
    throw new Error(`O nome do projeto é muito longo (máx ${MAX_NAME_LENGTH} caracteres).`);

  if (payload.start_date && !isValidISODate(payload.start_date)) {
    throw new Error('Data de início do projeto com formato inválido (esperado AAAA-MM-DD).');
  }
  if (payload.end_date && !isValidISODate(payload.end_date)) {
    throw new Error('Data final do projeto com formato inválido (esperado AAAA-MM-DD).');
  }

  if (payload.start_date && payload.end_date && payload.start_date > payload.end_date) {
    throw new Error('A data de início do projeto não pode ser posterior à data final.');
  }

  if ((payload.transformations_achievements || '').length > MAX_TRANSFORMATIONS_LENGTH)
    throw new Error('A descrição das transformações é muito longa.');
}

export async function fetchProjects(createdBy: string, filters?: FetchProjectsFilters): Promise<ProjectRow[]> {
  // No clientMode, cliente lê projetos da própria organização sem filtro por created_by.
  // A policy RLS "Clientes podem ver programas da sua organizacao" restringe o escopo no banco.
  if (filters?.clientMode && filters.clientId?.trim()) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('client_id', filters.clientId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Erro ao carregar projetos.');
    return (data || []).map(mapProjectRow);
  }

  validateUserId(createdBy);
  let q = supabase
    .from('projects')
    .select('*')
    .eq('created_by', createdBy)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (filters?.clientId?.trim()) {
    q = q.eq('client_id', filters.clientId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message || 'Erro ao carregar projetos.');
  return (data || []).map(mapProjectRow);
}

export async function createProject(createdBy: string, payload: ProjectPayload): Promise<ProjectRow> {
  validateUserId(createdBy);
  validatePayload(payload);
  const nextSortOrder = await getNextProjectSortOrder(createdBy, payload.client_id ?? null);
  const stakeholder = Array.isArray(payload.stakeholder_matrix)
    ? payload.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
    : [];
  const successEvidence = Array.isArray(payload.success_evidence)
    ? payload.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : [];
  const { data, error } = await supabase
    .from('projects')
    .insert({
      created_by: createdBy,
      client_id: payload.client_id || null,
      name: sanitizeText(payload.name),
      description: payload.description?.trim() ? sanitizeText(payload.description) : null,
      transformations_achievements: payload.transformations_achievements?.trim()
        ? sanitizeText(payload.transformations_achievements)
        : null,
      success_evidence: successEvidence,
      start_date: payload.start_date?.trim() || null,
      end_date: payload.end_date?.trim() || null,
      sort_order: nextSortOrder,
      stakeholder_matrix: stakeholder,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar projeto.');
  return mapProjectRow(data);
}

export async function updateProject(projectId: string, payload: ProjectPayload): Promise<ProjectRow> {
  validateProjectId(projectId);
  validatePayload(payload);
  const stakeholder = Array.isArray(payload.stakeholder_matrix)
    ? payload.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
    : [];
  const successEvidence = Array.isArray(payload.success_evidence)
    ? payload.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : [];
  const { data, error } = await supabase
    .from('projects')
    .update({
      name: sanitizeText(payload.name),
      description: payload.description?.trim() ? sanitizeText(payload.description) : null,
      transformations_achievements: payload.transformations_achievements?.trim()
        ? sanitizeText(payload.transformations_achievements)
        : null,
      success_evidence: successEvidence,
      start_date: payload.start_date?.trim() || null,
      end_date: payload.end_date?.trim() || null,
      stakeholder_matrix: stakeholder,
      client_id: payload.client_id ?? undefined,
    })
    .eq('id', projectId)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao atualizar projeto.');
  return mapProjectRow(data);
}

export async function deleteProject(projectId: string): Promise<void> {
  validateProjectId(projectId);
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw new Error(error.message || 'Erro ao excluir projeto.');
}
