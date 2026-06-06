import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { FilePen, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ConsolidatedRow } from './types';

interface CategoriaGridProps {
  rows: ConsolidatedRow[];
  onEdit: (catId: string) => void;
  onRemove: (catId: string) => void;
}

/** Item do menu de ações (•••). */
const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, danger, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className={danger ? 'text-red-500' : 'text-[#16a34a]'}>{icon}</span>
    {label}
  </button>
);

/**
 * Grid consolidado por categoria: soma o declarado sem detalhe e os animais
 * detalhados. Editar/Remover agem só sobre a parte declarada (cats[]); linhas
 * só com detalhados têm as ações desabilitadas (gerenciadas no Lançamento Rápido).
 */
const CategoriaGrid: React.FC<CategoriaGridProps> = ({ rows, onEdit, onRemove }) => {
  // Menu de ações flutuante (•••): ancorado por coordenadas e renderizado em
  // portal no body — assim escapa do overflow-hidden do cartão e do containing
  // block criado pelo @container (container-type) ao redor desta tabela.
  const [menu, setMenu] = useState<{ catId: string; x: number; y: number } | null>(null);
  const toggleMenu = (e: React.MouseEvent, catId: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.catId === catId ? null : { catId, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

  // Limita a área a 4 categorias visíveis: a partir da 5ª, a tabela rola (o
  // cabeçalho fica fixo via sticky). Medimos a altura real do thead + 4 linhas
  // porque o nome da categoria pode quebrar em 2 linhas — recalculamos quando
  // as linhas mudam ou o painel é redimensionado.
  const VISIBLE_ROWS = 4;
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const measure = () => {
      const thead = theadRef.current;
      const body = bodyRef.current;
      if (!thead || !body) return;
      const trs = body.querySelectorAll<HTMLTableRowElement>('tr');
      if (trs.length > VISIBLE_ROWS) {
        let h = thead.offsetHeight;
        for (let i = 0; i < VISIBLE_ROWS; i++) h += trs[i].offsetHeight;
        setMaxH(h + 2); // folga para bordas
      } else {
        setMaxH(undefined);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [rows]);

  return (
    <div
      ref={scrollRef}
      className="overflow-auto"
      style={maxH ? { maxHeight: maxH } : undefined}
    >
      <table className="w-full text-left text-[13px]">
        <thead ref={theadRef} className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
            <th className="p-2.5 font-bold">Categoria</th>
            <th className="w-[110px] p-2.5 text-right font-bold">Sem ID</th>
            <th className="w-[110px] p-2.5 text-right font-bold">Com ID</th>
            <th className="w-[100px] p-2.5 text-right font-bold">Total</th>
            <th className="w-[80px] p-2.5 text-center font-bold">Ações</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.catId} className="border-t border-gray-100">
                <td className="p-2.5 font-semibold text-gray-800">{r.catNome}</td>
                <td className="p-2.5 text-right tabular-nums text-gray-700">{r.declarado}</td>
                <td className="p-2.5 text-right tabular-nums text-[#2563eb]">{r.detalhado}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums text-gray-900">{r.total} cab.</td>
                <td className="p-2.5 text-center">
                  {r.declarado > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => toggleMenu(e, r.catId)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        menu?.catId === r.catId
                          ? 'bg-gray-100 text-gray-700'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                      title="Ações"
                      aria-label="Ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
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
      </table>

      {/* ── Menu de ações (•••) ─────────────────────────────────────────────── */}
      {menu
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenu} />
              <div
                className="fixed z-50 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                style={{ top: menu.y + 6, right: Math.max(8, window.innerWidth - menu.x) }}
              >
                <MenuItem
                  icon={<FilePen size={15} />}
                  label="Editar"
                  onClick={() => {
                    onEdit(menu.catId);
                    closeMenu();
                  }}
                />
                <div className="my-1 border-t border-gray-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Excluir"
                  danger
                  onClick={() => {
                    onRemove(menu.catId);
                    closeMenu();
                  }}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
};

export default CategoriaGrid;
