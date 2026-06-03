import React, { useEffect, useState } from 'react';
import { Baby, Check, ChevronRight, Eye, FilePen, IdCard, Info, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatDateBR } from './util';
import type { MovimentoNasc } from './types';

interface LancamentosRecentesProps {
  movimentos: MovimentoNasc[];
  /** resolve catId → nome da categoria */
  catName: (id: string) => string;
  /** abre o painel de atribuição de ID para o movimento selecionado */
  onAtribuir?: (movId: string) => void;
  /** reabre o lançamento no formulário superior para edição */
  onEditar?: (movId: string) => void;
  /** exclui o lançamento */
  onExcluir?: (movId: string) => void;
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

/** Resumo da distribuição por categoria de um movimento (ex.: "Bezerra mamando (20)"). */
function catSummary(m: MovimentoNasc, catName: (id: string) => string): string {
  return m.catDecl.length
    ? m.catDecl.map((d) => `${catName(d.catId)} (${d.qtd})`).join(', ')
    : 'A detalhar';
}

/**
 * Controle master-detail dos lançamentos de Nascimento: a relação fica na camada
 * superior (master) e, ao clicar numa linha, o detalhamento do lançamento
 * selecionado é exibido logo abaixo (detail).
 */
const LancamentosRecentes: React.FC<LancamentosRecentesProps> = ({ movimentos, catName, onAtribuir, onEditar, onExcluir }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Menu de ações flutuante (•••): ancorado por coordenadas para não ser
  // recortado pelo overflow-hidden do cartão.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Auto-seleciona o primeiro lançamento e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && movimentos.some((m) => m.id === prev)) return prev;
      return movimentos[0]?.id ?? null;
    });
  }, [movimentos]);

  const selected = movimentos.find((m) => m.id === selectedId) || null;

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* ── Master: relação de lançamentos ─────────────────────────────────── */}
      <div className="border-b border-gray-200 px-5 py-3.5">
        <h3 className="text-[15px] font-bold text-gray-900">Lançamentos recentes — Nascimento</h3>
        <p className="mt-0.5 text-[12px] text-gray-400">Clique em um lançamento para ver o detalhamento abaixo.</p>
      </div>

      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
            <th className="w-8 p-3" />
            <th className="p-3 font-bold">Data</th>
            <th className="p-3 font-bold">Categoria</th>
            <th className="p-3 text-right font-bold">Qtd</th>
            <th className="p-3 text-center font-bold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {movimentos.length ? (
            movimentos.map((m) => {
              const isSel = m.id === selectedId;
              return (
                <tr
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`cursor-pointer border-t border-gray-100 transition-colors ${
                    isSel ? 'bg-[#eaf1fb]' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="p-3">
                    <ChevronRight
                      size={15}
                      className={`transition-transform ${isSel ? 'rotate-90 text-[#2563eb]' : 'text-gray-300'}`}
                    />
                  </td>
                  <td className="p-3 text-gray-700">{formatDateBR(m.data)}</td>
                  <td className={`p-3 font-semibold ${isSel ? 'text-[#2563eb]' : 'text-gray-800'}`}>
                    {catSummary(m, catName)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-gray-700">+{m.qtd}</td>
                  <td className="p-3 text-center">
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
              );
            })
          ) : (
            <tr>
              <td colSpan={5} className="p-8 text-center text-gray-400">
                <Baby size={30} className="mx-auto mb-2 text-gray-300" />
                Nenhum lançamento ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Detail: detalhamento do lançamento selecionado ─────────────────── */}
      {selected ? (
        <LancamentoDetalhe movimento={selected} catName={catName} />
      ) : null}

      {/* ── Menu de ações (•••) ────────────────────────────────────────────── */}
      {menu ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            style={{ top: menu.y + 6, right: Math.max(8, window.innerWidth - menu.x) }}
          >
            <MenuItem
              icon={<Eye size={15} />}
              label="Ver"
              onClick={() => {
                setSelectedId(menu.id);
                closeMenu();
              }}
            />
            <MenuItem
              icon={<FilePen size={15} />}
              label="Editar"
              onClick={() => {
                onEditar?.(menu.id);
                closeMenu();
              }}
            />
            <MenuItem
              icon={<IdCard size={15} />}
              label="Atribuir ID"
              onClick={() => {
                onAtribuir?.(menu.id);
                closeMenu();
              }}
            />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<Trash2 size={15} />}
              label="Excluir"
              danger
              onClick={() => {
                onExcluir?.(menu.id);
                closeMenu();
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface LancamentoDetalheProps {
  movimento: MovimentoNasc;
  catName: (id: string) => string;
}

/** Painel inferior: cabeçalho + fichas individuais do lançamento. */
const LancamentoDetalhe: React.FC<LancamentoDetalheProps> = ({ movimento: m, catName }) => {
  const restantes = m.naoIdentificados;

  return (
    <div className="border-t-4 border-[#eaf1fb] bg-[#fafbfc]">
      {/* Cabeçalho do detalhe */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <h4 className="text-[14px] font-bold text-gray-900">
          Detalhamento · {formatDateBR(m.data)}
        </h4>
        <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">
          {m.qtd} cab.
        </span>
        {restantes > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeee3] px-2.5 py-1 text-[11.5px] font-semibold text-[#ea580c]">
            <Info size={12} /> {m.fichas.length} de {m.qtd} detalhados
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#16a34a]">
            <Check size={12} /> Totalmente identificado
          </span>
        )}
      </div>

      {/* Tabela de fichas individuais */}
      <div className="border-t border-gray-200 bg-white">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
              <th className="p-2.5 font-bold">ID interno</th>
              <th className="p-2.5 font-bold">Apelido / ID</th>
              <th className="p-2.5 font-bold">Categoria</th>
              <th className="p-2.5 font-bold">ID Eletrônica</th>
              <th className="p-2.5 font-bold">SISBOV</th>
              <th className="p-2.5 text-right font-bold">Peso</th>
              <th className="p-2.5 font-bold">Porte</th>
            </tr>
          </thead>
          <tbody>
            {m.fichas.length ? (
              m.fichas.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="p-2.5 font-mono font-semibold text-[#2563eb]">A-{String(f.id).padStart(4, '0')}</td>
                  <td className="p-2.5 font-semibold text-gray-800">{f.apelido}</td>
                  <td className="p-2.5 text-gray-700">{catName(f.catId)}</td>
                  <td className="p-2.5 font-mono text-[11px] text-gray-500">{f.rfid || '—'}</td>
                  <td className="p-2.5 font-mono text-[11px] text-gray-500">{f.sisbov || '—'}</td>
                  <td className="p-2.5 text-right tabular-nums text-gray-700">{f.peso ? `${f.peso} kg` : '—'}</td>
                  <td className="p-2.5 text-gray-600">{f.porte || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-400">
                  {restantes > 0
                    ? 'Nenhum bezerro individualizado ainda — use “Atribuir ID” para detalhar.'
                    : 'Nenhum bezerro individualizado neste lançamento.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LancamentosRecentes;
