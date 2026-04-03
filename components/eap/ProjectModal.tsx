import React, { useState } from 'react';
import { Info, Calendar, Target, CheckCircle2, Users, Trash2, Save, Plus, Loader2, Pencil } from 'lucide-react';
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

export const ProjectModal: React.FC<ProjectModalProps> = ({ form, onChange, onSave, onClose, saving, mode, people = [] }) => {
  const [selectedTransIdx, setSelectedTransIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState(-1);
  const selectedTrans = form.transformations[selectedTransIdx] ?? form.transformations[0];
  const effectiveIdx = form.transformations[selectedTransIdx] ? selectedTransIdx : 0;

  return (
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

    {/* Transformações e Evidências — lado a lado */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Coluna esquerda — Transformações Esperadas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeader icon={<Target size={14} className="text-ai-accent" />} label="Transformações Esperadas" />
          <button
            type="button"
            onClick={() => {
              const newIdx = form.transformations.length;
              onChange({ ...form, transformations: [...form.transformations, { text: '', evidence: [''] }] });
              setSelectedTransIdx(newIdx);
              setEditingIdx(newIdx);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-ai-accent hover:text-ai-accent/80 transition-colors"
          >
            <Plus size={12} />
            Adicionar
          </button>
        </div>
        <div className="space-y-1">
          {form.transformations.map((transformation, tIdx) => (
            <div
              key={`tr-${tIdx}`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                tIdx === effectiveIdx
                  ? 'border-ai-accent bg-ai-accent/5'
                  : 'border-ai-border bg-ai-surface hover:border-ai-accent/40'
              }`}
              onClick={() => { setSelectedTransIdx(tIdx); setEditingIdx(-1); }}
            >
              {editingIdx === tIdx ? (
                <input
                  type="text"
                  autoFocus
                  value={transformation.text}
                  onChange={e =>
                    onChange({
                      ...form,
                      transformations: updateAtIndex(form.transformations, tIdx, t => ({ ...t, text: e.target.value })),
                    })
                  }
                  onBlur={() => setEditingIdx(-1)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingIdx(-1); }}
                  onClick={e => e.stopPropagation()}
                  placeholder={`Transformação ${tIdx + 1}`}
                  className="w-full bg-transparent text-sm text-ai-text placeholder:text-ai-subtext/50 outline-none"
                />
              ) : (
                <span className="w-full text-sm text-ai-text truncate">
                  {transformation.text || <span className="text-ai-subtext/50">Transformação {tIdx + 1}</span>}
                </span>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setSelectedTransIdx(tIdx);
                  setEditingIdx(tIdx);
                }}
                className="shrink-0 p-1 text-ai-subtext hover:text-ai-accent transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const next = form.transformations.filter((_, i) => i !== tIdx);
                  const updated = next.length > 0 ? next : [{ text: '', evidence: [''] }];
                  onChange({ ...form, transformations: updated });
                  if (editingIdx === tIdx) setEditingIdx(-1);
                  if (selectedTransIdx >= updated.length) setSelectedTransIdx(Math.max(0, updated.length - 1));
                }}
                className="shrink-0 p-1 text-ai-subtext hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna direita — Evidências de Sucesso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeader icon={<CheckCircle2 size={14} className="text-ai-accent" />} label="Evidências de Sucesso" />
          {selectedTrans && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...form,
                  transformations: updateAtIndex(form.transformations, effectiveIdx, t => ({
                    ...t,
                    evidence: [...t.evidence, ''],
                  })),
                })
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-ai-accent hover:text-ai-accent/80 transition-colors"
            >
              <Plus size={12} />
              Adicionar
            </button>
          )}
        </div>
        {selectedTrans ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-ai-accent truncate">
              {selectedTrans.text || `Transformação ${effectiveIdx + 1}`}
            </div>
            {selectedTrans.evidence.map((ev, eIdx) => (
              <div key={`ev-${effectiveIdx}-${eIdx}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ev}
                  onChange={e =>
                    onChange({
                      ...form,
                      transformations: updateAtIndex(form.transformations, effectiveIdx, t => ({
                        ...t,
                        evidence: updateAtIndex(t.evidence, eIdx, () => e.target.value),
                      })),
                    })
                  }
                  placeholder={`Evidência ${eIdx + 1}`}
                  className="w-full rounded-lg border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text placeholder:text-ai-subtext/50"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...form,
                      transformations: updateAtIndex(form.transformations, effectiveIdx, t => ({
                        ...t,
                        evidence: removeAtIndex(t.evidence, eIdx, ''),
                      })),
                    })
                  }
                  className="shrink-0 p-1 text-ai-subtext hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ai-subtext py-4 text-center">
            Selecione uma transformação para ver suas evidências.
          </div>
        )}
      </div>
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
};
