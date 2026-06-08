import React, { useEffect, useRef, useState } from 'react';
import { Baby, Check, ChevronRight, Eye, FilePen, IdCard, Info, MoreHorizontal, Trash2, X } from 'lucide-react';
import FichaInclusaoForm from './FichaInclusaoForm';
import { LR_REGISTRY, defaultValue } from './fieldRegistry';
import { formatDateBR, parseWeight, proximoApelido, todayISO } from './util';
import type { AtribFicha, FieldPlaces, LookupItem, MovimentoNasc } from './types';

interface LancamentosRecentesProps {
  movimentos: MovimentoNasc[];
  /** resolve catId → nome da categoria */
  catName: (id: string) => string;
  /** categorias disponíveis para o campo Categoria da inclusão inline */
  categories: LookupItem[];
  /** configuração de campos (destino) — mesma do Lançamento Rápido */
  places: FieldPlaces;
  /** ordem global de exibição dos campos */
  order: string[];
  /** lotes para o campo Lote */
  lotes: LookupItem[];
  /** override de opções de selects (ex.: raças cadastradas) */
  optionsOverride?: Record<string, string[]>;
  /** numeração automática do ID Manejo (próximo na sequência ao adicionar) */
  autonum?: boolean;
  /** persiste uma nova ficha (atribuição de ID) no movimento aberto no detalhamento */
  onAddFicha: (movId: string, ficha: Omit<AtribFicha, 'id'>) => void;
  /** abre o painel de atribuição de ID (aba Lançar) para o movimento selecionado */
  onAtribuir?: (movId: string) => void;
  /** reabre o lançamento no formulário superior para edição */
  onEditar?: (movId: string) => void;
  /** exclui o lançamento */
  onExcluir?: (movId: string) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
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
 * selecionado é exibido logo abaixo (detail). O detalhamento é editável: a
 * atribuição de ID (individualização dos bezerros) acontece ali mesmo, sem sair
 * da tela de Registros, com os MESMOS campos/regras do Lançamento Rápido.
 */
const LancamentosRecentes: React.FC<LancamentosRecentesProps> = ({
  movimentos,
  catName,
  categories,
  places,
  order,
  lotes,
  optionsOverride,
  autonum,
  onAddFicha,
  onAtribuir,
  onEditar,
  onExcluir,
  onToast,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Linha com as categorias expandidas inline (independente da seleção: o 1º
  // clique seleciona/lista o detalhamento; o 2º expande as categorias aqui).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Menu de ações flutuante (•••): ancorado por coordenadas para não ser
  // recortado pelo overflow-hidden do cartão. `id` é o movimento alvo das ações;
  // `anchor` identifica o botão clicado (linha mestre ou linha de categoria) para
  // realçar só ele.
  const [menu, setMenu] = useState<{ id: string; anchor: string; x: number; y: number } | null>(null);
  // Categoria selecionada dentro do lançamento aberto: ao escolher uma linha de
  // categoria, o detalhamento inferior passa a mostrar só as fichas dela.
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  // Auto-seleciona o primeiro lançamento e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && movimentos.some((m) => m.id === prev)) return prev;
      return movimentos[0]?.id ?? null;
    });
  }, [movimentos]);

  // Trocar de lançamento limpa a categoria selecionada (volta a mostrar todas).
  useEffect(() => {
    setSelectedCatId(null);
  }, [selectedId]);

  const selected = movimentos.find((m) => m.id === selectedId) || null;

  // Clique na linha em 3 estágios: 1) lista o detalhamento (seleciona);
  // 2) abre as linhas das categorias lançadas logo abaixo; 3) fecha tudo.
  const cycleRow = (id: string) => {
    setSelectedCatId(null);
    if (selectedId !== id) {
      setSelectedId(id);
      setExpandedId(null);
    } else if (expandedId !== id) {
      setExpandedId(id);
    } else {
      setSelectedId(null);
      setExpandedId(null);
    }
  };

  // A seta abre/recolhe diretamente as categorias, mantendo o detalhamento aberto.
  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedCatId(null);
    setSelectedId(id);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleMenu = (e: React.MouseEvent, id: string, anchor: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.anchor === anchor ? null : { id, anchor, x: r.right, y: r.bottom }));
  };
  const closeMenu = () => setMenu(null);

  // ── Divisor arrastável entre a lista (master) e o detalhamento (detail) ─────
  // Arrastar a régua para cima reduz a altura da lista e amplia o detalhamento
  // — útil ao atribuir IDs, quando o formulário inferior precisa de mais espaço.
  const splitRef = useRef<HTMLDivElement>(null);
  const [masterPct, setMasterPct] = useState(50); // % de altura ocupada pela lista
  const draggingRef = useRef(false);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResize = (e: React.PointerEvent) => {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setMasterPct(Math.min(85, Math.max(15, pct)));
  };
  const endResize = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={splitRef}
      className="flex h-[calc(100vh-240px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      {/* ── Master: relação de lançamentos (altura ajustável, rolagem própria) ── */}
      <div className="min-h-0 shrink-0 overflow-y-auto" style={{ height: `${masterPct}%` }}>
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10">
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
              const isExpanded = m.id === expandedId;
              return (
                <React.Fragment key={m.id}>
                <tr
                  onClick={() => cycleRow(m.id)}
                  className={`cursor-pointer border-t border-gray-100 transition-colors ${
                    isSel ? 'bg-[#e7f6ec]' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(e, m.id)}
                      className="inline-flex items-center justify-center rounded transition-colors hover:bg-black/5"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Recolher categorias' : 'Expandir categorias'}
                      title={isExpanded ? 'Recolher categorias' : 'Expandir categorias'}
                    >
                      <ChevronRight
                        size={15}
                        className={`transition-transform ${
                          isExpanded ? 'rotate-90 text-[#16a34a]' : isSel ? 'text-[#16a34a]' : 'text-gray-300'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="p-3 text-gray-700">{formatDateBR(m.data)}</td>
                  <td className={`p-3 font-semibold ${isSel ? 'text-[#16a34a]' : 'text-gray-800'}`}>
                    {catSummary(m, catName)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-gray-700">+{m.qtd}</td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={(e) => toggleMenu(e, m.id, m.id)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        menu?.anchor === m.id ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                      title="Ações"
                      aria-label="Ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>

                {/* Linhas das categorias lançadas (visíveis ao expandir a linha). */}
                {isExpanded && m.catDecl.length
                  ? m.catDecl.map((d, i) => {
                      const anchor = `${m.id}-cat-${i}`;
                      const isCatSel = selectedCatId === d.catId;
                      return (
                      <tr
                        key={`${m.id}-cat-${d.catId}-${i}`}
                        onClick={() => setSelectedCatId((prev) => (prev === d.catId ? null : d.catId))}
                        className={`cursor-pointer transition-colors ${
                          isCatSel ? 'bg-[#cfeede]' : 'bg-[#f1faf4] hover:bg-[#e7f6ec]'
                        }`}
                      >
                        <td className="p-0" />
                        <td className="p-0" />
                        <td className="py-2 pl-8 pr-3">
                          <span className={`inline-flex items-center gap-2 text-[12.5px] ${isCatSel ? 'font-semibold text-[#16a34a]' : 'text-gray-700'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isCatSel ? 'bg-[#16a34a]' : 'bg-[#16a34a]/70'}`} />
                            {catName(d.catId)}
                          </span>
                        </td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${isCatSel ? 'text-[#16a34a]' : 'text-gray-700'}`}>{d.qtd}</td>
                        <td className="py-2 text-center">
                          <button
                            type="button"
                            onClick={(e) => toggleMenu(e, m.id, anchor)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                              menu?.anchor === anchor ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
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
                  : null}
                </React.Fragment>
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
      </div>

      {/* ── Divisor arrastável: ajusta a divisão lista × detalhamento ───────── */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Ajustar altura da lista de registros"
        onPointerDown={startResize}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        className="group relative flex h-2.5 shrink-0 cursor-row-resize touch-none items-center justify-center border-t-4 border-[#e7f6ec] bg-[#fafbfc] transition-colors hover:border-[#16a34a]/40"
        title="Arraste para ajustar o espaço da lista e do detalhamento"
      >
        <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
      </div>

      {/* ── Detail: detalhamento editável (espaço restante, rolagem própria) ─── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
        {selected ? (
          <LancamentoDetalhe
            movimento={selected}
            catName={catName}
            categories={categories}
            places={places}
            order={order}
            lotes={lotes}
            optionsOverride={optionsOverride}
            autonum={autonum}
            filterCatId={selectedCatId}
            onClearFilter={() => setSelectedCatId(null)}
            onAddFicha={onAddFicha}
            onToast={onToast}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
            Selecione um lançamento acima para ver o detalhamento.
          </div>
        )}
      </div>

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
  categories: LookupItem[];
  places: FieldPlaces;
  order: string[];
  lotes: LookupItem[];
  optionsOverride?: Record<string, string[]>;
  autonum?: boolean;
  /** quando definido, mostra só as fichas dessa categoria */
  filterCatId?: string | null;
  /** limpa o filtro de categoria (volta a mostrar todas as fichas) */
  onClearFilter?: () => void;
  /** persiste uma nova ficha (atribuição de ID) neste movimento */
  onAddFicha: (movId: string, ficha: Omit<AtribFicha, 'id'>) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/** Valores iniciais do formulário de inclusão do detalhamento. */
function buildDetalheValues(
  today: string,
  movData: string,
  defaultCatId: string,
  raca?: string,
): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of LR_REGISTRY) {
    if (f.id === 'sanitario') continue;
    v[f.id] = defaultValue(f.id, today, raca);
  }
  v.data = movData || today;
  v.categoria = defaultCatId || '';
  v.apelido = '';
  return v;
}

/**
 * Painel inferior: cabeçalho + fichas individuais do lançamento. Quando ainda há
 * bezerros a detalhar (naoIdentificados > 0), exibe o formulário de inclusão
 * (mesmos campos do Lançamento Rápido, dirigidos pela configuração) para
 * individualizar cada bezerro aqui mesmo, na tela de Registros.
 */
const LancamentoDetalhe: React.FC<LancamentoDetalheProps> = ({
  movimento: m,
  catName,
  categories,
  places,
  order,
  lotes,
  optionsOverride,
  autonum,
  filterCatId,
  onClearFilter,
  onAddFicha,
  onToast,
}) => {
  const restantes = m.naoIdentificados;
  const editable = restantes > 0;
  const isFiltered = !!filterCatId;
  const fichas = isFiltered ? m.fichas.filter((f) => f.catId === filterCatId) : m.fichas;
  const catQtd = isFiltered ? (m.catDecl.find((d) => d.catId === filterCatId)?.qtd ?? fichas.length) : m.qtd;

  const today = todayISO();
  const racaDefault = optionsOverride?.raca?.[0];
  const defaultCatId = filterCatId || m.catDecl[0]?.catId || categories[0]?.id || '';

  // ── Formulário de inclusão (atribuição de ID inline) ─────────────────────
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildDetalheValues(today, m.data, defaultCatId, racaDefault),
  );
  const [dadosOpen, setDadosOpen] = useState(false);
  // O formulário de individualização fica recolhido por padrão: a visão default
  // do detalhamento mostra apenas a listagem de IDs já atribuídos. O formulário
  // só aparece quando "Atribuir ID" é acionado.
  const [atribuindo, setAtribuindo] = useState(false);

  // Ao trocar de lançamento, de filtro de categoria ou de data, reinicia o
  // formulário (mira na categoria filtrada quando houver).
  useEffect(() => {
    setValues(buildDetalheValues(today, m.data, defaultCatId, racaDefault));
    setDadosOpen(false);
    setAtribuindo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, m.data, filterCatId]);

  const setValue = (fieldId: string, value: string) =>
    setValues((prev) => ({ ...prev, [fieldId]: value }));

  const handleAdd = () => {
    const apelido = (values.apelido || '').trim();
    const catId = values.categoria || '';
    if (!apelido) {
      onToast?.('Informe o ID Manejo', 'error');
      return;
    }
    if (!catId) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (restantes <= 0) {
      onToast?.('Lançamento já totalmente identificado', 'warning');
      return;
    }
    onAddFicha(m.id, {
      apelido,
      catId,
      rfid: (values.rfid || '').trim() || undefined,
      sisbov: (values.sisbov || '').trim() || undefined,
      porte: values.porte || undefined,
      raca: values.raca || undefined,
      peso: parseWeight(values.peso) || undefined,
    });
    // Próxima entrada: preserva a linha superior (data/raça/lote) e a categoria;
    // sugere o próximo ID Manejo se Nº auto; reseta o restante (sexo/porte/peso...).
    setValues((prev) => {
      const next = { ...prev };
      for (const f of LR_REGISTRY) {
        if (f.id === 'sanitario' || f.id === 'categoria') continue;
        if (places[f.id] === 'top') continue;
        next[f.id] = defaultValue(f.id, today, prev.raca);
      }
      next.apelido = autonum ? proximoApelido(apelido) : '';
      return next;
    });
  };

  return (
    <div>
      {/* Cabeçalho do detalhe (fixo no topo da metade inferior ao rolar) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-[#fafbfc] px-5 py-3.5">
        <h4 className="text-[14px] font-bold text-gray-900">
          Detalhamento · {formatDateBR(m.data)}
        </h4>
        {isFiltered ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] py-1 pl-2.5 pr-1 text-[11.5px] font-semibold text-[#16a34a]">
              {catName(filterCatId!)}
              <button
                type="button"
                onClick={onClearFilter}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#16a34a]/70 hover:bg-[#16a34a]/15 hover:text-[#16a34a]"
                title="Limpar filtro de categoria"
                aria-label="Limpar filtro de categoria"
              >
                <X size={12} />
              </button>
            </span>
            <span className="inline-flex items-center rounded-full bg-[#eef0f2] px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">
              {fichas.length} de {catQtd} detalhados
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
        {editable ? (
          <div className="ml-auto flex items-center gap-2">
            {atribuindo ? (
              <>
                <span className="hidden items-center gap-1.5 text-[11.5px] font-medium text-gray-400 sm:inline-flex">
                  <IdCard size={13} className="text-[#16a34a]" />
                  Preencha os campos abaixo para atribuir o ID de cada bezerro
                </span>
                <button
                  type="button"
                  onClick={() => setAtribuindo(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  <X size={14} /> Fechar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAtribuindo(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#15803d]"
              >
                <IdCard size={14} /> Atribuir ID
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Formulário de inclusão (mesmos campos do Lançamento Rápido) */}
      {editable && atribuindo ? (
        <div
          className="border-t border-gray-200 bg-white px-5 py-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault();
              handleAdd();
            }
          }}
        >
          <FichaInclusaoForm
            places={places}
            order={order}
            categories={categories}
            lotes={lotes}
            optionsOverride={optionsOverride}
            values={values}
            onValueChange={setValue}
            onAdd={handleAdd}
            dadosOpen={dadosOpen}
            onToggleDados={() => setDadosOpen((p) => !p)}
            onToast={onToast}
          />
        </div>
      ) : null}

      {/* Tabela de fichas individuais (somente leitura) */}
      <div className="border-t border-gray-200 bg-white">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#fcfcfd] text-[10.5px] uppercase tracking-wide text-gray-500">
              <th className="p-2.5 font-bold">ID Manejo</th>
              <th className="p-2.5 font-bold">Categoria</th>
              <th className="p-2.5 font-bold">ID Eletrônica</th>
              <th className="p-2.5 font-bold">SISBOV</th>
              <th className="p-2.5 text-right font-bold">Peso</th>
              <th className="p-2.5 font-bold">Porte</th>
            </tr>
          </thead>
          <tbody>
            {fichas.length ? (
              fichas.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
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
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  {(() => {
                    const acaoHint = atribuindo
                      ? 'preencha o formulário acima para identificar.'
                      : 'clique em “Atribuir ID” para identificar.';
                    if (isFiltered) {
                      return editable
                        ? `Nenhum bezerro desta categoria ainda — ${acaoHint}`
                        : 'Nenhum bezerro desta categoria foi individualizado.';
                    }
                    return editable
                      ? `Nenhum bezerro individualizado ainda — ${acaoHint}`
                      : 'Nenhum bezerro individualizado neste lançamento.';
                  })()}
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
