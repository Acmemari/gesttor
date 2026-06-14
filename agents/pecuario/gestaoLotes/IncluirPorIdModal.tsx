import React, { useCallback, useMemo, useState } from 'react';
import { Search, Check, ChevronDown, Loader2, Tag, ArrowLeftRight, X, Plus, Minus, Trash2, BadgeCheck, AlertTriangle } from 'lucide-react';
import type { Lote } from '../../../lib/api/lotesClient';
import type { CategoriaLookup, AnimalLite, LoteEventoRow } from './types';
import { todayISO, ledgerLoteByAnimal as buildLedgerMap, resolveLoteIdFromText, pendenciasPorCategoria } from './util';
import { resolveSituacao } from '../fichaAnimal/AnimalStatusBadge';
import { ModalShell, inputCls, labelCls, type EventoDraft } from './LoteModals';
import IconCardButton from '../../../components/IconCardButton';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';

/** Sentinelas dos filtros (animais sem vínculo / sem categoria). */
const SEM_LOTE = '__sem_lote__';
const SEM_CAT = '__sem_cat__';

/** Ação encenada por animal (derivada do destino). */
export type Acao = 'none' | 'incluir' | 'remover' | 'transferir';

/**
 * Operação encenada sobre as cabeças SEM identificação (incluídas por categoria).
 * Espelha a gestão por ID, porém em quantidades por categoria:
 *  - baixar:      saída sem destino (corrige/baixa cabeças).
 *  - transferir:  saída daqui + entrada no lote destino.
 *  - identificar: vincula animais por ID (entrada por ID) e abate a pendência (saída naoIdent).
 */
export type CatOp =
  | { kind: 'baixar'; catId: string | null; catNome: string; qtd: number }
  | { kind: 'transferir'; catId: string | null; catNome: string; qtd: number; destinoLoteId: string }
  | { kind: 'identificar'; catId: string | null; catNome: string; animalIds: string[] };

/** Chave de identidade de uma operação por categoria (para mesclar/remover). */
const catOpKey = (op: CatOp): string =>
  `${op.kind}|${op.catId ?? ''}|${op.kind === 'transferir' ? op.destinoLoteId : ''}`;

/** Chave estável de categoria (id; senão snapshot do nome) — casa com util/pendenciasPorCategoria. */
const catKeyOf = (catId: string | null, nome?: string): string => catId || `@${nome ?? ''}`;

// ── Lista suspensa com seleção múltipla (filtros) ─────────────────────────────

export const MultiSelect: React.FC<{
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

// ── Botão "Transferir para" (escolhe o lote destino e aplica) ─────────────────

const TransferirParaBtn: React.FC<{
  outrosLotes: Lote[];
  disabled: boolean;
  onPick: (loteId: string) => void;
}> = ({ outrosLotes, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0891b2] bg-[#e0f5fb] px-2.5 text-[12px] font-bold text-[#0891b2] hover:bg-[#cdeef7] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeftRight size={13} /> Transferir para <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Transferir para</div>
            {outrosLotes.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-gray-400">Não há outros lotes.</p>
            ) : (
              outrosLotes.map((l) => (
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

// ── Badge da ação encenada (na coluna "Ação") ─────────────────────────────────

export const AcaoBadge: React.FC<{ acao: Acao; label: string; onClear: () => void }> = ({ acao, label, onClear }) => {
  if (acao === 'none') return <span className="text-[12px] text-gray-300">—</span>;
  const cls =
    acao === 'incluir' ? 'bg-[#e7f6ec] text-[#16a34a]'
      : acao === 'remover' ? 'bg-[#fdeaea] text-[#DC2626]'
        : 'bg-[#e0f5fb] text-[#0891b2]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11.5px] font-bold ${cls}`}>
      {label}
      <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }} className="rounded-full p-0.5 hover:bg-black/10" title="Desfazer">
        <X size={11} />
      </button>
    </span>
  );
};

// ── Botão de ação por categoria (Baixar / Transferir / Identificar) ───────────

const CatAcaoBtn: React.FC<{
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  cor: 'red' | 'cyan' | 'green';
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, cor, icon, children }) => {
  const base =
    cor === 'red' ? 'border-[#DC2626] text-[#DC2626] hover:bg-[#fdeaea]'
      : cor === 'cyan' ? 'border-[#0891b2] text-[#0891b2] hover:bg-[#e0f5fb]'
        : 'border-[#16a34a] text-[#16a34a] hover:bg-[#e7f6ec]';
  const activeBg = cor === 'red' ? 'bg-[#fdeaea]' : cor === 'cyan' ? 'bg-[#e0f5fb]' : 'bg-[#e7f6ec]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${base} ${active ? activeBg : ''}`}
    >
      {icon}{children}
    </button>
  );
};

// ── Tela: incluir / transferir / remover animais por ID ───────────────────────

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

  // Seleção transitória (caixas marcadas) para a barra de ações.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  // Mudanças ENCENADAS por animal: id → destino. Ausente = sem mudança.
  //   valor = lote.id (incluir) | SEM_LOTE (remover) | outroLoteId (transferir).
  const [destino, setDestino] = useState<Map<string, string>>(new Map());
  // Aviso quando parte da seleção é ignorada por não se aplicar à ação.
  const [aviso, setAviso] = useState<string | null>(null);

  // ── Modo de inclusão: por indivíduo (por ID) | por categoria (coletivo) ───────
  const [modo, setModo] = useState<'individuo' | 'categoria'>('individuo');
  // Inclusões por categoria encenadas (entram como cabeças a identificar).
  const [catDecl, setCatDecl] = useState<{ catId: string; qtd: number }[]>([]);
  // Linha de input transitória do modo "por categoria".
  const [catSel, setCatSel] = useState('');
  const [qtdStr, setQtdStr] = useState('');

  // ── Gestão das cabeças SEM identificação (incluídas por categoria) ─────────────
  // Operações encenadas (baixar / transferir / identificar) — aplicadas ao salvar.
  const [catOps, setCatOps] = useState<CatOp[]>([]);
  // Editor inline ativo: qual categoria + qual ação está sendo composta.
  const [edAtivo, setEdAtivo] = useState<{ catKey: string; kind: 'baixar' | 'transferir' | 'identificar' } | null>(null);
  const [edQtd, setEdQtd] = useState('');           // quantidade (baixar/transferir)
  const [edDestino, setEdDestino] = useState('');   // lote destino (transferir)
  const [edAnimais, setEdAnimais] = useState<Set<string>>(new Set()); // animais (identificar)

  const loteById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);
  const outrosLotes = useMemo(() => lotes.filter((l) => l.id !== lote.id), [lotes, lote.id]);
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
  // Origem só do ledger (para o outroLoteId da inclusão — null se vínculo é só texto).
  const ledgerLoteId = useCallback((a: AnimalLite): string | null => ledger.get(a.id) ?? null, [ledger]);
  const isInThisLote = useCallback((a: AnimalLite) => currentLoteId(a) === lote.id, [currentLoteId, lote.id]);

  // Só animais no plantel (exclui morte/venda).
  const animaisAtivos = useMemo(
    () => animais.filter((a) => resolveSituacao(a.situacao) === 'ativo'),
    [animais],
  );

  // Ação encenada de um animal (a partir do mapa `destino`).
  const acaoDe = useCallback((a: AnimalLite): Acao => {
    const t = destino.get(a.id);
    if (t === undefined) return 'none';
    if (t === lote.id) return 'incluir';
    if (t === SEM_LOTE) return 'remover';
    return 'transferir';
  }, [destino, lote.id]);

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

  // ── Aplicar ações à seleção (relativo ao lote aberto) ─────────────────────────
  const aplicarDestino = (elegiveis: AnimalLite[], valor: string) =>
    setDestino((prev) => {
      const n = new Map(prev);
      for (const a of elegiveis) n.set(a.id, valor);
      return n;
    });

  const notaIgnorados = (aplicados: number, total: number, motivo: string) =>
    setAviso(aplicados < total ? `${aplicados} de ${total} aplicado(s) — ${motivo}.` : null);

  const aplicarIncluir = () => {
    const elig = animaisSelecionados.filter((a) => !isInThisLote(a));
    if (animaisSelecionados.length === 0) return;
    aplicarDestino(elig, lote.id);
    notaIgnorados(elig.length, animaisSelecionados.length, 'os demais já estão neste lote');
  };
  const aplicarRemover = () => {
    const elig = animaisSelecionados.filter((a) => isInThisLote(a));
    if (animaisSelecionados.length === 0) return;
    aplicarDestino(elig, SEM_LOTE);
    notaIgnorados(elig.length, animaisSelecionados.length, 'só animais deste lote podem ser removidos');
  };
  const aplicarTransferir = (loteX: string) => {
    const elig = animaisSelecionados.filter((a) => isInThisLote(a));
    if (animaisSelecionados.length === 0) return;
    aplicarDestino(elig, loteX);
    notaIgnorados(elig.length, animaisSelecionados.length, 'só animais deste lote podem ser transferidos');
  };
  const limparAcao = () => {
    setAviso(null);
    setDestino((prev) => {
      const n = new Map(prev);
      for (const id of selecionados) n.delete(id);
      return n;
    });
  };

  // ── Inclusão por categoria (coletivo) ─────────────────────────────────────────
  // Quantidade válida = inteiro ≥ 1 (espelha o "addCat" das telas de movimentação).
  const qtdNum = useMemo(() => {
    const n = Number(qtdStr);
    return Number.isInteger(n) && n >= 1 ? n : 0;
  }, [qtdStr]);
  const catAddValido = !!catSel && qtdNum >= 1;

  const addCat = () => {
    if (!catAddValido) return;
    setCatDecl((prev) => {
      const existing = prev.find((c) => c.catId === catSel);
      if (existing) return prev.map((c) => (c === existing ? { ...c, qtd: c.qtd + qtdNum } : c));
      return [...prev, { catId: catSel, qtd: qtdNum }];
    });
    setCatSel('');
    setQtdStr('');
  };
  const removeCat = (catId: string) => setCatDecl((prev) => prev.filter((c) => c.catId !== catId));

  // ── Gestão das cabeças sem ID: composição atual + disponível por categoria ─────
  const eventosDoLote = useMemo(() => eventosByLote[lote.id] ?? [], [eventosByLote, lote.id]);
  const pendCats = useMemo(() => pendenciasPorCategoria(eventosDoLote), [eventosDoLote]);
  // Destinos válidos para transferir cabeças: outros lotes não encerrados.
  const lotesDestino = useMemo(() => outrosLotes.filter((l) => !l.finalizado), [outrosLotes]);

  // Cabeças já comprometidas em operações encenadas, por categoria.
  const stagedOutByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const op of catOps) {
      const k = catKeyOf(op.catId, op.catNome);
      const q = op.kind === 'identificar' ? op.animalIds.length : op.qtd;
      m.set(k, (m.get(k) ?? 0) + q);
    }
    return m;
  }, [catOps]);

  // Disponível = pendência atual da categoria − comprometido nas operações.
  const disponivelDe = useCallback(
    (row: { categoriaId: string | null; categoriaNome?: string; qtd: number }) =>
      Math.max(0, row.qtd - (stagedOutByCat.get(catKeyOf(row.categoriaId, row.categoriaNome)) ?? 0)),
    [stagedOutByCat],
  );

  // Animais já escolhidos em "identificar" (não reofertar no seletor).
  const idsJaIdentificando = useMemo(() => {
    const s = new Set<string>();
    for (const op of catOps) if (op.kind === 'identificar') for (const id of op.animalIds) s.add(id);
    return s;
  }, [catOps]);

  // Animais disponíveis (ativos, sem lote, da categoria) para identificar.
  const animaisParaIdentificar = useCallback(
    (catId: string | null) =>
      animaisAtivos.filter(
        (a) => a.categoriaId === catId && currentLoteId(a) === null && !destino.has(a.id) && !idsJaIdentificando.has(a.id),
      ),
    [animaisAtivos, currentLoteId, destino, idsJaIdentificando],
  );

  // Mescla/empilha uma operação (mesma chave soma qtd; identificar une os IDs).
  // Chaves iguais ⇒ mesmo `kind` (e mesmo destino, p/ transferir).
  const addCatOp = (op: CatOp) =>
    setCatOps((prev) => {
      const key = catOpKey(op);
      const idx = prev.findIndex((o) => catOpKey(o) === key);
      if (idx < 0) return [...prev, op];
      const cur = prev[idx];
      let merged: CatOp = op;
      if (op.kind === 'identificar' && cur.kind === 'identificar') {
        merged = { ...cur, animalIds: Array.from(new Set([...cur.animalIds, ...op.animalIds])) };
      } else if (op.kind !== 'identificar' && cur.kind !== 'identificar') {
        merged = { ...cur, qtd: cur.qtd + op.qtd };
      }
      const copy = [...prev];
      copy[idx] = merged;
      return copy;
    });
  const removeCatOp = (idx: number) => setCatOps((prev) => prev.filter((_, i) => i !== idx));

  // Editor inline por categoria (abrir/fechar/confirmar).
  const abrirEditor = (catKey: string, kind: 'baixar' | 'transferir' | 'identificar') => {
    setEdAtivo({ catKey, kind });
    setEdQtd('');
    setEdDestino('');
    setEdAnimais(new Set());
  };
  const fecharEditor = () => setEdAtivo(null);
  const toggleEdAnimal = (id: string) =>
    setEdAnimais((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const confirmarEditor = (row: { categoriaId: string | null; categoriaNome?: string }, disp: number) => {
    if (!edAtivo) return;
    const nomeSnap = row.categoriaNome || catNome(row.categoriaId) || 'Sem categoria';
    if (edAtivo.kind === 'identificar') {
      const ids = Array.from(edAnimais);
      if (ids.length === 0) return;
      addCatOp({ kind: 'identificar', catId: row.categoriaId, catNome: nomeSnap, animalIds: ids });
    } else {
      const n = Number(edQtd);
      const qtd = Number.isInteger(n) ? Math.min(n, disp) : 0;
      if (qtd < 1) return;
      if (edAtivo.kind === 'transferir') {
        if (!edDestino) return;
        addCatOp({ kind: 'transferir', catId: row.categoriaId, catNome: nomeSnap, qtd, destinoLoteId: edDestino });
      } else {
        addCatOp({ kind: 'baixar', catId: row.categoriaId, catNome: nomeSnap, qtd });
      }
    }
    fecharEditor();
  };

  // ── Resumo das mudanças encenadas ─────────────────────────────────────────────
  const { nIncluir, nTransferir, nRemover } = useMemo(() => {
    let nIncluir = 0, nTransferir = 0, nRemover = 0;
    for (const a of animaisAtivos) {
      const acao = acaoDe(a);
      if (acao === 'incluir') nIncluir++;
      else if (acao === 'transferir') nTransferir++;
      else if (acao === 'remover') nRemover++;
    }
    return { nIncluir, nTransferir, nRemover };
  }, [animaisAtivos, acaoDe]);

  // Total de cabeças incluídas por categoria (coletivo, sem identificação).
  const nCatIncluir = useMemo(() => catDecl.reduce((s, c) => s + c.qtd, 0), [catDecl]);

  // Totais das operações de gestão por categoria (baixar / transferir / identificar).
  const { nCatBaixar, nCatTransferir, nCatIdentificar } = useMemo(() => {
    let b = 0, t = 0, i = 0;
    for (const op of catOps) {
      if (op.kind === 'baixar') b += op.qtd;
      else if (op.kind === 'transferir') t += op.qtd;
      else i += op.animalIds.length;
    }
    return { nCatBaixar: b, nCatTransferir: t, nCatIdentificar: i };
  }, [catOps]);

  const semAlteracoes =
    nIncluir + nTransferir + nRemover + nCatIncluir + nCatBaixar + nCatTransferir + nCatIdentificar === 0;
  const temSelecao = selecionados.size > 0;

  // ── Salvar: monta os movimentos de alocação ───────────────────────────────────
  const handleSave = async () => {
    if (semAlteracoes) {
      window.alert('Nenhuma alteração para salvar. Selecione animais e escolha uma ação, ou inclua animais por categoria.');
      return;
    }
    const drafts: EventoDraft[] = [];

    // 1) Inclusões → ENTRADA neste lote, por (origem do ledger, categoria).
    const addGroups = new Map<string, { origem: string | null; catId: string | null; ids: string[] }>();
    // 2) Remoções → SAÍDA sem destino, por categoria.
    const remGroups = new Map<string, { catId: string | null; ids: string[] }>();
    // 3) Transferências → SAÍDA com destino X, por (X, categoria).
    const transGroups = new Map<string, { destinoId: string; catId: string | null; ids: string[] }>();

    for (const a of animaisAtivos) {
      const acao = acaoDe(a);
      if (acao === 'none') continue;
      const catId = a.categoriaId ?? null;
      if (acao === 'incluir') {
        const origem = ledgerLoteId(a); // null = entrada nova; outro lote = transferência p/ cá
        const key = `${origem ?? ''}|${catId ?? ''}`;
        const g = addGroups.get(key) ?? { origem, catId, ids: [] };
        g.ids.push(a.id);
        addGroups.set(key, g);
      } else if (acao === 'remover') {
        const key = catId ?? '';
        const g = remGroups.get(key) ?? { catId, ids: [] };
        g.ids.push(a.id);
        remGroups.set(key, g);
      } else {
        const destinoId = destino.get(a.id)!; // lote X
        const key = `${destinoId}|${catId ?? ''}`;
        const g = transGroups.get(key) ?? { destinoId, catId, ids: [] };
        g.ids.push(a.id);
        transGroups.set(key, g);
      }
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
    for (const g of remGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true,
        dados: {
          sentido: 'saida', outroLoteId: null, qtd: g.ids.length,
          categoriaId: g.catId, categoriaNome: catNome(g.catId) ?? undefined, naoIdent: 0, animais: g.ids,
        },
      });
    }
    for (const g of transGroups.values()) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: true,
        dados: {
          sentido: 'saida', outroLoteId: g.destinoId, qtd: g.ids.length,
          categoriaId: g.catId, categoriaNome: catNome(g.catId) ?? undefined, naoIdent: 0, animais: g.ids,
        },
      });
    }

    // 4) Inclusões por categoria → ENTRADA nova, cabeças sem identificação (Mesa).
    for (const c of catDecl) {
      drafts.push({
        tipo: 'alocacao', data, resp: null, syncFichas: false,
        dados: {
          sentido: 'entrada', outroLoteId: null, qtd: c.qtd,
          categoriaId: c.catId, categoriaNome: catNome(c.catId) ?? undefined, naoIdent: c.qtd, animais: [],
        },
      });
    }

    // 5) Gestão das cabeças sem ID já existentes (baixar / transferir / identificar).
    for (const op of catOps) {
      const nomeSnap = op.catNome || catNome(op.catId) || undefined;
      if (op.kind === 'baixar') {
        // Saída sem destino → abate a pendência da categoria.
        drafts.push({
          tipo: 'alocacao', data, resp: null, syncFichas: false,
          dados: {
            sentido: 'saida', outroLoteId: null, qtd: op.qtd,
            categoriaId: op.catId, categoriaNome: nomeSnap, naoIdent: op.qtd, animais: [],
          },
        });
      } else if (op.kind === 'transferir') {
        // Saída daqui com destino → o repositório grava o espelho (entrada com
        // naoIdent) no lote destino; as cabeças seguem sem ID lá.
        drafts.push({
          tipo: 'alocacao', data, resp: null, syncFichas: false,
          dados: {
            sentido: 'saida', outroLoteId: op.destinoLoteId, qtd: op.qtd,
            categoriaId: op.catId, categoriaNome: nomeSnap, naoIdent: op.qtd, animais: [],
          },
        });
      } else {
        // Identificar: entra por ID (vincula os animais) e abate a pendência.
        const ids = op.animalIds;
        if (ids.length === 0) continue;
        drafts.push({
          tipo: 'alocacao', data, resp: null, syncFichas: true,
          dados: {
            sentido: 'entrada', outroLoteId: null, qtd: ids.length,
            categoriaId: op.catId, categoriaNome: nomeSnap, naoIdent: 0, animais: ids,
          },
        });
        drafts.push({
          tipo: 'alocacao', data, resp: null, syncFichas: false,
          dados: {
            sentido: 'saida', outroLoteId: null, qtd: ids.length,
            categoriaId: op.catId, categoriaNome: nomeSnap, naoIdent: ids.length, animais: [],
          },
        });
      }
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
      title="Compor lote — incluir, transferir ou remover animais"
      subtitle={`Lote ${lote.codigo || lote.nome} — por indivíduo (por ID) ou por categoria`}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          <div className="mr-auto flex items-center gap-3 text-[12.5px] font-semibold">
            {nIncluir > 0 && <span className="text-[#16a34a]">+{nIncluir} incluir</span>}
            {nTransferir > 0 && <span className="inline-flex items-center gap-1 text-[#0891b2]"><ArrowLeftRight size={12} />{nTransferir} transferir</span>}
            {nRemover > 0 && <span className="text-[#DC2626]">−{nRemover} remover</span>}
            {nCatIncluir > 0 && <span className="inline-flex items-center gap-1 text-[#16a34a]"><Tag size={12} />+{nCatIncluir} por categoria</span>}
            {nCatBaixar > 0 && <span className="inline-flex items-center gap-1 text-[#DC2626]"><Minus size={12} />{nCatBaixar} baixar</span>}
            {nCatTransferir > 0 && <span className="inline-flex items-center gap-1 text-[#0891b2]"><ArrowLeftRight size={12} />{nCatTransferir} transf. (cat.)</span>}
            {nCatIdentificar > 0 && <span className="inline-flex items-center gap-1 text-[#16a34a]"><BadgeCheck size={12} />{nCatIdentificar} identificar</span>}
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
      {/* Alternância de modo: por indivíduo (por ID) × por categoria (coletivo) */}
      <div className="flex items-center gap-2">
        <IconCardButton
          active={modo === 'individuo'}
          onClick={() => setModo('individuo')}
          title="Por indivíduo (por ID)"
          icon={<BrincoBovinoIcon size={22} />}
        />
        <IconCardButton
          active={modo === 'categoria'}
          onClick={() => setModo('categoria')}
          title="Por categoria (coletivo)"
          icon={<LoteAnimaisIcon size={26} />}
        />
        <span className="ml-1 text-[12.5px] font-semibold text-gray-600">
          {modo === 'individuo'
            ? 'Por indivíduo — incluir, transferir ou remover por ID'
            : 'Por categoria — incluir, baixar, transferir ou identificar cabeças sem ID'}
        </span>
      </div>

      {modo === 'individuo' && (
        <>
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
          <button
            type="button"
            disabled={!temSelecao}
            onClick={aplicarIncluir}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#16a34a] bg-[#e7f6ec] px-2.5 text-[12px] font-bold text-[#16a34a] hover:bg-[#d6f0df] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={13} /> Incluir aqui
          </button>
          <TransferirParaBtn outrosLotes={outrosLotes} disabled={!temSelecao} onPick={aplicarTransferir} />
          <button
            type="button"
            disabled={!temSelecao}
            onClick={aplicarRemover}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DC2626] bg-[#fdeaea] px-2.5 text-[12px] font-bold text-[#DC2626] hover:bg-[#fbdada] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remover do lote
          </button>
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
          <span className="w-32 shrink-0 text-right">Ação</span>
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
              const sel = selecionados.has(a.id);
              const acao = acaoDe(a);
              const rowBg =
                acao === 'incluir' ? 'bg-[#f1faf4]'
                  : acao === 'transferir' ? 'bg-[#ecfeff]'
                    : acao === 'remover' ? 'bg-[#fef2f2]'
                      : sel ? 'bg-gray-50' : 'hover:bg-gray-50';
              const acaoLabel =
                acao === 'incluir' ? 'Incluir'
                  : acao === 'remover' ? 'Remover'
                    : acao === 'transferir' ? `→ ${loteCurto(destino.get(a.id)!)}` : '';
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
                      {inLote ? (
                        <span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 font-semibold text-[#16a34a]">Neste lote</span>
                      ) : cl ? (
                        <span className="text-gray-500">{loteLabel(cl)}</span>
                      ) : (
                        <span className="text-gray-400">Sem lote</span>
                      )}
                    </span>
                  </button>
                  <span className="flex w-32 shrink-0 justify-end">
                    <AcaoBadge acao={acao} label={acaoLabel} onClear={() => setDestino((prev) => { const n = new Map(prev); n.delete(a.id); return n; })} />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
        </>
      )}

      {/* Modo por categoria: incluir + gerir as cabeças sem identificação */}
      {modo === 'categoria' && (
        categorias.length === 0 && pendCats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-[#fafbfc] px-4 py-10 text-center text-[12.5px] text-gray-400">
            Cadastre categorias primeiro (Cadastros › Categorias) para incluir por categoria.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* ── Bloco 1: incluir cabeças por categoria ──────────────────────── */}
            {categorias.length > 0 && (
              <section className="flex flex-col gap-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Incluir cabeças por categoria</h4>

                {/* Linha de input: categoria + quantidade + adicionar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className={labelCls}>Categoria <span className="text-[#DC2626]">*</span></label>
                    <select value={catSel} onChange={(e) => setCatSel(e.target.value)} className={inputCls}>
                      <option value="">Selecione a categoria</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:w-36">
                    <label className={labelCls}>
                      Quantidade <span className="text-[#DC2626]">*</span> <span className="font-medium text-gray-400">(cab.)</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={qtdStr}
                      onChange={(e) => setQtdStr(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }}
                      placeholder="Ex.: 30"
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCat}
                    disabled={!catAddValido}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#16a34a] bg-white px-3.5 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                  >
                    <Plus size={16} /> adicionar
                  </button>
                </div>

                {/* Lista de inclusões por categoria encenadas */}
                {catDecl.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3 border-b border-gray-200 bg-[#fafbfc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      <span className="flex-1 min-w-0">Categoria</span>
                      <span className="w-24 shrink-0 text-right">Quantidade</span>
                      <span className="w-10 shrink-0" />
                    </div>
                    {catDecl.map((c) => (
                      <div key={c.catId} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0">
                        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-gray-800">{catNome(c.catId) || 'Sem categoria'}</span>
                        <span className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-gray-800">{c.qtd} cab.</span>
                        <span className="flex w-10 shrink-0 justify-end">
                          <button type="button" onClick={() => removeCat(c.catId)} title="Remover" className="rounded-lg p-1.5 text-gray-400 hover:bg-[#fdeaea] hover:text-[#DC2626]">
                            <Trash2 size={15} />
                          </button>
                        </span>
                      </div>
                    ))}
                    {nCatIncluir > 0 && (
                      <div className="flex items-center justify-between border-t border-gray-200 bg-[#fafbfc] px-3 py-2 text-[12px] font-semibold text-gray-600">
                        <span>Total a incluir</span>
                        <span className="text-[#16a34a]">{nCatIncluir} cab.</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="flex items-center gap-1.5 text-[11.5px] text-[#b45309]">
                  <AlertTriangle size={13} className="shrink-0" /> Entram como cabeças sem identificação (pendência na Mesa) até serem vinculadas por ID.
                </p>
              </section>
            )}

            {/* ── Bloco 2: gerir as cabeças sem identificação do lote ─────────── */}
            <section className="flex flex-col gap-3">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Gerir cabeças sem identificação neste lote</h4>
                <p className="mt-0.5 text-[12px] text-gray-500">Baixe, transfira ou identifique (vincule por ID) as cabeças que entraram por categoria.</p>
              </div>

              {pendCats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-[#fafbfc] px-4 py-8 text-center text-[12.5px] text-gray-400">
                  Nenhuma cabeça sem identificação neste lote. As inclusões por categoria aparecem aqui para baixar, transferir ou identificar.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-3 border-b border-gray-200 bg-[#fafbfc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    <span className="flex-1 min-w-0">Categoria</span>
                    <span className="w-24 shrink-0 text-right">Sem ID</span>
                    <span className="w-[280px] shrink-0 text-right">Ações</span>
                  </div>
                  {pendCats.map((row) => {
                    const ck = catKeyOf(row.categoriaId, row.categoriaNome);
                    const disp = disponivelDe(row);
                    const aberto = edAtivo?.catKey === ck;
                    const nome = row.categoriaNome || catNome(row.categoriaId) || 'Sem categoria';
                    const listaIdent =
                      aberto && edAtivo?.kind === 'identificar' ? animaisParaIdentificar(row.categoriaId) : [];
                    const edQtdNum = Number(edQtd);
                    const edQtdValido = Number.isInteger(edQtdNum) && edQtdNum >= 1 && edQtdNum <= disp;
                    return (
                      <div key={ck} className="border-b border-gray-100 last:border-0">
                        <div className={`flex items-center gap-3 px-3 py-2.5 ${aberto ? 'bg-[#fafbfc]' : ''}`}>
                          <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-gray-800">{nome}</span>
                          <span className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-gray-800">
                            {disp}
                            {disp !== row.qtd && <span className="font-normal text-gray-400"> / {row.qtd}</span>}
                            <span className="font-normal text-gray-400"> cab.</span>
                          </span>
                          <span className="flex w-[280px] shrink-0 items-center justify-end gap-1.5">
                            <CatAcaoBtn cor="red" active={aberto && edAtivo?.kind === 'baixar'} disabled={disp < 1} onClick={() => abrirEditor(ck, 'baixar')} icon={<Minus size={13} />}>Baixar</CatAcaoBtn>
                            <CatAcaoBtn cor="cyan" active={aberto && edAtivo?.kind === 'transferir'} disabled={disp < 1 || lotesDestino.length === 0} onClick={() => abrirEditor(ck, 'transferir')} icon={<ArrowLeftRight size={13} />}>Transferir</CatAcaoBtn>
                            <CatAcaoBtn cor="green" active={aberto && edAtivo?.kind === 'identificar'} disabled={disp < 1} onClick={() => abrirEditor(ck, 'identificar')} icon={<BadgeCheck size={13} />}>Identificar</CatAcaoBtn>
                          </span>
                        </div>

                        {/* Editor inline conforme a ação escolhida */}
                        {aberto && (
                          <div className="border-t border-gray-100 bg-[#fafbfc] px-3 py-3">
                            {edAtivo?.kind === 'baixar' && (
                              <>
                                <div className="flex flex-wrap items-end gap-3">
                                  <div className="w-40">
                                    <label className={labelCls}>Baixar quantas? <span className="font-medium text-gray-400">(máx. {disp})</span></label>
                                    <input
                                      type="number" min={1} max={disp} step={1} value={edQtd} autoFocus
                                      onChange={(e) => setEdQtd(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter' && edQtdValido) { e.preventDefault(); confirmarEditor(row, disp); } }}
                                      placeholder="Ex.: 5" className={inputCls}
                                    />
                                  </div>
                                  <button type="button" disabled={!edQtdValido} onClick={() => confirmarEditor(row, disp)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#DC2626] bg-white px-3.5 text-sm font-semibold text-[#DC2626] hover:bg-[#fdeaea] disabled:cursor-not-allowed disabled:opacity-50">
                                    <Minus size={15} /> Adicionar baixa
                                  </button>
                                  <button type="button" onClick={fecharEditor} className="h-10 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
                                </div>
                                <p className="mt-2 text-[11.5px] text-gray-400">Saída sem destino — abate cabeças sem identificação (correção/baixa).</p>
                              </>
                            )}

                            {edAtivo?.kind === 'transferir' && (
                              <>
                                <div className="flex flex-wrap items-end gap-3">
                                  <div className="w-36">
                                    <label className={labelCls}>Quantidade <span className="font-medium text-gray-400">(máx. {disp})</span></label>
                                    <input
                                      type="number" min={1} max={disp} step={1} value={edQtd} autoFocus
                                      onChange={(e) => setEdQtd(e.target.value)}
                                      placeholder="Ex.: 5" className={inputCls}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1 sm:max-w-xs">
                                    <label className={labelCls}>Lote destino <span className="text-[#DC2626]">*</span></label>
                                    <select value={edDestino} onChange={(e) => setEdDestino(e.target.value)} className={inputCls}>
                                      <option value="">Selecione o lote</option>
                                      {lotesDestino.map((l) => (
                                        <option key={l.id} value={l.id}>{loteLabel(l.id)}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <button type="button" disabled={!edQtdValido || !edDestino} onClick={() => confirmarEditor(row, disp)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#0891b2] bg-white px-3.5 text-sm font-semibold text-[#0891b2] hover:bg-[#e0f5fb] disabled:cursor-not-allowed disabled:opacity-50">
                                    <ArrowLeftRight size={15} /> Adicionar transferência
                                  </button>
                                  <button type="button" onClick={fecharEditor} className="h-10 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
                                </div>
                                <p className="mt-2 text-[11.5px] text-gray-400">Saída daqui + entrada no lote destino — as cabeças seguem sem identificação no destino.</p>
                              </>
                            )}

                            {edAtivo?.kind === 'identificar' && (
                              <>
                                <label className={labelCls}>
                                  Selecione os animais (sem lote) desta categoria
                                  <span className="ml-1 font-medium text-gray-400">— {edAnimais.size}/{disp} selecionado(s)</span>
                                </label>
                                {listaIdent.length === 0 ? (
                                  <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-[12px] text-gray-400">
                                    Nenhum animal disponível (sem lote) desta categoria. Cadastre os animais ou inclua-os pela aba “Por indivíduo”.
                                  </p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                                    {listaIdent.map((a) => {
                                      const checked = edAnimais.has(a.id);
                                      const atLimit = !checked && edAnimais.size >= disp;
                                      return (
                                        <label key={a.id} className={`flex cursor-pointer items-center gap-2.5 border-b border-gray-50 px-3 py-1.5 last:border-0 hover:bg-gray-50 ${atLimit ? 'opacity-40' : ''}`}>
                                          <input type="checkbox" checked={checked} disabled={atLimit} onChange={() => toggleEdAnimal(a.id)} />
                                          <span className="font-mono text-[12.5px] font-bold text-gray-800">{a.apelido}</span>
                                          {a.rfid && <span className="text-[11.5px] text-gray-400">{a.rfid}</span>}
                                          {a.raca && <span className="text-[12px] text-gray-400">· {a.raca}</span>}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="mt-3 flex items-center gap-2">
                                  <button type="button" disabled={edAnimais.size === 0} onClick={() => confirmarEditor(row, disp)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#16a34a] bg-white px-3.5 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec] disabled:cursor-not-allowed disabled:opacity-50">
                                    <BadgeCheck size={15} /> Identificar{edAnimais.size > 0 ? ` (${edAnimais.size})` : ''}
                                  </button>
                                  <button type="button" onClick={fecharEditor} className="h-10 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
                                </div>
                                <p className="mt-2 text-[11.5px] text-gray-400">Vincula os animais por ID ao lote e abate a pendência da categoria.</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Operações de gestão encenadas */}
              {catOps.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="border-b border-gray-200 bg-[#fafbfc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Ações a aplicar ao salvar</div>
                  {catOps.map((op, idx) => {
                    const cls = op.kind === 'baixar' ? 'text-[#DC2626]' : op.kind === 'transferir' ? 'text-[#0891b2]' : 'text-[#16a34a]';
                    const label =
                      op.kind === 'baixar' ? `Baixar ${op.qtd} cab. · ${op.catNome}`
                        : op.kind === 'transferir' ? `Transferir ${op.qtd} cab. · ${op.catNome} → ${loteCurto(op.destinoLoteId)}`
                          : `Identificar ${op.animalIds.length} cab. · ${op.catNome}`;
                    return (
                      <div key={idx} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0">
                        <span className={`inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] font-semibold ${cls}`}>
                          {op.kind === 'baixar' ? <Minus size={13} className="shrink-0" /> : op.kind === 'transferir' ? <ArrowLeftRight size={13} className="shrink-0" /> : <BadgeCheck size={13} className="shrink-0" />}
                          <span className="truncate">{label}</span>
                        </span>
                        <button type="button" onClick={() => removeCatOp(idx)} title="Desfazer" className="ml-auto shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-[#fdeaea] hover:text-[#DC2626]">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )
      )}

      {/* Data do movimento */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <label className={labelCls}>Data <span className="text-[#DC2626]">*</span></label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center pb-2.5 text-[11.5px] text-gray-400">
          <Tag size={13} className="mr-1 shrink-0" /> Inclusões, transferências e remoções viram movimentos de alocação.
        </div>
      </div>
    </ModalShell>
  );
};

export default IncluirPorIdModal;
