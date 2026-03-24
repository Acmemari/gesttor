import React from 'react';
import { Info, Calendar, Target, CheckCircle2, Users, Trash2, Save, Plus, Loader2 } from 'lucide-react';
import { ModalShell, SectionHeader } from './ModalShell';
import DateInputBR from '../DateInputBR';
import type { ProgramFormState } from './types';
import { removeAtIndex, updateAtIndex } from './types';
import type { Person } from '../../lib/people';

interface ProjectModalProps {
  form: ProgramFormState;
  onChange: (form: ProgramFormState) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  mode: 'create' | 'edit';
  people?: Person[];
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ form, onChange, onSave, onClose, saving, mode, people = [] }) => (
  <ModalShell
    title={mode === 'create' ? 'Novo Projeto' : 'Editar Projeto'}
    subtitle={mode === 'create' ? 'Preencha os detalhes do novo projeto.' : 'Edite as informações do projeto.'}
    onClose={saving ? () => {} : onClose}
  >
    <div>
      <label className="block text-sm font-medium text-ai-text mb-2">Tipo de Projeto</label>
      <div className="inline-flex rounded-lg border border-ai-border overflow-hidden">
        <button
          type="button"
          onClick={() => onChange({ ...form, program_type: 'assessoria' })}
          className={`px-4 py-2 text-sm font-medium transition-colors ${form.program_type === 'assessoria' ? 'bg-ai-accent text-white' : 'bg-ai-surface text-ai-subtext hover:text-ai-text'}`}
        >
          Assessoria
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...form, program_type: 'fazenda' })}
          className={`px-4 py-2 text-sm font-medium transition-colors border-l border-ai-border ${form.program_type === 'fazenda' ? 'bg-ai-accent text-white' : 'bg-ai-surface text-ai-subtext hover:text-ai-text'}`}
        >
          Fazenda
        </button>
      </div>
    </div>

    <SectionHeader icon={<Info size={14} className="text-ai-accent" />} label="Informações Básicas" />
    <div>
      <label className="block text-sm font-medium text-ai-text mb-1">
        Nome do Projeto <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={form.name}
        onChange={e => onChange({ ...form, name: e.target.value })}
        placeholder="Ex: Transformação Digital 2024"
        className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-ai-text mb-1">Descrição</label>
      <textarea
        rows={3}
        value={form.description}
        onChange={e => onChange({ ...form, description: e.target.value })}
        placeholder="Descreva os objetivos principais e o contexto do projeto..."
        className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50 resize-none"
      />
    </div>

    <SectionHeader icon={<Calendar size={14} className="text-ai-accent" />} label="Cronograma" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Data de Início <span className="text-red-500">*</span></label>
        <DateInputBR value={form.start_date} onChange={v => onChange({ ...form, start_date: v })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-ai-text mb-1">Data Final <span className="text-red-500">*</span></label>
        <DateInputBR
          value={form.end_date}
          onChange={v => onChange({ ...form, end_date: v })}
          min={form.start_date || undefined}
        />
      </div>
    </div>

    <SectionHeader icon={<Target size={14} className="text-ai-accent" />} label="Transformações Esperadas" />
    <textarea
      rows={3}
      value={form.transformations_achievements}
      onChange={e => onChange({ ...form, transformations_achievements: e.target.value })}
        placeholder="Quais mudanças reais este projeto trará para a organização?"
      className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50 resize-none"
    />

    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<CheckCircle2 size={14} className="text-ai-accent" />} label="Evidências de Sucesso" />
        <button
          type="button"
          onClick={() => onChange({ ...form, success_evidence: [...form.success_evidence, ''] })}
          className="inline-flex items-center gap-1 text-xs font-medium text-ai-accent hover:text-ai-accent/80 transition-colors"
        >
          <Plus size={12} />
          Adicionar item
        </button>
      </div>
      {form.success_evidence.map((item, idx) => (
        <div key={`ev-${idx}`} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={e =>
              onChange({
                ...form,
                success_evidence: updateAtIndex(form.success_evidence, idx, () => e.target.value),
              })
            }
            placeholder={`Evidência ${idx + 1}`}
            className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50"
          />
          <button
            type="button"
            onClick={() =>
              onChange({
                ...form,
                success_evidence: removeAtIndex(form.success_evidence, idx, ''),
              })
            }
            className="shrink-0 p-2 text-ai-subtext hover:text-red-500 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>

    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Users size={14} className="text-ai-accent" />} label="Matriz de Stakeholders" />
        <button
          type="button"
          onClick={() =>
            onChange({
              ...form,
              stakeholder_matrix: [...form.stakeholder_matrix, { name: '', activity: '' }],
            })
          }
          className="inline-flex items-center gap-1 text-xs font-medium text-ai-accent hover:text-ai-accent/80 transition-colors"
        >
          <Plus size={12} />
          Adicionar linha
        </button>
      </div>
      {form.stakeholder_matrix.map((row, idx) => (
        <div key={`sh-${idx}`} className="flex items-center gap-2">
          {people.length > 0 ? (
            <select
              value={row.name}
              onChange={e => {
                const selected = people.find(p => (p.preferred_name || p.full_name) === e.target.value);
                const name = e.target.value;
                const activity = selected?.job_role && !row.activity ? selected.job_role : row.activity;
                onChange({
                  ...form,
                  stakeholder_matrix: updateAtIndex(form.stakeholder_matrix, idx, r => ({ ...r, name, activity })),
                });
              }}
              className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text"
            >
              <option value="">Selecione uma pessoa...</option>
              {people.map(p => {
                const label = p.preferred_name || p.full_name;
                return (
                  <option key={p.id} value={label}>
                    {label}{p.job_role ? ` — ${p.job_role}` : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              type="text"
              value={row.name}
              onChange={e =>
                onChange({
                  ...form,
                  stakeholder_matrix: updateAtIndex(form.stakeholder_matrix, idx, r => ({ ...r, name: e.target.value })),
                })
              }
              placeholder="Nome / Cargo"
              className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50"
            />
          )}
          <input
            type="text"
            value={row.activity}
            onChange={e =>
              onChange({
                ...form,
                stakeholder_matrix: updateAtIndex(form.stakeholder_matrix, idx, r => ({
                  ...r,
                  activity: e.target.value,
                })),
              })
            }
            placeholder="Atividade / Responsabilidade"
            className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2.5 text-sm text-ai-text placeholder:text-ai-subtext/50"
          />
          <button
            type="button"
            onClick={() =>
              onChange({
                ...form,
                stakeholder_matrix: removeAtIndex(form.stakeholder_matrix, idx, { name: '', activity: '' }),
              })
            }
            className="shrink-0 p-2 text-ai-subtext hover:text-red-500 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>

    <div className="flex justify-end gap-3 pt-3 border-t border-ai-border">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-lg px-4 py-2.5 text-sm font-medium text-ai-subtext hover:text-ai-text disabled:opacity-50 transition-colors"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-ai-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-ai-accent/90 disabled:opacity-60 transition-colors"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {mode === 'create' ? 'Salvar Projeto' : 'Atualizar Projeto'}
      </button>
    </div>
  </ModalShell>
);
