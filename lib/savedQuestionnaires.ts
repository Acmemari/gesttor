import { SavedQuestionnaire, SavedQuestionnaireAnswer } from '../types';
import { sanitizeText } from './inputSanitizer';
import { getAuthHeaders } from './session';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateId(id: string, fieldName: string): void {
  if (!id || !UUID_REGEX.test(id)) {
    throw new Error(`${fieldName} inválido.`);
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

function mapRow(row: Record<string, unknown>): SavedQuestionnaire {
  return {
    id: row.id as string,
    user_id: row.userId as string,
    client_id: (row.organizationId as string | null) ?? null,
    name: row.name as string,
    farm_id: (row.farmId as string | null) ?? null,
    farm_name: (row.farmName as string | null) ?? null,
    production_system: (row.productionSystem as string | null) ?? null,
    questionnaire_id: (row.questionnaireId as string | null) ?? null,
    answers: (row.answers as SavedQuestionnaireAnswer[]) || [],
    created_at: row.createdAt as string,
    updated_at: ((row.updatedAt as string) || (row.createdAt as string)),
  };
}

export interface QuestionnaireFilters {
  clientId?: string | null;
  farmId?: string | null;
}

export const getSavedQuestionnaires = async (
  userId: string,
  filters?: QuestionnaireFilters,
): Promise<SavedQuestionnaire[]> => {
  const params = new URLSearchParams({ userId });
  if (filters?.clientId) params.set('orgId', filters.clientId);
  if (filters?.farmId) params.set('farmId', filters.farmId);

  const res = await apiFetch(`/api/saved-questionnaires?${params}`);
  if (!res.ok) return [];

  const json = await res.json();
  if (!json.ok) return [];

  return (json.data ?? []).map(mapRow);
};

export const saveQuestionnaire = async (
  userId: string,
  name: string,
  payload: {
    clientId?: string;
    farmId: string;
    farmName: string;
    productionSystem: string;
    questionnaireId: string;
    answers: SavedQuestionnaireAnswer[];
  },
): Promise<SavedQuestionnaire> => {
  const sanitizedName = sanitizeText(name);
  if (!sanitizedName || sanitizedName.length > 300) {
    throw new Error('Nome do questionário inválido (1-300 caracteres).');
  }

  const res = await apiFetch('/api/saved-questionnaires', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      organizationId: payload.clientId || null,
      name: sanitizedName,
      farmId: payload.farmId,
      farmName: payload.farmName,
      productionSystem: payload.productionSystem,
      questionnaireId: payload.questionnaireId,
      answers: payload.answers,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao salvar questionário');
  }

  const json = await res.json();
  return { ...mapRow(json.data), answers: json.data.answers || [] };
};

export const updateSavedQuestionnaire = async (
  id: string,
  userId: string,
  answers: SavedQuestionnaireAnswer[],
): Promise<void> => {
  validateId(id, 'ID do questionário');
  validateId(userId, 'ID do usuário');

  const res = await apiFetch(`/api/saved-questionnaires?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ userId, answers }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar questionário');
  }
};

export const getSavedQuestionnaire = async (id: string, userId: string): Promise<SavedQuestionnaire | null> => {
  const res = await apiFetch(
    `/api/saved-questionnaires?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
  );

  if (!res.ok) return null;

  const json = await res.json();
  if (!json.ok || !json.data) return null;
  return { ...mapRow(json.data), answers: json.data.answers || [] };
};

export const updateSavedQuestionnaireName = async (id: string, userId: string, name: string): Promise<void> => {
  validateId(id, 'ID do questionário');
  validateId(userId, 'ID do usuário');

  const sanitizedName = sanitizeText(name);
  if (!sanitizedName || sanitizedName.length > 300) {
    throw new Error('Nome inválido (1-300 caracteres).');
  }

  const res = await apiFetch(`/api/saved-questionnaires?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ userId, name: sanitizedName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar nome');
  }
};

export const deleteSavedQuestionnaire = async (id: string, userId: string): Promise<void> => {
  validateId(id, 'ID do questionário');
  validateId(userId, 'ID do usuário');

  const res = await apiFetch(
    `/api/saved-questionnaires?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao excluir questionário');
  }
};
