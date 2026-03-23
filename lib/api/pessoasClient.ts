/**
 * Cliente HTTP para API de pessoas (/api/pessoas).
 */
import { getAuthHeaders, clearToken } from '../session';

const API_BASE = '/api';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Pessoa {
  id: string;
  createdBy: string;
  fullName: string;
  preferredName: string | null;
  phoneWhatsapp: string | null;
  email: string | null;
  locationCityUf: string | null;
  photoUrl: string | null;
  organizationId: string | null;
  userId: string | null;
  cpf: string | null;
  rg: string | null;
  dataNascimento: string | null;
  dataContratacao: string | null;
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CargoFuncao {
  id: string;
  nome: string;
  ativo: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface PessoaPerfil {
  id: string;
  pessoaId: string;
  perfilId: string;
  cargoFuncaoId: string | null;
  ativo: boolean;
  createdAt: string;
  perfilNome?: string;
  cargoFuncaoNome?: string | null;
}

export interface PessoaFazenda {
  id: string;
  pessoaId: string;
  farmId: string;
  farmName?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface PessoaPermissao {
  id: string;
  pessoaId: string;
  farmId: string;
  assumeTarefasFazenda: boolean;
  podeAlterarSemanaFechada: boolean;
  podeApagarSemana: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PessoaCompleta extends Pessoa {
  perfis: PessoaPerfil[];
  fazendas: PessoaFazenda[];
  permissoes: PessoaPermissao[];
}

export interface CreatePessoaData {
  full_name: string;
  preferred_name?: string | null;
  phone_whatsapp?: string | null;
  email?: string | null;
  location_city_uf?: string | null;
  photo_url?: string | null;
  organization_id: string;
  cpf?: string | null;
  rg?: string | null;
  data_nascimento?: string | null;
  data_contratacao?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
}

export type UpdatePessoaData = Partial<Omit<CreatePessoaData, 'organization_id'> & { ativo?: boolean }>;

// ─── Helpers de máscara ───────────────────────────────────────────────────────

export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(digits[10]);
}

// ─── Helper HTTP ───────────────────────────────────────────────────────────────

interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { offset?: number; limit?: number; hasMore?: boolean };
}

interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiSuccess<T> | ApiError> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok && json && typeof json === 'object' && 'error' in json) {
    return json as ApiError;
  }
  if (!res.ok) {
    return { ok: false, error: (json as { error?: string })?.error || `HTTP ${res.status}` };
  }
  return json as ApiSuccess<T>;
}

// ─── Funções de pessoa ─────────────────────────────────────────────────────────

export async function listPessoas(options: {
  organizationId: string;
  search?: string;
  ativo?: boolean;
  perfilId?: string | null;
  farmId?: string | null;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ data: Pessoa[]; hasMore: boolean }> {
  const params = new URLSearchParams({ organizationId: options.organizationId });
  if (options.search) params.set('search', options.search);
  if (options.ativo !== undefined) params.set('ativo', String(options.ativo));
  if (options.perfilId) params.set('perfilId', String(options.perfilId));
  if (options.farmId) params.set('farmId', options.farmId);
  if (options.offset != null) params.set('offset', String(options.offset));
  if (options.limit != null) params.set('limit', String(options.limit));

  const res = await fetchApi<Pessoa[]>(`${API_BASE}/pessoas?${params}`, { signal: options.signal });
  if (!res.ok) return { data: [], hasMore: false };
  return { data: res.data, hasMore: res.meta?.hasMore ?? false };
}

export async function getPessoa(id: string, signal?: AbortSignal): Promise<PessoaCompleta | null> {
  const res = await fetchApi<PessoaCompleta>(`${API_BASE}/pessoas?id=${encodeURIComponent(id)}`, { signal });
  if (!res.ok) return null;
  return res.data;
}

export async function createPessoa(data: CreatePessoaData): Promise<Pessoa | null> {
  const res = await fetchApi<Pessoa>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

export async function updatePessoa(id: string, data: UpdatePessoaData): Promise<Pessoa | null> {
  const res = await fetchApi<Pessoa>(`${API_BASE}/pessoas`, {
    method: 'PATCH',
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

export async function deactivatePessoa(id: string): Promise<void> {
  const res = await fetchApi<unknown>(`${API_BASE}/pessoas?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((res as ApiError).error);
}

// ─── Perfis e Cargos ─────────────────────────────────────────────────────────

export async function listPerfis(includeInactive = false): Promise<Perfil[]> {
  const params = new URLSearchParams({ resource: 'perfis' });
  if (includeInactive) params.set('all', 'true');
  const res = await fetchApi<Perfil[]>(`${API_BASE}/pessoas?${params}`);
  if (!res.ok) return [];
  return res.data;
}

export async function listCargosFuncoes(includeInactive = false): Promise<CargoFuncao[]> {
  const params = new URLSearchParams({ resource: 'cargos' });
  if (includeInactive) params.set('all', 'true');
  const res = await fetchApi<CargoFuncao[]>(`${API_BASE}/pessoas?${params}`);
  if (!res.ok) return [];
  return res.data;
}

export async function createPerfil(data: { nome: string; descricao?: string | null; sortOrder?: number }): Promise<Perfil> {
  const res = await fetchApi<Perfil>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify({ action: 'create-perfil', ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

export async function updatePerfil(id: string, data: { nome?: string; descricao?: string | null; ativo?: boolean; sortOrder?: number }): Promise<Perfil> {
  const res = await fetchApi<Perfil>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify({ action: 'update-perfil', id, ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

export async function createCargoFuncao(data: { nome: string; sortOrder?: number }): Promise<CargoFuncao> {
  const res = await fetchApi<CargoFuncao>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify({ action: 'create-cargo', ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

export async function updateCargoFuncao(id: string, data: { nome?: string; ativo?: boolean; sortOrder?: number }): Promise<CargoFuncao> {
  const res = await fetchApi<CargoFuncao>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify({ action: 'update-cargo', id, ...data }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}

// ─── Compatibilidade lib/people.ts ────────────────────────────────────────────

export interface PessoaByFarm {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone_whatsapp: string | null;
  photo_url: string | null;
  location_city_uf: string | null;
  person_type: string;
  job_role: string | null;
  farm_id: string;
  assume_tarefas_fazenda: boolean;
  pode_alterar_semana_fechada: boolean;
  pode_apagar_semana: boolean;
}

export async function listPessoasByFarm(
  farmId: string,
  opts: { assumeTarefas?: boolean } = {},
): Promise<PessoaByFarm[]> {
  const params = new URLSearchParams({ farmId });
  if (opts.assumeTarefas) params.set('assumeTarefas', 'true');
  const res = await fetchApi<PessoaByFarm[]>(`${API_BASE}/pessoas?${params}`);
  if (!res.ok) return [];
  return res.data;
}

export async function checkPermsByEmail(
  email: string,
): Promise<{ pode_alterar_semana_fechada: boolean; pode_apagar_semana: boolean }[]> {
  const params = new URLSearchParams({ checkPerms: 'true', email });
  const res = await fetchApi<{ pode_alterar_semana_fechada: boolean; pode_apagar_semana: boolean }[]>(
    `${API_BASE}/pessoas?${params}`,
  );
  if (!res.ok) return [];
  return res.data;
}

// ─── Sub-recursos ─────────────────────────────────────────────────────────────

async function postAction(payload: Record<string, unknown>): Promise<void> {
  const res = await fetchApi<unknown>(`${API_BASE}/pessoas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
}

export async function addPessoaPerfil(
  pessoaId: string,
  perfilId: string,
  cargoFuncaoId?: string | null,
): Promise<void> {
  await postAction({ action: 'add-perfil', pessoaId, perfilId, cargoFuncaoId: cargoFuncaoId ?? null });
}

export async function removePessoaPerfil(pessoaPerfilId: string, pessoaId: string): Promise<void> {
  await postAction({ action: 'remove-perfil', pessoaPerfilId, pessoaId });
}

export async function addPessoaFazenda(pessoaId: string, farmId: string): Promise<void> {
  await postAction({ action: 'add-fazenda', pessoaId, farmId });
}

export async function setPrimaryFazenda(pessoaId: string, pessoaFazendaId: string): Promise<void> {
  await postAction({ action: 'set-primary-fazenda', pessoaId, pessoaFazendaId });
}

export async function removePessoaFazenda(pessoaFazendaId: string, pessoaId: string): Promise<void> {
  await postAction({ action: 'remove-fazenda', pessoaFazendaId, pessoaId });
}

export async function upsertPessoaPermissao(
  pessoaId: string,
  farmId: string,
  perms: {
    assume_tarefas_fazenda?: boolean;
    pode_alterar_semana_fechada?: boolean;
    pode_apagar_semana?: boolean;
  },
): Promise<void> {
  await postAction({ action: 'upsert-permissao', pessoaId, farmId, ...perms });
}
