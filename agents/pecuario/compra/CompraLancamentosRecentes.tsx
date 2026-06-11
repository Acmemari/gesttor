import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FilePen, MoreHorizontal, Trash2, Receipt } from 'lucide-react';
import { createPortal } from 'react-dom';
import { formatDateBR, computeCompra, fmtNum, fmtBRL } from './util';
import type { MovimentoCompra } from './types';

interface CompraLancamentosRecentesProps {
  movimentos: MovimentoCompra[];
  catName: (id: string) => string;
  pessoaName: (id?: string) => string;
  onEditar: (movId: string) => void;
  onExcluir: (movId: string) => void;
}

/** Resumo "Categoria (qtd), ..." a partir dos itens da compra. */
function catSummary(m: MovimentoCompra, catName: (id: string) => string): string {
  const tally: Record<string, number> = {};
  for (const it of m.itens) if (it.catId) tally[it.catId] = (tally[it.catId] || 0) + it.qtd;
  const ids = Object.keys(tally);
  return ids.length ? ids.map((id) => `${catName(id)} (${tally[id]})`).join(', ') : '—';
}

/** Item do menu de ações (•••). */
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

/** Linha de detalhe do bloco de valores. */
const ValorItem: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex flex-col">
    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    <span className={`tabular-nums ${strong ? 'text-[15px] font-bold text-[#65C04A]' : 'text-[13px] font-semibold text-gray-800'}`}>
      {value}
    </span>
  </div>
);

const CompraLancamentosRecentes: React.FC<CompraLancamentosRecentesProps> = ({
  movimentos,
  catName,
  pessoaName,
  onEditar,
  onExcluir,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

  if (!movimentos.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f5e9] text-[#65C04A]">
          <Receipt size={26} />
        </div>
        <h4 className="text-sm font-bold text-gray-700">Nenhuma compra registrada ainda</h4>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
          Vá até a aba “Lançamentos” para registrar a primeira compra do rebanho.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#fcfcfd] text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <th className="w-[36px] border-b border-gray-200 px-3 py-3" />
            <th className="border-b border-gray-200 px-4 py-3">Data</th>
            <th className="border-b border-gray-200 px-4 py-3">Categorias</th>
            <th className="border-b border-gray-200 px-4 py-3">Cliente</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Cabeças</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Peso/cab</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">Valor total</th>
            <th className="w-[70px] border-b border-gray-200 px-4 py-3 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {movimentos.map((m) => {
            const open = expanded === m.id;
            const calc = computeCompra(m.itens, m.desconto);
            const totalPesoBruto = m.itens.reduce((a, it) => a + (it.pesoMortoTotal ?? 0), 0);
            const calculatedDesconto = totalPesoBruto > 0 ? ((totalPesoBruto - (calc.totalPesoMorto || 0)) / totalPesoBruto) * 100 : 0;
            const displayDesconto = m.desconto != null && m.desconto > 0 ? m.desconto : calculatedDesconto;
            return (
              <React.Fragment key={m.id}>
                <tr
                  className="cursor-pointer hover:bg-[#fafbfc]"
                  onClick={() => (open ? setExpanded(null) : setExpanded(m.id))}
                >
                  <td className="border-b border-[#f1f2f4] px-3 py-3 text-gray-400">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 font-semibold text-gray-800">{formatDateBR(m.data)}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-700">{catSummary(m, catName)}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-700">{pessoaName(m.cliente) || '—'}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{m.qtd} cab.</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right tabular-nums text-gray-700">
                    {calc.pesoMortoCab != null ? `${fmtNum(calc.pesoMortoCab, 0)} kg` : '—'}
                  </td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-right font-semibold tabular-nums text-[#65C04A]">{fmtBRL(calc.valorTotal)}</td>
                  <td className="border-b border-[#f1f2f4] px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={(e) => toggleMenu(e, m.id)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        menu?.id === m.id ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                      title="Ações"
                      aria-label="Ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>

                {open ? (
                  <tr>
                    <td colSpan={8} className="border-b border-[#f1f2f4] bg-[#fbfcfd] px-6 py-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px]">
                        <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 font-semibold text-gray-600">
                          {m.qtd} cab.
                        </span>
                        {m.proprietario ? (
                          <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 font-semibold text-gray-600">
                            Prop.: {pessoaName(m.proprietario)}
                          </span>
                        ) : null}
                        {m.cliente ? (
                          <span className="inline-flex items-center rounded-full bg-[#e8f5e9] px-2.5 py-1 font-semibold text-[#65C04A]">
                            Cliente: {pessoaName(m.cliente)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-gray-200 bg-white p-3.5 sm:grid-cols-4 lg:grid-cols-5">
                        <ValorItem label="Valor/kg médio" value={fmtBRL(calc.valorArroba)} />
                        <ValorItem label="Peso vivo total (com desconto)" value={calc.totalPesoMorto > 0 ? `${fmtNum(calc.totalPesoMorto, 0)} kg` : '—'} />
                        <ValorItem label="Desconto médio %" value={displayDesconto > 0 ? `${fmtNum(displayDesconto, 1)}%` : '0%'} />
                        <ValorItem label="Valor/cab" value={fmtBRL(calc.valorCab)} />
                        <ValorItem label="Valor total" value={fmtBRL(calc.valorTotal)} strong />
                      </div>

                      {m.obs ? (
                        <p className="mb-3 text-[12.5px] text-gray-600">
                          <span className="font-semibold text-gray-500">Observação: </span>
                          {m.obs}
                        </p>
                      ) : null}

                      {m.itens.length ? (
                        <div>
                          <h5 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Categorias</h5>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="w-full border-collapse text-[12.5px]">
                              <thead>
                                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                                  <th className="border-b border-gray-100 px-3 py-2">Categoria</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Quantidade</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso vivo/cab</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Valor/kg</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Peso vivo total</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right">Desconto</th>
                                  <th className="border-b border-gray-100 px-3 py-2 text-right text-[#65C04A]">Peso Líquido</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.itens.map((it) => {
                                  const itemDesc = it.desconto ?? m.desconto ?? 0;
                                  const pLiquido = (it.pesoMortoTotal ?? 0) * (1 - itemDesc / 100);
                                  return (
                                    <tr key={it.id}>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 font-semibold text-gray-800">{catName(it.catId)}</td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">{it.qtd} cab.</td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-600">
                                        {it.pesoVivoKg != null ? `${fmtNum(it.pesoVivoKg, 0)} kg` : '—'}
                                      </td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">
                                        {it.valorArroba != null ? fmtBRL(it.valorArroba) : '—'}
                                      </td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-700">
                                        {it.pesoMortoTotal != null ? `${fmtNum(it.pesoMortoTotal, 0)} kg` : '—'}
                                      </td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-gray-600">
                                        {itemDesc != null ? `${fmtNum(itemDesc, 1)}%` : '0%'}
                                      </td>
                                      <td className="border-b border-[#f4f5f6] px-3 py-2 text-right tabular-nums text-[#65C04A] font-semibold">
                                        {it.pesoMortoTotal != null ? `${fmtNum(pLiquido, 0)} kg` : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-gray-400">Sem categorias registradas.</p>
                      )}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
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
                  icon={<Eye size={15} />}
                  label="Ver"
                  onClick={() => {
                    setExpanded(menu.id);
                    closeMenu();
                  }}
                />
                <MenuItem
                  icon={<FilePen size={15} />}
                  label="Editar"
                  onClick={() => {
                    onEditar(menu.id);
                    closeMenu();
                  }}
                />
                <div className="my-1 border-t border-gray-100" />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  label="Excluir"
                  danger
                  onClick={() => {
                    onExcluir(menu.id);
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

export default CompraLancamentosRecentes;
