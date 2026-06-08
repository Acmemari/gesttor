import React from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, ArrowUpFromLine } from 'lucide-react';
import { okRowValues } from './importTemplate';
import type { CellStatus, ImportCell, ImportResult } from './importTemplate';
import type { LookupItem, LrField } from './types';

interface ImportarPlanilhaModalProps {
  result: ImportResult;
  fileName: string;
  categories: LookupItem[];
  /** importa as linhas 100% conformes (verde). */
  onConfirm: (rows: Record<string, string>[]) => void;
  onClose: () => void;
  /** escolher outro arquivo. */
  onReselect: () => void;
}

const ROW_BADGE: Record<CellStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  ok: { cls: 'bg-[#e7f6ec] text-[#16a34a]', label: 'OK', Icon: CheckCircle2 },
  aviso: { cls: 'bg-[#fdeee3] text-[#ea580c]', label: 'Aviso', Icon: AlertTriangle },
  erro: { cls: 'bg-[#fdecec] text-[#dc2626]', label: 'Erro', Icon: XCircle },
};

const CELL_CLS: Record<CellStatus, string> = {
  ok: 'text-gray-700',
  aviso: 'bg-[#fff7ed] text-[#b45309]',
  erro: 'bg-[#fdecec] text-[#dc2626]',
};

/** Texto a exibir numa célula (valor canônico quando válido; cru quando erro). */
function cellDisplay(f: LrField, cell: ImportCell, categories: LookupItem[]): string {
  if (f.type === 'cat') {
    if (cell.value) return categories.find((c) => c.id === cell.value)?.nome ?? cell.value;
    return cell.raw || '—';
  }
  if (cell.status === 'erro') return cell.raw || '—';
  return cell.value || cell.raw || '—';
}

const ImportarPlanilhaModal: React.FC<ImportarPlanilhaModalProps> = ({
  result,
  fileName,
  categories,
  onConfirm,
  onClose,
  onReselect,
}) => {
  const { fields, rows, okCount, avisoCount, erroCount, unmatchedHeaders, missingRequiredCols } = result;
  const hasWarnBanner = missingRequiredCols.length > 0 || unmatchedHeaders.length > 0 || categories.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-[1100px] rounded-2xl bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <FileSpreadsheet size={18} className="text-[#16a34a]" /> Conferir importação
            </h3>
            <p className="mt-1 truncate text-[12.5px] leading-snug text-gray-500">
              <span className="font-semibold text-gray-700">{fileName}</span> — só as linhas{' '}
              <span className="font-semibold text-[#16a34a]">100% conformes</span> são importadas. Corrija as demais na
              planilha e importe de novo.
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

        {/* Resumo (contagem por sinal) */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-6 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[12px] font-semibold text-[#16a34a]">
            <CheckCircle2 size={13} /> {okCount} OK
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeee3] px-2.5 py-1 text-[12px] font-semibold text-[#ea580c]">
            <AlertTriangle size={13} /> {avisoCount} aviso{avisoCount === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdecec] px-2.5 py-1 text-[12px] font-semibold text-[#dc2626]">
            <XCircle size={13} /> {erroCount} erro{erroCount === 1 ? '' : 's'}
          </span>
          <span className="ml-auto text-[12px] text-gray-400">
            {rows.length} linha{rows.length === 1 ? '' : 's'} de dados
          </span>
        </div>

        {/* Faixa de avisos estruturais */}
        {hasWarnBanner ? (
          <div className="mx-6 mt-3 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[12.5px] text-[#b45309]">
            {categories.length === 0 ? (
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={14} /> Nenhuma categoria carregada — selecione a organização antes de importar.
              </div>
            ) : null}
            {missingRequiredCols.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={14} /> Colunas obrigatórias ausentes:{' '}
                <span className="font-semibold">{missingRequiredCols.map((f) => f.label).join(', ')}</span>
              </div>
            ) : null}
            {unmatchedHeaders.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={14} /> Colunas ignoradas (não reconhecidas):{' '}
                <span className="font-semibold">{unmatchedHeaders.join(', ')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Tabela de conferência */}
        <div className="max-h-[55vh] overflow-auto px-6 py-3">
          {rows.length ? (
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-[10.5px] uppercase tracking-wide text-gray-500">
                  <th className="border-b border-gray-200 bg-[#fcfcfd] p-2 font-bold">#</th>
                  <th className="border-b border-gray-200 bg-[#fcfcfd] p-2 font-bold">Status</th>
                  {fields.map((f) => (
                    <th key={f.id} className="whitespace-nowrap border-b border-gray-200 bg-[#fcfcfd] p-2 font-bold">
                      {f.label}
                      {f.req ? <span className="ml-0.5 text-red-500">*</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = ROW_BADGE[r.status];
                  return (
                    <tr key={r.index} className="border-t border-gray-100 align-top">
                      <td className="p-2 font-mono text-[11px] text-gray-400">{r.index + 1}</td>
                      <td className="p-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}
                          title={r.issues.join(' · ') || 'Conforme'}
                        >
                          <badge.Icon size={12} /> {badge.label}
                        </span>
                      </td>
                      {fields.map((f) => {
                        const cell = r.cells[f.id];
                        return (
                          <td
                            key={f.id}
                            className={`whitespace-nowrap p-2 ${cell ? CELL_CLS[cell.status] : 'text-gray-400'}`}
                            title={cell?.msg || ''}
                          >
                            {cell ? cellDisplay(f, cell, categories) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-400">
              Nenhuma linha de dados encontrada na planilha. Preencha o modelo abaixo do cabeçalho e tente de novo.
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-6 py-4">
          {/* Legenda */}
          <div className="flex items-center gap-3 text-[11.5px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={13} className="text-[#16a34a]" /> importa
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle size={13} className="text-[#ea580c]" /> corrigir
            </span>
            <span className="inline-flex items-center gap-1">
              <XCircle size={13} className="text-[#dc2626]" /> inválida
            </span>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onReselect}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Trocar arquivo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(okRowValues(result))}
            disabled={okCount === 0}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
              okCount > 0 ? 'bg-[#16a34a] hover:bg-[#15803d]' : 'cursor-not-allowed bg-[#86cfa4]'
            }`}
          >
            <ArrowUpFromLine size={16} /> Importar {okCount} linha{okCount === 1 ? '' : 's'} OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportarPlanilhaModal;
