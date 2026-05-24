import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Eye,
  Search,
  AlertCircle,
  Loader2,
  Save,
} from 'lucide-react';
import { format, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import {
  listarPlanilha,
  salvarEdicoes,
  type PlanilhaResult,
  type ContaPlanilha,
  type EdicaoInput,
} from '../../lib/api/orcamentoItensClient';

interface Props {
  /** Filtra a planilha por uma raiz específica (ex.: '5'). Quando omitido, mostra todas as despesas. */
  numeroRaiz?: string;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

const NOMES_RAIZ: Record<string, string> = {
  '2': 'Agricultura e Silvicultura',
  '3': 'Investimentos',
  '4': 'Mão de Obra Permanente',
  '5': 'Pecuária',
  '6': 'Suporte Produção',
  '8': 'Outros Débitos',
};

const AUTOSAVE_MS = 1500;

function formatBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parseBRL(s: string): number | null {
  const trimmed = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Gera 12 meses ISO (primeiro dia de cada mês) a partir de dataInicio. */
function gerarMeses(dataInicioIso: string): string[] {
  const inicio = parseISO(dataInicioIso);
  const meses: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = addMonths(inicio, i);
    // 'YYYY-MM-01'
    meses.push(format(d, 'yyyy-MM-01'));
  }
  return meses;
}

interface PlanilhaCellProps {
  value: number | null;
  readOnly: boolean;
  onCommit: (next: number | null) => void;
  onArrow: (dir: 'up' | 'down' | 'left' | 'right') => void;
  cellId: string;
}

function PlanilhaCell({ value, readOnly, onCommit, onArrow, cellId }: PlanilhaCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start() {
    if (readOnly) return;
    setDraft(value !== null && value !== undefined ? String(value).replace('.', ',') : '');
    setEditing(true);
  }

  function commit(advance: 'tab' | 'enter' | 'none' = 'none') {
    const parsed = parseBRL(draft);
    onCommit(parsed);
    setEditing(false);
    if (advance === 'tab') onArrow('right');
    else if (advance === 'enter') onArrow('down');
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit('enter');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        commit('none');
        onArrow('left');
      } else {
        commit('tab');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  }

  const display = value !== null && value !== undefined && value !== 0 ? formatBRL(value) : '';

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit('none')}
        onKeyDown={handleKey}
        data-cell-id={cellId}
        className="w-full h-full px-2 py-1 text-right text-sm bg-emerald-50 border-2 border-emerald-500 outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      disabled={readOnly}
      data-cell-id={cellId}
      className={[
        'w-full h-full px-2 py-1 text-right text-sm border border-transparent',
        readOnly
          ? 'cursor-not-allowed text-slate-400'
          : 'hover:bg-emerald-50 hover:border-emerald-300 focus:bg-emerald-50 focus:border-emerald-500 focus:outline-none cursor-text',
        display ? 'text-slate-800' : 'text-slate-300',
      ].join(' ')}
    >
      {display || '—'}
    </button>
  );
}

export default function DespesasPlanilha({ numeroRaiz, onToast }: Props) {
  const { selectedFarm } = useHierarchy();
  const { versaoAtiva } = useOrcamento();

  const [data, setData] = useState<PlanilhaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // valores efetivos por (planoContaId, mesIso)
  const [valores, setValores] = useState<Map<string, Record<string, number>>>(new Map());
  // alterações pendentes desde o último save
  const [dirty, setDirty] = useState<Map<string, Record<string, number | null>>>(new Map());
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Carregar planilha ──
  useEffect(() => {
    if (!selectedFarm || !versaoAtiva) {
      setData(null);
      return;
    }
    let aborted = false;
    setLoading(true);
    const ac = new AbortController();
    listarPlanilha({
      versaoId: versaoAtiva.id,
      farmId: selectedFarm.id,
      numeroRaiz,
      signal: ac.signal,
    })
      .then((result) => {
        if (aborted) return;
        setData(result);
        if (result) {
          // Inicializa valores
          const map = new Map<string, Record<string, number>>();
          for (const [contaId, vals] of Object.entries(result.itens)) {
            map.set(contaId, { ...vals });
          }
          setValores(map);
          setDirty(new Map());
          // Default expanded: nível 1 e 2
          const exp = new Set<string>();
          for (const c of result.contas) {
            if (c.nivel <= 2) exp.add(c.id);
          }
          setExpanded(exp);
        }
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
      ac.abort();
    };
  }, [selectedFarm, versaoAtiva, numeroRaiz]);

  const meses = useMemo(() => {
    if (!data) return [];
    return gerarMeses(data.orcamento.dataInicio);
  }, [data]);

  const { childrenById, descendantesFolhasById } = useMemo(() => {
    const childrenById = new Map<string | null, ContaPlanilha[]>();
    if (!data) return { childrenById, descendantesFolhasById: new Map<string, string[]>() };
    for (const c of data.contas) {
      const arr = childrenById.get(c.numeroPaiId) ?? [];
      arr.push(c);
      childrenById.set(c.numeroPaiId, arr);
    }
    // Pré-computa descendentes-folha por categoria (para subtotais)
    const descById = new Map<string, string[]>();
    for (const c of data.contas) {
      if (c.isFolha) continue;
      const folhas: string[] = [];
      const stack = [...(childrenById.get(c.id) ?? [])];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.isFolha) folhas.push(node.id);
        else stack.push(...(childrenById.get(node.id) ?? []));
      }
      descById.set(c.id, folhas);
    }
    return { childrenById, descendantesFolhasById: descById };
  }, [data]);

  // Travas
  const readOnly = !!(versaoAtiva && (versaoAtiva.imutavel || versaoAtiva.tipo === 'em_aprovacao' || versaoAtiva.tipo === 'arquivado'));

  // ── Autosave ──
  // Mantém o último snapshot de dirty acessível ao timer (sem fechar sobre estado obsoleto).
  const dirtyRef = useRef<Map<string, Record<string, number | null>>>(new Map());
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const triggerAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!selectedFarm || !versaoAtiva) return;
      const pending = dirtyRef.current;
      if (pending.size === 0) return;
      const edicoes: EdicaoInput[] = [];
      for (const [planoContaId, vals] of pending.entries()) {
        edicoes.push({ planoContaId, valoresMensais: vals });
      }
      // Limpa local; em caso de erro, devolvemos abaixo.
      setDirty(new Map());
      setSavingState('saving');
      const res = await salvarEdicoes({
        versaoId: versaoAtiva.id,
        farmId: selectedFarm.id,
        edicoes,
      });
      if ('error' in res) {
        setSavingState('error');
        onToast?.(`Erro ao salvar: ${res.error}`, 'error');
        // Devolve as edições para nova tentativa (mas só onde ainda não houve nova edição local)
        setDirty((prev) => {
          const next = new Map(prev);
          for (const e of edicoes) {
            const cur = next.get(e.planoContaId) ?? {};
            next.set(e.planoContaId, { ...e.valoresMensais, ...cur });
          }
          return next;
        });
        return;
      }
      setSavingState('saved');
      setSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }, AUTOSAVE_MS);
  }, [selectedFarm, versaoAtiva, onToast]);

  function setCelula(contaId: string, mes: string, valor: number | null) {
    setValores((prev) => {
      const next = new Map(prev);
      const atual = { ...(next.get(contaId) ?? {}) };
      if (valor === null) {
        delete atual[mes];
      } else {
        atual[mes] = valor;
      }
      if (Object.keys(atual).length === 0) next.delete(contaId);
      else next.set(contaId, atual);
      return next;
    });
    setDirty((prev) => {
      const next = new Map(prev);
      const atual = { ...(next.get(contaId) ?? {}) };
      atual[mes] = valor;
      next.set(contaId, atual);
      return next;
    });
    triggerAutosave();
  }

  // ── Navegação por teclado entre células ──
  function moverFoco(currentId: string, dir: 'up' | 'down' | 'left' | 'right') {
    const [contaId, mesIdx] = currentId.split('|');
    const idx = Number(mesIdx);
    if (!data) return;
    const folhas = data.contas.filter((c) => c.isFolha);
    const linhaAtual = folhas.findIndex((c) => c.id === contaId);
    if (linhaAtual === -1) return;

    let nextContaId = contaId;
    let nextMes = idx;
    if (dir === 'left') nextMes = Math.max(0, idx - 1);
    else if (dir === 'right') nextMes = Math.min(11, idx + 1);
    else if (dir === 'up') nextContaId = folhas[Math.max(0, linhaAtual - 1)].id;
    else if (dir === 'down') nextContaId = folhas[Math.min(folhas.length - 1, linhaAtual + 1)].id;

    const target = document.querySelector<HTMLElement>(`[data-cell-id="${nextContaId}|${nextMes}"]`);
    target?.focus();
  }

  // ── Render helpers ──
  function getValorFolha(contaId: string, mes: string): number | null {
    const v = valores.get(contaId)?.[mes];
    return v !== undefined ? v : null;
  }

  function somaCategoria(contaId: string, mes?: string): number {
    const folhas = descendantesFolhasById.get(contaId) ?? [];
    let total = 0;
    for (const folhaId of folhas) {
      const v = valores.get(folhaId);
      if (!v) continue;
      if (mes) {
        const x = v[mes];
        if (typeof x === 'number' && Number.isFinite(x)) total += x;
      } else {
        for (const x of Object.values(v)) {
          if (typeof x === 'number' && Number.isFinite(x)) total += x;
        }
      }
    }
    return total;
  }

  function somaFolhaTotal(contaId: string): number {
    const v = valores.get(contaId);
    if (!v) return 0;
    let total = 0;
    for (const x of Object.values(v)) {
      if (typeof x === 'number' && Number.isFinite(x)) total += x;
    }
    return total;
  }

  function totalGeralPorMes(mes: string): number {
    if (!data) return 0;
    let total = 0;
    for (const c of data.contas) {
      if (!c.isFolha) continue;
      const v = valores.get(c.id);
      if (v && typeof v[mes] === 'number') total += v[mes];
    }
    return total;
  }

  function totalGeral(): number {
    if (!data) return 0;
    let total = 0;
    for (const c of data.contas) {
      if (!c.isFolha) continue;
      const v = valores.get(c.id);
      if (!v) continue;
      for (const x of Object.values(v)) {
        if (typeof x === 'number') total += x;
      }
    }
    return total;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Estados vazios ──
  if (!versaoAtiva) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-700 mb-1">
          Nenhum orçamento ativo
        </p>
        <p className="text-xs text-slate-500">Crie ou selecione um orçamento para abrir a planilha.</p>
      </div>
    );
  }
  if (!selectedFarm) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-700">Selecione uma fazenda no header.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Loader2 size={28} className="animate-spin mb-2" />
        <p className="text-sm">Carregando planilha…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={28} className="mb-2 opacity-40" />
        <p className="text-sm">Não foi possível carregar a planilha.</p>
      </div>
    );
  }

  // Lista visível: filtra busca + respeita expand/collapse
  const buscaTrim = busca.trim().toLowerCase();
  const linhasVisiveis: ContaPlanilha[] = [];
  function adicionarSeMatch(c: ContaPlanilha, paiVisivel: boolean) {
    const matchBusca = !buscaTrim
      || c.nome.toLowerCase().includes(buscaTrim)
      || c.numero.includes(buscaTrim);
    const filhos = childrenById.get(c.id) ?? [];
    if (filhos.length > 0) {
      // categoria
      // Se busca ativa, mostra a categoria sse algum descendente match
      const algumDescMatch = (() => {
        if (!buscaTrim) return true;
        let stack = [...filhos];
        while (stack.length) {
          const n = stack.pop()!;
          if (n.nome.toLowerCase().includes(buscaTrim) || n.numero.includes(buscaTrim)) return true;
          stack.push(...(childrenById.get(n.id) ?? []));
        }
        return false;
      })();
      if (algumDescMatch && paiVisivel) {
        linhasVisiveis.push(c);
        const aberta = buscaTrim ? true : expanded.has(c.id);
        if (aberta) {
          for (const f of filhos) adicionarSeMatch(f, true);
        }
      }
    } else {
      // folha
      if (matchBusca && paiVisivel) linhasVisiveis.push(c);
    }
  }
  const raizes = childrenById.get(null) ?? [];
  for (const r of raizes) adicionarSeMatch(r, true);

  // Render
  const tituloRaiz = numeroRaiz ? (NOMES_RAIZ[numeroRaiz] ?? numeroRaiz) : 'Todas as categorias';
  const gridTemplate = `minmax(280px, 360px) repeat(12, minmax(80px, 1fr)) minmax(110px, 130px)`;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">
              Despesas — {tituloRaiz}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {data.orcamento.nome} · Safra {data.orcamento.safra} · {selectedFarm.name}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {savingState === 'saving' && (
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                Salvando…
              </span>
            )}
            {savingState === 'saved' && savedAt && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <Save size={12} />
                Salvo às {savedAt}
              </span>
            )}
          </div>
        </div>
        {readOnly && (
          <div
            className={`mt-2 rounded-md p-2 text-xs flex items-center gap-2 ${
              versaoAtiva.imutavel ? 'bg-amber-50 text-amber-900 border border-amber-300' : 'bg-blue-50 text-blue-900 border border-blue-300'
            }`}
          >
            {versaoAtiva.imutavel ? <Lock size={14} /> : <Eye size={14} />}
            <span>
              {versaoAtiva.imutavel
                ? 'Versão Baseline — imutável. Crie um Forecast para editar.'
                : versaoAtiva.tipo === 'em_aprovacao'
                  ? 'Versão em aprovação — somente leitura.'
                  : 'Versão arquivada — somente leitura.'}
            </span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="px-6 py-2 border-b border-slate-200 shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar conta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            // Expandir todos: pega categorias
            if (!data) return;
            const all = new Set<string>();
            for (const c of data.contas) if (!c.isFolha) all.add(c.id);
            setExpanded(all);
          }}
          className="text-xs text-slate-600 hover:text-slate-900"
        >
          Expandir tudo
        </button>
        <span className="text-slate-300">·</span>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="text-xs text-slate-600 hover:text-slate-900"
        >
          Colapsar tudo
        </button>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto relative">
        <div
          className="grid text-xs sticky top-0 z-20 bg-slate-100 border-b border-slate-300"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
            Conta
          </div>
          {meses.map((mes) => (
            <div key={mes} className="px-2 py-2 text-center font-medium text-slate-600">
              {format(parseISO(mes), 'MMM/yy', { locale: ptBR })}
            </div>
          ))}
          <div className="px-2 py-2 text-right font-semibold uppercase tracking-wide text-slate-600 sticky right-0 bg-slate-100 z-10 border-l border-slate-200">
            Total
          </div>
        </div>

        {linhasVisiveis.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Nenhuma conta deste ramo está disponível para esta fazenda. Configure em "Plano de Contas".
          </div>
        ) : (
          linhasVisiveis.map((c) => {
            const isCategoria = !c.isFolha;
            const isExp = expanded.has(c.id);
            const filhos = childrenById.get(c.id) ?? [];
            const hasChildren = filhos.length > 0;

            if (isCategoria) {
              return (
                <div
                  key={c.id}
                  className="grid border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 sticky left-0 bg-slate-50/80 z-10 border-r border-slate-100 flex items-center gap-1"
                    style={{ paddingLeft: 12 + (c.nivel - 1) * 16 }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(c.id)}
                        className="p-0.5 text-slate-500 hover:text-slate-800"
                      >
                        {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    ) : (
                      <span className="w-3" aria-hidden="true" />
                    )}
                    <span className="text-xs text-slate-500 font-mono shrink-0">{c.numero}</span>
                    <span className="truncate">{c.nome}</span>
                  </div>
                  {meses.map((mes) => {
                    const total = somaCategoria(c.id, mes);
                    return (
                      <div key={mes} className="px-2 py-1.5 text-right text-sm text-slate-600">
                        {total > 0 ? formatBRL(total) : ''}
                      </div>
                    );
                  })}
                  <div className="px-2 py-1.5 text-right text-sm font-semibold text-slate-800 sticky right-0 bg-slate-50/80 z-10 border-l border-slate-100">
                    {formatBRL(somaCategoria(c.id))}
                  </div>
                </div>
              );
            }

            // Folha
            return (
              <div
                key={c.id}
                className="grid border-b border-slate-100 hover:bg-emerald-50/30"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div
                  className="px-3 py-1.5 text-sm text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100 flex items-center gap-1"
                  style={{ paddingLeft: 12 + (c.nivel - 1) * 16 }}
                >
                  <span className="w-3" aria-hidden="true" />
                  <span className="text-xs text-slate-500 font-mono shrink-0">{c.numero}</span>
                  <span className="truncate">{c.nome}</span>
                </div>
                {meses.map((mes, idx) => {
                  const v = getValorFolha(c.id, mes);
                  return (
                    <div key={mes} className="border-l border-slate-50">
                      <PlanilhaCell
                        cellId={`${c.id}|${idx}`}
                        value={v}
                        readOnly={readOnly}
                        onCommit={(val) => setCelula(c.id, mes, val)}
                        onArrow={(dir) => moverFoco(`${c.id}|${idx}`, dir)}
                      />
                    </div>
                  );
                })}
                <div className="px-2 py-1.5 text-right text-sm font-medium text-slate-800 sticky right-0 bg-white z-10 border-l border-slate-100">
                  {formatBRL(somaFolhaTotal(c.id))}
                </div>
              </div>
            );
          })
        )}

        {/* Footer total */}
        <div
          className="grid sticky bottom-0 z-20 bg-slate-900 text-white border-t border-slate-700"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-2 text-sm font-semibold uppercase tracking-wide sticky left-0 bg-slate-900 z-10 border-r border-slate-700">
            Total do ramo
          </div>
          {meses.map((mes) => (
            <div key={mes} className="px-2 py-2 text-right text-sm font-medium">
              {formatBRL(totalGeralPorMes(mes))}
            </div>
          ))}
          <div className="px-2 py-2 text-right text-sm font-bold sticky right-0 bg-slate-900 z-10 border-l border-slate-700">
            {formatBRL(totalGeral())}
          </div>
        </div>
      </div>
    </div>
  );
}
