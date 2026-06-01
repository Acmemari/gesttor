import React from 'react';
import { X, Check } from 'lucide-react';
import { LR_REGISTRY } from './fieldRegistry';
import type { FieldPlace, FieldPlaces, LrField } from './types';

interface CamposConfigModalProps {
  places: FieldPlaces;
  autonum: boolean;
  onSetPlace: (fieldId: string, place: FieldPlace) => void;
  onToggleAutonum: (value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

type PillKind = 'superior' | 'tabela' | 'adicionais' | 'off';

const ON_CLASSES: Record<PillKind, string> = {
  superior: 'bg-[#fef6e0] border-[#f3d98a] text-[#a06a12] shadow-sm',
  tabela: 'bg-[#e3f7ea] border-[#9bdcb2] text-[#15803d] shadow-sm',
  adicionais: 'bg-[#eaf1fb] border-[#bcd6f7] text-[#2563eb] shadow-sm',
  off: 'bg-[#fdecec] border-[#f3c0c0] text-[#dc2626] shadow-sm',
};

const OFF_CLASSES = 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50';

const CamposConfigModal: React.FC<CamposConfigModalProps> = ({
  places,
  autonum,
  onSetPlace,
  onToggleAutonum,
  onReset,
  onClose,
}) => {
  const currentPlace = (f: LrField): FieldPlace =>
    f.id === 'sanitario' ? places.sanitario || 'top' : places[f.id];

  const Pill: React.FC<{ field: LrField; value: FieldPlace; label: string; kind: PillKind; allowed: boolean }> = ({
    field,
    value,
    label,
    kind,
    allowed,
  }) => {
    if (!allowed) return <td className="p-2" />;
    const on = currentPlace(field) === value;
    return (
      <td className="p-2 text-center">
        <button
          type="button"
          onClick={() => onSetPlace(field.id, value)}
          className={`w-full max-w-[150px] rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-all ${
            on ? ON_CLASSES[kind] : OFF_CLASSES
          }`}
        >
          {label}
        </button>
      </td>
    );
  };

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
            <h3 className="text-lg font-bold text-gray-900">Configurar campos do Lançamento Rápido</h3>
            <p className="mt-1 text-[12.5px] leading-snug text-gray-500">
              Defina onde cada campo aparece: Linha Superior (repete em todos), Linha Tabela Lançamento
              (por animal), Dados Adicionais (recolhido) ou Desativado (não aparece).
            </p>
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
            <tbody>
              {LR_REGISTRY.map((f) => {
                const isApelido = !!f.locked;
                const isSan = !!f.enableOnly;
                const allowTop = !isApelido;
                const allowBottom = !isSan;
                const allowDados = !isApelido && !isSan;
                return (
                  <tr key={f.id} className="hover:bg-[#fafbfc]">
                    <td className="border-b border-[#f1f2f4] p-2 text-left font-medium text-gray-800">
                      <span className="align-middle">
                        {f.label}
                        {f.req ? <span className="ml-0.5 text-red-500">*</span> : null}
                      </span>
                      {isApelido ? (
                        <label
                          className="ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#cfe0fb] bg-[#eaf1fb] px-1.5 py-0.5 align-middle text-[11px] font-semibold text-[#2563eb]"
                          title="Numeração automática: ao Adicionar sugere o próximo número (001 → 002)"
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-[#2563eb]"
                            checked={autonum}
                            onChange={(e) => onToggleAutonum(e.target.checked)}
                          />
                          Nº auto
                        </label>
                      ) : null}
                    </td>
                    <Pill field={f} value="top" label="Superior" kind="superior" allowed={allowTop} />
                    <Pill field={f} value="bottom" label="Tabela" kind="tabela" allowed={allowBottom} />
                    <Pill field={f} value="dados" label="Adicionais" kind="adicionais" allowed={allowDados} />
                    <Pill field={f} value="off" label="Desativar" kind="off" allowed />
                  </tr>
                );
              })}
            </tbody>
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
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4fd7]"
          >
            <Check size={16} /> Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

export default CamposConfigModal;
