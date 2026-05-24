/**
 * Tela unificada de Despesas Previstas — orquestrador raiz.
 *
 * Layout:
 *   - Toolbar superior fina (título compacto + status de save)
 *   - Painel superior: grid hierárquico read-only do plano de contas
 *   - Divisor vertical resizable
 *   - Painel inferior: Categorias (esquerda) + Detalhamento Produtos (direita)
 *
 * A entrada de dados está toda no painel inferior. Selecionar uma conta no grid
 * filtra automaticamente as folhas descendentes na tabela de categorias.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, Loader2, Lock } from 'lucide-react';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import DespesasGridReadOnly from './DespesasGridReadOnly';
import CategoriasEDetalhamento from './CategoriasEDetalhamento';
import LancamentoModal from './LancamentoModal';
import { useDespesasUnificadasState } from './useDespesasUnificadasState';
import { NOMES_RAIZ } from './despesasPlanilha.utils';
import type { LancamentoRow } from '../../lib/api/lancamentosClient';

interface Props {
  numeroRaiz?: string;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

const LS_SPLIT_GRID = 'despesasUnificada.splitGrid.v1';
const LS_SPLIT_H = 'despesasUnificada.splitH.v1';

function readLsNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(0.85, Math.max(0.2, n));
  } catch {
    return fallback;
  }
}

function writeLsNumber(key: string, value: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

export default function DespesasUnificada({ numeroRaiz, onToast }: Props) {
  const { selectedFarm } = useHierarchy();
  const { versaoAtiva } = useOrcamento();

  const versaoId = versaoAtiva?.id ?? null;
  const farmId = selectedFarm?.id ?? null;

  const state = useDespesasUnificadasState({ versaoId, farmId, numeroRaiz });

  const [selectedContaId, setSelectedContaId] = useState<string | null>(null);
  const [detailLancamentoId, setDetailLancamentoId] = useState<string | null>(null);
  const [splitGrid, setSplitGrid] = useState<number>(() =>
    readLsNumber(LS_SPLIT_GRID, 0.6),
  );
  const [splitHorizontal, setSplitHorizontal] = useState<number>(() =>
    readLsNumber(LS_SPLIT_H, 0.6),
  );
  const [dragSplit, setDragSplit] = useState(false);
  const [modalEdicao, setModalEdicao] = useState<LancamentoRow | null>(null);

  // Persiste splits no localStorage
  useEffect(() => {
    writeLsNumber(LS_SPLIT_GRID, splitGrid);
  }, [splitGrid]);
  useEffect(() => {
    writeLsNumber(LS_SPLIT_H, splitHorizontal);
  }, [splitHorizontal]);

  // Quando muda a conta selecionada, fecha o detalhamento
  useEffect(() => {
    setDetailLancamentoId(null);
  }, [selectedContaId]);

  // Resize do divisor entre grid (esquerda) e detalhamento (direita)
  const splitContainerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dragSplit) return;
    function onMove(e: MouseEvent) {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitGrid(Math.min(0.8, Math.max(0.25, ratio)));
    }
    function onUp() {
      setDragSplit(false);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragSplit]);

  const readOnly = !!(
    versaoAtiva &&
    (versaoAtiva.imutavel ||
      versaoAtiva.tipo === 'em_aprovacao' ||
      versaoAtiva.tipo === 'arquivado')
  );

  const tituloRaiz = numeroRaiz ? NOMES_RAIZ[numeroRaiz] ?? numeroRaiz : 'Todas as categorias';

  const handleLancamentoSalvo = useCallback(
    (l: LancamentoRow) => {
      state.upsertLancamento(l);
    },
    [state.upsertLancamento],
  );

  const handleLancamentoRemovido = useCallback(
    (id: string) => {
      state.removeLancamento(id);
      if (detailLancamentoId === id) setDetailLancamentoId(null);
    },
    [state.removeLancamento, detailLancamentoId],
  );

  // Estados iniciais
  if (!versaoAtiva) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-700 mb-1">Nenhum orçamento ativo</p>
        <p className="text-xs text-slate-500">
          Crie ou selecione um orçamento para abrir as despesas.
        </p>
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
  if (state.loading && !state.planilha) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Loader2 size={28} className="animate-spin mb-2" />
        <p className="text-sm">Carregando despesas…</p>
      </div>
    );
  }
  if (!state.planilha) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={28} className="mb-2 opacity-40" />
        <p className="text-sm">Não foi possível carregar a planilha.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar fina superior */}
      <div className="px-6 py-2 border-b border-slate-200 shrink-0 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            Despesas — {tituloRaiz}
          </h1>
          <p className="text-[11px] text-slate-500 truncate">
            {state.planilha.orcamento.nome} · Safra {state.planilha.orcamento.safra} ·{' '}
            {selectedFarm.name}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {readOnly && (
            <span
              className={[
                'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded',
                versaoAtiva.imutavel
                  ? 'bg-amber-50 text-amber-900 border border-amber-300'
                  : 'bg-blue-50 text-blue-900 border border-blue-300',
              ].join(' ')}
            >
              {versaoAtiva.imutavel ? <Lock size={11} /> : <Eye size={11} />}
              {versaoAtiva.imutavel
                ? 'Baseline — imutável'
                : versaoAtiva.tipo === 'em_aprovacao'
                  ? 'Em aprovação'
                  : 'Arquivada'}
            </span>
          )}
        </div>
      </div>

      {/* Container horizontal: grid à esquerda, categorias+produtos à direita */}
      <div ref={splitContainerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Painel esquerdo: Grid Read-Only */}
        <div
          style={{ flex: `${splitGrid} 1 0%`, minWidth: 320 }}
          className="overflow-hidden"
        >
          <DespesasGridReadOnly
            contas={state.planilha.contas}
            hierarquia={state.hierarquia}
            meses={state.meses}
            valoresPorFolha={state.valoresPorFolha}
            selectedContaId={selectedContaId}
            onSelectConta={setSelectedContaId}
          />
        </div>

        {/* Divisor vertical resizable */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setDragSplit(true);
          }}
          className={[
            'w-1 cursor-col-resize bg-slate-200 hover:bg-emerald-400 transition-colors shrink-0',
            dragSplit ? 'bg-emerald-500' : '',
          ].join(' ')}
        />

        {/* Painel direito: Categorias + Detalhamento de produtos */}
        <div
          style={{ flex: `${1 - splitGrid} 1 0%`, minWidth: 360 }}
          className="overflow-hidden"
        >
          <CategoriasEDetalhamento
            versaoId={versaoAtiva.id}
            farmId={selectedFarm.id}
            selectedContaId={selectedContaId}
            hierarquia={state.hierarquia}
            meses={state.meses}
            lancamentos={state.lancamentos}
            lancamentosPorFolha={state.lancamentosPorFolha}
            valoresPorFolha={state.valoresPorFolha}
            detailLancamentoId={detailLancamentoId}
            readOnly={readOnly}
            splitRatio={splitHorizontal}
            onChangeSplitRatio={setSplitHorizontal}
            onDetalhar={setDetailLancamentoId}
            onEditarAvancado={(l) => setModalEdicao(l)}
            onLancamentoSalvo={handleLancamentoSalvo}
            onLancamentoRemovido={handleLancamentoRemovido}
            onToast={onToast}
          />
        </div>
      </div>

      {/* Modal de edição avançada */}
      {modalEdicao && (
        <LancamentoModal
          lancamentoExistente={modalEdicao}
          onClose={() => setModalEdicao(null)}
          onSaved={() => {
            setModalEdicao(null);
            void state.refreshSilencioso();
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
