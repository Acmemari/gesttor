import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Search,
  ListTree,
  Save,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { useHierarchy } from '../../contexts/HierarchyContext';
import {
  listPlanoContasDaFazenda,
  salvarAtivacoes,
  type PlanoContaComFlag,
} from '../../lib/api/farmPlanoContasClient';

interface ConfigPlanoContasProps {
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

const AREAS = ['AGRICULTURA', 'PECUÁRIA', 'OUTROS'] as const;
type Area = typeof AREAS[number];

/** Cores das tags por área (mantidas nas linhas como info do CSV). */
const AREA_CHIP_COLORS: Record<Area, string> = {
  AGRICULTURA: 'bg-amber-100 text-amber-800 border-amber-200',
  'PECUÁRIA': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  OUTROS: 'bg-slate-100 text-slate-700 border-slate-200',
};

/**
 * Filtro principal por NATUREZA da conta — derivada do número raiz:
 *   Receitas = ramos 1 (Receitas) + 7 (Outros Créditos)
 *   Despesas = ramos 2, 3, 4, 5, 6, 8
 */
type Natureza = 'receitas' | 'despesas';

const NATUREZAS: { id: Natureza; label: string; classOn: string; classOff: string }[] = [
  {
    id: 'receitas',
    label: 'Receitas',
    classOn: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    classOff: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50',
  },
  {
    id: 'despesas',
    label: 'Despesas',
    classOn: 'bg-rose-100 text-rose-800 border-rose-300',
    classOff: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50',
  },
];

const RAIZES_RECEITAS = new Set(['1', '7']);
const RAIZES_DESPESAS = new Set(['2', '3', '4', '5', '6', '8']);

function naturezaDoNumero(numero: string): Natureza | null {
  const raiz = numero.split('.')[0];
  if (RAIZES_RECEITAS.has(raiz)) return 'receitas';
  if (RAIZES_DESPESAS.has(raiz)) return 'despesas';
  return null;
}

/** Checkbox que aceita estado indeterminate. */
function TriCheckbox({
  state,
  onChange,
  disabled,
}: {
  state: 'on' | 'off' | 'indeterminate';
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'on'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
    />
  );
}

export default function ConfigPlanoContas({ onToast }: ConfigPlanoContasProps) {
  const { selectedFarm } = useHierarchy();

  const [contas, setContas] = useState<PlanoContaComFlag[]>([]);
  const [ativoLocal, setAtivoLocal] = useState<Map<string, boolean>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [filtroNaturezas, setFiltroNaturezas] = useState<Set<Natureza>>(new Set());
  const [filtroPerfil, setFiltroPerfil] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Carrega contas quando a fazenda muda.
  useEffect(() => {
    if (!selectedFarm) return;
    let aborted = false;
    setLoading(true);
    const ac = new AbortController();
    listPlanoContasDaFazenda(selectedFarm.id, ac.signal)
      .then((data) => {
        if (aborted) return;
        setContas(data);
        const map = new Map<string, boolean>();
        for (const c of data) map.set(c.id, c.ativoNaFazenda);
        setAtivoLocal(map);
        // Expande nível 1 e 2 por default
        const exp = new Set<string>();
        for (const c of data) if (c.nivel <= 1) exp.add(c.id);
        setExpanded(exp);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
      ac.abort();
    };
  }, [selectedFarm]);

  // ── Estruturas auxiliares (children, perfis) ──
  const { childrenById, contaById, perfis } = useMemo(() => {
    const childrenById = new Map<string | null, PlanoContaComFlag[]>();
    const contaById = new Map<string, PlanoContaComFlag>();
    const perfisSet = new Set<string>();
    for (const c of contas) {
      const arr = childrenById.get(c.numeroPaiId) ?? [];
      arr.push(c);
      childrenById.set(c.numeroPaiId, arr);
      contaById.set(c.id, c);
      if (c.perfilDesembolso) perfisSet.add(c.perfilDesembolso);
    }
    // Ordena filhos por número (ex: 1.1, 1.2, 1.10) tratando como tupla numérica.
    const sortByNumero = (a: PlanoContaComFlag, b: PlanoContaComFlag) => {
      const pa = a.numero.split('.').map(Number);
      const pb = b.numero.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? 0;
        const y = pb[i] ?? 0;
        if (x !== y) return x - y;
      }
      return 0;
    };
    for (const arr of childrenById.values()) arr.sort(sortByNumero);
    return {
      childrenById,
      contaById,
      perfis: Array.from(perfisSet).sort(),
    };
  }, [contas]);

  // ── Cascata: setar pai/descendente ──
  function descendentesDe(id: string): string[] {
    const result: string[] = [];
    const stack = [...(childrenById.get(id) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      result.push(node.id);
      const filhos = childrenById.get(node.id);
      if (filhos) stack.push(...filhos);
    }
    return result;
  }

  function setAtivoCascata(id: string, valor: boolean) {
    setAtivoLocal((prev) => {
      const next = new Map(prev);
      next.set(id, valor);
      for (const did of descendentesDe(id)) next.set(did, valor);
      return next;
    });
  }

  // ── Estado visual do checkbox (derivado dos descendentes) ──
  function estadoVisual(id: string): 'on' | 'off' | 'indeterminate' {
    const desc = descendentesDe(id);
    if (desc.length === 0) {
      return ativoLocal.get(id) ? 'on' : 'off';
    }
    let on = 0;
    let off = 0;
    for (const did of desc) {
      if (ativoLocal.get(did)) on++;
      else off++;
    }
    if (on === 0) return 'off';
    if (off === 0) return 'on';
    return 'indeterminate';
  }

  // ── Filtros ──
  const filtroAtivo = busca.trim().length > 0 || filtroNaturezas.size > 0 || filtroPerfil !== '';

  function contaMatchFiltro(c: PlanoContaComFlag): boolean {
    const buscaTrim = busca.trim().toLowerCase();
    if (buscaTrim) {
      const matchTexto =
        c.nome.toLowerCase().includes(buscaTrim) || c.numero.includes(buscaTrim);
      if (!matchTexto) return false;
    }
    if (filtroNaturezas.size > 0) {
      const nat = naturezaDoNumero(c.numero);
      if (!nat || !filtroNaturezas.has(nat)) return false;
    }
    if (filtroPerfil && c.perfilDesembolso !== filtroPerfil) return false;
    return true;
  }

  /** Conjunto de ids visíveis: contas que match + ancestrais de matches. */
  const idsVisiveis = useMemo<Set<string>>(() => {
    if (!filtroAtivo) return new Set(contas.map((c) => c.id));
    const visiveis = new Set<string>();
    for (const c of contas) {
      if (contaMatchFiltro(c)) {
        visiveis.add(c.id);
        // Sobe pelos pais
        let cur: PlanoContaComFlag | undefined = c;
        while (cur?.numeroPaiId) {
          const pai = contaById.get(cur.numeroPaiId);
          if (!pai || visiveis.has(pai.id)) break;
          visiveis.add(pai.id);
          cur = pai;
        }
      }
    }
    return visiveis;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas, busca, filtroNaturezas, filtroPerfil, contaById]);

  // Quando filtra, expande tudo automaticamente para mostrar matches.
  const expandedEffective = filtroAtivo
    ? new Set([...idsVisiveis])
    : expanded;

  // ── Diff e contagens ──
  const dirty = useMemo<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    for (const c of contas) {
      const local = ativoLocal.get(c.id);
      if (local !== undefined && local !== c.ativoNaFazenda) m.set(c.id, local);
    }
    return m;
  }, [contas, ativoLocal]);

  const totalAtivas = useMemo(() => {
    let n = 0;
    for (const v of ativoLocal.values()) if (v) n++;
    return n;
  }, [ativoLocal]);

  // ── Ações ──
  function toggleExpanded(id: string) {
    if (filtroAtivo) return; // expanded é derivado quando filtra
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleNatureza(nat: Natureza) {
    setFiltroNaturezas((prev) => {
      const next = new Set(prev);
      if (next.has(nat)) next.delete(nat);
      else next.add(nat);
      return next;
    });
  }

  function descartar() {
    const map = new Map<string, boolean>();
    for (const c of contas) map.set(c.id, c.ativoNaFazenda);
    setAtivoLocal(map);
  }

  async function salvar() {
    if (!selectedFarm || dirty.size === 0) return;
    setSaving(true);
    const ativacoes = [...dirty.entries()].map(([planoContaId, ativo]) => ({
      planoContaId,
      ativo,
    }));
    const res = await salvarAtivacoes(selectedFarm.id, ativacoes);
    setSaving(false);
    if (!('data' in res)) {
      onToast?.(`Erro ao salvar: ${res.error}`, 'error');
      return;
    }
    onToast?.(`Configuração salva: ${res.data.atualizadas} alteração(ões)`, 'success');
    // Recarrega para sincronizar com o server
    if (selectedFarm) {
      const fresh = await listPlanoContasDaFazenda(selectedFarm.id);
      setContas(fresh);
      const map = new Map<string, boolean>();
      for (const c of fresh) map.set(c.id, c.ativoNaFazenda);
      setAtivoLocal(map);
    }
  }

  // ── Render ──
  if (!selectedFarm) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6">
        <ListTree size={36} className="mb-3 opacity-40" />
        <h2 className="text-base font-medium text-slate-800 mb-1">Selecione uma fazenda</h2>
        <p className="text-sm text-slate-500 text-center max-w-md">
          Escolha uma fazenda no header acima para configurar quais contas serão usadas
          no planejamento orçamentário.
        </p>
      </div>
    );
  }

  // Renderiza recursivamente a partir das raízes
  const renderNode = (conta: PlanoContaComFlag, depth: number): React.ReactNode => {
    if (!idsVisiveis.has(conta.id)) return null;
    const filhos = childrenById.get(conta.id) ?? [];
    const filhosVisiveis = filhos.filter((f) => idsVisiveis.has(f.id));
    const hasChildren = filhosVisiveis.length > 0;
    const isExp = expandedEffective.has(conta.id);
    const visual = estadoVisual(conta.id);
    const wasDirty = dirty.has(conta.id);

    return (
      <React.Fragment key={conta.id}>
        <div
          className={[
            'flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 border-l-2 transition-colors',
            wasDirty ? 'border-emerald-500 bg-emerald-50/30' : 'border-transparent',
          ].join(' ')}
          style={{ paddingLeft: 12 + depth * 18 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(conta.id)}
              disabled={filtroAtivo}
              className="p-0.5 text-slate-500 hover:text-slate-800 rounded disabled:cursor-default"
              aria-label={isExp ? 'Recolher' : 'Expandir'}
            >
              {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[18px]" aria-hidden="true" />
          )}

          <TriCheckbox state={visual} onChange={(v) => setAtivoCascata(conta.id, v)} />

          <span className="text-xs text-slate-500 font-mono shrink-0 min-w-[3.5rem]">
            {conta.numero}
          </span>

          <span className={`text-sm flex-1 truncate ${visual === 'off' ? 'text-slate-400' : 'text-slate-800'}`}>
            {conta.nome}
          </span>

          {conta.perfilDesembolso && (
            <span className="hidden lg:inline text-[10px] text-slate-500 uppercase tracking-wide truncate max-w-[200px]">
              {conta.perfilDesembolso}
            </span>
          )}

          <div className="flex gap-1 shrink-0">
            {(conta.areasNegocio ?? []).map((a) => {
              const cls = AREA_CHIP_COLORS[a as Area] ?? 'bg-slate-100 text-slate-700 border-slate-200';
              return (
                <span
                  key={a}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}
                  title={a}
                >
                  {a.substring(0, 3)}
                </span>
              );
            })}
          </div>
        </div>

        {hasChildren && isExp && filhosVisiveis.map((f) => renderNode(f, depth + 1))}
      </React.Fragment>
    );
  };

  const raizes = (childrenById.get(null) ?? []).filter((r) => idsVisiveis.has(r.id));

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <ListTree size={18} className="text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-900">Configuração — Plano de Contas</h1>
        </div>
        <p className="text-sm text-slate-500">
          Fazenda <strong className="text-slate-800">{selectedFarm.name}</strong> ·{' '}
          <span className="text-slate-700">{totalAtivas}</span> de {contas.length} contas ativas
          {dirty.size > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 font-medium">
              · {dirty.size} alteração(ões) pendente(s)
            </span>
          )}
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-slate-200 shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número ou nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {NATUREZAS.map((n) => {
            const active = filtroNaturezas.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleNatureza(n.id)}
                className={[
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  active ? `${n.classOn} border-2` : n.classOff,
                ].join(' ')}
              >
                {n.label}
              </button>
            );
          })}
        </div>

        <select
          value={filtroPerfil}
          onChange={(e) => setFiltroPerfil(e.target.value)}
          className="text-sm rounded-md border border-slate-300 px-2 py-1.5 bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Todos os perfis</option>
          {perfis.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Árvore */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-sm text-slate-500 px-6 py-4">Carregando…</p>
        )}
        {!loading && contas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
            <AlertCircle size={28} className="mb-2 opacity-40" />
            <p className="text-sm font-medium text-slate-700 mb-1">
              Não foi possível carregar as contas
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Recarregue a página. Se o problema persistir, peça ao administrador para reiniciar
              o servidor — a configuração foi instalada e pode precisar de um novo boot do
              backend para responder.
            </p>
          </div>
        )}
        {!loading && contas.length > 0 && raizes.length === 0 && (
          <p className="text-sm text-slate-500 px-6 py-4">
            Nenhuma conta encontrada com os filtros atuais.
          </p>
        )}
        <div className="py-2">
          {raizes.map((r) => renderNode(r, 0))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 bg-slate-50">
        <button
          type="button"
          onClick={descartar}
          disabled={dirty.size === 0 || saving}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={14} />
          Descartar alterações
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {dirty.size === 0 ? 'Nenhuma alteração' : `${dirty.size} alteração(ões) pendente(s)`}
          </span>
          <button
            type="button"
            onClick={salvar}
            disabled={dirty.size === 0 || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <Save size={14} />
            {saving ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>
      </footer>
    </div>
  );
}
