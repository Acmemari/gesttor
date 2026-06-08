import React from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Tabela genérica de "régua de lançamento": exibe os itens que vão sendo
 * adicionados inline (clicar → aparece aqui), com estado vazio e ação de
 * remover por linha.
 *
 * Padrão extraído de LancamentoRapido.
 */
export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /** Largura fixa (classe Tailwind), ex.: 'w-[64px]'. */
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface InlineEntryTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Quando fornecido, adiciona uma coluna "Ações" com botão de remover. */
  onRemove?: (row: T) => void;
  emptyIcon?: React.ReactNode;
  emptyText?: string;
}

function InlineEntryTable<T>({
  columns,
  rows,
  rowKey,
  onRemove,
  emptyIcon,
  emptyText = 'Nenhum item adicionado ainda.',
}: InlineEntryTableProps<T>) {
  const totalCols = columns.length + (onRemove ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full table-fixed text-left text-[11.5px]">
        <thead>
          <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`p-2 font-bold ${col.align === 'right' ? 'text-right' : ''} ${col.width ?? ''}`}
              >
                {col.header}
              </th>
            ))}
            {onRemove ? <th className="w-[64px] p-2 font-bold">Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-gray-100 align-top">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`break-words p-2 text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {onRemove ? (
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onRemove(row)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={totalCols} className="p-5 text-center text-gray-400">
                {emptyIcon ? <span className="mx-auto mb-2 block w-fit">{emptyIcon}</span> : null}
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default InlineEntryTable;
