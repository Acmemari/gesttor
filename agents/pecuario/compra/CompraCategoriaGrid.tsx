import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { FilePen, MoreHorizontal, Trash2 } from 'lucide-react';
import type { CompraCat } from './types';

interface CompraCategoriaGridProps {
  rows: CompraCat[];
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
}

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }> = ({
  icon,
  label,
  danger,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className={danger ? 'text-red-500' : 'text-[#65C04A]'}>{icon}</span>
    {label}
  </button>
);

const CompraCategoriaGrid: React.FC<CompraCategoriaGridProps> = ({ rows, onEdit, onRemove }) => {
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const toggleMenu = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

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
        setMaxH(h + 2);
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
    <div ref={scrollRef} className="overflow-auto" style={maxH ? { maxHeight: maxH } : undefined}>
      <table className="w-full text-left text-[13px]">
        <thead ref={theadRef} className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
            <th className="p-2.5 font-bold">Categoria</th>
            <th className="w-[70px] p-2.5 text-right font-bold">Sem ID</th>
            <th className="w-[70px] p-2.5 text-right font-bold">Com ID</th>
            <th className="w-[88px] p-2.5 text-right font-bold">Total</th>
            <th className="w-[60px] p-2.5 text-center font-bold">Ações</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="p-2.5 font-semibold text-gray-800">{r.catNome}</td>
                <td className="p-2.5 text-right tabular-nums text-gray-700">{r.qtd}</td>
                <td className="p-2.5 text-right tabular-nums text-[#2563eb]">0</td>
                <td className="p-2.5 text-right font-semibold tabular-nums text-gray-900">{r.qtd} cab.</td>
                <td className="p-2.5 text-center">
                  <button
                    type="button"
                    onClick={(e) => toggleMenu(e, r.id)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      menu?.id === r.id
                        ? 'bg-gray-100 text-gray-700'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                    title="Ações"
                    aria-label="Ações"
                  >
                    <MoreHorizontal size={18} />
                  </button>
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
                    onEdit(menu.id);
                    closeMenu();
                  }}
                />
                <div className="my-1 border-t border-gray-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Excluir"
                  danger
                  onClick={() => {
                    onRemove(menu.id);
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

export default CompraCategoriaGrid;
