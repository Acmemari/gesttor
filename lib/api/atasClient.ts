/**
 * Client HTTP for meeting minutes (atas) API (/api/atas).
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

export interface AtaConteudo {
  metadata: {
    dataReuniao: string;
    semanaFechada: number;
    semanaAberta: number;
    periodoFechada: { inicio: string; fim: string };
    periodoAberta: { inicio: string; fim: string };
    farmName: string;
  };
  participantes: Array<{
    nome: string;
    modalidade: 'online' | 'presencial';
    presente: boolean;
    photoUrl?: string | null;
  }>;
  atividadesConcluidas: Array<{
    titulo: string;
    responsavel: string;
    tag: string;
  }>;
  atividadesPendentes: Array<{
    titulo: string;
    responsavel: string;
    status: string;
    tag: string;
  }>;
  atividadesPlanejadas: Array<{
    titulo: string;
    responsavel: string;
    tag: string;
    status: string;
  }>;
  resumoTranscricao: {
    sumario: string;
    decisoes: string[];
    acoes: Array<{ descricao: string; responsavel: string; prazo: string }>;
    estacionamento: string[];
    riscosBlockers: string[];
  } | null;
  transcricaoTextoOriginal: string | null;
  fotos: Array<{
    url: string;
    legenda: string;
    storagePath: string;
  }>;
  observacoes: string;
}

export interface AtaRow {
  id: string;
  semanaFechadaId: string | null;
  semanaAbertaId: string | null;
  farmId: string;
  organizationId: string;
  createdBy: string | null;
  dataReuniao: string;
  conteudo: AtaConteudo;
  versao: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
  return { ok: true, data: json.data };
}

export async function listAtasByFarm(farmId: string): Promise<AtaRow[]> {
  const res = await fetchApi<AtaRow[]>(
    `${API_BASE}/atas?farmId=${encodeURIComponent(farmId)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data ?? [];
}

export async function getAtaById(id: string): Promise<AtaRow> {
  const res = await fetchApi<AtaRow>(
    `${API_BASE}/atas?id=${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export interface CreateAtaPayload {
  semanaFechadaId: string;
  farmId: string;
  organizationId: string;
  transcricaoTexto?: string;
  fotos?: Array<{ url: string; legenda: string; storagePath: string }>;
}

export async function createAta(payload: CreateAtaPayload): Promise<AtaRow> {
  const res = await fetchApi<AtaRow>(`${API_BASE}/atas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function updateAta(id: string, conteudo: AtaConteudo): Promise<AtaRow> {
  const res = await fetchApi<AtaRow>(
    `${API_BASE}/atas?id=${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ conteudo }) },
  );
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

export async function deleteAtaApi(id: string): Promise<void> {
  const res = await fetchApi<{ deleted: boolean }>(
    `${API_BASE}/atas?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(res.error);
}
