import * as projectsApi from './api/projectsClient';

export interface ProjectStakeholderRow {
  name: string;
  activity: string;
}

export interface ProjectTransformationRow {
  id: string;
  project_id: string;
  text: string;
  evidence: string[];
  sort_order: number;
}

export interface TransformationPayloadItem {
  text: string;
  evidence: string[];
}

export interface ProjectRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  transformations_achievements: string | null;
  success_evidence: string[];
  transformations: ProjectTransformationRow[];
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  stakeholder_matrix: ProjectStakeholderRow[];
  program_type?: 'assessoria' | 'fazenda';
  created_at: string;
  updated_at: string;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  organization_id?: string | null;
  transformations_achievements?: string | null;
  success_evidence?: string[] | null;
  transformations?: TransformationPayloadItem[];
  start_date?: string | null;
  end_date?: string | null;
  stakeholder_matrix?: ProjectStakeholderRow[];
  program_type?: 'assessoria' | 'fazenda';
}

export interface FetchProjectsFilters {
  organizationId?: string;
  farmId?: string;
  /** Quando presente, busca projetos vinculados ao organization_id sem filtrar por created_by (modo cliente). */
  clientMode?: boolean;
}

const MAX_NAME_LENGTH = 300;
const MAX_TRANSFORMATIONS_LENGTH = 10000;
const MAX_STAKEHOLDER_ROWS = 50;

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

function validatePartialPayload(payload: Partial<ProjectPayload>): void {
  if (payload.name !== undefined) {
    const name = payload.name?.trim() || '';
    if (!name) throw new Error('O nome do projeto é obrigatório.');
    if (name.length > MAX_NAME_LENGTH)
      throw new Error(`O nome do projeto é muito longo (máx ${MAX_NAME_LENGTH} caracteres).`);
  }

  if (payload.start_date !== undefined && payload.start_date && !isValidISODate(payload.start_date)) {
    throw new Error('Data de início do projeto com formato inválido (esperado AAAA-MM-DD).');
  }
  if (payload.end_date !== undefined && payload.end_date && !isValidISODate(payload.end_date)) {
    throw new Error('Data final do projeto com formato inválido (esperado AAAA-MM-DD).');
  }

  if (payload.start_date && payload.end_date && payload.start_date > payload.end_date) {
    throw new Error('A data de início do projeto não pode ser posterior à data final.');
  }

  if (payload.transformations_achievements !== undefined &&
      (payload.transformations_achievements || '').length > MAX_TRANSFORMATIONS_LENGTH) {
    throw new Error('A descrição das transformações é muito longa.');
  }
}

export async function fetchProjects(createdBy: string, filters?: FetchProjectsFilters): Promise<ProjectRow[]> {
  validateUserId(createdBy);
  return projectsApi.fetchProjects(createdBy, filters);
}

export async function createProject(createdBy: string, payload: ProjectPayload): Promise<ProjectRow> {
  validateUserId(createdBy);
  validatePayload(payload);
  const stakeholder = Array.isArray(payload.stakeholder_matrix)
    ? payload.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
    : [];
  const successEvidence = Array.isArray(payload.success_evidence)
    ? payload.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : [];
  const transformations = Array.isArray(payload.transformations)
    ? payload.transformations.filter(t => t.text?.trim()).map(t => ({
        text: t.text.trim(),
        evidence: Array.isArray(t.evidence) ? t.evidence.filter((e: string) => typeof e === 'string' && e.trim()).map((e: string) => e.trim()) : [],
      }))
    : undefined;
  return projectsApi.createProject(createdBy, {
    ...payload,
    stakeholder_matrix: stakeholder,
    success_evidence: successEvidence,
    transformations,
  });
}

export async function updateProject(projectId: string, payload: Partial<ProjectPayload>): Promise<ProjectRow> {
  validateProjectId(projectId);
  validatePartialPayload(payload);
  const cleaned: Partial<ProjectPayload> = { ...payload };
  if (Array.isArray(cleaned.stakeholder_matrix)) {
    cleaned.stakeholder_matrix = cleaned.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS);
  }
  if (Array.isArray(cleaned.success_evidence)) {
    cleaned.success_evidence = cleaned.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
  }
  if (Array.isArray(cleaned.transformations)) {
    cleaned.transformations = cleaned.transformations.filter(t => t.text?.trim()).map(t => ({
      text: t.text.trim(),
      evidence: Array.isArray(t.evidence) ? t.evidence.filter((e: string) => typeof e === 'string' && e.trim()).map((e: string) => e.trim()) : [],
    }));
  }
  return projectsApi.updateProject(projectId, cleaned);
}

export async function deleteProject(projectId: string): Promise<void> {
  validateProjectId(projectId);
  return projectsApi.deleteProject(projectId);
}
