import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Check, ChevronDown, Loader2, Tag } from 'lucide-react';
import type { Lote } from '../../../lib/api/lotesClient';
import type { CategoriaLookup, AnimalLite, LoteEventoRow } from './types';
import { todayISO, ledgerLoteByAnimal as buildLedgerMap, resolveLoteIdFromText } from './util';
import { resolveSituacao } from '../fichaAnimal/AnimalStatusBadge';
import { ModalShell, inputCls, labelCls, type EventoDraft } from './LoteModals';

/** Sentinelas dos filtros (animais sem vínculo / sem categoria). */
const SEM_LOTE = '__sem_lote__';
const SEM_CAT = '__sem_cat__';

// ── Lista suspensa com seleção múltipla ───────────────────────────────────────

const MultiSelect: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  emptyLabel?: string;
}> = ({ label, options, selected, onChange, emptyLabel = 'Todos' }) => {
  const [open, setOpen] = useState(false);
  const summary = selected.size === 0 ? emptyLabel : `${selected.size} selecionado${selected.size > 1 ? 's' : ''}`;
  const toggle = (v: string) => {
    const n = new Set(selected);
    if (n.has(v)) n.delete(v); else n.add(v);
    onChange(n);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm transition-colors ${selected.size ? 'border-[#16a34a] text-gray-800' : 'border-gray-200 text-gray-600'} hover:border-gray-300`}
      >
        <span className="truncate"><span className="font-semibold text-gray-700">{label}:</span> {summary}</span>
        <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-64 w-full min-w-[210px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
              {selected.size > 0 && (
                <button type="button" onClick={() => onChange(new Set())} className="text-[11.5px] font-semibold text-[#16a34a] hover:underline">
                  Limpar
                </button>
              )}
            </div>
            {options.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-gray-400">Sem opções.</p>
            ) : (
              options.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                  <span className="text-[13px] text-gray-700">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Tela: incluir / remover animais por ID ────────────────────────────────────

export const IncluirPorIdModal: React.FC<{
  lote: Lote;
  lotes: Lote[];
  categorias: CategoriaLookup[];
  animais: AnimalLite[];
  animaisLoading?: boolean;
  /** Eventos por lote — usado para derivar o lote atual de cada animal. */
  eventosByLote: Record<string, LoteEventoRow[]>;
  onClose: () => void;
  onSubmit: (eventos: EventoDraft[]) => Promise<void>;
}> = ({ lote, lotes, categorias, animais, animaisLoading, eventosByLote, onClose, onSubmit }) => {
  const [busca, setBusca] = useState('');
  const [filtroLotes, setFiltroLotes] = useState<Set<string>>(new Set());
  const [filtroCats, setFiltroCats] = useState<Set<string>>(new Set());
  const [data, setData] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const loteById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);
  const catNome = useCallback((id: string | null) => categorias.find((c) => c.id === id)?.nome, [categorias]);
  const loteLabel = useCallback((id: string) => {
    const l = loteById.get(id);
    if (!l) return id;
    return l.codigo ? `${l.codigo} · ${l.nome}` : l.nome;
  }, [loteById]);

  // Lote atual derivado do ledger (vínculo por ID); fallback no texto da ficha.
  const ledger = useMemo(() => buildLedgerMap(eventosByLote), [eventosByLote]);
  const currentLoteId = useCallback(
    (a: AnimalLite): string | null => ledger.get(a.id) ?? resolveLoteIdFromText(a.lote, lotes),
    [ledger, lotes],
  );

  // Só animais no plantel (exclui morte/venda).
  const animaisAtivos = useMemo(
    () => animais.filter((a) => resolveSituacao(a.situacao) === 'ativo'),
    [animais],
  );

  // Estado desejado: conjunto de IDs que devem ficar NESTE lote.
  const initialDesired = useMemo(() => {
    const s = new Set<string>();
    for (const a of animaisAtivos) if (currentLoteId(a) === lote.id) s.add(a.id);
    return s;
  }, [animaisAtivos, currentLoteId, lote.id]);

  const [desired, setDesired] = useState<Set<string>>(initialDesired);
  useEffect(() => { setDesired(initialDesired); }, [initialDesired]);

  const toggle = (id: string) =>
    setDesired((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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

  const marcarVisiveis = () =>
    setDesired((prev) => {
      const n = new Set(prev);
      for (const a of filtrados) n.add(a.id);
      return n;
    });
  const desmarcarVisiveis = () =>
    setDesired((prev) => {
      const n = new Set(prev);
      for (const a of filtrados) n.delete(a.id);
      return n;
    });

  // ── Diff (o que será incluído / removido ao salvar) ──────────────────────────
  const { adds, removes } = useMemo(() => {
    const adds: AnimalLite[] = [];
    const removes: AnimalLite[] = [];
    for (const a of animaisAtivos) {
      const inLote = currentLoteId(a) === lote.id;
      const want = desired.has(a.id);
      if (want && !inLote) adds.push(a);
      else if (!want && inLote) removes.push(a);
    }
    return { adds, removes };
  }, [animaisAtivos, desired, currentLoteId, lote.id]);

  const handleSave = async () => {
    if (adds.length === 0 && removes.length === 0) {
      window.alert('Nenhuma alteração para salvar. Marque ou desmarque animais.');
      return;
    }
    const drafts: EventoDraft[] = [];

    // Inclusões: um evento de ENTRADA por (origem, categoria).
    const addGroups = new Map<string, { origem: string | null; catId: string | null; ids: string[] }>();
    for (const a of adds) {
      const origem = currentLoteId(a); // null = entrada nova; outro lote = transferência
      const catId = a.categoriaId ?? null;
      const key = `${origem ?? ''}|${catId ?? ''}`;
      const g = addGroups.get(key) ?? { origem, catId, ids: [] };
      g.ids.push(a.id);
      addGroups.set(key, g);
    }
    for (const g of addGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true,
        dados: {
          sentido: 'entrada', outroLoteId: g.origem, qtd: g.ids.length,
          categoriaId: g.catId, categoriaNome: catNome(g.catId) ?? undefined, naoIdent: 0, animais: g.ids,
        },
      });
    }

    // Remoções: um evento de SAÍDA (sem destino → "sem lote") por categoria.
    const remGroups = new Map<string, { catId: string | null; ids: string[] }>();
    for (const a of removes) {
      const catId = a.categoriaId ?? null;
      const key = catId ?? '';
      const g = remGroups.get(key) ?? { catId, ids: [] };
      g.ids.push(a.id);
      remGroups.set(key, g);
    }
    for (const g of remGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true,
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

  const semAlteracoes = adds.length === 0 && removes.length === 0;

  return (
    <ModalShell
      title="Incluir / remover animais por ID"
      subtitle={`Lote ${lote.codigo || lote.nome} — marque para incluir, desmarque para remover`}
      info="Marque um animal para incluí-lo neste lote (se estiver em outro lote, ele é transferido). Desmarque um animal deste lote para removê-lo (fica sem lote). As mudanças só são aplicadas ao salvar."
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          <div className="mr-auto flex items-center gap-3 text-[12.5px] font-semibold">
            {adds.length > 0 && <span className="text-[#16a34a]">+{adds.length} incluir</span>}
            {removes.length > 0 && <span className="text-[#DC2626]">−{removes.length} remover</span>}
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

      {/* Ações em massa sobre os filtrados */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-500">
          {filtrados.length} animal(is) {(busca || filtroLotes.size || filtroCats.size) ? 'filtrado(s)' : 'no plantel'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={marcarVisiveis} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#16a34a] bg-[#e7f6ec] px-2.5 text-[12px] font-bold text-[#16a34a] hover:bg-[#d6f0df]">
            <Check size={13} /> Marcar visíveis
          </button>
          <button type="button" onClick={desmarcarVisiveis} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-bold text-gray-600 hover:bg-gray-50">
            Desmarcar visíveis
          </button>
        </div>
      </div>

      {/* Lista de animais */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-[#fafbfc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <span className="w-5 shrink-0" />
          <span className="w-36 shrink-0">ID de manejo</span>
          <span className="flex-1 min-w-0">Categoria</span>
          <span className="w-44 shrink-0 text-right">Lote atual</span>
          <span className="w-20 shrink-0 text-right">Ação</span>
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {animaisLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-gray-400">Nenhum animal encontrado com os filtros atuais.</div>
          ) : (
            filtrados.map((a) => {
              const cl = currentLoteId(a);
              const inLote = cl === lote.id;
              const want = desired.has(a.id);
              const willAdd = want && !inLote;
              const willRemove = !want && inLote;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-0 ${want ? 'bg-[#f1faf4]' : 'hover:bg-gray-50'}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${want ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-gray-300 text-transparent'}`}>
                    <Check size={13} />
                  </span>
                  <span className="w-36 shrink-0 truncate font-mono text-[13px] font-bold text-gray-800">{a.apelido}</span>
                  <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-600">
                    {catNome(a.categoriaId) || '—'}
                    {a.raca && <span className="text-gray-400"> · {a.raca}</span>}
                  </span>
                  <span className="w-44 shrink-0 truncate text-right text-[12px]">
                    {inLote ? (
                      <span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 font-semibold text-[#16a34a]">Neste lote</span>
                    ) : cl ? (
                      <span className="text-gray-500">{loteLabel(cl)}</span>
                    ) : (
                      <span className="text-gray-400">Sem lote</span>
                    )}
                  </span>
                  <span className="w-20 shrink-0 text-right">
                    {willAdd && <span className="text-[11.5px] font-bold text-[#16a34a]">+ incluir</span>}
                    {willRemove && <span className="text-[11.5px] font-bold text-[#DC2626]">− remover</span>}
                  </span>
                </button>
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
          <Tag size={13} className="mr-1 shrink-0" /> Inclusões e remoções viram movimentos de alocação.
        </div>
      </div>
    </ModalShell>
  );
};

export default IncluirPorIdModal;
