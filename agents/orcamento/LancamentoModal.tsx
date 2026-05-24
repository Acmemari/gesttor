/**
 * Modal de criação/edição de Lançamento de Despesa.
 *
 * Estrutura:
 * - Cascata Centro → Subcentro → Categoria → Folha
 * - Recorrência (Mensal / Sazonal / Única) segmented
 * - Valor mensal + toggle "Detalhar produtos"
 * - Distribuição mensal visual (12 barras)
 * - Observação
 * - Botões: Salvar rascunho | Cancelar | Adicionar à planilha
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Receipt, Calendar, FileText } from 'lucide-react';
import { format, parseISO, addMonths } from 'date-fns';
import { ModalShell } from '../../components/eap/ModalShell';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { listPlanoContas, type PlanoContaRow } from '../../lib/api/orcamentosClient';
import {
  createLancamento,
  updateLancamento,
  type LancamentoRow,
  type ProdutoInput,
  type Recorrencia,
} from '../../lib/api/lancamentosClient';
import { formatBRL, formatBRLFull, parseBRL } from '../../lib/format/brl';
import LancamentoCascata from './LancamentoCascata';
import LancamentoDistribuicaoBars from './LancamentoDistribuicaoBars';
import LancamentoProdutosTable from './LancamentoProdutosTable';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
  /** Quando passado, abre em modo edição. */
  lancamentoExistente?: LancamentoRow | null;
  /** Quando vier do clique na planilha, pré-seleciona a conta. */
  planoContaIdInicial?: string | null;
}

function gerarMeses(dataInicioIso: string): string[] {
  const inicio = parseISO(dataInicioIso);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(format(addMonths(inicio, i), 'yyyy-MM-01'));
  return out;
}

export default function LancamentoModal({
  onClose,
  onSaved,
  onToast,
  lancamentoExistente,
  planoContaIdInicial,
}: Props) {
  const { orcamentoAtivo, versaoAtiva } = useOrcamento();
  const { selectedFarm } = useHierarchy();

  const [contas, setContas] = useState<PlanoContaRow[]>([]);
  const [planoContaId, setPlanoContaId] = useState<string | null>(
    lancamentoExistente?.planoContaId ?? planoContaIdInicial ?? null,
  );
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(
    lancamentoExistente?.recorrencia ?? 'mensal',
  );
  const [descricao, setDescricao] = useState(lancamentoExistente?.descricao ?? '');
  const [valorBase, setValorBase] = useState<number>(lancamentoExistente?.valorBase ?? 0);
  const [distribuicao, setDistribuicao] = useState<Record<string, number>>(
    lancamentoExistente?.distribuicaoMensal ?? {},
  );
  const [observacao, setObservacao] = useState(lancamentoExistente?.observacao ?? '');
  const [mostrarDetalhes, setMostrarDetalhes] = useState(
    (lancamentoExistente?.produtos.length ?? 0) > 0,
  );
  const [produtos, setProdutos] = useState<ProdutoInput[]>(
    lancamentoExistente?.produtos.map((p) => ({
      nome: p.nome,
      quantidade: p.quantidade,
      unidade: p.unidade,
      valorUnitario: p.valorUnitario,
    })) ?? [],
  );
  const [salvando, setSalvando] = useState(false);

  const meses = useMemo(() => {
    return orcamentoAtivo ? gerarMeses(orcamentoAtivo.dataInicio) : [];
  }, [orcamentoAtivo]);

  // Carrega plano de contas
  useEffect(() => {
    listPlanoContas().then(setContas);
  }, []);

  // Ao mudar recorrência ou valor base, atualiza a distribuição efetiva (sem
  // perder overrides). Mantemos só os "extras" que diferem do padrão.
  useEffect(() => {
    if (lancamentoExistente) return; // edição: não recompor automaticamente
    if (recorrencia === 'mensal') {
      // mensal: distribuição = valor base por mês, salvo overrides existentes.
      // Não preenchemos todos os 12 meses no state — o componente de barras
      // resolve fallback para valorBase. Mantemos só overrides aqui.
      setDistribuicao((prev) => {
        // limpa entradas == valorBase (deixa só overrides)
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v !== valorBase) next[k] = v;
        }
        return next;
      });
    } else if (recorrencia === 'unica') {
      // apenas 1 mês ativo (primeiro selecionado ou primeiro mês)
      setDistribuicao((prev) => {
        const entries = Object.entries(prev).filter(([, v]) => v > 0);
        if (entries.length > 0) return { [entries[0][0]]: entries[0][1] };
        if (meses.length > 0) return { [meses[0]]: valorBase };
        return {};
      });
    }
    // sazonal: usuário escolhe livremente — não mexer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrencia]);

  const contaSelecionada = useMemo(
    () => contas.find((c) => c.id === planoContaId) ?? null,
    [planoContaId, contas],
  );

  const folhaOk = !!contaSelecionada?.isFolha;
  const podeSalvar =
    folhaOk &&
    !!versaoAtiva &&
    !!selectedFarm &&
    !!orcamentoAtivo &&
    !salvando &&
    (valorBase > 0 || produtos.length > 0 || Object.keys(distribuicao).length > 0);

  // Calcula totais
  const valorEfetivoPorMes = (m: string) => {
    const v = distribuicao[m];
    if (v !== undefined) return v;
    return recorrencia === 'mensal' ? valorBase : 0;
  };
  const totalAnual = meses.reduce((acc, m) => acc + valorEfetivoPorMes(m), 0);
  const valorMensalAnualizado = recorrencia === 'mensal' ? valorBase * 12 : totalAnual;

  async function salvar(comoRascunho: boolean) {
    if (!versaoAtiva || !selectedFarm || !planoContaId) return;
    setSalvando(true);

    // Materializa a distribuição completa (12 meses) pra enviar.
    const distribFinal: Record<string, number> = {};
    for (const m of meses) {
      const v = valorEfetivoPorMes(m);
      if (v !== 0 || recorrencia === 'mensal') distribFinal[m] = v;
    }
    // Sazonal: filtra zeros
    if (recorrencia === 'sazonal') {
      for (const k of Object.keys(distribFinal)) {
        if (!distribFinal[k]) delete distribFinal[k];
      }
    }

    try {
      const payload = {
        recorrencia,
        valorBase,
        distribuicaoMensal: distribFinal,
        descricao: descricao || null,
        observacao: observacao || null,
        status: (comoRascunho ? 'rascunho' : 'ativo') as 'rascunho' | 'ativo',
        produtos: mostrarDetalhes && produtos.length > 0 ? produtos : [],
      };

      const res = lancamentoExistente
        ? await updateLancamento(lancamentoExistente.id, payload)
        : await createLancamento({
            ...payload,
            versaoId: versaoAtiva.id,
            farmId: selectedFarm.id,
            planoContaId,
          });

      if ('error' in res) {
        onToast?.(`Erro ao salvar: ${res.error}`, 'error');
        setSalvando(false);
        return;
      }
      onToast?.(comoRascunho ? 'Rascunho salvo.' : 'Lançamento adicionado à planilha.', 'success');
      onSaved();
    } catch (err) {
      onToast?.('Erro inesperado ao salvar', 'error');
      setSalvando(false);
    }
  }

  const titulo = lancamentoExistente ? 'Editar lançamento' : 'Novo lançamento de despesa';
  const subtitulo = 'Centro de custo › Subcentro › Categoria · valor mensal e detalhamento opcional em produtos';

  return (
    <ModalShell title={titulo} subtitle={subtitulo} onClose={onClose}>
      <div className="space-y-5">
        {/* Classificação */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={14} className="text-slate-500" />
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Classificação
            </span>
          </div>
          <LancamentoCascata
            contas={contas}
            selectedId={planoContaId}
            onChange={setPlanoContaId}
            disabled={!!lancamentoExistente}
          />
        </section>

        {/* Recorrência */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-slate-500" />
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Recorrência
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['mensal', 'Mensal', 'todo mês'],
              ['sazonal', 'Sazonal', 'meses específicos'],
              ['unica', 'Única', 'pontual'],
            ] as const).map(([key, label, desc]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRecorrencia(key)}
                className={[
                  'rounded-md border px-3 py-2 text-left transition-colors',
                  recorrencia === key
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                ].join(' ')}
              >
                <div className="text-sm font-medium text-slate-900">{label}</div>
                <div className="text-[11px] text-slate-500">{desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Valor */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Valor
            </span>
            <button
              type="button"
              onClick={() => setMostrarDetalhes((v) => !v)}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium"
            >
              {mostrarDetalhes ? 'Ocultar detalhes' : 'Detalhar produtos'}
            </button>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              {recorrencia === 'mensal' ? 'Valor mensal *' : recorrencia === 'unica' ? 'Valor único *' : 'Valor base *'}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valorBase ? String(valorBase).replace('.', ',') : ''}
                onChange={(e) => {
                  const n = parseBRL(e.target.value);
                  setValorBase(n ?? 0);
                }}
                placeholder="0,00"
                disabled={mostrarDetalhes && produtos.length > 0}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            {mostrarDetalhes && produtos.length > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Valor controlado pelos produtos detalhados abaixo.
              </p>
            )}
          </div>
        </section>

        {/* Detalhamento em produtos */}
        {mostrarDetalhes && (
          <section>
            <LancamentoProdutosTable
              produtos={produtos}
              onChange={setProdutos}
              valorMensalAnualizado={valorMensalAnualizado}
            />
          </section>
        )}

        {/* Distribuição mensal (só se não há produtos OU se sazonal/única) */}
        {meses.length > 0 && (
          <section>
            <LancamentoDistribuicaoBars
              meses={meses}
              recorrencia={recorrencia}
              valorBase={valorBase}
              distribuicaoMensal={distribuicao}
              onChange={setDistribuicao}
              readOnly={mostrarDetalhes && produtos.length > 0}
            />
          </section>
        )}

        {/* Total anual */}
        <section className="rounded-md bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Total Anual</div>
            {recorrencia === 'mensal' && !mostrarDetalhes && (
              <div className="text-[11px] text-slate-400 mt-0.5">
                Média de {formatBRL(valorBase)}/mês
              </div>
            )}
          </div>
          <div className="text-xl font-semibold">{formatBRLFull(totalAnual)}</div>
        </section>

        {/* Descrição + Observação */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-slate-500" />
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Identificação
            </span>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição curta (ex.: Vacinação Aftosa 1º semestre)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Observações opcionais"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
            />
          </div>
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={!podeSalvar}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Salvar como rascunho
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 rounded-md hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => salvar(false)}
              disabled={!podeSalvar}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Salvando…
                </>
              ) : lancamentoExistente ? (
                'Atualizar'
              ) : (
                'Adicionar à planilha'
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
