import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { ModalShell } from './ModalShell';
import DateInputBR from '../DateInputBR';
import type { ActivityFormState } from './types';
import type { Person } from '../../lib/people';
import { peopleFilteredForResponsavel, peopleFilteredForLiderInterno } from '../../lib/people';

interface ActivityModalProps {
  form: ActivityFormState;
  onChange: (form: ActivityFormState) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  mode: 'create' | 'edit';
  people: Person[];
}

export const ActivityModal: React.FC<ActivityModalProps> = ({
  form,
  onChange,
  onSave,
  onClose,
  saving,
  mode,
  people,
}) => (
  <ModalShell
    title={mode === 'create' ? 'Nova Macro Atividade' : 'Editar Macro Atividade'}
    onClose={saving ? () => {} : onClose}
  >
    <div>
      <label className="block text-sm font-medium text-ai-text mb-1">Nome *</label>
      <input
        type="text"
        value={form.name}
        onChange={e => onChange({ ...form, name: e.target.value })}
        className="w-full rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-ai-text mb-1">Descrição</label>
      <textarea
        rows={3}
        value={form.description}
        onChange={e => onChange({ ...form, description: e.target.value })}
        className="w-full rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text resize-none"
      />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Data inicial</label>
        <DateInputBR value={form.start_date} onChange={v => onChange({ ...form, start_date: v })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Data final</label>
        <DateInputBR
          value={form.end_date}
          onChange={v => onChange({ ...form, end_date: v })}
          min={form.start_date || undefined}
        />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Responsável *</label>
        <select
          value={form.leader_id}
          onChange={e => onChange({ ...form, leader_id: e.target.value })}
          className="w-full rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text"
        >
          <option value="">Selecione (Co-Gestor, Consultor ou Analista)</option>
          {peopleFilteredForResponsavel(people).map(person => (
            <option key={person.id} value={person.id}>
              {person.preferred_name?.trim() || person.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Lider Interno</label>
        <select
          value={form.internal_leader_id}
          onChange={e => onChange({ ...form, internal_leader_id: e.target.value })}
          className="w-full rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text"
        >
          <option value="">Selecione</option>
          {peopleFilteredForLiderInterno(people).map(person => (
            <option key={person.id} value={person.id}>
              {person.preferred_name?.trim() || person.full_name}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div>
      <label className="block text-sm font-medium text-ai-text mb-1">Incluir Participantes</label>
      <div className="max-h-40 overflow-y-auto rounded-md border border-ai-border bg-ai-surface p-2 space-y-1">
        {people.length === 0 ? (
          <p className="text-sm text-ai-subtext px-2 py-1">Nenhuma pessoa cadastrada.</p>
        ) : (
          people.map(person => {
            const isChecked = form.participant_ids.includes(person.id);
            return (
              <label
                key={person.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ai-surface2/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    const next = isChecked
                      ? form.participant_ids.filter(id => id !== person.id)
                      : [...form.participant_ids, person.id];
                    onChange({ ...form, participant_ids: next });
                  }}
                  className="accent-ai-accent rounded"
                />
                <span className="text-sm text-ai-text">
                  {person.preferred_name?.trim() || person.full_name}
                </span>
              </label>
            );
          })
        )}
      </div>
      {form.participant_ids.length > 0 && (
        <p className="text-xs text-ai-subtext mt-1">
          {form.participant_ids.length} selecionado{form.participant_ids.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Status</label>
        <select
          value={form.status}
          onChange={e => onChange({ ...form, status: e.target.value })}
          className="w-full rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text"
        >
          <option value="Não Iniciado">Não Iniciado</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Suspenso">Suspenso</option>
          <option value="Concluído">Concluído</option>
          <option value="Atrasado">Atrasado</option>
        </select>
      </div>
    </div>
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-md border border-ai-border px-3 py-2 text-sm text-ai-subtext hover:text-ai-text disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-ai-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {mode === 'create' ? 'Salvar' : 'Atualizar'}
      </button>
    </div>
  </ModalShell>
);
