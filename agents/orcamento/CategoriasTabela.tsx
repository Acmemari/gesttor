/**
 * Tabela "Categorias · de {CC} › {Subcentro}".
 *
 * Cada linha é uma categoria-folha. Tem um único lançamento associado
 * (criado lazy ao primeiro commit). Suporta dois modos:
 *  - agregado: valor mensal editável direto na linha
 *  - detalhado: valor mensal read-only (= soma_produtos / meses_ativos),
 *    detalhamento de produtos no painel à direita
 *
 * Distribuição é um ícone de calendário (com badge contador quando sazonal)
 * que abre o DistribuicaoPopover.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Loader2,
  Package,
  Plus,
  Sparkles,
  Check,
  AlertCircle,
  MoreHorizontal,
  Edit3,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL, parseBRL } from '../../lib/format/brl';
import type { ContaPlanilha } from '../../lib/api/orcamentoItensClient';
import {
  createLancamento,
  updateLancamento,
  deleteLancamento,
  type LancamentoRow,
  type Recorrencia,
} from '../../lib/api/lancamentosClient';

/**
 * Formata um input livre como BRL com separador de milhar enquanto o usuário
 * digita. Preserva a vírgula (e até 2 dígitos decimais) se presente.
 */
function formatLiveBRL(input: string): string {
  const hasComma = input.includes(',');
  const cleaned = input.replace(/\./g, '');
  const [intRaw, decRaw] = cleaned.split(',');
  const intPart = (intRaw || '').replace(/\D/g, '');
  const decPart = decRaw !== undefined ? decRaw.replace(/\D/g, '').slice(0, 2) : undefined;
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (hasComma) {
    return decPart !== undefined && decPart.length > 0
      ? `${intFormatted},${decPart}`
      : `${intFormatted},`;
  }
  return intFormatted;
}
import type { HierarquiaContas } from './despesasPlanilha.utils';
import {
  distribuirValor,
  mesesAtivosDe,
  valorMensalMedio,
} from './despesasPlanilha.utils';
import DistribuicaoPopover, { type DistribuicaoTipo } from './DistribuicaoPopover';

interface Props {
  versaoId: string;
  farmId: string;
  /** ID composto `${ccId}|${subId}` selecionado no grid superior. */
  selectedCentroSubId: string | null;
  centroNome: string | null;
  subcentroNome: string | null;
  folhasIds: string[];
  hierarquia: HierarquiaContas;
  meses: string[];
  lancamentos: LancamentoRow[];
  lancamentosPorFolha: Map<string, LancamentoRow[]>;
  detailFolhaId: string | null;
  modosDetalhados: Set<string>;
  readOnly: boolean;
  onDetalhar: (folhaId: string | null) => void;
  onToggleModo: (folhaId: string, modo: 'agregado' | 'detalhado') => void;
  onEditarAvancado: (lancamento: LancamentoRow) => void;
  onLancamentoSalvo: (l: LancamentoRow) => void;
  onLancamentoRemovido: (id: string) => void;
  onAdicionarCategoria?: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

interface SaveStatePorLinha {
  state: 'idle' | 'saving' | 'saved' | 'error';
  at?: number;
}

const SAVE_DEBOUNCE_MS = 800;

export default function CategoriasTabela({
  versaoId,
  farmId,
  selectedCentroSubId,
  centroNome,
  subcentroNome,
  folhasIds,
  hierarquia,
  meses,
  lancamentos,
  lancamentosPorFolha,
  detailFolhaId,
  modosDetalhados,
  readOnly,
  onDetalhar,
  onToggleModo,
  onEditarAvancado,
  onLancamentoSalvo,
  onLancamentoRemovido,
  onAdicionarCategoria,
  onToast,
}: Props) {
  const [savingPorLinha, setSavingPorLinha] = useState<Map<string, SaveStatePorLinha>>(
    new Map(),
  );
  const [popoverPara, setPopoverPara] = useState<string | null>(null);
  const [menuPara, setMenuPara] = useState<string | null>(null);

  function setSaveState(linhaId: string, state: SaveStatePorLinha['state']) {
    setSavingPorLinha((prev) => {
      const next = new Map(prev);
      next.set(linhaId, { state, at: Date.now() });
      return next;
    });
    if (state === 'saved') {
      setTimeout(() => {
        setSavingPorLinha((prev) => {
          const next = new Map(prev);
          const cur = next.get(linhaId);
          if (cur && cur.state === 'saved' && Date.now() - (cur.at ?? 0) >= 1800) {
            next.delete(linhaId);
          }
          return next;
        });
      }, 2000);
    }
  }

  /** Devolve o lançamento "principal" da folha (primeiro ativo). */
  function lancamentoPrincipal(folhaId: string): LancamentoRow | null {
    const lista = lancamentosPorFolha.get(folhaId) ?? [];
    return lista.find((l) => l.status === 'ativo') ?? lista[0] ?? null;
  }

  async function salvar(
    folha: ContaPlanilha,
    lancamentoAtual: LancamentoRow | null,
    patch: {
      tipo?: DistribuicaoTipo;
      valorMensal?: number;
      mesesAtivos?: string[];
    },
  ): Promise<LancamentoRow | null> {
    const linhaId = folha.id;
    setSaveState(linhaId, 'saving');

    // Recorrência e meses ativos finais
    const recorrenciaAtual: Recorrencia =
      patch.tipo === 'mensal'
        ? 'mensal'
        : patch.tipo === 'sazonal'
          ? 'sazonal'
          : (lancamentoAtual?.recorrencia ?? 'mensal');

    let valorMensal = patch.valorMensal;
    if (valorMensal === undefined && lancamentoAtual) {
      valorMensal =
        lancamentoAtual.recorrencia === 'mensal'
          ? lancamentoAtual.valorBase
          : valorMensalMedio(lancamentoAtual.distribuicaoMensal);
    }
    valorMensal = valorMensal ?? 0;

    let mesesAtivos = patch.mesesAtivos;
    if (mesesAtivos === undefined) {
      if (recorrenciaAtual === 'mensal') {
        mesesAtivos = meses.slice();
      } else if (lancamentoAtual) {
        const atuais = mesesAtivosDe(lancamentoAtual.distribuicaoMensal);
        mesesAtivos = atuais.length > 0 ? atuais : meses.slice();
      } else {
        mesesAtivos = meses.slice();
      }
    }

    const distribuicao = distribuirValor(valorMensal, recorrenciaAtual, meses, mesesAtivos);
    if (recorrenciaAtual !== 'mensal') {
      for (const k of Object.keys(distribuicao)) {
        if (!distribuicao[k]) delete distribuicao[k];
      }
    }

    try {
      const res = lancamentoAtual
        ? await updateLancamento(lancamentoAtual.id, {
            recorrencia: recorrenciaAtual,
            valorBase: valorMensal,
            distribuicaoMensal: distribuicao,
          })
        : await createLancamento({
            versaoId,
            farmId,
            planoContaId: folha.id,
            recorrencia: recorrenciaAtual,
            valorBase: valorMensal,
            distribuicaoMensal: distribuicao,
            status: 'ativo',
          });

      if ('error' in res) {
        setSaveState(linhaId, 'error');
        onToast?.(`Erro ao salvar: ${res.error}`, 'error');
        return null;
      }
      onLancamentoSalvo(res.data);
      setSaveState(linhaId, 'saved');
      return res.data;
    } catch (err) {
      setSaveState(linhaId, 'error');
      onToast?.('Erro inesperado ao salvar', 'error');
      return null;
    }
  }

  async function remover(lancamento: LancamentoRow) {
    if (!confirm('Remover este lançamento? Esta ação não pode ser desfeita.')) return;
    const res = await deleteLancamento(lancamento.id);
    if ('error' in res) {
      onToast?.(`Erro ao remover: ${res.error}`, 'error');
      return;
    }
    onLancamentoRemovido(lancamento.id);
    if (detailFolhaId === lancamento.planoContaId) onDetalhar(null);
    onToast?.('Lançamento removido.', 'success');
  }

  // Estados vazios
  if (!selectedCentroSubId) {
    return (
      <PlaceholderTabela
        icon={<Sparkles size={28} className="opacity-40" />}
        title="Selecione um centro de custo"
        subtitle="Clique numa linha da grade acima para listar suas categorias."
      />
    );
  }

  // Totais por folha (visualização)
  function valorMensalFolha(folha: ContaPlanilha): number {
    const lanc = lancamentoPrincipal(folha.id);
    if (!lanc) return 0;
    return lanc.recorrencia === 'mensal'
      ? lanc.valorBase
      : valorMensalMedio(lanc.distribuicaoMensal);
  }

  function totalAnualFolha(folha: ContaPlanilha): number {
    const lanc = lancamentoPrincipal(folha.id);
    if (!lanc) return 0;
    return Object.values(lanc.distribuicaoMensal).reduce((a, b) => a + b, 0);
  }

  const totalCategorias = folhasIds.reduce((acc, fid) => {
    const folha = hierarquia.porId.get(fid);
    if (!folha) return acc;
    return acc + totalAnualFolha(folha);
  }, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-3">
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[12px] font-semibold text-slate-800">Categorias</span>
          {centroNome && (
            <span className="text-[10.5px] text-slate-500 truncate">
              {centroNome}
              {subcentroNome && subcentroNome !== '—' && ` › ${subcentroNome}`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            onAdicionarCategoria?.() ||
            onToast?.(
              'Adicionar categoria requer configurar o plano de contas.',
              'error',
            )
          }
          title="Adicionar categoria"
          aria-label="Adicionar categoria"
          className="p-1 rounded hover:bg-emerald-50 hover:text-emerald-700 text-slate-600"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Header de colunas */}
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_28px_28px] gap-2 px-4 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] uppercase tracking-wider font-semibold text-slate-600 shrink-0">
        <div />
        <div>Categoria</div>
        <div className="text-right">Valor Mensal</div>
        <div />
        <div />
      </div>

      {/* Linhas */}
      <div className="flex-1 overflow-auto">
        {folhasIds.map((fid) => {
          const folha = hierarquia.porId.get(fid);
          if (!folha) return null;
          const lanc = lancamentoPrincipal(fid);
          const detalhado = modosDetalhados.has(fid);
          const isSelected = detailFolhaId === fid;
          return (
            <LinhaCategoria
              key={fid}
              folha={folha}
              lancamento={lanc}
              meses={meses}
              valorMensalAtual={valorMensalFolha(folha)}
              totalAnualAtual={totalAnualFolha(folha)}
              detalhado={detalhado}
              isSelected={isSelected}
              readOnly={readOnly}
              saveState={savingPorLinha.get(fid)?.state ?? 'idle'}
              popoverAberto={popoverPara === fid}
              menuAberto={menuPara === fid}
              onCommitValor={(v) => salvar(folha, lanc, { valorMensal: v })}
              onChangeTipo={(tipo) => salvar(folha, lanc, { tipo })}
              onChangeMesesAtivos={(novos) =>
                salvar(folha, lanc, { tipo: 'sazonal', mesesAtivos: novos })
              }
              onClickDetalhar={() => {
                if (detalhado && isSelected) {
                  onToggleModo(fid, 'agregado');
                  onDetalhar(null);
                } else {
                  onToggleModo(fid, 'detalhado');
                  onDetalhar(fid);
                }
              }}
              onTogglePopover={() =>
                setPopoverPara(popoverPara === fid ? null : fid)
              }
              onToggleMenu={() => setMenuPara(menuPara === fid ? null : fid)}
              onCloseMenu={() => setMenuPara(null)}
              onEditarAvancado={() => {
                setMenuPara(null);
                if (lanc) onEditarAvancado(lanc);
              }}
              onRemover={() => {
                setMenuPara(null);
                if (lanc) void remover(lanc);
              }}
            />
          );
        })}
      </div>

      {/* Rodapé */}
      <div className="px-4 py-2 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between">
        <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-600">
          Total anual
        </span>
        <span className="font-bold text-slate-900 tabular-nums text-[11px]">
          {formatBRL(totalCategorias) || '0'}
        </span>
      </div>
    </div>
  );
}

// ─── Linha de categoria ────────────────────────────────────────────────────

interface LinhaCategoriaProps {
  folha: ContaPlanilha;
  lancamento: LancamentoRow | null;
  meses: string[];
  valorMensalAtual: number;
  totalAnualAtual: number;
  detalhado: boolean;
  isSelected: boolean;
  readOnly: boolean;
  saveState: SaveStatePorLinha['state'];
  popoverAberto: boolean;
  menuAberto: boolean;
  onCommitValor: (v: number) => Promise<LancamentoRow | null>;
  onChangeTipo: (tipo: DistribuicaoTipo) => Promise<LancamentoRow | null>;
  onChangeMesesAtivos: (novos: string[]) => Promise<LancamentoRow | null>;
  onClickDetalhar: () => void;
  onTogglePopover: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onEditarAvancado: () => void;
  onRemover: () => void;
}

function LinhaCategoria({
  folha,
  lancamento,
  meses,
  valorMensalAtual,
  totalAnualAtual,
  detalhado,
  isSelected,
  readOnly,
  saveState,
  popoverAberto,
  menuAberto,
  onCommitValor,
  onChangeTipo,
  onChangeMesesAtivos,
  onClickDetalhar,
  onTogglePopover,
  onToggleMenu,
  onCloseMenu,
  onEditarAvancado,
  onRemover,
}: LinhaCategoriaProps) {
  // Tipo efetivo de distribuição (legado 'unica' renderiza como sazonal)
  const tipoEfetivo: DistribuicaoTipo =
    lancamento?.recorrencia === 'mensal' ? 'mensal' : 'sazonal';
  const mesesAtivos =
    !lancamento || lancamento.recorrencia === 'mensal'
      ? meses.slice()
      : mesesAtivosDe(lancamento.distribuicaoMensal);

  const [draft, setDraft] = useState<string>(formatBRL(valorMensalAtual));
  const [editing, setEditing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(formatBRL(valorMensalAtual));
    }
  }, [valorMensalAtual, editing]);

  function commit() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const valor = parseBRL(draft) ?? 0;
    if (Math.abs(valor - valorMensalAtual) > 0.001) {
      void onCommitValor(valor);
    }
    setEditing(false);
  }

  function scheduleCommit(rawDraft: string) {
    const masked = formatLiveBRL(rawDraft);
    setDraft(masked);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const valor = parseBRL(masked) ?? 0;
      if (Math.abs(valor - valorMensalAtual) > 0.001) {
        void onCommitValor(valor);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // Label do pill de distribuição
  let labelDist: string;
  if (tipoEfetivo === 'mensal') {
    labelDist = 'Mensal igual';
  } else if (mesesAtivos.length === 1) {
    labelDist = `Sazonal · ${format(parseISO(mesesAtivos[0]), 'MMM', { locale: ptBR })}`;
  } else {
    labelDist = `Sazonal · ${mesesAtivos.length} meses`;
  }

  return (
    <div
      className={[
        'grid grid-cols-[28px_minmax(0,1fr)_auto_28px_28px] gap-2 px-4 py-2 items-center border-b border-slate-100 tabular-nums',
        isSelected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50',
      ].join(' ')}
    >
      {/* Calendar / Sazonal — abre o popover de distribuição */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={onTogglePopover}
          disabled={readOnly}
          title={labelDist}
          aria-label={labelDist}
          className="relative inline-flex items-center justify-center w-6 h-6 rounded border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 text-slate-500 disabled:opacity-50"
        >
          <Calendar size={12} />
          {tipoEfetivo === 'sazonal' && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {mesesAtivos.length}
            </span>
          )}
        </button>
        {popoverAberto && (
          <DistribuicaoPopover
            meses={meses}
            tipo={tipoEfetivo}
            mesesAtivos={mesesAtivos}
            readOnly={readOnly}
            onChangeTipo={(t) => {
              void onChangeTipo(t);
            }}
            onChangeMesesAtivos={(novos) => {
              void onChangeMesesAtivos(novos);
            }}
            onClose={onTogglePopover}
          />
        )}
      </div>

      {/* Nome da categoria */}
      <span className="text-[11px] text-slate-800 truncate" title={folha.nome}>
        {folha.nome}
      </span>

      {/* Valor mensal + badge Σ + indicadores de save */}
      <div className="flex items-center justify-end gap-1">
        {detalhado ? (
          <span
            className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded"
            title="Soma dos produtos"
          >
            Σ
          </span>
        ) : (
          <span className="w-4 h-4 inline-block" aria-hidden />
        )}
        {saveState === 'saving' && (
          <Loader2 size={11} className="animate-spin text-slate-400" />
        )}
        {saveState === 'saved' && <Check size={11} className="text-emerald-500" />}
        {saveState === 'error' && (
          <AlertCircle size={11} className="text-red-500" />
        )}
        {detalhado ? (
          <span
            className="text-[11px] font-medium text-slate-700"
            title={`Total anual: ${formatBRL(totalAnualAtual) || '0'}`}
          >
            R$ {formatBRL(valorMensalAtual) || '0'}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-slate-400">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              disabled={readOnly}
              title={`Total anual: ${formatBRL(totalAnualAtual) || '0'}`}
              onFocus={() => setEditing(true)}
              onChange={(e) => scheduleCommit(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setDraft(formatBRL(valorMensalAtual));
                  setEditing(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="0"
              className="w-20 px-1.5 py-0.5 text-[10px] text-right border border-slate-200 rounded hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
            />
          </div>
        )}
      </div>

      {/* Cubo: detalhar produtos */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onClickDetalhar}
          disabled={readOnly}
          title={detalhado ? 'Detalhado (clique para voltar a agregado)' : 'Detalhar produtos'}
          aria-label={detalhado ? 'Detalhado' : 'Detalhar'}
          className={[
            'inline-flex items-center justify-center w-6 h-6 rounded border transition-colors disabled:opacity-50',
            detalhado
              ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-white border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-700',
          ].join(' ')}
        >
          <Package size={12} />
        </button>
      </div>

      {/* Menu [...] — editar ou remover lançamento */}
      <div className="relative flex items-center justify-end">
        <button
          type="button"
          onClick={onToggleMenu}
          disabled={readOnly || !lancamento}
          title="Mais ações"
          aria-label="Mais ações"
          className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-40"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuAberto && lancamento && (
          <MenuLinha
            onClose={onCloseMenu}
            onEditar={onEditarAvancado}
            onRemover={onRemover}
          />
        )}
      </div>
    </div>
  );
}

function MenuLinha({
  onClose,
  onEditar,
  onRemover,
}: {
  onClose: () => void;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-40 mt-1 w-40 rounded-md border border-slate-200 bg-white shadow-lg py-1"
    >
      <button
        type="button"
        onClick={onEditar}
        className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-2"
      >
        <Edit3 size={11} />
        Editar valor
      </button>
      <button
        type="button"
        onClick={onRemover}
        className="w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-red-50 flex items-center gap-2"
      >
        <Trash2 size={11} />
        Excluir valor
      </button>
    </div>
  );
}

function PlaceholderTabela({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-medium text-slate-700 mb-1">{title}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}