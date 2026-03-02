import type { ProjectStakeholderRow } from '../../lib/projects';

export interface ProgramFormState {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  transformations_achievements: string;
  success_evidence: string[];
  stakeholder_matrix: ProjectStakeholderRow[];
}

export interface DeliveryFormState {
  name: string;
  description: string;
  transformations_achievements: string;
  start_date: string;
  end_date: string;
}

export interface ActivityFormState {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: string;
  leader_id: string;
  internal_leader_id: string;
  participant_ids: string[];
}

export type KanbanStatus = 'A Fazer' | 'Andamento' | 'Pausado' | 'Concluído';

export interface TaskFormState {
  title: string;
  description: string;
  responsible_person_id: string;
  activity_date: string;
  duration_days: string;
  kanban_status: KanbanStatus;
  completed: boolean;
}

export const INITIAL_PROGRAM_FORM: ProgramFormState = {
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  transformations_achievements: '',
  success_evidence: [''],
  stakeholder_matrix: [{ name: '', activity: '' }],
};

export const INITIAL_DELIVERY_FORM: DeliveryFormState = {
  name: '',
  description: '',
  transformations_achievements: '',
  start_date: '',
  end_date: '',
};

export const INITIAL_ACTIVITY_FORM: ActivityFormState = {
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  status: 'Não Iniciado',
  leader_id: '',
  internal_leader_id: '',
  participant_ids: [],
};

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const INITIAL_TASK_FORM: TaskFormState = {
  title: '',
  description: '',
  responsible_person_id: '',
  activity_date: currentIsoDate(),
  duration_days: '1',
  kanban_status: 'A Fazer',
  completed: false,
};

export function getCurrentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function removeAtIndex<T>(arr: T[], idx: number, fallback: T): T[] {
  const next = arr.filter((_, i) => i !== idx);
  return next.length > 0 ? next : [fallback];
}

export function updateAtIndex<T>(arr: T[], idx: number, updater: (item: T) => T): T[] {
  return arr.map((item, i) => (i === idx ? updater(item) : item));
}
