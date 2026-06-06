import React from 'react';
import { Pencil, Trash2, IdCard, X, FileSpreadsheet } from 'lucide-react';
import FichaInclusaoForm from './FichaInclusaoForm';
import { exportLancamentoTemplate } from './exportTemplate';
import { parseWeight } from './util';
import type { FieldPlaces, LookupItem, NascDetalhe, SanItem } from './types';

interface LancamentoRapidoProps {
  places: FieldPlaces;
  /** ordem global de exibição (lista de field ids) */
  order: string[];
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
  order,
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
  const catName = (id: string) => categories.find((c) => c.id === id)?.nome || '—';

  // Exporta um modelo .xlsx com uma coluna por campo configurado, para ser
  // preenchido offline e, depois, reimportado (aceleração de lançamentos).
  const handleExport = () => {
    try {
      const cols = exportLancamentoTemplate({ order, places, categories, lotes, optionsOverride });
      onToast?.(`Modelo exportado · ${cols} colunas. Preencha e importe para lançar em massa.`, 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao exportar a planilha modelo', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[13px] font-bold text-gray-800">
        <button
          type="button"
          onClick={onOpenConfig}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#b7e0c4] bg-white text-[#16a34a] hover:bg-[#e7f6ec]"
          title="Configurar campos"
        >
          <Pencil size={15} />
        </button>
        Lançamento Rápido
        <span className="text-[11.5px] font-medium text-gray-400">
          — a linha de cima repete em todos; a de baixo lança em modo rápido
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            title="Exportar planilha modelo com os campos configurados (para preencher e importar depois)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#16a34a] hover:bg-[#e7f6ec]"
          >
            <FileSpreadsheet size={14} /> Exportar planilha
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="Fechar Lançamento Rápido"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <X size={14} /> Fechar
            </button>
          ) : null}
        </div>
      </div>

      {/* Formulário de inclusão (mesmo usado no detalhamento da tela de Registros) */}
      <FichaInclusaoForm
        places={places}
        order={order}
        categories={categories}
        lotes={lotes}
        optionsOverride={optionsOverride}
        values={values}
        onValueChange={onValueChange}
        onAdd={onAdd}
        sanEnabled={sanEnabled}
        sanOpen={sanOpen}
        onToggleSan={onToggleSan}
        sanItems={sanItems}
        onSanItemsChange={onSanItemsChange}
        dadosOpen={dadosOpen}
        onToggleDados={onToggleDados}
        onToast={onToast}
      />

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
