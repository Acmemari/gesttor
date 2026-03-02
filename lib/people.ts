import { supabase } from './supabase';
import { logger } from './logger';
import { storageUpload, storageGetPublicUrl } from './storage';

const log = logger.withContext({ component: 'people' });

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
};

export interface FetchPeopleFilters {
  farmId?: string;
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

// ─── Validação ──────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 300;
const MAX_TEXT_LENGTH = 2000;

function validateUserId(userId: string): void {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('ID do usuário é obrigatório.');
  }
}

function validatePersonId(id: string): void {
  if (!id || typeof id !== 'string' || !id.trim()) {
    throw new Error('ID da pessoa é obrigatório.');
  }
}

// ─── Funções ────────────────────────────────────────────────────────────────

export async function fetchPeople(userId: string, filters?: FetchPeopleFilters): Promise<Person[]> {
  validateUserId(userId);

  let q = supabase.from('people').select('*').eq('created_by', userId).order('full_name', { ascending: true });

  if (filters?.farmId?.trim()) {
    q = q.eq('farm_id', filters.farmId);
  }

  const { data, error } = await q;
  if (error) {
    log.error('fetchPeople failed', new Error(error.message));
    throw error;
  }
  return (data || []) as Person[];
}

export async function createPerson(userId: string, payload: Partial<PersonFormData>): Promise<Person> {
  validateUserId(userId);

  const fullName = (payload.full_name || '').trim();
  if (!fullName) throw new Error('Nome completo é obrigatório.');
  if (fullName.length > MAX_NAME_LENGTH) throw new Error(`Nome muito longo (máx ${MAX_NAME_LENGTH} caracteres).`);

  const { data, error } = await supabase
    .from('people')
    .insert({
      created_by: userId,
      full_name: fullName,
      preferred_name: payload.preferred_name?.trim() || null,
      person_type: payload.person_type || 'Colaborador Fazenda',
      job_role: payload.job_role?.trim() || null,
      phone_whatsapp: payload.phone_whatsapp?.trim() || null,
      email: payload.email?.trim().toLowerCase() || null,
      location_farm: payload.location_farm?.trim() || null,
      location_city_uf: payload.location_city_uf?.trim() || null,
      base: payload.base?.trim() || null,
      photo_url: payload.photo_url || null,
      main_activities: payload.main_activities?.trim()?.slice(0, MAX_TEXT_LENGTH) || null,
      farm_id: payload.farm_id || null,
    })
    .select()
    .single();

  if (error) {
    log.error('createPerson failed', new Error(error.message));
    throw new Error(error.message || 'Erro ao cadastrar pessoa.');
  }
  if (!data) throw new Error('Pessoa não retornada após criação.');
  return data as Person;
}

export async function updatePerson(id: string, payload: Partial<PersonFormData>): Promise<Person> {
  validatePersonId(id);

  if (payload.full_name !== undefined) {
    const fullName = (payload.full_name || '').trim();
    if (!fullName) throw new Error('Nome completo é obrigatório.');
    if (fullName.length > MAX_NAME_LENGTH) throw new Error(`Nome muito longo (máx ${MAX_NAME_LENGTH} caracteres).`);
  }

  const { data, error } = await supabase
    .from('people')
    .update({
      ...(payload.full_name !== undefined && { full_name: payload.full_name.trim() }),
      ...(payload.preferred_name !== undefined && { preferred_name: payload.preferred_name?.trim() || null }),
      ...(payload.person_type !== undefined && { person_type: payload.person_type }),
      ...(payload.job_role !== undefined && { job_role: payload.job_role?.trim() || null }),
      ...(payload.phone_whatsapp !== undefined && { phone_whatsapp: payload.phone_whatsapp?.trim() || null }),
      ...(payload.email !== undefined && { email: payload.email?.trim().toLowerCase() || null }),
      ...(payload.location_farm !== undefined && { location_farm: payload.location_farm?.trim() || null }),
      ...(payload.location_city_uf !== undefined && { location_city_uf: payload.location_city_uf?.trim() || null }),
      ...(payload.base !== undefined && { base: payload.base?.trim() || null }),
      ...(payload.photo_url !== undefined && { photo_url: payload.photo_url || null }),
      ...(payload.main_activities !== undefined && {
        main_activities: payload.main_activities?.trim()?.slice(0, MAX_TEXT_LENGTH) || null,
      }),
      ...(payload.farm_id !== undefined && { farm_id: payload.farm_id || null }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    log.error('updatePerson failed', new Error(error.message));
    throw new Error(error.message || 'Erro ao atualizar pessoa.');
  }
  if (!data) throw new Error('Pessoa não retornada após atualização.');
  return data as Person;
}

export async function deletePerson(id: string): Promise<void> {
  validatePersonId(id);
  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) {
    log.error('deletePerson failed', new Error(error.message));
    throw new Error(error.message || 'Erro ao excluir pessoa.');
  }
}

const STORAGE_PREFIX = 'people-photos';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadPersonPhoto(userId: string, personId: string, file: File): Promise<string> {
  validateUserId(userId);
  validatePersonId(personId);

  if (file.size > MAX_PHOTO_SIZE) {
    throw new Error('A foto deve ter no máximo 5 MB.');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF.');
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${personId}-${Date.now()}.${ext}`;
  await storageUpload(STORAGE_PREFIX, path, file, { contentType: file.type, upsert: true });

  return storageGetPublicUrl(STORAGE_PREFIX, path);
}
