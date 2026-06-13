import React from 'react';
import { X, Check, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FieldPlace, FieldPlaces, LrField } from './types';

interface CamposConfigModalProps {
  /** mapa id → campo do movimento. */
  fieldById: Record<string, LrField>;
  places: FieldPlaces;
  autonum: boolean;
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  onSetPlace: (fieldId: string, place: FieldPlace) => void;
  onToggleAutonum: (value: boolean) => void;
  /** reordena a lista global de campos */
  onReorder: (order: string[]) => void;
  onReset: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

type PillKind = 'superior' | 'tabela' | 'adicionais' | 'off';

const ON_CLASSES: Record<PillKind, string> = {
  superior: 'bg-[#fef6e0] border-[#f3d98a] text-[#a06a12] shadow-sm',
  tabela: 'bg-[#e3f7ea] border-[#9bdcb2] text-[#15803d] shadow-sm',
  adicionais: 'bg-[#e7f6ec] border-[#b7e0c4] text-[#16a34a] shadow-sm',
  off: 'bg-[#fdecec] border-[#f3c0c0] text-[#dc2626] shadow-sm',
};

const OFF_CLASSES = 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50';

/** Célula de destino (pill). */
const Pill: React.FC<{
  field: LrField;
  value: FieldPlace;
  label: string;
  kind: PillKind;
  allowed: boolean;
  on: boolean;
  onSelect: (fieldId: string, place: FieldPlace) => void;
}> = ({ field, value, label, kind, allowed, on, onSelect }) => {
  if (!allowed) return <td className="p-2" />;
  return (
    <td className="p-2 text-center">
      <button
        type="button"
        onClick={() => onSelect(field.id, value)}
        className={`w-full max-w-[150px] rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-all ${
          on ? ON_CLASSES[kind] : OFF_CLASSES
        }`}
      >
        {label}
      </button>
    </td>
  );
};

/** Linha arrastável: alça ⠿ + nome + 4 destinos. */
const SortableFieldRow: React.FC<{
  field: LrField;
  place: FieldPlace;
  autonum: boolean;
  onSetPlace: (fieldId: string, place: FieldPlace) => void;
  onToggleAutonum: (value: boolean) => void;
}> = ({ field: f, place, autonum, onSetPlace, onToggleAutonum }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isLocked = !!f.locked;
  const isSection = !!f.enableOnly;
  const allowTop = !isLocked;
  const allowBottom = !isSection;
  const allowDados = !isLocked && !isSection;

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-[#fafbfc]">
      <td className="w-8 border-b border-[#f1f2f4] p-2 text-center align-middle">
        <button
          type="button"
          title="Arraste para reordenar"
          aria-label={`Reordenar ${f.label}`}
          className="cursor-grab text-gray-300 transition-colors hover:text-[#16a34a] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="border-b border-[#f1f2f4] p-2 text-left font-medium text-gray-800">
        <span className="align-middle">
          {f.label}
          {f.req ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
        {isLocked ? (
          <label
            className="ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#b7e0c4] bg-[#e7f6ec] px-1.5 py-0.5 align-middle text-[11px] font-semibold text-[#16a34a]"
            title="Numeração automática: ao Adicionar sugere o próximo número (001 → 002)"
          >
            <input
              type="checkbox"
              className="h-3 w-3 accent-[#16a34a]"
              checked={autonum}
              onChange={(e) => onToggleAutonum(e.target.checked)}
            />
            Nº auto
          </label>
        ) : null}
      </td>
      <Pill field={f} value="top" label="Superior" kind="superior" allowed={allowTop} on={place === 'top'} onSelect={onSetPlace} />
      <Pill field={f} value="bottom" label="Tabela" kind="tabela" allowed={allowBottom} on={place === 'bottom'} onSelect={onSetPlace} />
      <Pill field={f} value="dados" label="Adicionais" kind="adicionais" allowed={allowDados} on={place === 'dados'} onSelect={onSetPlace} />
      <Pill field={f} value="off" label="Desativar" kind="off" allowed on={place === 'off'} onSelect={onSetPlace} />
    </tr>
  );
};

const CamposConfigModal: React.FC<CamposConfigModalProps> = ({
  fieldById,
  places,
  autonum,
  order,
  onSetPlace,
  onToggleAutonum,
  onReorder,
  onReset,
  onClose,
  title = 'Configurar campos',
  subtitle = 'Defina onde cada campo aparece: Linha Superior (repete em todos), Linha Tabela Lançamento (por animal), Dados Adicionais (recolhido) ou Desativado (não aparece). Arraste pela alça para definir a ordem em que aparecem na tela.',
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const fields = order.map((id) => fieldById[id]).filter(Boolean) as LrField[];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(order, oldIndex, newIndex));
  };

  const currentPlace = (f: LrField): FieldPlace =>
    f.enableOnly ? places[f.id] || 'top' : places[f.id];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-[920px] rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-[12.5px] leading-snug text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-2">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="w-8 border-b border-gray-200 bg-[#fcfcfd] p-2.5" aria-label="Reordenar" />
                <th className="border-b border-gray-200 bg-[#fcfcfd] p-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Nome do campo do sistema
                </th>
                <th className="border-b border-gray-200 bg-[#fcfcfd] p-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Linha Superior
                </th>
                <th className="border-b border-gray-200 bg-[#fcfcfd] p-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Linha Tabela Lançamento
                </th>
                <th className="border-b border-gray-200 bg-[#fcfcfd] p-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Dados Adicionais
                </th>
                <th className="border-b border-gray-200 bg-[#fcfcfd] p-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Desativado
                </th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <tbody>
                  {fields.map((f) => (
                    <SortableFieldRow
                      key={f.id}
                      field={f}
                      place={currentPlace(f)}
                      autonum={autonum}
                      onSetPlace={onSetPlace}
                      onToggleAutonum={onToggleAutonum}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Restaurar padrão
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
          >
            <Check size={16} /> Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

export default CamposConfigModal;
