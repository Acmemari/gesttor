import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ConsolidatedRow } from './types';

interface CategoriaGridProps {
  rows: ConsolidatedRow[];
  onEdit: (catId: string) => void;
  onRemove: (catId: string) => void;
}

/**
 * Grid consolidado por categoria: soma o declarado sem detalhe e os animais
 * detalhados. Editar/Remover agem só sobre a parte declarada (cats[]); linhas
 * só com detalhados têm as ações desabilitadas (gerenciadas no Lançamento Rápido).
 */
const CategoriaGrid: React.FC<CategoriaGridProps> = ({ rows, onEdit, onRemove }) => {
  const totalDeclarado = rows.reduce((a, r) => a + r.declarado, 0);
  const totalDetalhado = rows.reduce((a, r) => a + r.detalhado, 0);
  const totalGeral = totalDeclarado + totalDetalhado;
  return (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
            <th className="p-2.5 font-bold">Categoria</th>
            <th className="w-[110px] p-2.5 text-right font-bold">Sem ID</th>
            <th className="w-[110px] p-2.5 text-right font-bold">Com ID</th>
            <th className="w-[100px] p-2.5 text-right font-bold">Total</th>
            <th className="w-[90px] p-2.5 font-bold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.catId} className="border-t border-gray-100">
                <td className="p-2.5 font-semibold text-gray-800">{r.catNome}</td>
                <td className="p-2.5 text-right tabular-nums text-gray-700">{r.declarado}</td>
                <td className="p-2.5 text-right tabular-nums text-[#2563eb]">{r.detalhado}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums text-gray-900">{r.total} cab.</td>
                <td className="p-2.5">
                  {r.declarado > 0 ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onEdit(r.catId)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar sem ID">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => onRemove(r.catId)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover sem ID">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-300">só com ID</span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr className="border-t border-gray-100">
              <td colSpan={5} className="p-3 text-center text-gray-400">
                Nenhuma categoria adicionada — o total começa em 0.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-[#fcfcfd]">
            <td className="p-2.5 font-semibold text-gray-700">Total</td>
            <td className="p-2.5 text-right font-bold tabular-nums text-gray-700">{totalDeclarado}</td>
            <td className="p-2.5 text-right font-bold tabular-nums text-[#2563eb]">{totalDetalhado}</td>
            <td className="p-2.5 text-right font-bold tabular-nums text-[#2563eb]">{totalGeral} cab.</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default CategoriaGrid;
