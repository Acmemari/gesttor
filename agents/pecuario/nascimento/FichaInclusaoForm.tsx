import React from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import FieldControl from './FieldControl';
import SanitarioSection from './SanitarioSection';
import { FIELD_BY_ID } from './fieldRegistry';
import type { FieldPlaces, LookupItem, LrField, SanItem } from './types';

interface FichaInclusaoFormProps {
  places: FieldPlaces;
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  categories: LookupItem[];
  lotes: LookupItem[];
  optionsOverride?: Record<string, string[]>;
  values: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
  onAdd: () => void;
  /** rótulo do botão de inclusão (padrão "Adicionar") */
  addLabel?: string;
  /** Sanitário (nível movimento): só o Lançamento Rápido o utiliza. */
  sanEnabled?: boolean;
  sanOpen?: boolean;
  onToggleSan?: () => void;
  sanItems?: SanItem[];
  onSanItemsChange?: (items: SanItem[]) => void;
  dadosOpen: boolean;
  onToggleDados: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/**
 * Formulário de inclusão de uma ficha (bezerro), dirigido pela configuração de
 * campos (places/order) e renderizado com FieldControl. Compartilhado entre o
 * "Lançamento Rápido" (aba Lançar) e o detalhamento editável da tela de
 * Registros, garantindo as MESMAS opções/campos nos dois lugares.
 *
 * Não renderiza a tabela de animais — quem o usa decide o que mostrar abaixo
 * (lista a salvar, no lançamento; fichas persistidas, no detalhamento).
 */
const FichaInclusaoForm: React.FC<FichaInclusaoFormProps> = ({
  places,
  order,
  categories,
  lotes,
  optionsOverride,
  values,
  onValueChange,
  onAdd,
  addLabel = 'Adicionar',
  sanEnabled,
  sanOpen,
  onToggleSan,
  sanItems,
  onSanItemsChange,
  dadosOpen,
  onToggleDados,
  onToast,
}) => {
  const ordered = order.map((id) => FIELD_BY_ID[id]).filter(Boolean) as LrField[];
  const topFields = ordered.filter((f) => places[f.id] === 'top' && f.id !== 'sanitario');
  const bottomFields = ordered.filter((f) => places[f.id] === 'bottom');
  const dadosFields = ordered.filter((f) => places[f.id] === 'dados');
  const showSan = !!sanEnabled && !!onToggleSan;
  const hasTop = topFields.length > 0 || showSan;

  return (
    <div className="flex flex-col gap-3">
      {/* Linha superior (repete em todos) + botão Sanitário */}
      {hasTop ? (
        <div className="flex flex-wrap items-end gap-3.5">
          {topFields.map((f) => (
            <div key={f.id} style={{ flex: '1 1 140px', minWidth: 0 }}>
              <FieldControl
                field={f}
                value={values[f.id] ?? ''}
                onChange={(v) => onValueChange(f.id, v)}
                categories={categories}
                lotes={lotes}
                optionsOverride={optionsOverride}
              />
            </div>
          ))}
          {showSan ? (
            <button
              type="button"
              onClick={onToggleSan}
              className={`ml-auto inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold ${
                sanOpen ? 'border-[#b7e0c4] bg-[#e7f6ec] text-[#16a34a]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <ChevronDown size={16} className={`transition-transform ${sanOpen ? '' : '-rotate-90'}`} />
              Sanitário
              {sanItems && sanItems.length ? (
                <span className="rounded bg-[#e7f6ec] px-1.5 text-[11px] font-bold text-[#16a34a]">{sanItems.length}</span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {showSan && sanOpen && onSanItemsChange ? (
        <SanitarioSection items={sanItems ?? []} onItemsChange={onSanItemsChange} onToast={onToast} />
      ) : null}

      {hasTop ? <div className="my-0.5 h-px bg-[#b7e0c4] opacity-60" /> : null}

      {/* Linha de lançamento (por animal) + botão Adicionar */}
      <div className="flex flex-wrap items-end gap-2.5 pb-1">
        {bottomFields.map((f) => (
          <div key={f.id} style={{ flex: '1 1 110px', minWidth: 0 }}>
            <FieldControl
              field={f}
              value={values[f.id] ?? ''}
              onChange={(v) => onValueChange(f.id, v)}
              categories={categories}
              lotes={lotes}
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
                    onChange={(v) => onValueChange(f.id, v)}
                    categories={categories}
                    lotes={lotes}
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
