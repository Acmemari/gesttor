import React, { useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, IdCard, X, ArrowDownToLine, ArrowUpFromLine, Maximize2, Minimize2 } from 'lucide-react';
import FichaInclusaoForm from './FichaInclusaoForm';
import ImportarPlanilhaModal from './ImportarPlanilhaModal';
import { exportLancamentoTemplate } from './exportTemplate';
import { readSheetRows, validateImport, type ImportResult } from './importTemplate';
import { formatDateBR, parseWeight } from './util';
import type { FieldPlaces, FichaDetalhe, LookupItem, LrField } from './types';

/** Coluna da tabela de detalhe. Por padrão derivada dos campos 'bottom'. */
export interface DetalheColumn {
  fieldId: string;
  label?: string;
  align?: 'left' | 'right';
  render?: (value: string, ficha: FichaDetalhe) => React.ReactNode;
}

interface DefinaCamposPanelProps {
  fieldById: Record<string, LrField>;
  order: string[];
  places: FieldPlaces;
  categories: LookupItem[];
  lotes: LookupItem[];
  lookups?: Record<string, LookupItem[]>;
  optionsOverride?: Record<string, string[]>;
  values: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
  detalhe: FichaDetalhe[];
  onAdd: () => void;
  addLabel?: string;
  onRemoveDetalhe: (id: number) => void;
  onOpenConfig: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** Importa linhas conformes da planilha para a lista de detalhe. */
  onImport: (rows: Record<string, string>[]) => void;
  /** Fecha o painel (volta à visão coletiva). */
  onClose?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** prefixo do nome do modelo .xlsx (ex.: 'modelo-compra'). */
  filenamePrefix?: string;
  /** colunas da tabela de detalhe (default: derivadas dos campos 'bottom'). */
  detalheColumns?: DetalheColumn[];
  /** slots do bloco "repete em todos" (ex.: Sanitário). */
  topRowExtra?: React.ReactNode;
  topBelowExtra?: React.ReactNode;
  dadosOpen: boolean;
  onToggleDados: () => void;
  title?: string;
}

/** Formata o valor de uma célula da tabela de detalhe conforme o tipo do campo. */
function formatValue(
  field: LrField | undefined,
  value: string,
  categories: LookupItem[],
  lotes: LookupItem[],
  lookups?: Record<string, LookupItem[]>,
): React.ReactNode {
  if (!field) return value || '—';
  if (!value) return '—';
  switch (field.type) {
    case 'cat':
      return categories.find((c) => c.id === value)?.nome ?? '—';
    case 'lote':
      return lotes.find((l) => l.id === value)?.nome ?? '—';
    case 'lookup':
      return (lookups?.[field.lookupKey ?? field.id] ?? []).find((l) => l.id === value)?.nome ?? '—';
    case 'sexo':
      return value === 'Fêmea' ? '♀ F' : '♂ M';
    case 'weight': {
      const n = parseWeight(value);
      return n > 0 ? `${n} kg` : '—';
    }
    case 'money':
      return `R$ ${value}`;
    case 'date':
      return formatDateBR(value);
    default:
      return value;
  }
}

const DefinaCamposPanel: React.FC<DefinaCamposPanelProps> = ({
  fieldById,
  order,
  places,
  categories,
  lotes,
  lookups,
  optionsOverride,
  values,
  onValueChange,
  detalhe,
  onAdd,
  addLabel,
  onRemoveDetalhe,
  onOpenConfig,
  onToast,
  onImport,
  onClose,
  expanded,
  onToggleExpand,
  filenamePrefix,
  detalheColumns,
  topRowExtra,
  topBelowExtra,
  dadosOpen,
  onToggleDados,
  title = 'Defina seus campos',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importFileName, setImportFileName] = useState('');

  // Campo-âncora de ID (locked) → duplicidade na importação.
  const idFieldId = useMemo(() => Object.values(fieldById).find((f) => f.locked)?.id, [fieldById]);

  // Colunas da tabela de detalhe: explícitas ou derivadas dos campos 'bottom'.
  const cols = useMemo<DetalheColumn[]>(() => {
    if (detalheColumns) return detalheColumns;
    return order
      .map((id) => fieldById[id])
      .filter((f): f is LrField => !!f && places[f.id] === 'bottom' && f.type !== 'sanitario')
      .map((f) => ({ fieldId: f.id, align: f.type === 'weight' || f.type === 'money' ? 'right' : 'left' }));
  }, [detalheColumns, order, places, fieldById]);

  const handleExport = () => {
    try {
      const n = exportLancamentoTemplate({ order, places, fieldById, categories, lotes, lookups, optionsOverride, filenamePrefix });
      onToast?.(`Modelo exportado · ${n} colunas. Preencha e importe para lançar em massa.`, 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao exportar a planilha modelo', 'error');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await readSheetRows(file);
      if (rows.length < 2) {
        onToast?.('A planilha não tem linhas de dados abaixo do cabeçalho.', 'error');
        return;
      }
      const existingIds = idFieldId ? detalhe.map((d) => d.values[idFieldId] || '') : [];
      const result = validateImport({ rows, order, places, fieldById, categories, lotes, lookups, optionsOverride, existingIds });
      setImportFileName(file.name);
      setImportResult(result);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao ler a planilha. Verifique se é .xlsx, .xls ou .csv.', 'error');
    }
  };

  const closeImport = () => setImportResult(null);
  const confirmImport = (rows: Record<string, string>[]) => {
    onImport(rows);
    setImportResult(null);
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
        {title}
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
          <button
            type="button"
            onClick={handleExport}
            title="Exportar planilha modelo com os campos configurados (baixar para preencher)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#16a34a] hover:bg-[#e7f6ec]"
          >
            <ArrowDownToLine size={14} /> Planilha
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Importar planilha preenchida (conferir e lançar em massa)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#16a34a] hover:bg-[#e7f6ec]"
          >
            <ArrowUpFromLine size={14} /> Planilha
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
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              title={expanded ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#16a34a] hover:bg-[#e7f6ec]"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {expanded ? 'Reduzir' : 'Expandir'}
            </button>
          ) : null}
        </div>
      </div>

      <FichaInclusaoForm
        fieldById={fieldById}
        order={order}
        places={places}
        categories={categories}
        lotes={lotes}
        lookups={lookups}
        optionsOverride={optionsOverride}
        values={values}
        onValueChange={onValueChange}
        onAdd={onAdd}
        addLabel={addLabel}
        dadosOpen={dadosOpen}
        onToggleDados={onToggleDados}
        topRowExtra={topRowExtra}
        topBelowExtra={topBelowExtra}
      />

      {/* Tabela de animais detalhados */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-[11.5px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
              {cols.map((c) => (
                <th key={c.fieldId} className={`p-2 font-bold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label ?? fieldById[c.fieldId]?.label ?? c.fieldId}
                </th>
              ))}
              <th className="w-[64px] p-2 font-bold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.length ? (
              detalhe.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 align-top">
                  {cols.map((c) => {
                    const field = fieldById[c.fieldId];
                    const value = d.values[c.fieldId] ?? '';
                    return (
                      <td
                        key={c.fieldId}
                        className={`break-words p-2 ${c.align === 'right' ? 'text-right tabular-nums text-gray-700' : 'text-gray-700'}`}
                      >
                        {c.render ? c.render(value, d) : formatValue(field, value, categories, lotes, lookups)}
                      </td>
                    );
                  })}
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
              ))
            ) : (
              <tr>
                <td colSpan={cols.length + 1} className="p-5 text-center text-gray-400">
                  <IdCard size={28} className="mx-auto mb-2 text-gray-300" />
                  Nenhum animal identificado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {importResult ? (
        <ImportarPlanilhaModal
          result={importResult}
          fileName={importFileName}
          categories={categories}
          lookups={lookups}
          onConfirm={confirmImport}
          onClose={closeImport}
          onReselect={() => {
            closeImport();
            fileInputRef.current?.click();
          }}
        />
      ) : null}
    </div>
  );
};

export default DefinaCamposPanel;
