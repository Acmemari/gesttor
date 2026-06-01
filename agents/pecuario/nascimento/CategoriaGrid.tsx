import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { somaCategorias } from './util';
import type { NascCat } from './types';

interface CategoriaGridProps {
  cats: NascCat[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

/** Grid editável de categorias declaradas manualmente (modo DESLIGADO). */
const CategoriaGrid: React.FC<CategoriaGridProps> = ({ cats, onEdit, onRemove }) => {
  if (!cats.length) return null;
  const total = somaCategorias(cats);
  return (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
            <th className="p-2.5 font-bold">Categoria</th>
            <th className="w-[120px] p-2.5 text-right font-bold">Quantidade</th>
            <th className="w-[110px] p-2.5 font-bold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c, i) => (
            <tr key={`${c.catId}-${i}`} className="border-t border-gray-100">
              <td className="p-2.5 font-semibold text-gray-800">{c.catNome}</td>
              <td className="p-2.5 text-right tabular-nums text-gray-700">{c.qtd} cab.</td>
              <td className="p-2.5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => onEdit(i)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => onRemove(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-[#fcfcfd]">
            <td className="p-2.5 font-semibold text-gray-700">Total</td>
            <td className="p-2.5 text-right font-bold tabular-nums text-[#2563eb]">{total} cab.</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default CategoriaGrid;
