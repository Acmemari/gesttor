/**
 * Grid hierárquico de despesas em modo somente leitura.
 *
 * Exibido no painel superior da tela unificada. Recebe a estrutura de contas,
 * meses e valores já agregados por folha; não faz fetch nem edição. Suporta
 * busca, expand/collapse e seleção de linha (usada para filtrar a tabela
 * de categorias do painel inferior).
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ContaPlanilha } from '../../lib/api/orcamentoItensClient';
import {
  somaCategoria,
  somaFolhaTotal,
  totalGeralPorMes,
  totalGeralGlobal,
  type HierarquiaContas,
} from './despesasPlanilha.utils';

interface Props {
  contas: ContaPlanilha[];
  hierarquia: HierarquiaContas;
  meses: string[];
  valoresPorFolha: Map<string, Record<string, number>>;
  selectedContaId: string | null;
  onSelectConta: (id: string | null) => void;
}

function formatBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function DespesasGridReadOnly({
  contas,
  hierarquia,
  meses,
  valoresPorFolha,
  selectedContaId,
  onSelectConta,
}: Props) {
  const [busca, setBusca] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const exp = new Set<string>();
    for (const c of contas) {
      if (c.nivel <= 2) exp.add(c.id);
    }
    return exp;
  });

  const { childrenById } = hierarquia;

  const linhasVisiveis = useMemo(() => {
    const buscaTrim = busca.trim().toLowerCase();
    const out: ContaPlanilha[] = [];

    function adicionarSeMatch(c: ContaPlanilha, paiVisivel: boolean) {
      const matchBusca =
        !buscaTrim ||
        c.nome.toLowerCase().includes(buscaTrim) ||
        c.numero.includes(buscaTrim);
      const filhos = childrenById.get(c.id) ?? [];
      if (filhos.length > 0) {
        const algumDescMatch = (() => {
          if (!buscaTrim) return true;
          const stack = [...filhos];
          while (stack.length) {
            const n = stack.pop()!;
            if (
              n.nome.toLowerCase().includes(buscaTrim) ||
              n.numero.includes(buscaTrim)
            )
              return true;
            stack.push(...(childrenById.get(n.id) ?? []));
          }
          return false;
        })();
        if (algumDescMatch && paiVisivel) {
          out.push(c);
          const aberta = buscaTrim ? true : expanded.has(c.id);
          if (aberta) {
            for (const f of filhos) adicionarSeMatch(f, true);
          }
        }
      } else {
        if (matchBusca && paiVisivel) out.push(c);
      }
    }

    const raizes = childrenById.get(null) ?? [];
    for (const r of raizes) adicionarSeMatch(r, true);
    return out;
  }, [busca, expanded, childrenById]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandirTudo() {
    const all = new Set<string>();
    for (const c of contas) if (!c.isFolha) all.add(c.id);
    setExpanded(all);
  }

  function handleSelect(id: string) {
    onSelectConta(selectedContaId === id ? null : id);
  }

  const gridTemplate = `minmax(200px, 280px) repeat(12, minmax(54px, 1fr)) minmax(80px, 100px)`;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 py-1.5 border-b border-slate-200 shrink-0 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Buscar conta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-[11px] rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={expandirTudo}
          className="text-[10.5px] text-slate-600 hover:text-slate-900"
        >
          Expandir tudo
        </button>
        <span className="text-slate-300 text-[10.5px]">·</span>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="text-[10.5px] text-slate-600 hover:text-slate-900"
        >
          Colapsar tudo
        </button>
        {selectedContaId && (
          <>
            <span className="text-slate-300 text-[10.5px]">·</span>
            <button
              type="button"
              onClick={() => onSelectConta(null)}
              className="text-[10.5px] text-emerald-700 hover:text-emerald-900"
            >
              Limpar seleção
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto relative">
        <div
          className="grid text-[10px] sticky top-0 z-20 bg-slate-100 border-b border-slate-300"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 py-1.5 font-semibold uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
            Conta
          </div>
          {meses.map((mes) => (
            <div key={mes} className="px-1.5 py-1.5 text-center font-medium text-slate-600">
              {format(parseISO(mes), 'MMM/yy', { locale: ptBR })}
            </div>
          ))}
          <div className="px-1.5 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600 sticky right-0 bg-slate-100 z-10 border-l border-slate-200">
            Total
          </div>
        </div>

        {linhasVisiveis.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Nenhuma conta disponível.
          </div>
        ) : (
          linhasVisiveis.map((c) => {
            const isCategoria = !c.isFolha;
            const isExp = expanded.has(c.id);
            const filhos = childrenById.get(c.id) ?? [];
            const hasChildren = filhos.length > 0;
            const isSelected = selectedContaId === c.id;

            const baseRow = 'grid border-b border-slate-100 cursor-pointer';
            const rowBg = isSelected
              ? 'bg-emerald-100 hover:bg-emerald-100'
              : isCategoria
                ? 'bg-slate-50/50 hover:bg-slate-50'
                : 'hover:bg-emerald-50/30';

            if (isCategoria) {
              return (
                <div
                  key={c.id}
                  className={[baseRow, rowBg].join(' ')}
                  style={{ gridTemplateColumns: gridTemplate }}
                  onClick={() => handleSelect(c.id)}
                >
                  <div
                    className={[
                      'px-2 py-1 text-[11px] font-medium text-slate-700 sticky left-0 z-10 border-r border-slate-100 flex items-center gap-1',
                      isSelected ? 'bg-emerald-100' : 'bg-slate-50/80',
                    ].join(' ')}
                    style={{ paddingLeft: 8 + (c.nivel - 1) * 12 }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(c.id);
                        }}
                        className="p-0.5 text-slate-500 hover:text-slate-800"
                      >
                        {isExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                    ) : (
                      <span className="w-2.5" aria-hidden="true" />
                    )}
                    <span className="text-[9.5px] text-slate-500 font-mono shrink-0">{c.numero}</span>
                    <span className="truncate">{c.nome}</span>
                  </div>
                  {meses.map((mes) => {
                    const total = somaCategoria(c.id, hierarquia, valoresPorFolha, mes);
                    return (
                      <div key={mes} className="px-1.5 py-1 text-right text-[10.5px] text-slate-600 tabular-nums">
                        {total > 0 ? formatBRL(total) : ''}
                      </div>
                    );
                  })}
                  <div
                    className={[
                      'px-1.5 py-1 text-right text-[10.5px] font-semibold text-slate-800 sticky right-0 z-10 border-l border-slate-100 tabular-nums',
                      isSelected ? 'bg-emerald-100' : 'bg-slate-50/80',
                    ].join(' ')}
                  >
                    {formatBRL(somaCategoria(c.id, hierarquia, valoresPorFolha))}
                  </div>
                </div>
              );
            }

            // Folha
            return (
              <div
                key={c.id}
                className={[baseRow, rowBg].join(' ')}
                style={{ gridTemplateColumns: gridTemplate }}
                onClick={() => handleSelect(c.id)}
              >
                <div
                  className={[
                    'px-2 py-1 text-[11px] text-slate-800 sticky left-0 z-10 border-r border-slate-100 flex items-center gap-1',
                    isSelected ? 'bg-emerald-100' : 'bg-white',
                  ].join(' ')}
                  style={{ paddingLeft: 8 + (c.nivel - 1) * 12 }}
                >
                  <span className="w-2.5" aria-hidden="true" />
                  <span className="text-[9.5px] text-slate-500 font-mono shrink-0">{c.numero}</span>
                  <span className="truncate">{c.nome}</span>
                </div>
                {meses.map((mes) => {
                  const v = valoresPorFolha.get(c.id)?.[mes];
                  const display = v !== undefined && v !== 0 ? formatBRL(v) : '';
                  return (
                    <div
                      key={mes}
                      className={[
                        'px-1.5 py-1 text-right text-[10.5px] tabular-nums',
                        display ? 'text-slate-800' : 'text-slate-300',
                      ].join(' ')}
                    >
                      {display || '—'}
                    </div>
                  );
                })}
                <div
                  className={[
                    'px-1.5 py-1 text-right text-[10.5px] font-medium text-slate-800 sticky right-0 z-10 border-l border-slate-100 tabular-nums',
                    isSelected ? 'bg-emerald-100' : 'bg-white',
                  ].join(' ')}
                >
                  {formatBRL(somaFolhaTotal(c.id, valoresPorFolha))}
                </div>
              </div>
            );
          })
        )}

        <div
          className="grid sticky bottom-0 z-20 bg-slate-900 text-white border-t border-slate-700"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide sticky left-0 bg-slate-900 z-10 border-r border-slate-700">
            Total do ramo
          </div>
          {meses.map((mes) => (
            <div key={mes} className="px-1.5 py-1.5 text-right text-[10.5px] font-medium tabular-nums">
              {formatBRL(totalGeralPorMes(contas, valoresPorFolha, mes))}
            </div>
          ))}
          <div className="px-1.5 py-1.5 text-right text-[10.5px] font-bold sticky right-0 bg-slate-900 z-10 border-l border-slate-700 tabular-nums">
            {formatBRL(totalGeralGlobal(contas, valoresPorFolha))}
          </div>
        </div>
      </div>
    </div>
  );
}
