import React from 'react';
import { Construction, Wallet, Plus, Loader2, FolderOpen } from 'lucide-react';
import CadastroOrcamentoWizard from './CadastroOrcamentoWizard';
import ConfigPlanoContas from './ConfigPlanoContas';
import DespesasUnificada from './DespesasUnificada';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import type { OrcamentoView } from '../../components/orcamento/types';

interface WorkspaceProps {
  view: OrcamentoView;
  onChangeView: (view: OrcamentoView) => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

export default function OrcamentoWorkspace({ view, onChangeView, onToast }: WorkspaceProps) {
  const { orcamentoAtivo, orcamentosDisponiveis, loading, setOrcamentoAtivoId } = useOrcamento();

  if (view === 'cadastro-wizard') {
    return (
      <CadastroOrcamentoWizard
        onCancel={() => onChangeView('dashboard')}
        onCreated={() => onChangeView('dashboard')}
        onToast={onToast}
      />
    );
  }

  if (view === 'config:plano-contas') {
    return <ConfigPlanoContas onToast={onToast} />;
  }

  if (view === 'despesas' || view.startsWith('despesas:')) {
    const numeroRaiz = view.startsWith('despesas:') ? view.split(':')[1] : undefined;
    return <DespesasUnificada numeroRaiz={numeroRaiz} onToast={onToast} />;
  }

  if (view === 'dashboard') {
    if (loading && !orcamentoAtivo) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <Loader2 size={28} className="animate-spin mb-2" />
          <p className="text-sm">Carregando orçamentos…</p>
        </div>
      );
    }

    if (!orcamentoAtivo) {
      const temDisponiveis = orcamentosDisponiveis.length > 0;
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6">
          <Wallet size={40} className="text-emerald-500 mb-3 opacity-60" />
          {temDisponiveis ? (
            <>
              <h2 className="text-lg font-medium text-slate-800 mb-1">
                Selecione um orçamento existente
              </h2>
              <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                Foram encontrados {orcamentosDisponiveis.length} orçamento(s) nesta organização.
                Escolha um abaixo ou crie um novo.
              </p>
              <ul className="w-full max-w-md space-y-2 mb-6">
                {orcamentosDisponiveis.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setOrcamentoAtivoId(o.id)}
                      className="flex w-full items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-left hover:border-emerald-400 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <FolderOpen size={16} className="text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{o.nome}</div>
                        <div className="text-xs text-slate-500">
                          Safra {o.safra} · {o.dataInicio} → {o.dataFim}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onChangeView('cadastro-wizard')}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <Plus size={14} />
                Novo Orçamento
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-medium text-slate-800 mb-1">Comece criando um orçamento</h2>
              <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                O dashboard executivo será disponibilizado em breve. Por enquanto, crie seu primeiro
                orçamento para definir versões, premissas e colaboradores.
              </p>
              <button
                type="button"
                onClick={() => onChangeView('cadastro-wizard')}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <Plus size={14} />
                Novo Orçamento
              </button>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{orcamentoAtivo.nome}</h2>
        <p className="text-sm text-slate-600">
          Safra {orcamentoAtivo.safra} · Período {orcamentoAtivo.dataInicio} → {orcamentoAtivo.dataFim}
        </p>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Versões ({orcamentoAtivo.versoes.length})</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            {orcamentoAtivo.versoes.map((v) => (
              <li key={v.id}>· <strong>{v.nome}</strong> — {v.tipo}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Colaboradores ({orcamentoAtivo.colaboradores.length})</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            {orcamentoAtivo.colaboradores.map((c) => (
              <li key={c.id}>
                · {c.user?.name || c.user?.email || c.userId} —{' '}
                <span className="capitalize">{c.papel}</span>
                {c.eAprovador && ' (aprovador)'}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
          <Construction size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Phase 2:</strong> tela de Despesas com edição inline, fluxo de aprovação e Realizado
            (upload Excel/OFX) em breve.
          </div>
        </div>
      </div>
    );
  }

  // Demais views são placeholders V2+.
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <Construction size={32} className="mb-3 opacity-30" />
      <h2 className="text-lg font-medium mb-1 text-slate-800">Em Desenvolvimento</h2>
      <p className="text-sm">Esta tela estará disponível em breve.</p>
    </div>
  );
}
