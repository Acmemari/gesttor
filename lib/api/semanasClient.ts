/**
 * Cliente HTTP para semanas, atividades e historico_semanas.
 */
import { getAuthHeaders, clearToken } from '../session';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers ?? {}) },
    });
    if (res.status === 401) {
      if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
      return { ok: false, error: 'Não autorizado' };
    }
    const json = await res.json() as { ok: boolean; data?: T; error?: string };
    if (json.ok) return { ok: true, data: json.data as T };
    return { ok: false, error: json.error || `Erro ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SemanaRow {
  id: string;
  numero: number;
  modo: string;
  aberta: boolean;
  data_inicio: string;
  data_fim: string;
  farm_id: string | null;
  created_at: string;
}

export interface AtividadeRow {
  id: string;
  semana_id: string;
  titulo: string;
  descricao: string;
  pessoa_id: string | null;
  data_termino: string | null;
  tag: string;
  status: string;
  parent_id: string | null;
  created_at: string;
}

export interface HistoricoSemanaRow {
  id: string;
  semana_numero: number;
  semana_id: string | null;
  farm_id: string | null;
  total: number;
  concluidas: number;
  pendentes: number;
  closed_at: string;
}

// ─── Semanas ──────────────────────────────────────────────────────────────────

export async function getCurrentSemana(farmId: string | null) {
  const params = new URLSearchParams({ current: 'true' });
  if (farmId) params.set('farmId', farmId);
  return apiFetch<SemanaRow | null>(`/api/semanas?${params}`);
}

export async function getSemanaByDataInicio(dataInicio: string, farmId: string | null) {
  const params = new URLSearchParams({ dataInicio });
  if (farmId) params.set('farmId', farmId);
  return apiFetch<SemanaRow | null>(`/api/semanas?${params}`);
}

export async function getSemanaById(id: string) {
  return apiFetch<SemanaRow | null>(`/api/semanas?id=${encodeURIComponent(id)}`);
}

export async function listSemanasByFarm(farmId: string): Promise<SemanaRow[]> {
  const res = await apiFetch<SemanaRow[]>(`/api/semanas?farmId=${encodeURIComponent(farmId)}&list=true`);
  if (!res.ok) throw new Error(res.error);
  return res.data.map((r: any) => ({
    ...r,
    data_inicio: String(r.data_inicio ?? r.dataInicio ?? ''),
    data_fim: String(r.data_fim ?? r.dataFim ?? ''),
    farm_id: r.farm_id ?? r.farmId ?? null,
    created_at: r.created_at ?? r.createdAt ?? '',
  }));
}

export async function getSemanaByNumero(numero: number, modo: string, farmId: string | null) {
  const params = new URLSearchParams({ numero: String(numero), modo });
  if (farmId) params.set('farmId', farmId);
  return apiFetch<SemanaRow | null>(`/api/semanas?${params}`);
}

export interface SemanaPayload {
  numero: number;
  modo: string;
  aberta?: boolean;
  data_inicio: string;
  data_fim: string;
  farm_id?: string | null;
}

export async function createSemana(payload: SemanaPayload) {
  return apiFetch<SemanaRow>('/api/semanas', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteSemana(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/semanas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function updateSemana(id: string, partial: Partial<SemanaPayload & { aberta: boolean }>) {
  return apiFetch<SemanaRow>(`/api/semanas?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

// ─── Atividades ───────────────────────────────────────────────────────────────

export async function listAtividades(semanaId: string) {
  return apiFetch<AtividadeRow[]>(`/api/atividades?semanaId=${encodeURIComponent(semanaId)}`);
}

export interface AtividadePayload {
  semana_id: string;
  titulo: string;
  descricao?: string;
  pessoa_id?: string | null;
  data_termino?: string | null;
  tag?: string;
  status?: string;
  parent_id?: string | null;
}

export async function createAtividade(payload: AtividadePayload) {
  return apiFetch<AtividadeRow>('/api/atividades', { method: 'POST', body: JSON.stringify(payload) });
}

export async function createAtividadesBulk(items: AtividadePayload[]) {
  return apiFetch<AtividadeRow[]>('/api/atividades?bulk=true', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function updateAtividade(id: string, partial: Partial<Omit<AtividadePayload, 'semana_id'>>) {
  return apiFetch<AtividadeRow>(`/api/atividades?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteAtividade(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/atividades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteAtividadesBySemana(semanaId: string) {
  return apiFetch<{ deleted: boolean }>(`/api/atividades?semanaId=${encodeURIComponent(semanaId)}`, { method: 'DELETE' });
}

// ─── Histórico ────────────────────────────────────────────────────────────────

export async function listHistorico(farmId: string | null) {
  const params = farmId ? `?farmId=${encodeURIComponent(farmId)}` : '?farmId=';
  return apiFetch<HistoricoSemanaRow[]>(`/api/historico-semanas${params}`);
}

export interface HistoricoPayload {
  semana_id?: string | null;
  farm_id?: string | null;
  semana_numero: number;
  total: number;
  concluidas: number;
  pendentes: number;
}

export async function createHistorico(payload: HistoricoPayload) {
  return apiFetch<HistoricoSemanaRow>('/api/historico-semanas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteHistorico(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/historico-semanas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Participantes ─────────────────────────────────────────────────────────────

export interface SemanaParticipanteRow {
  id: string;
  semanaId: string;
  pessoaId: string;
  presenca: boolean;
  modalidade: 'online' | 'presencial';
  createdAt: string;
  fullName: string;
  preferredName: string | null;
  photoUrl: string | null;
}

export interface ParticipantePayload {
  pessoaId: string;
  presenca: boolean;
  modalidade: 'online' | 'presencial';
}

export async function listSemanaParticipantes(semanaId: string) {
  return apiFetch<SemanaParticipanteRow[]>(
    `/api/semana-participantes?semanaId=${encodeURIComponent(semanaId)}`,
  );
}

export async function saveParticipantes(semanaId: string, participantes: ParticipantePayload[]) {
  return apiFetch<SemanaParticipanteRow[]>('/api/semana-participantes', {
    method: 'POST',
    body: JSON.stringify({ semanaId, participantes }),
  });
}
