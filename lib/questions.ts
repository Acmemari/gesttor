import { Question } from '../components/questionnaire/types';
import { getAuthHeaders } from './session';

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

function mapRow(row: Record<string, unknown>): Question {
  return {
    id: row.id as string,
    category: row.category as string,
    group: row.group as string,
    question: row.question as string,
    positiveAnswer: row.positiveAnswer as 'Sim' | 'Não',
    applicableTypes: (row.applicableTypes as string[]) as Question['applicableTypes'],
  };
}

export const getQuestions = async (): Promise<Question[]> => {
  const res = await apiFetch('/api/questions');
  if (!res.ok) return [];
  const json = await res.json();
  if (!json.ok) return [];
  return (json.data ?? []).map(mapRow);
};

export const createQuestion = async (data: {
  pergNumber?: number;
  category: string;
  group: string;
  question: string;
  positiveAnswer: string;
  applicableTypes: string[];
}): Promise<Question> => {
  const res = await apiFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao criar pergunta');
  }
  const json = await res.json();
  return mapRow(json.data);
};

export const updateQuestion = async (
  id: string,
  data: Partial<{
    pergNumber: number;
    category: string;
    group: string;
    question: string;
    positiveAnswer: string;
    applicableTypes: string[];
  }>,
): Promise<Question> => {
  const res = await apiFetch(`/api/questions?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar pergunta');
  }
  const json = await res.json();
  return mapRow(json.data);
};

export const deleteQuestion = async (id: string): Promise<void> => {
  const res = await apiFetch(`/api/questions?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao excluir pergunta');
  }
};
