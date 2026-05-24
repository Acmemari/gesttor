/**
 * Hook de estado para a tela unificada de despesas previstas.
 *
 * Responsabilidades:
 * - Carregar planilha (estrutura de contas + meses + dados do orçamento) e
 *   lançamentos da versão/fazenda ativa.
 * - Derivar `valoresPorFolha` e `lancamentosPorFolha` a partir dos lançamentos
 *   (fonte única de verdade local).
 * - Operações otimistas: replaceLancamento, removeLancamento e refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listarPlanilha,
  type PlanilhaResult,
} from '../../lib/api/orcamentoItensClient';
import {
  listLancamentos,
  type LancamentoRow,
} from '../../lib/api/lancamentosClient';
import {
  agruparLancamentosPorFolha,
  calcularValoresPorFolha,
  gerarMeses,
  montarHierarquia,
  type HierarquiaContas,
} from './despesasPlanilha.utils';

interface Options {
  versaoId: string | null | undefined;
  farmId: string | null | undefined;
  numeroRaiz?: string;
}

export interface DespesasUnificadasState {
  loading: boolean;
  planilha: PlanilhaResult | null;
  lancamentos: LancamentoRow[];
  meses: string[];
  hierarquia: HierarquiaContas;
  valoresPorFolha: Map<string, Record<string, number>>;
  lancamentosPorFolha: Map<string, LancamentoRow[]>;
  refresh: () => Promise<void>;
  refreshSilencioso: () => Promise<void>;
  /** Substitui um lançamento existente OU adiciona um novo (id já gerado pelo server). */
  upsertLancamento: (l: LancamentoRow) => void;
  removeLancamento: (id: string) => void;
}

const EMPTY_HIERARQUIA: HierarquiaContas = {
  childrenById: new Map(),
  descendantesFolhasById: new Map(),
  porId: new Map(),
};

export function useDespesasUnificadasState(opts: Options): DespesasUnificadasState {
  const { versaoId, farmId, numeroRaiz } = opts;
  const [planilha, setPlanilha] = useState<PlanilhaResult | null>(null);
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const carregar = useCallback(
    async (silencioso: boolean) => {
      if (!versaoId || !farmId) {
        setPlanilha(null);
        setLancamentos([]);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (!silencioso) setLoading(true);
      try {
        const [p, l] = await Promise.all([
          listarPlanilha({ versaoId, farmId, numeroRaiz, signal: ac.signal }),
          listLancamentos({ versaoId, farmId, incluirShadow: false, signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        setPlanilha(p);
        setLancamentos(l);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [versaoId, farmId, numeroRaiz],
  );

  useEffect(() => {
    void carregar(false);
    return () => abortRef.current?.abort();
  }, [carregar]);

  const meses = useMemo(() => {
    if (!planilha) return [];
    return gerarMeses(planilha.orcamento.dataInicio);
  }, [planilha]);

  const hierarquia = useMemo(() => {
    if (!planilha) return EMPTY_HIERARQUIA;
    return montarHierarquia(planilha.contas);
  }, [planilha]);

  const valoresPorFolha = useMemo(
    () => calcularValoresPorFolha(lancamentos),
    [lancamentos],
  );
  const lancamentosPorFolha = useMemo(
    () => agruparLancamentosPorFolha(lancamentos),
    [lancamentos],
  );

  const upsertLancamento = useCallback((l: LancamentoRow) => {
    setLancamentos((prev) => {
      const idx = prev.findIndex((x) => x.id === l.id);
      if (idx === -1) return [...prev, l];
      const next = prev.slice();
      next[idx] = l;
      return next;
    });
  }, []);

  const removeLancamento = useCallback((id: string) => {
    setLancamentos((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return {
    loading,
    planilha,
    lancamentos,
    meses,
    hierarquia,
    valoresPorFolha,
    lancamentosPorFolha,
    refresh: () => carregar(false),
    refreshSilencioso: () => carregar(true),
    upsertLancamento,
    removeLancamento,
  };
}
