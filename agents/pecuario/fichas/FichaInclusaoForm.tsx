import React from 'react';
import { Plus, ChevronDown, Repeat, IdCard } from 'lucide-react';
import FieldControl from './FieldControl';
import { sexoFromCategoria } from './util';
import type { FieldPlaces, LookupItem, LrField } from './types';

interface FichaInclusaoFormProps {
  /** mapa id → campo do movimento. */
  fieldById: Record<string, LrField>;
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  places: FieldPlaces;
  categories: LookupItem[];
  lotes: LookupItem[];
  lookups?: Record<string, LookupItem[]>;
  optionsOverride?: Record<string, string[]>;
  values: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
  onAdd: () => void;
  /** rótulo do botão de inclusão (padrão "Adicionar") */
  addLabel?: string;
  /** dados adicionais (recolhível) */
  dadosOpen: boolean;
  onToggleDados: () => void;
  /** Slot opcional no fim da linha "Repete em todos" (ex.: botão Sanitário). */
  topRowExtra?: React.ReactNode;
  /** Slot opcional abaixo da linha "Repete em todos" (ex.: seção Sanitário). */
  topBelowExtra?: React.ReactNode;
}

/**
 * Formulário de inclusão de uma ficha, dirigido pela configuração de campos
 * (places/order) e renderizado com FieldControl. Genérico: serve a qualquer
 * movimento que forneça um registro de campos (fieldById). O bloco "Repete em
 * todos" (verde) aplica-se a TODOS os lançamentos; o bloco "Individual" muda a
 * cada Adicionar; "Dados Adicionais" fica recolhido.
 */
const FichaInclusaoForm: React.FC<FichaInclusaoFormProps> = ({
  fieldById,
  order,
  places,
  categories,
  lotes,
  lookups,
  optionsOverride,
  values,
  onValueChange,
  onAdd,
  addLabel = 'Adicionar',
  dadosOpen,
  onToggleDados,
  topRowExtra,
  topBelowExtra,
}) => {
  const ordered = order.map((id) => fieldById[id]).filter(Boolean) as LrField[];
  const sexoField = ordered.find((f) => f.type === 'sexo');

  // Ao selecionar a Categoria, o Sexo (se existir no registro) vem por padrão
  // derivado do cadastro da categoria — padrão do sistema.
  const handleFieldChange = (field: LrField, value: string) => {
    onValueChange(field.id, value);
    if (field.type === 'cat' && sexoField) {
      const sexo = sexoFromCategoria(categories, value);
      if (sexo) onValueChange(sexoField.id, sexo);
    }
  };

  const topFields = ordered.filter((f) => places[f.id] === 'top' && f.type !== 'sanitario');
  const bottomFields = ordered.filter((f) => places[f.id] === 'bottom');
  const dadosFields = ordered.filter((f) => places[f.id] === 'dados');
  const hasTop = topFields.length > 0 || !!topRowExtra;

  return (
    <div className="flex flex-col gap-3">
      {/* Bloco "repete em todos": destaque verde, aplica-se a TODOS os lançamentos */}
      {hasTop ? (
        <div className="rounded-lg border border-[#cdebd7] bg-[#f5fbf7] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#16a34a]">
            <Repeat size={12} />
            Repete em todos
            <span className="font-medium normal-case tracking-normal text-[#16a34a]/70">
              — vale para cada animal lançado
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3.5">
            {topFields.map((f) => (
              <div key={f.id} style={{ flex: '1 1 140px', minWidth: 0 }}>
                <FieldControl
                  field={f}
                  value={values[f.id] ?? ''}
                  onChange={(v) => handleFieldChange(f, v)}
                  categories={categories}
                  lotes={lotes}
                  lookups={lookups}
                  optionsOverride={optionsOverride}
                />
              </div>
            ))}
            {topRowExtra ? <div className="ml-auto">{topRowExtra}</div> : null}
          </div>

          {topBelowExtra ? <div className="mt-3">{topBelowExtra}</div> : null}
        </div>
      ) : null}

      {/* Bloco "por animal": neutro, lançado individualmente a cada Adicionar */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">
          <IdCard size={12} />
          Individual · por animal
          <span className="font-medium normal-case tracking-normal text-gray-400">
            — muda a cada lançamento
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          {bottomFields.map((f) => (
            <div key={f.id} style={{ flex: '1 1 110px', minWidth: 0 }}>
              <FieldControl
                field={f}
                value={values[f.id] ?? ''}
                onChange={(v) => handleFieldChange(f, v)}
                categories={categories}
                lotes={lotes}
                lookups={lookups}
                optionsOverride={optionsOverride}
                compact
              />
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
          >
            <Plus size={16} /> {addLabel}
          </button>
        </div>
      </div>

      {/* Dados Adicionais (recolhido) */}
      {dadosFields.length ? (
        <div>
          <button
            type="button"
            onClick={onToggleDados}
            className="inline-flex items-center gap-2 rounded-lg border border-[#b7e0c4] bg-[#f1faf4] px-3.5 py-2 text-[13px] font-semibold text-[#16a34a] hover:bg-[#e7f6ec]"
          >
            <ChevronDown size={15} className={`transition-transform ${dadosOpen ? '' : '-rotate-90'}`} />
            Dados Adicionais
          </button>
          {dadosOpen ? (
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {dadosFields.map((f) => (
                <div key={f.id} className={f.span === 3 ? 'lg:col-span-3 sm:col-span-2' : f.span === 2 ? 'sm:col-span-2' : ''}>
                  <FieldControl
                    field={f}
                    value={values[f.id] ?? ''}
                    onChange={(v) => handleFieldChange(f, v)}
                    categories={categories}
                    lotes={lotes}
                    lookups={lookups}
                    optionsOverride={optionsOverride}
                    grid
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default FichaInclusaoForm;
