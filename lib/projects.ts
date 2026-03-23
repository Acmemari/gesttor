import { sanitizeText } from './inputSanitizer';
import * as projectsApi from './api/projectsClient';

export interface ProjectStakeholderRow {
  name: string;
  activity: string;
}

export interface ProjectRow {
  id: string;
  created_by: string;
  organization_id: string | null;
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
  organization_id?: string | null;
  transformations_achievements?: string | null;
  success_evidence?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  stakeholder_matrix?: ProjectStakeholderRow[];
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
  return projectsApi.createProject(createdBy, {
    ...payload,
    stakeholder_matrix: stakeholder,
    success_evidence: successEvidence,
  });
}

export async function updateProject(projectId: string, payload: ProjectPayload): Promise<ProjectRow> {
  validateProjectId(projectId);
  validatePayload(payload);
  const stakeholder = Array.isArray(payload.stakeholder_matrix)
    ? payload.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
    : undefined;
  const successEvidence = Array.isArray(payload.success_evidence)
    ? payload.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : undefined;
  return projectsApi.updateProject(projectId, {
    ...payload,
    stakeholder_matrix: stakeholder,
    success_evidence: successEvidence,
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  validateProjectId(projectId);
  return projectsApi.deleteProject(projectId);
}
