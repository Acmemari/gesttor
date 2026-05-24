import React, { useMemo } from 'react';
import { X, History, GitCompare, Download } from 'lucide-react';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import VersaoBadge from './VersaoBadge';
import type { OrcamentoVersao, OrcamentoStatus } from './types';

interface GavetaProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_COLORS = [
  'bg-amber-200 text-amber-800',
  'bg-blue-200 text-blue-800',
  'bg-purple-200 text-purple-800',
  'bg-emerald-200 text-emerald-800',
  'bg-rose-200 text-rose-800',
  'bg-slate-300 text-slate-700',
];

function autorIniciais(nome: string | null | undefined, email: string | null | undefined): string {
  if (nome && nome.trim()) {
    return nome
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('');
  }
  return (email ?? '?').slice(0, 2).toUpperCase();
}

function corDoAutor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDataCurta(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, hoje)) return `Hoje, ${hh}`;
  if (sameDay(d, ontem)) return `Ontem, ${hh}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${hh}`;
}

function formatDataCompleta(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function VersaoCard({
  versao,
  isFirst,
  isLast,
  isAtual,
}: {
  versao: OrcamentoVersao;
  isFirst: boolean;
  isLast: boolean;
  isAtual: boolean;
}) {
  const autorNome = versao.autor?.name || versao.autor?.email || 'Usuário';
  const iniciais = autorIniciais(versao.autor?.name, versao.autor?.email);
  const cor = versao.autor?.id ? corDoAutor(versao.autor.id) : AVATAR_COLORS[5];

  return (
    <div className="relative flex gap-3 pb-5">
      {/* Linha vertical da timeline */}
      {!isLast && (
        <span
          className="absolute left-[18px] top-9 bottom-0 w-px bg-slate-200"
          aria-hidden="true"
        />
      )}

      {/* Avatar do autor */}
      <span
        className={`relative h-9 w-9 rounded-full ${cor} text-xs font-semibold flex items-center justify-center shrink-0 ${isAtual ? 'ring-2 ring-emerald-500' : ''}`}
        title={autorNome}
      >
        {iniciais}
      </span>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-900">{versao.nome}</span>
          <VersaoBadge status={versao.tipo as OrcamentoStatus} size="sm" showTooltip={false} />
        </div>
        <p className="text-sm text-slate-700 truncate">{versao.nome}</p>
        <p className="text-xs text-slate-500">
          {autorNome} · {formatDataCurta(versao.createdAt)}
        </p>
        {versao.descricaoMudanca && (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            {versao.descricaoMudanca}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GavetaGovernanca({ isOpen, onClose }: GavetaProps) {
  const { orcamentoAtivo, versaoAtiva } = useOrcamento();

  const versoesOrdenadas = useMemo<OrcamentoVersao[]>(() => {
    if (!orcamentoAtivo) return [];
    // Mais recente primeiro (já vem ordenado do backend, mas garantimos).
    return [...orcamentoAtivo.versoes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orcamentoAtivo]);

  const versaoAtualParaCabecalho = versaoAtiva ?? versoesOrdenadas[0] ?? null;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed right-0 top-0 h-screen w-[420px] max-w-full bg-white border-l border-slate-200 shadow-lg z-50 transform transition-transform duration-200 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Cabeçalho da gaveta */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History size={16} className="text-slate-500 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900">Histórico de versões</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded focus:outline-none"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        {/* Versão atual em destaque */}
        {versaoAtualParaCabecalho && (
          <section className="px-4 py-4 border-b border-slate-200 shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Versão atual
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-900">
                {versaoAtualParaCabecalho.nome}
              </span>
              <span className="text-slate-400">—</span>
              <span className="text-sm text-slate-700">
                {versaoAtualParaCabecalho.tipo === 'baseline'
                  ? 'Baseline aprovada'
                  : versaoAtualParaCabecalho.tipo === 'forecast'
                    ? 'Forecast em edição'
                    : versaoAtualParaCabecalho.tipo === 'em_aprovacao'
                      ? 'Em aprovação'
                      : versaoAtualParaCabecalho.tipo === 'arquivado'
                        ? 'Arquivada'
                        : 'Rascunho'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              por{' '}
              <span className="font-medium text-slate-700">
                {versaoAtualParaCabecalho.autor?.name ||
                  versaoAtualParaCabecalho.autor?.email ||
                  'usuário'}
              </span>{' '}
              · {formatDataCompleta(versaoAtualParaCabecalho.createdAt)}
            </p>
          </section>
        )}

        {/* Timeline de versões */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {versoesOrdenadas.length === 0 && (
            <p className="text-xs text-slate-500">Nenhuma versão registrada.</p>
          )}
          {versoesOrdenadas.map((v, idx) => (
            <VersaoCard
              key={v.id}
              versao={v}
              isFirst={idx === 0}
              isLast={idx === versoesOrdenadas.length - 1}
              isAtual={versaoAtiva?.id === v.id}
            />
          ))}
        </div>

        {/* Footer com ações */}
        <footer className="border-t border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
          <button
            type="button"
            disabled
            title="Disponível na Phase 2"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitCompare size={14} />
            Comparar versões
          </button>
          <button
            type="button"
            disabled
            title="Disponível na Phase 2"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            Exportar trilha
          </button>
        </footer>
      </aside>
    </>
  );
}
