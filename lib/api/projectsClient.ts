/**
 * Cliente HTTP para API de projetos.
 */
import { fetchWithAuth, type ApiSuccess, type ApiError } from './fetchWithAuth';

const API_BASE = '/api';

const fetchApi = fetchWithAuth as <T>(url: string, options?: RequestInit) => Promise<ApiSuccess<T> | ApiError>;

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

export interface FetchProjectsFilters {
  organizationId?: string;
  farmId?: string;
  clientMode?: boolean;
}

export interface TransformationPayloadItem {
  text: string;
  evidence: string[];
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
  sort_order?: number;
  program_type?: 'assessoria' | 'fazenda';
}

function buildQuery(filters?: FetchProjectsFilters): string {
  const p = new URLSearchParams();
  if (filters?.organizationId) p.set('organizationId', filters.organizationId);
  if (filters?.farmId) p.set('farmId', filters.farmId);
  if (filters?.clientMode) p.set('clientMode', 'true');
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchProjects(createdBy: string, filters?: FetchProjectsFilters): Promise<ProjectRow[]> {
  const res = await fetchApi<ProjectRow[]>(`${API_BASE}/projects${buildQuery(filters)}`);
  if (!res.ok) throw new Error(res.error);
  return res.data ?? [];
}

export async function createProject(createdBy: string, payload: ProjectPayload): Promise<ProjectRow> {
  const res = await fetchApi<ProjectRow>(`${API_BASE}/projects`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, created_by: createdBy }),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function updateProject(projectId: string, payload: Partial<ProjectPayload>): Promise<ProjectRow> {
  const res = await fetchApi<ProjectRow>(`${API_BASE}/projects?id=${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function deleteProject(projectId: string): Promise<void> {
  const res = await fetchApi<{ deleted: boolean }>(`${API_BASE}/projects?id=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.error);
}
