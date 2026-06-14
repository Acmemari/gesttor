import React, { useCallback, useMemo, useState } from 'react';
import { Search, Check, ChevronDown, Loader2, Tag, ArrowLeftRight } from 'lucide-react';
import type { Lote } from '../../../lib/api/lotesClient';
import type { CategoriaLookup, AnimalLite, LoteEventoRow } from './types';
import { todayISO, ledgerLoteByAnimal as buildLedgerMap, resolveLoteIdFromText } from './util';
import { resolveSituacao } from '../fichaAnimal/AnimalStatusBadge';
import { ModalShell, inputCls, labelCls, type EventoDraft } from './LoteModals';
import { MultiSelect, AcaoBadge } from './IncluirPorIdModal';

/** Sentinelas dos filtros (animais sem vínculo / sem categoria). */
const SEM_LOTE = '__sem_lote__';
const SEM_CAT = '__sem_cat__';

// ── Botão "Mover para" (escolhe destino: qualquer lote ou Sem lote) ───────────

const MoverParaBtn: React.FC<{
  lotesDestino: Lote[];
  disabled: boolean;
  onPick: (destino: string) => void; // loteId | SEM_LOTE
}> = ({ lotesDestino, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0891b2] bg-[#e0f5fb] px-2.5 text-[12px] font-bold text-[#0891b2] hover:bg-[#cdeef7] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeftRight size={13} /> Mover para <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Mover para</div>
            <button
              type="button"
              onClick={() => { onPick(SEM_LOTE); setOpen(false); }}
              className="flex w-full items-center px-3 py-1.5 text-left text-[13px] font-semibold text-[#DC2626] hover:bg-[#fdeaea]"
            >
              Sem lote (remover)
            </button>
            <div className="my-1 border-t border-gray-100" />
            {lotesDestino.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-gray-400">Nenhum lote disponível.</p>
            ) : (
              lotesDestino.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => { onPick(l.id); setOpen(false); }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-[#e0f5fb]"
                >
                  {l.codigo ? `${l.codigo} · ${l.nome}` : l.nome}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Tela: Manejo de lotes (toda a fazenda — mover qualquer animal) ────────────

export const ManejoLotesModal: React.FC<{
  lotes: Lote[];
  categorias: CategoriaLookup[];
  animais: AnimalLite[];
  animaisLoading?: boolean;
  /** Eventos por lote — usado para derivar o lote atual de cada animal. */
  eventosByLote: Record<string, LoteEventoRow[]>;
  onClose: () => void;
  onSubmit: (eventos: EventoDraft[]) => Promise<void>;
}> = ({ lotes, categorias, animais, animaisLoading, eventosByLote, onClose, onSubmit }) => {
  const [busca, setBusca] = useState('');
  const [filtroLotes, setFiltroLotes] = useState<Set<string>>(new Set());
  const [filtroCats, setFiltroCats] = useState<Set<string>>(new Set());
  const [data, setData] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  // Seleção transitória (caixas marcadas) para a barra de ações.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  // Mudanças ENCENADAS por animal: id → destino. Ausente = sem mudança.
  //   valor = loteId (mover/atribuir) | SEM_LOTE (remover).
  const [destino, setDestino] = useState<Map<string, string>>(new Map());
  const [aviso, setAviso] = useState<string | null>(null);

  const loteById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);
  // Destinos válidos: lotes não encerrados.
  const lotesDestino = useMemo(() => lotes.filter((l) => !l.finalizado), [lotes]);
  const catNome = useCallback((id: string | null) => categorias.find((c) => c.id === id)?.nome, [categorias]);
  const loteLabel = useCallback((id: string) => {
    const l = loteById.get(id);
    if (!l) return id;
    return l.codigo ? `${l.codigo} · ${l.nome}` : l.nome;
  }, [loteById]);
  const loteCurto = useCallback((id: string) => {
    const l = loteById.get(id);
    return l ? (l.codigo || l.nome) : id;
  }, [loteById]);

  // Lote atual derivado do ledger (vínculo por ID); fallback no texto da ficha.
  const ledger = useMemo(() => buildLedgerMap(eventosByLote), [eventosByLote]);
  const currentLoteId = useCallback(
    (a: AnimalLite): string | null => ledger.get(a.id) ?? resolveLoteIdFromText(a.lote, lotes),
    [ledger, lotes],
  );
  // Origem só do ledger (para o outroLoteId — null se vínculo é só texto).
  const ledgerLoteId = useCallback((a: AnimalLite): string | null => ledger.get(a.id) ?? null, [ledger]);

  // Só animais no plantel (exclui morte/venda).
  const animaisAtivos = useMemo(
    () => animais.filter((a) => resolveSituacao(a.situacao) === 'ativo'),
    [animais],
  );

  // Ação encenada: SEM_LOTE → remover; outro valor → mover (atribuir lote).
  const acaoDe = useCallback((a: AnimalLite): 'none' | 'mover' | 'remover' => {
    const t = destino.get(a.id);
    if (t === undefined) return 'none';
    return t === SEM_LOTE ? 'remover' : 'mover';
  }, [destino]);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const loteOptions = useMemo(
    () => [
      { value: SEM_LOTE, label: 'Sem lote' },
      ...lotes.map((l) => ({ value: l.id, label: l.codigo ? `${l.codigo} · ${l.nome}` : l.nome })),
    ],
    [lotes],
  );
  const catOptions = useMemo(
    () => [...categorias.map((c) => ({ value: c.id, label: c.nome })), { value: SEM_CAT, label: 'Sem categoria' }],
    [categorias],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return animaisAtivos.filter((a) => {
      if (filtroLotes.size > 0 && !filtroLotes.has(currentLoteId(a) ?? SEM_LOTE)) return false;
      if (filtroCats.size > 0 && !filtroCats.has(a.categoriaId ?? SEM_CAT)) return false;
      if (q) {
        const hay = `${a.apelido} ${a.rfid ?? ''} ${a.raca ?? ''} ${catNome(a.categoriaId) ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [animaisAtivos, busca, filtroLotes, filtroCats, currentLoteId, catNome]);

  const filtroAtivo = !!(busca || filtroLotes.size || filtroCats.size);
  const todosVisiveisSelecionados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.id));

  // ── Seleção ──────────────────────────────────────────────────────────────────
  const toggleSel = (id: string) =>
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const selecionarVisiveis = () => {
    setAviso(null);
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (todosVisiveisSelecionados) for (const a of filtrados) n.delete(a.id);
      else for (const a of filtrados) n.add(a.id);
      return n;
    });
  };
  const limparSelecao = () => { setSelecionados(new Set()); setAviso(null); };

  const animaisSelecionados = useMemo(
    () => animaisAtivos.filter((a) => selecionados.has(a.id)),
    [animaisAtivos, selecionados],
  );

  // ── Aplicar destino à seleção (qualquer animal → qualquer lote / sem lote) ─────
  const moverPara = (target: string) => {
    if (animaisSelecionados.length === 0) return;
    const elig =
      target === SEM_LOTE
        ? animaisSelecionados.filter((a) => currentLoteId(a) !== null)
        : animaisSelecionados.filter((a) => currentLoteId(a) !== target);
    setDestino((prev) => {
      const n = new Map(prev);
      for (const a of elig) n.set(a.id, target);
      return n;
    });
    setAviso(
      elig.length < animaisSelecionados.length
        ? `${elig.length} de ${animaisSelecionados.length} aplicado(s) — os demais já estão ${target === SEM_LOTE ? 'sem lote' : 'neste lote'}.`
        : null,
    );
  };
  const limparAcao = () => {
    setAviso(null);
    setDestino((prev) => {
      const n = new Map(prev);
      for (const id of selecionados) n.delete(id);
      return n;
    });
  };

  // ── Resumo das mudanças encenadas ─────────────────────────────────────────────
  const { nMover, nRemover } = useMemo(() => {
    let nMover = 0, nRemover = 0;
    for (const a of animaisAtivos) {
      const acao = acaoDe(a);
      if (acao === 'mover') nMover++;
      else if (acao === 'remover') nRemover++;
    }
    return { nMover, nRemover };
  }, [animaisAtivos, acaoDe]);

  const semAlteracoes = nMover + nRemover === 0;
  const temSelecao = selecionados.size > 0;

  // ── Salvar: monta os movimentos de alocação (cada draft fixa seu loteId) ───────
  const handleSave = async () => {
    if (semAlteracoes) {
      window.alert('Nenhuma alteração para salvar. Selecione animais e escolha um destino.');
      return;
    }
    const drafts: EventoDraft[] = [];

    // Mover/atribuir → ENTRADA no lote destino, por (destino, origem do ledger, categoria).
    const moveGroups = new Map<string, { destinoId: string; origem: string | null; catId: string | null; ids: string[] }>();
    // Remover → SAÍDA sem destino, no lote de origem, por (origem, categoria).
    const remGroups = new Map<string, { origem: string; catId: string | null; ids: string[] }>();

    for (const a of animaisAtivos) {
      const acao = acaoDe(a);
      if (acao === 'none') continue;
      const catId = a.categoriaId ?? null;
      if (acao === 'mover') {
        const destinoId = destino.get(a.id)!; // lote destino
        const origem = ledgerLoteId(a);        // null = entrada nova; outro lote = transferência
        const key = `${destinoId}|${origem ?? ''}|${catId ?? ''}`;
        const g = moveGroups.get(key) ?? { destinoId, origem, catId, ids: [] };
        g.ids.push(a.id);
        moveGroups.set(key, g);
      } else {
        const origem = currentLoteId(a);
        if (!origem) continue; // sem lote → nada a remover
        const key = `${origem}|${catId ?? ''}`;
        const g = remGroups.get(key) ?? { origem, catId, ids: [] };
        g.ids.push(a.id);
        remGroups.set(key, g);
      }
    }

    for (const g of moveGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true, loteId: g.destinoId,
        dados: {
          sentido: 'entrada', outroLoteId: g.origem, qtd: g.ids.length,
          categoriaId: g.catId, categoriaNome: catNome(g.catId) ?? undefined, naoIdent: 0, animais: g.ids,
        },
      });
    }
    for (const g of remGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true, loteId: g.origem,
        dados: {
          sentido: 'saida', outroLoteId: null, qtd: g.ids.length,
          categoriaId: g.catId, categoriaNome: catNome(g.catId) ?? undefined, naoIdent: 0, animais: g.ids,
        },
      });
    }

    setSaving(true);
    try {
      await onSubmit(drafts);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Manejo de lotes — animais por ID"
      subtitle="Todos os animais da fazenda — selecione e mova para qualquer lote"
      info="Selecione um ou mais animais e use “Mover para” para atribuí-los a um lote ou removê-los (fica sem lote). Vale para qualquer animal, esteja ele em qualquer lote. As mudanças só são aplicadas ao salvar."
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          <div className="mr-auto flex items-center gap-3 text-[12.5px] font-semibold">
            {nMover > 0 && <span className="inline-flex items-center gap-1 text-[#0891b2]"><ArrowLeftRight size={12} />{nMover} mover</span>}
            {nRemover > 0 && <span className="text-[#DC2626]">−{nRemover} remover</span>}
            {semAlteracoes && <span className="text-gray-400">Nenhuma alteração</span>}
          </div>
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || semAlteracoes}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#15803d] disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Salvar alterações
          </button>
        </>
      }
    >
      {/* Header de filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={labelCls}>Buscar</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="ID de manejo, brinco ou raça"
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>
        <div className="sm:w-56">
          <label className={labelCls}>Filtrar por lote</label>
          <MultiSelect label="Lote" options={loteOptions} selected={filtroLotes} onChange={setFiltroLotes} />
        </div>
        <div className="sm:w-56">
          <label className={labelCls}>Filtrar por categoria</label>
          <MultiSelect label="Categoria" options={catOptions} selected={filtroCats} onChange={setFiltroCats} />
        </div>
      </div>

      {/* Contagem + seleção dos visíveis */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-500">
          {filtrados.length} animal(is) {filtroAtivo ? 'filtrado(s)' : 'no plantel'}
          {temSelecao && <span className="ml-1 font-semibold text-gray-700">· {selecionados.size} selecionado(s)</span>}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={selecionarVisiveis} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
            <Check size={13} /> {todosVisiveisSelecionados ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
          </button>
          {temSelecao && (
            <button type="button" onClick={limparSelecao} className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-bold text-gray-600 hover:bg-gray-50">
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      {/* Barra de ações em massa */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-[#fafbfc] px-3 py-2">
        <span className="text-[12px] font-semibold text-gray-600">
          {temSelecao ? `${selecionados.size} selecionado(s)` : 'Selecione animais para aplicar uma ação'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MoverParaBtn lotesDestino={lotesDestino} disabled={!temSelecao} onPick={moverPara} />
          <button
            type="button"
            disabled={!temSelecao}
            onClick={limparAcao}
            className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Limpar ação
          </button>
        </div>
      </div>
      {aviso && <p className="-mt-1 text-[11.5px] font-semibold text-[#b45309]">{aviso}</p>}

      {/* Lista de animais */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-[#fafbfc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <span className="flex w-5 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={selecionarVisiveis}
              disabled={filtrados.length === 0}
              title={todosVisiveisSelecionados ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
              className={`flex h-4 w-4 items-center justify-center rounded border ${todosVisiveisSelecionados ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-gray-300 text-transparent'} disabled:opacity-40`}
            >
              <Check size={11} />
            </button>
          </span>
          <span className="w-36 shrink-0">ID de manejo</span>
          <span className="flex-1 min-w-0">Categoria</span>
          <span className="w-44 shrink-0 text-right">Lote atual</span>
          <span className="w-32 shrink-0 text-right">Destino</span>
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {animaisLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-gray-400">Nenhum animal encontrado com os filtros atuais.</div>
          ) : (
            filtrados.map((a) => {
              const cl = currentLoteId(a);
              const sel = selecionados.has(a.id);
              const acao = acaoDe(a);
              const rowBg =
                acao === 'mover' ? 'bg-[#ecfeff]'
                  : acao === 'remover' ? 'bg-[#fef2f2]'
                    : sel ? 'bg-gray-50' : 'hover:bg-gray-50';
              const acaoLabel =
                acao === 'remover' ? 'Remover'
                  : acao === 'mover' ? `→ ${loteCurto(destino.get(a.id)!)}` : '';
              // Reusa o AcaoBadge: 'mover' usa a cor de transferência (ciano).
              const badgeAcao = acao === 'mover' ? 'transferir' : acao === 'remover' ? 'remover' : 'none';
              return (
                <div
                  key={a.id}
                  className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 transition-colors last:border-0 ${rowBg}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSel(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${sel ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-gray-300 text-transparent'}`}>
                      <Check size={13} />
                    </span>
                    <span className="w-36 shrink-0 truncate font-mono text-[13px] font-bold text-gray-800">{a.apelido}</span>
                    <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-600">
                      {catNome(a.categoriaId) || '—'}
                      {a.raca && <span className="text-gray-400"> · {a.raca}</span>}
                    </span>
                    <span className="w-44 shrink-0 truncate text-right text-[12px]">
                      {cl ? (
                        <span className="text-gray-500">{loteLabel(cl)}</span>
                      ) : (
                        <span className="text-gray-400">Sem lote</span>
                      )}
                    </span>
                  </button>
                  <span className="flex w-32 shrink-0 justify-end">
                    <AcaoBadge acao={badgeAcao} label={acaoLabel} onClear={() => setDestino((prev) => { const n = new Map(prev); n.delete(a.id); return n; })} />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Data do movimento */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <label className={labelCls}>Data <span className="text-[#DC2626]">*</span></label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center pb-2.5 text-[11.5px] text-gray-400">
          <Tag size={13} className="mr-1 shrink-0" /> As movimentações viram movimentos de alocação.
        </div>
      </div>
    </ModalShell>
  );
};

export default ManejoLotesModal;
