/**
 * Grade "Centro de custo × Meses" — visualização agregada.
 *
 * Linhas = combinações Centro de Custo × Subcentro (achatadas, sem expandir).
 * Colunas = 12 meses + Total. Clicar numa linha seleciona o (CC, Sub) para a
 * tabela de Categorias abaixo. Linha selecionada destacada em azul claro.
 *
 * O botão "+ Adicionar centro" é um placeholder informativo nesta versão —
 * adicionar centros/subcentros é um fluxo de configuração do plano de contas.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '../../lib/format/brl';
import {
  somaFolhasNoMes,
  type CentroCustoSub,
} from './despesasPlanilha.utils';

interface Props {
  centros: CentroCustoSub[];
  meses: string[];
  valoresPorFolha: Map<string, Record<string, number>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdicionarCentro?: () => void;
}

const GRID_TEMPLATE =
  'minmax(220px, 280px) repeat(12, minmax(70px, 1fr)) minmax(100px, 120px)';

export default function CentrosCustoGrid({
  centros,
  meses,
  valoresPorFolha,
  selectedId,
  onSelect,
  onAdicionarCentro,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-2 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <h2 className="text-[12.5px] font-semibold text-slate-700 uppercase tracking-wider">
          Centro de custo × Meses
        </h2>
        <button
          type="button"
          onClick={onAdicionarCentro}
          className="inline-flex items-center gap-1 text-[11.5px] text-slate-600 hover:text-emerald-700"
        >
          <Plus size={12} />
          Adicionar centro
        </button>
      </div>

      <div className="flex-1 overflow-auto relative">
        <div
          className="grid text-[10px] sticky top-0 z-20 bg-slate-100 border-b border-slate-300 uppercase tracking-wider font-semibold text-slate-600"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
          <div className="px-3 py-2 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
            Centro de Custo
          </div>
          {meses.map((mes) => (
            <div key={mes} className="px-2 py-2 text-center">
              {format(parseISO(mes), 'MMM/yy', { locale: ptBR })}
            </div>
          ))}
          <div className="px-2 py-2 text-right sticky right-0 bg-slate-100 z-10 border-l border-slate-200">
            Total
          </div>
        </div>

        {centros.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Nenhum centro de custo configurado.
          </div>
        ) : (
          centros.map((c) => {
            const isSelected = selectedId === c.id;
            const totalGeral = somaFolhasNoMes(c.folhasIds, valoresPorFolha);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(c.id);
                  }
                }}
                className={[
                  'grid border-b border-slate-100 cursor-pointer transition-colors tabular-nums',
                  isSelected
                    ? 'bg-blue-50 ring-1 ring-inset ring-blue-300 hover:bg-blue-100'
                    : 'bg-white hover:bg-slate-50',
                ].join(' ')}
                style={{ gridTemplateColumns: GRID_TEMPLATE }}
              >
                <div
                  className={[
                    'px-3 py-1.5 text-[12.5px] text-slate-800 sticky left-0 z-10 border-r border-slate-100 truncate',
                    isSelected ? 'bg-blue-50' : 'bg-white',
                  ].join(' ')}
                >
                  <span className="font-medium">{c.ccNome}</span>
                  {c.subNome !== '—' && (
                    <span className="text-slate-500"> — {c.subNome}</span>
                  )}
                </div>
                {meses.map((mes) => {
                  const v = somaFolhasNoMes(c.folhasIds, valoresPorFolha, mes);
                  return (
                    <div
                      key={mes}
                      className="px-2 py-1.5 text-right text-[12.5px] text-slate-700"
                    >
                      {v > 0 ? formatBRL(v) : '—'}
                    </div>
                  );
                })}
                <div
                  className={[
                    'px-2 py-1.5 text-right text-[12.5px] font-semibold text-slate-900 sticky right-0 z-10 border-l border-slate-100',
                    isSelected ? 'bg-blue-50' : 'bg-white',
                  ].join(' ')}
                >
                  {totalGeral > 0 ? formatBRL(totalGeral) : '—'}
                </div>
              </div>
            );
          })
        )}

        {/* Footer total geral */}
        <div
          className="grid sticky bottom-0 z-20 bg-slate-900 text-white border-t border-slate-700 tabular-nums"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider sticky left-0 bg-slate-900 z-10 border-r border-slate-700">
            Total geral
          </div>
          {meses.map((mes) => {
            const total = centros.reduce(
              (acc, c) => acc + somaFolhasNoMes(c.folhasIds, valoresPorFolha, mes),
              0,
            );
            return (
              <div key={mes} className="px-2 py-2 text-right text-[12.5px] font-medium">
                {total > 0 ? formatBRL(total) : '—'}
              </div>
            );
          })}
          <div className="px-2 py-2 text-right text-[12.5px] font-bold sticky right-0 bg-slate-900 z-10 border-l border-slate-700">
            {(() => {
              const total = centros.reduce(
                (acc, c) => acc + somaFolhasNoMes(c.folhasIds, valoresPorFolha),
                0,
              );
              return total > 0 ? formatBRL(total) : '—';
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
