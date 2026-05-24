/**
 * Painel direito da tela unificada: split vertical entre
 * - Tabela de Categorias (folhas + lançamentos) em cima
 * - Painel de Detalhamento de Produtos embaixo (carrega quando há lançamento selecionado)
 *
 * Quando nenhum lançamento está em "Detalhar", o painel inferior colapsa e
 * a tabela ocupa todo o espaço.
 *
 * Adapta a API antiga (selectedContaId + detailLancamentoId, vindos do
 * DespesasUnificada) para a API atual do CategoriasTabela (folhasIds +
 * detailFolhaId + modosDetalhados).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CategoriasTabela from './CategoriasTabela';
import ProdutosDetalhamentoPanel from './ProdutosDetalhamentoPanel';
import { createLancamento, type LancamentoRow } from '../../lib/api/lancamentosClient';
import {
  folhasDescendentes,
  type HierarquiaContas,
} from './despesasPlanilha.utils';

interface Props {
  versaoId: string;
  farmId: string;
  selectedContaId: string | null;
  hierarquia: HierarquiaContas;
  meses: string[];
  lancamentos: LancamentoRow[];
  lancamentosPorFolha: Map<string, LancamentoRow[]>;
  valoresPorFolha: Map<string, Record<string, number>>;
  detailLancamentoId: string | null;
  readOnly: boolean;
  splitRatio: number;
  onChangeSplitRatio: (ratio: number) => void;
  onDetalhar: (lancamentoId: string | null) => void;
  onEditarAvancado: (lancamento: LancamentoRow) => void;
  onLancamentoSalvo: (l: LancamentoRow) => void;
  onLancamentoRemovido: (id: string) => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

export default function CategoriasEDetalhamento({
  versaoId,
  farmId,
  selectedContaId,
  hierarquia,
  meses,
  lancamentos,
  lancamentosPorFolha,
  detailLancamentoId,
  readOnly,
  splitRatio,
  onChangeSplitRatio,
  onDetalhar,
  onEditarAvancado,
  onLancamentoSalvo,
  onLancamentoRemovido,
  onToast,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [modosDetalhados, setModosDetalhados] = useState<Set<string>>(new Set());
  const [creatingFolhaId, setCreatingFolhaId] = useState<string | null>(null);

  // ── Derivações do selectedContaId ─────────────────────────────────────────
  const folhasIds = useMemo(() => {
    if (!selectedContaId) return [];
    return folhasDescendentes(selectedContaId, hierarquia);
  }, [selectedContaId, hierarquia]);

  const contaSelecionada = selectedContaId
    ? hierarquia.porId.get(selectedContaId) ?? null
    : null;
  const centroNome = contaSelecionada?.nome ?? null;
  const subcentroNome = '—';
  const selectedCentroSubId = selectedContaId;

  // detailLancamentoId (parent) → detailFolhaId (CategoriasTabela)
  const detailFolhaId = useMemo(() => {
    if (!detailLancamentoId) return null;
    const l = lancamentos.find((x) => x.id === detailLancamentoId);
    return l?.planoContaId ?? null;
  }, [detailLancamentoId, lancamentos]);

  // Reseta os modos detalhados quando a seleção do grid muda
  useEffect(() => {
    setModosDetalhados(new Set());
  }, [selectedContaId]);

  const handleToggleModo = useCallback(
    (folhaId: string, modo: 'agregado' | 'detalhado') => {
      setModosDetalhados((prev) => {
        const next = new Set(prev);
        if (modo === 'detalhado') next.add(folhaId);
        else next.delete(folhaId);
        return next;
      });
    },
    [],
  );

  // Quando CategoriasTabela pede para detalhar uma folha, encontra o
  // lançamento principal e propaga o id para o parent. Se a folha ainda não
  // tem lançamento, cria um stub silenciosamente (mesmo padrão lazy de
  // CategoriasTabela.salvar) e abre o painel sobre ele.
  const handleDetalharFolha = useCallback(
    async (folhaId: string | null) => {
      if (!folhaId) {
        onDetalhar(null);
        return;
      }
      const lista = lancamentosPorFolha.get(folhaId) ?? [];
      const principal = lista.find((l) => l.status === 'ativo') ?? lista[0] ?? null;
      if (principal) {
        onDetalhar(principal.id);
        return;
      }
      if (readOnly) return;
      if (creatingFolhaId === folhaId) return;
      setCreatingFolhaId(folhaId);
      const distribuicaoMensal = Object.fromEntries(meses.map((m) => [m, 0]));
      const res = await createLancamento({
        versaoId,
        farmId,
        planoContaId: folhaId,
        recorrencia: 'mensal',
        valorBase: 0,
        distribuicaoMensal,
        status: 'ativo',
      });
      setCreatingFolhaId(null);
      if ('error' in res) {
        onToast?.(`Erro ao iniciar detalhamento: ${res.error}`, 'error');
        return;
      }
      onLancamentoSalvo(res.data);
      onDetalhar(res.data.id);
    },
    [
      lancamentosPorFolha,
      onDetalhar,
      readOnly,
      creatingFolhaId,
      meses,
      versaoId,
      farmId,
      onLancamentoSalvo,
      onToast,
    ],
  );

  // ── Painel direito ────────────────────────────────────────────────────────
  const lancamentoSelecionado: LancamentoRow | null = detailLancamentoId
    ? lancamentos.find((l) => l.id === detailLancamentoId) ?? null
    : null;
  const mostrarDireita = lancamentoSelecionado !== null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientY - rect.top) / rect.height;
      onChangeSplitRatio(Math.min(0.85, Math.max(0.3, ratio)));
    }
    function onUp() {
      setDragging(false);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onChangeSplitRatio]);

  const topFlex = mostrarDireita ? splitRatio : 1;
  const bottomFlex = mostrarDireita ? 1 - splitRatio : 0;

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden">
      <div
        style={{ flex: `${topFlex} 1 0%`, minHeight: 0 }}
        className="border-b border-slate-200 overflow-hidden"
      >
        <CategoriasTabela
          versaoId={versaoId}
          farmId={farmId}
          selectedCentroSubId={selectedCentroSubId}
          centroNome={centroNome}
          subcentroNome={subcentroNome}
          folhasIds={folhasIds}
          hierarquia={hierarquia}
          meses={meses}
          lancamentos={lancamentos}
          lancamentosPorFolha={lancamentosPorFolha}
          detailFolhaId={detailFolhaId}
          modosDetalhados={modosDetalhados}
          readOnly={readOnly}
          onDetalhar={handleDetalharFolha}
          onToggleModo={handleToggleModo}
          onEditarAvancado={onEditarAvancado}
          onLancamentoSalvo={onLancamentoSalvo}
          onLancamentoRemovido={onLancamentoRemovido}
          onToast={onToast}
        />
      </div>
      {mostrarDireita && (
        <>
          <div
            onMouseDown={handleMouseDown}
            className={[
              'h-1 cursor-row-resize bg-slate-200 hover:bg-emerald-400 transition-colors shrink-0',
              dragging ? 'bg-emerald-500' : '',
            ].join(' ')}
          />
          <div style={{ flex: `${bottomFlex} 1 0%`, minHeight: 0 }} className="overflow-hidden">
            <ProdutosDetalhamentoPanel
              lancamento={lancamentoSelecionado}
              readOnly={readOnly}
              onClose={() => onDetalhar(null)}
              onSaved={onLancamentoSalvo}
              onToast={onToast}
            />
          </div>
        </>
      )}
    </div>
  );
}
