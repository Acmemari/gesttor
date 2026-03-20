/**
 * Cliente HTTP para API de iniciativas e equipe.
 */
import { fetchWithAuth, type ApiSuccess, type ApiError } from './fetchWithAuth';

const API_BASE = '/api';

const fetchApi = fetchWithAuth as <T>(url: string, options?: RequestInit) => Promise<ApiSuccess<T> | ApiError>;

export interface InitiativeRow {
  id: string;
  created_by: string;
  delivery_id: string;
  organization_id: string | null;
  farm_id: string | null;
  name: string;
  tags: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  leader: string | null;
  internal_leader: string | null;
  percent: number;
  weight: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  initiative_id: string;
  name: string;
  role: string;
  sort_order: number;
  pessoa_id: string | null;
  created_at: string;
}

export interface InitiativePayload {
  delivery_id: string;
  name: string;
  organization_id?: string | null;
  farm_id?: string | null;
  tags?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  leader?: string | null;
  internal_leader?: string | null;
  weight?: string | number;
  status?: string;
  sort_order?: number;
}

export async function listInitiativesByDelivery(deliveryId: string) {
  return fetchApi<InitiativeRow[]>(`${API_BASE}/initiatives?deliveryId=${encodeURIComponent(deliveryId)}`);
}

export async function listInitiativesByOrg(orgId: string) {
  return fetchApi<InitiativeRow[]>(`${API_BASE}/initiatives?orgId=${encodeURIComponent(orgId)}`);
}

export async function getInitiativeById(id: string) {
  return fetchApi<InitiativeRow>(`${API_BASE}/initiatives?id=${encodeURIComponent(id)}`);
}

export async function createInitiative(payload: InitiativePayload) {
  return fetchApi<InitiativeRow>(`${API_BASE}/initiatives`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInitiative(id: string, payload: Partial<InitiativePayload>) {
  return fetchApi<InitiativeRow>(`${API_BASE}/initiatives?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteInitiative(id: string) {
  return fetchApi<{ deleted: boolean }>(`${API_BASE}/initiatives?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ─── Equipe ────────────────────────────────────────────────────────────────────

export async function listTeamMembers(initiativeId: string) {
  return fetchApi<TeamMemberRow[]>(`${API_BASE}/initiatives?subpath=team&initiativeId=${encodeURIComponent(initiativeId)}`);
}

export async function addTeamMember(initiativeId: string, member: { name: string; role?: string; pessoa_id?: string | null }) {
  return fetchApi<TeamMemberRow>(`${API_BASE}/initiatives?subpath=team`, {
    method: 'POST',
    body: JSON.stringify({ initiative_id: initiativeId, ...member }),
  });
}

export async function removeTeamMember(memberId: string) {
  return fetchApi<{ deleted: boolean }>(`${API_BASE}/initiatives?subpath=team&id=${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
  });
}

// ─── Participantes ─────────────────────────────────────────────────────────────

export async function listParticipants(initiativeId: string) {
  return fetchApi<string[]>(`${API_BASE}/initiatives?subpath=participants&initiativeId=${encodeURIComponent(initiativeId)}`);
}

export async function replaceParticipants(initiativeId: string, personIds: string[]) {
  return fetchApi<{ ok: boolean }>(`${API_BASE}/initiatives?subpath=participants`, {
    method: 'POST',
    body: JSON.stringify({ initiativeId, personIds }),
  });
}
