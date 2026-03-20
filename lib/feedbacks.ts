import { getAuthHeaders } from './session';

export interface SaveFeedbackInput {
  createdBy: string;
  recipientPersonId?: string | null;
  recipientName: string;
  recipientEmail?: string | null;
  context: string;
  feedbackType: string;
  objective: string;
  whatHappened?: string | null;
  eventDate?: string | null;
  eventMoment?: string | null;
  damages?: string | null;
  tone: string;
  format: string;
  structure: string;
  lengthPreference: string;
  generatedFeedback: string;
  generatedStructure: string;
  tips?: string[];
  farmId?: string | null;
}

export interface SavedFeedback {
  id: string;
  created_by: string;
  recipient_person_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  context: string;
  feedback_type: string;
  objective: string;
  what_happened: string | null;
  event_date: string | null;
  event_moment: string | null;
  damages: string | null;
  tone: string;
  format: string;
  structure: string;
  length_preference: string;
  generated_feedback: string;
  generated_structure: string;
  tips: string[];
  farm_id: string | null;
  created_at: string;
  updated_at: string;
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

function mapRow(row: Record<string, unknown>): SavedFeedback {
  return {
    id: row.id as string,
    created_by: row.createdBy as string,
    recipient_person_id: (row.recipientPersonId as string | null) ?? null,
    recipient_name: row.recipientName as string,
    recipient_email: (row.recipientEmail as string | null) ?? null,
    context: row.context as string,
    feedback_type: row.feedbackType as string,
    objective: row.objective as string,
    what_happened: (row.whatHappened as string | null) ?? null,
    event_date: (row.eventDate as string | null) ?? null,
    event_moment: (row.eventMoment as string | null) ?? null,
    damages: (row.damages as string | null) ?? null,
    tone: row.tone as string,
    format: row.format as string,
    structure: row.structure as string,
    length_preference: row.lengthPreference as string,
    generated_feedback: row.generatedFeedback as string,
    generated_structure: row.generatedStructure as string,
    tips: (row.tips as string[]) || [],
    farm_id: (row.farmId as string | null) ?? null,
    created_at: row.createdAt as string,
    updated_at: (row.updatedAt as string) || (row.createdAt as string),
  };
}

export async function saveFeedback(input: SaveFeedbackInput): Promise<SavedFeedback> {
  const recipientName = (input.recipientName || '').trim();
  if (recipientName.length < 2) {
    throw new Error('Destinatário inválido.');
  }

  const res = await apiFetch('/api/saved-feedbacks', {
    method: 'POST',
    body: JSON.stringify({
      createdBy: input.createdBy,
      recipientPersonId: input.recipientPersonId ?? null,
      recipientName,
      recipientEmail: input.recipientEmail?.trim().toLowerCase() ?? null,
      context: input.context,
      feedbackType: input.feedbackType,
      objective: input.objective,
      whatHappened: input.whatHappened ?? null,
      eventDate: input.eventDate ?? null,
      eventMoment: input.eventMoment ?? null,
      damages: input.damages ?? null,
      tone: input.tone,
      format: input.format,
      structure: input.structure,
      lengthPreference: input.lengthPreference,
      generatedFeedback: input.generatedFeedback,
      generatedStructure: input.generatedStructure,
      tips: input.tips ?? [],
      farmId: input.farmId ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao salvar feedback.');
  }

  const json = await res.json();
  return mapRow(json.data);
}

export async function getSavedFeedbacks(): Promise<SavedFeedback[]> {
  const res = await apiFetch('/api/saved-feedbacks');
  if (!res.ok) return [];

  const json = await res.json();
  if (!json.ok) return [];

  return (json.data ?? []).map(mapRow);
}
