/**
 * Camada de compatibilidade: mapeia o modelo antigo (Supabase 'people')
 * para o novo modelo (Neon/Drizzle 'pessoas' + sub-tabelas).
 *
 * Os componentes legados (FeedbackAgent, InitiativesActivities, EAPMindMap,
 * ProgramaWorkbench, etc.) continuam importando daqui sem alteração.
 */
import { listPessoasByFarm, checkPermsByEmail } from './api/pessoasClient';
import { storageUpload, storageGetPublicUrl } from './storage';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface Person {
  id: string;
  created_by: string;
  full_name: string;
  preferred_name: string | null;
  person_type: string;
  job_role: string | null;
  phone_whatsapp: string | null;
  email: string | null;
  location_farm: string | null;
  location_city_uf: string | null;
  base: string | null;
  photo_url: string | null;
  main_activities: string | null;
  farm_id: string | null;
  assume_tarefas_fazenda: boolean;
  pode_alterar_semana_fechada: boolean;
  pode_apagar_semana: boolean;
  created_at: string;
  updated_at: string;
}

export type PersonFormData = Omit<Person, 'id' | 'created_by' | 'created_at' | 'updated_at'> & {
  full_name: string;
  preferred_name?: string;
  person_type: string;
  job_role?: string;
  phone_whatsapp?: string;
  email?: string;
  location_farm?: string;
  location_city_uf?: string;
  base?: string;
  photo_url?: string | null;
  main_activities?: string;
  farm_id?: string | null;
  assume_tarefas_fazenda?: boolean;
  pode_alterar_semana_fechada?: boolean;
  pode_apagar_semana?: boolean;
};

export interface FetchPeopleFilters {
  farmId?: string;
  sharedScope?: boolean;
}

/** Tipos de pessoa para Responsável (consultoria): Co-Gestor, Consultor, Analista */
export const CONSULTING_ROLES = ['Co-Gestor', 'Consultor', 'Analista'] as const;

/** Filtra pessoas para o campo Responsável (apenas Co-Gestor, Consultor, Analista) */
export function peopleFilteredForResponsavel(people: Person[]): Person[] {
  return people.filter(p => CONSULTING_ROLES.includes(p.person_type as (typeof CONSULTING_ROLES)[number]));
}

/** Filtra pessoas para o campo Lider Interno (exclui Co-Gestor, Consultor, Analista) */
export function peopleFilteredForLiderInterno(people: Person[]): Person[] {
  return people.filter(p => !CONSULTING_ROLES.includes(p.person_type as (typeof CONSULTING_ROLES)[number]));
}

// ─── Funções ────────────────────────────────────────────────────────────────

export async function fetchPeople(_userId: string, filters?: FetchPeopleFilters): Promise<Person[]> {
  const farmId = filters?.farmId?.trim();
  if (!farmId) return [];

  const rows = await listPessoasByFarm(farmId);
  return rows.map(r => ({
    id: r.id,
    created_by: '',
    full_name: r.full_name,
    preferred_name: r.preferred_name,
    person_type: r.person_type,
    job_role: r.job_role,
    phone_whatsapp: r.phone_whatsapp,
    email: r.email,
    location_farm: null,
    location_city_uf: r.location_city_uf,
    base: null,
    photo_url: r.photo_url,
    main_activities: null,
    farm_id: r.farm_id,
    assume_tarefas_fazenda: r.assume_tarefas_fazenda,
    pode_alterar_semana_fechada: r.pode_alterar_semana_fechada,
    pode_apagar_semana: r.pode_apagar_semana,
    created_at: '',
    updated_at: '',
  }));
}

export { checkPermsByEmail };

// ─── Upload de foto (mantido) ──────────────────────────────────────────────

const STORAGE_PREFIX = 'people-photos';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export async function uploadPersonPhoto(_userId: string, personId: string, file: File): Promise<string> {
  if (file.size > MAX_PHOTO_SIZE) throw new Error('A foto deve ter no máximo 5 MB.');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) throw new Error('Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF.');
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `pessoas/${personId}-${Date.now()}.${ext}`;
  await storageUpload(STORAGE_PREFIX, path, file, { contentType: file.type, upsert: true });
  return storageGetPublicUrl(STORAGE_PREFIX, path);
}
