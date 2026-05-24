/**
 * Aba "Lançamentos" — lista os lançamentos da versão+farm ativa, com filtros e
 * botão "Novo lançamento". Permite editar/remover cada item.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, Receipt, Search, Trash2, Edit3, FileText } from 'lucide-react';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import { useHierarchy } from '../../contexts/HierarchyContext';
import {
  deleteLancamento,
  listLancamentos,
  type LancamentoRow,
} from '../../lib/api/lancamentosClient';
import { listPlanoContas, type PlanoContaRow } from '../../lib/api/orcamentosClient';
import { formatBRLFull } from '../../lib/format/brl';
import LancamentoModal from './LancamentoModal';

interface Props {
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

export default function LancamentosLista({ onToast }: Props) {
  const { versaoAtiva } = useOrcamento();
  const { selectedFarm } = useHierarchy();
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([]);
  const [contas, setContas] = useState<PlanoContaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [incluirShadow, setIncluirShadow] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<LancamentoRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    listPlanoContas().then(setContas);
  }, []);

  useEffect(() => {
    if (!versaoAtiva || !selectedFarm) {
      setLancamentos([]);
      return;
    }
    let aborted = false;
    setLoading(true);
    listLancamentos({
      versaoId: versaoAtiva.id,
      farmId: selectedFarm.id,
      incluirShadow,
    })
      .then((data) => {
        if (!aborted) setLancamentos(data);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [versaoAtiva, selectedFarm, incluirShadow, refreshKey]);

  const contasById = useMemo(() => {
    const m = new Map<string, PlanoContaRow>();
    for (const c of contas) m.set(c.id, c);
    return m;
  }, [contas]);

  function caminhoConta(planoContaId: string): string {
    const c = contasById.get(planoContaId);
    if (!c) return planoContaId;
    const path: string[] = [c.nome];
    let cur = c.numeroPaiId ? contasById.get(c.numeroPaiId) : null;
    while (cur) {
      path.unshift(cur.nome);
      cur = cur.numeroPaiId ? contasById.get(cur.numeroPaiId) : null;
    }
    return path.join(' › ');
  }

  const buscaTrim = busca.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!buscaTrim) return lancamentos;
    return lancamentos.filter((l) => {
      const caminho = caminhoConta(l.planoContaId).toLowerCase();
      const desc = (l.descricao ?? '').toLowerCase();
      return caminho.includes(buscaTrim) || desc.includes(buscaTrim);
    });
  }, [lancamentos, buscaTrim, contasById]);

  // Agrupa por raiz (Centro de custo)
  const grupos = useMemo(() => {
    const out = new Map<string, LancamentoRow[]>();
    for (const l of filtrados) {
      const c = contasById.get(l.planoContaId);
      let raiz = c?.nome ?? 'Outros';
      // sobe até a raiz
      let cur = c?.numeroPaiId ? contasById.get(c.numeroPaiId) : null;
      while (cur?.numeroPaiId) cur = contasById.get(cur.numeroPaiId);
      if (cur) raiz = cur.nome;
      const arr = out.get(raiz) ?? [];
      arr.push(l);
      out.set(raiz, arr);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados, contasById]);

  async function remover(id: string) {
    if (!confirm('Remover este lançamento? A planilha será recalculada.')) return;
    const res = await deleteLancamento(id);
    if ('error' in res) {
      onToast?.(`Erro ao remover: ${res.error}`, 'error');
      return;
    }
    onToast?.('Lançamento removido.', 'success');
    setRefreshKey((k) => k + 1);
  }

  if (!versaoAtiva) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum orçamento ativo</p>
      </div>
    );
  }
  if (!selectedFarm) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <AlertCircle size={32} className="mb-3 opacity-40" />
        <p className="text-sm">Selecione uma fazenda no header.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-slate-200 shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por conta ou descrição…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={incluirShadow}
            onChange={(e) => setIncluirShadow(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Incluir lançamentos da planilha
        </label>
        <button
          type="button"
          onClick={() => {
            setEmEdicao(null);
            setModalAberto(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
        >
          <Plus size={14} />
          Novo lançamento
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
            <Loader2 size={24} className="animate-spin mb-2" />
            <p className="text-sm">Carregando lançamentos…</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16 px-6 text-center">
            <Receipt size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-slate-700 mb-1">
              {busca ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento ainda'}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              {busca
                ? 'Tente outra busca ou crie um novo lançamento.'
                : 'Crie seu primeiro lançamento detalhado de despesa.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setEmEdicao(null);
                setModalAberto(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              <Plus size={14} />
              Novo lançamento
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {grupos.map(([raiz, lans]) => (
              <section key={raiz}>
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 px-1">
                  {raiz}
                </h3>
                <div className="space-y-1.5">
                  {lans.map((l) => {
                    const totalAnual = Object.values(l.distribuicaoMensal).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    return (
                      <div
                        key={l.id}
                        className="rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800 truncate">
                                {l.descricao || caminhoConta(l.planoContaId)}
                              </span>
                              {l.status === 'rascunho' && (
                                <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Rascunho
                                </span>
                              )}
                              {l.tipoOrigem === 'planilha' && (
                                <span className="text-[10px] uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  Planilha
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {caminhoConta(l.planoContaId)} ·{' '}
                              <span className="capitalize">{l.recorrencia}</span>
                              {l.produtos.length > 0 && ` · ${l.produtos.length} produto(s)`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatBRLFull(totalAnual)}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                              Total anual
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEmEdicao(l);
                                setModalAberto(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                              title="Editar"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => remover(l.id)}
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Remover"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {l.observacao && (
                          <div className="px-3 py-1.5 border-t border-slate-100 flex items-start gap-1.5 text-xs text-slate-600 bg-slate-50">
                            <FileText size={11} className="mt-0.5 shrink-0 text-slate-400" />
                            <span>{l.observacao}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {modalAberto && (
        <LancamentoModal
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false);
            setRefreshKey((k) => k + 1);
          }}
          onToast={onToast}
          lancamentoExistente={emEdicao}
        />
      )}
    </div>
  );
}
