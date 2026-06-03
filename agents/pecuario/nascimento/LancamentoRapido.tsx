import React from 'react';
import { Plus, Pencil, ChevronDown, Trash2, IdCard, X } from 'lucide-react';
import FieldControl from './FieldControl';
import SanitarioSection from './SanitarioSection';
import { LR_REGISTRY } from './fieldRegistry';
import { parseWeight } from './util';
import type { FieldPlaces, LookupItem, NascDetalhe, SanItem } from './types';

interface LancamentoRapidoProps {
  places: FieldPlaces;
  categories: LookupItem[];
  lotes: LookupItem[];
  optionsOverride?: Record<string, string[]>;
  values: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
  detalhe: NascDetalhe[];
  onAdd: () => void;
  onRemoveDetalhe: (id: number) => void;
  onOpenConfig: () => void;
  sanEnabled: boolean;
  sanOpen: boolean;
  onToggleSan: () => void;
  sanItems: SanItem[];
  onSanItemsChange: (items: SanItem[]) => void;
  dadosOpen: boolean;
  onToggleDados: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** Fecha o painel de Lançamento Rápido (volta à visão coletiva). */
  onClose?: () => void;
}

const LancamentoRapido: React.FC<LancamentoRapidoProps> = ({
  places,
  categories,
  lotes,
  optionsOverride,
  values,
  onValueChange,
  detalhe,
  onAdd,
  onRemoveDetalhe,
  onOpenConfig,
  sanEnabled,
  sanOpen,
  onToggleSan,
  sanItems,
  onSanItemsChange,
  dadosOpen,
  onToggleDados,
  onToast,
  onClose,
}) => {
  const topFields = LR_REGISTRY.filter((f) => places[f.id] === 'top' && f.id !== 'sanitario');
  const bottomFields = LR_REGISTRY.filter((f) => places[f.id] === 'bottom');
  const dadosFields = LR_REGISTRY.filter((f) => places[f.id] === 'dados');

  const catName = (id: string) => categories.find((c) => c.id === id)?.nome || '—';

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-[10px] border border-dashed border-[#cfe0fb] bg-[#f7faff] p-4">
      <div className="flex items-center gap-2 text-[13px] font-bold text-gray-800">
        <button
          type="button"
          onClick={onOpenConfig}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#cfe0fb] bg-white text-[#2563eb] hover:bg-[#eaf1fb]"
          title="Configurar campos"
        >
          <Pencil size={15} />
        </button>
        Lançamento Rápido
        <span className="text-[11.5px] font-medium text-gray-400">
          — a linha de cima repete em todos; a de baixo lança em modo rápido
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            title="Fechar Lançamento Rápido"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <X size={14} /> Fechar
          </button>
        ) : null}
      </div>

      {/* Linha superior (repete) */}
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
        {sanEnabled ? (
          <button
            type="button"
            onClick={onToggleSan}
            className={`ml-auto inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold ${
              sanOpen ? 'border-[#cfe0fb] bg-[#eaf1fb] text-[#2563eb]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <ChevronDown size={16} className={`transition-transform ${sanOpen ? '' : '-rotate-90'}`} />
            Sanitário
            {sanItems.length ? (
              <span className="rounded bg-[#eaf1fb] px-1.5 text-[11px] font-bold text-[#2563eb]">{sanItems.length}</span>
            ) : null}
          </button>
        ) : null}
      </div>

      {sanEnabled && sanOpen ? (
        <SanitarioSection items={sanItems} onItemsChange={onSanItemsChange} onToast={onToast} />
      ) : null}

      <div className="my-0.5 h-px bg-[#cfe0fb] opacity-60" />

      {/* Linha de lançamento (por animal) */}
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
          className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4fd7]"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      {/* Dados Adicionais */}
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

      {/* Tabela de animais identificados */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-[11.5px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
              <th className="p-2 font-bold">Apelido / ID</th>
              <th className="p-2 font-bold">ID Eletrônica</th>
              <th className="p-2 font-bold">SISBOV</th>
              <th className="p-2 font-bold">Sexo</th>
              <th className="p-2 font-bold">Categoria</th>
              <th className="p-2 font-bold">Porte</th>
              <th className="p-2 font-bold">Colostro</th>
              <th className="p-2 text-right font-bold">Peso</th>
              <th className="w-[64px] p-2 font-bold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.length ? (
              detalhe.map((d) => {
                const peso = parseWeight(d.values.peso);
                return (
                  <tr key={d.id} className="border-t border-gray-100 align-top">
                    <td className="break-words p-2 font-semibold text-gray-800">{d.values.apelido}</td>
                    <td className="break-words p-2 font-mono text-[11px] text-gray-500">{d.values.rfid || '—'}</td>
                    <td className="break-words p-2 font-mono text-[11px] text-gray-500">{d.values.sisbov || '—'}</td>
                    <td className="p-2 text-gray-600">{d.values.sexo === 'Fêmea' ? '♀ F' : '♂ M'}</td>
                    <td className="break-words p-2 text-gray-700">{catName(d.values.categoria)}</td>
                    <td className="p-2 text-gray-600">{d.values.porte || '—'}</td>
                    <td className="p-2 text-gray-600">{d.values.colostro || '—'}</td>
                    <td className="p-2 text-right tabular-nums text-gray-700">{peso > 0 ? `${peso} kg` : '—'}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => onRemoveDetalhe(d.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Remover"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="p-5 text-center text-gray-400">
                  <IdCard size={28} className="mx-auto mb-2 text-gray-300" />
                  Nenhum animal identificado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LancamentoRapido;
