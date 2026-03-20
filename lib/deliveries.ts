/**
 * Lib cliente de entregas — usa o backend Drizzle via /api/deliveries.
 * Mantém assinaturas compatíveis com o código legado.
 */
import * as deliveriesApi from './api/deliveriesClient';

export interface DeliveryStakeholderRow {
  name: string;
  activity: string;
}

export interface DeliveryRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  /** @deprecated use organization_id */
  client_id: string | null;
  project_id: string;
  name: string;
  description: string | null;
  transformations_achievements: string | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
  percent: number;
  stakeholder_matrix: DeliveryStakeholderRow[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryPayload {
  name: string;
  description?: string | null;
  project_id: string;
  organization_id?: string | null;
  /** @deprecated use organization_id */
  client_id?: string | null;
  transformations_achievements?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  stakeholder_matrix?: DeliveryStakeholderRow[];
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }, fallback: string): T {
  if (!result.ok) throw new Error((result as { ok: false; error: string }).error || fallback);
  return (result as { ok: true; data: T }).data;
}

function mapRow(r: deliveriesApi.DeliveryRow): DeliveryRow {
  return {
    ...r,
    client_id: r.organization_id,
    project_id: r.project_id,
    stakeholder_matrix: (r.stakeholder_matrix ?? []) as DeliveryStakeholderRow[],
  };
}

export async function fetchDeliveriesByProject(projectId: string): Promise<DeliveryRow[]> {
  if (!projectId?.trim()) throw new Error('ID do projeto é obrigatório.');
  const result = await deliveriesApi.listDeliveries(projectId);
  return unwrap(result, 'Erro ao carregar entregas.').map(mapRow);
}

export async function fetchDeliveriesByProjects(projectIds: string[]): Promise<DeliveryRow[]> {
  if (!projectIds?.length) return [];
  const results = await Promise.all(projectIds.map(id => deliveriesApi.listDeliveries(id)));
  return results.flatMap((r, i) => unwrap(r, `Erro ao carregar entregas do projeto ${projectIds[i]}.`).map(mapRow));
}

export async function createDelivery(_createdBy: string, payload: DeliveryPayload): Promise<DeliveryRow> {
  if (!payload.name?.trim()) throw new Error('Nome da entrega é obrigatório.');
  const result = await deliveriesApi.createDelivery({
    project_id: payload.project_id,
    name: payload.name.trim(),
    description: payload.description ?? null,
    organization_id: payload.organization_id ?? payload.client_id ?? null,
    transformations_achievements: payload.transformations_achievements ?? null,
    due_date: payload.due_date ?? null,
    start_date: payload.start_date ?? null,
    end_date: payload.end_date ?? null,
    stakeholder_matrix: payload.stakeholder_matrix ?? [],
  });
  return mapRow(unwrap(result, 'Erro ao criar entrega.'));
}

export async function updateDelivery(deliveryId: string, payload: Partial<DeliveryPayload>): Promise<DeliveryRow> {
  if (!deliveryId?.trim()) throw new Error('ID da entrega é obrigatório.');
  const result = await deliveriesApi.updateDelivery(deliveryId, {
    name: payload.name,
    description: payload.description,
    organization_id: payload.organization_id ?? payload.client_id,
    transformations_achievements: payload.transformations_achievements,
    due_date: payload.due_date,
    start_date: payload.start_date,
    end_date: payload.end_date,
    stakeholder_matrix: payload.stakeholder_matrix,
  });
  return mapRow(unwrap(result, 'Erro ao atualizar entrega.'));
}

export interface FetchDeliveriesFilters {
  clientId?: string;
  farmId?: string;
}

/**
 * Busca todas as entregas acessíveis ao usuário, opcionalmente filtradas por clientId.
 * Carrega os projetos do usuário e busca entregas de cada projeto.
 */
export async function fetchDeliveries(createdBy: string, filters?: FetchDeliveriesFilters): Promise<DeliveryRow[]> {
  const { fetchProjects } = await import('./projects');
  const projectFilters = filters?.clientId ? { clientId: filters.clientId } : undefined;
  const projects = await fetchProjects(createdBy, projectFilters);
  if (!projects.length) return [];
  return fetchDeliveriesByProjects(projects.map(p => p.id));
}

export async function deleteDelivery(deliveryId: string): Promise<void> {
  if (!deliveryId?.trim()) throw new Error('ID da entrega é obrigatório.');
  const result = await deliveriesApi.deleteDelivery(deliveryId);
  unwrap(result, 'Erro ao excluir entrega.');
}
