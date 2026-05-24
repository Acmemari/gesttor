/**
 * Wrapper de Despesas com 2 abas: Fluxo (planilha) | Lançamentos.
 *
 * Fluxo mostra a planilha consolidada (soma de todos lançamentos).
 * Lançamentos mostra a lista de despesas detalhadas + modal de criação.
 */
import React, { useState } from 'react';
import { LayoutGrid, ListChecks } from 'lucide-react';
import DespesasPlanilha from './DespesasPlanilha';
import LancamentosLista from './LancamentosLista';

interface Props {
  /** Quando vier do roteamento antigo (despesas:N), filtra Fluxo por raiz. */
  numeroRaiz?: string;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

type Tab = 'fluxo' | 'lancamentos';

export default function DespesasTabs({ numeroRaiz, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('fluxo');
  // bump pra forçar Planilha a recarregar quando volta da aba Lançamentos
  const [fluxoRefreshKey, setFluxoRefreshKey] = useState(0);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="border-b border-slate-200 shrink-0 px-6 pt-3">
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => {
              setTab('fluxo');
              setFluxoRefreshKey((k) => k + 1);
            }}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
              tab === 'fluxo'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            <LayoutGrid size={14} />
            Fluxo
          </button>
          <button
            type="button"
            onClick={() => setTab('lancamentos')}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
              tab === 'lancamentos'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            <ListChecks size={14} />
            Lançamentos
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'fluxo' ? (
          <DespesasPlanilha key={fluxoRefreshKey} numeroRaiz={numeroRaiz} onToast={onToast} />
        ) : (
          <LancamentosLista onToast={onToast} />
        )}
      </div>
    </div>
  );
}
