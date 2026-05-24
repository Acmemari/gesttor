import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Plus,
  Search,
  History,
  PenLine,
  Check,
} from 'lucide-react';
import { useOrcamento } from '../../contexts/OrcamentoContext';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { listAuditoria } from '../../lib/api/orcamentosClient';
import VersaoBadge from './VersaoBadge';
import { STATUS_TOKENS } from './status-tokens';
import type { OrcamentoStatus } from './types';
import type { Farm } from '../../types';

interface HeaderProps {
  onOpenGoverness: () => void;
  onNewBudget: () => void;
}

/** Paleta para gerar cor estável a partir do id do usuário. */
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
];

function corDoUsuario(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function userInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    return name
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('');
  }
  return email.slice(0, 2).toUpperCase();
}

function farmInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function descricaoStatus(tipo: OrcamentoStatus, imutavel: boolean): string {
  if (tipo === 'baseline') return 'Baseline aprovada';
  if (tipo === 'em_aprovacao') return 'Em aprovação';
  if (tipo === 'forecast') return 'Forecast em edição';
  if (tipo === 'arquivado') return 'Arquivado';
  return imutavel ? 'Travada' : 'Em rascunho';
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function FarmSwitcher() {
  const { selectedFarm, farms, setSelectedFarm } = useHierarchy();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!selectedFarm) return null;

  const multiFarm = farms.length > 1;
  const totalArea = (selectedFarm as Farm).totalArea;
  const initials = farmInitials(selectedFarm.name);

  // Quando há apenas 1 fazenda, mostra read-only (sem dropdown).
  if (!multiFarm) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
        <span className="h-7 w-7 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
          {initials}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-slate-900 truncate">{selectedFarm.name}</span>
          {totalArea && (
            <span className="text-[11px] text-slate-500 leading-none">
              {Number(totalArea).toLocaleString('pt-BR')} ha
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <span className="h-7 w-7 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center">
          {initials}
        </span>
        <div className="flex flex-col min-w-0 text-left">
          <span className="text-sm font-semibold text-slate-900 truncate">{selectedFarm.name}</span>
          {totalArea && (
            <span className="text-[11px] text-slate-500 leading-none">
              {Number(totalArea).toLocaleString('pt-BR')} ha
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg z-50">
          <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Suas fazendas
          </div>
          <ul className="py-1">
            {farms.map((f) => {
              const isActive = f.id === selectedFarm.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFarm(f);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-slate-50 ${isActive ? 'bg-slate-50' : ''}`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full mt-1.5 ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{f.name}</div>
                      <div className="text-xs text-slate-500">
                        {[f.city, f.state].filter(Boolean).join(' — ')}
                        {f.totalArea ? ` · ${Number(f.totalArea).toLocaleString('pt-BR')} ha` : ''}
                      </div>
                    </div>
                    {isActive && <Check size={14} className="text-slate-700 mt-1" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function VersaoSwitcher() {
  const { orcamentoAtivo, versaoAtiva, setVersaoAtivaId } = useOrcamento();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!orcamentoAtivo || !versaoAtiva) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800 hover:text-slate-900 focus:outline-none"
      >
        <span>{versaoAtiva.nome}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 rounded-md border border-slate-200 bg-white shadow-lg z-50 max-h-80 overflow-y-auto">
          <ul className="py-1">
            {orcamentoAtivo.versoes.map((v) => {
              const isActive = v.id === versaoAtiva.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVersaoAtivaId(v.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 ${isActive ? 'bg-slate-50' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate font-medium text-slate-800">{v.nome}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(v.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <VersaoBadge status={v.tipo as OrcamentoStatus} size="sm" showTooltip={false} />
                      {isActive && <Check size={14} className="text-emerald-600" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ElaboradoresAvatares() {
  const { orcamentoAtivo } = useOrcamento();
  if (!orcamentoAtivo) return null;

  // Editores = pessoas autorizadas a ELABORAR o orçamento (papel='editor').
  const editores = orcamentoAtivo.colaboradores.filter((c) => c.papel === 'editor');
  if (editores.length === 0) return null;

  const visiveis = editores.slice(0, 3);
  const extras = editores.length - visiveis.length;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex -space-x-2">
        {visiveis.map((c) => {
          const nome = c.user?.name || c.user?.email || c.userId;
          const initials = userInitials(c.user?.name, c.user?.email ?? c.userId);
          const cor = corDoUsuario(c.userId);
          const tooltipPapel = c.eAprovador ? 'Editor + Aprovador' : 'Editor';
          return (
            <span
              key={c.id}
              title={`${nome} · ${tooltipPapel}`}
              className={`relative h-7 w-7 rounded-full ring-2 ring-white ${cor} text-white text-[11px] font-semibold flex items-center justify-center`}
            >
              {initials}
              {c.eAprovador && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Aprovador" />
              )}
            </span>
          );
        })}
        {extras > 0 && (
          <span
            className="relative h-7 w-7 rounded-full ring-2 ring-white bg-slate-300 text-slate-700 text-[11px] font-semibold flex items-center justify-center"
            title={`Mais ${extras} elaborador(es)`}
          >
            +{extras}
          </span>
        )}
      </div>
      <span className="text-xs text-slate-600 whitespace-nowrap">
        {editores.length} {editores.length === 1 ? 'elaborador' : 'elaboradores'}
      </span>
    </div>
  );
}

function UltimaEdicao() {
  const { orcamentoAtivo, versaoAtiva } = useOrcamento();
  const [info, setInfo] = useState<{ autor: string; quando: string } | null>(null);

  useEffect(() => {
    if (!orcamentoAtivo) {
      setInfo(null);
      return;
    }
    const ac = new AbortController();
    listAuditoria({
      orcamentoId: orcamentoAtivo.id,
      versaoId: versaoAtiva?.id,
      limit: 1,
      signal: ac.signal,
    }).then((evs) => {
      const ev = evs[0];
      if (!ev) {
        setInfo(null);
        return;
      }
      const autor = ev.usuario?.name || ev.usuario?.email || 'usuário';
      setInfo({ autor, quando: formatHora(ev.createdAt) });
    });
    return () => ac.abort();
  }, [orcamentoAtivo, versaoAtiva?.id]);

  if (!info) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap shrink-0">
      <PenLine size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">
        Editado por <span className="font-semibold text-slate-800">{info.autor}</span> às {info.quando}
      </span>
    </div>
  );
}

// ── Header principal ─────────────────────────────────────────────────────────

export default function OrcamentoHeader({ onOpenGoverness, onNewBudget }: HeaderProps) {
  const { orcamentoAtivo, versaoAtiva } = useOrcamento();
  const { selectedFarm, farms } = useHierarchy();

  const status = (versaoAtiva?.tipo as OrcamentoStatus | undefined) ?? 'rascunho';
  const tokens = STATUS_TOKENS[status];

  const dadosOrcamento = useMemo(() => {
    if (!orcamentoAtivo) return null;
    return {
      titulo: `Safra ${orcamentoAtivo.safra} — ${orcamentoAtivo.nome}`,
      subtitulo: descricaoStatus(status, !!versaoAtiva?.imutavel),
    };
  }, [orcamentoAtivo, status, versaoAtiva?.imutavel]);

  // Estado vazio: ainda não tem orçamento ativo.
  if (!orcamentoAtivo) {
    return (
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {selectedFarm && <FarmSwitcher />}
        </div>
        <button
          type="button"
          onClick={onNewBudget}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <Plus size={14} />
          Novo Orçamento
        </button>
      </header>
    );
  }

  return (
    <header
      className={`h-16 ${tokens.headerBg} border-b ${tokens.headerBorder} flex items-center gap-3 px-4 shrink-0 transition-colors relative z-30`}
    >
      {/* 1. Seletor de fazenda */}
      <FarmSwitcher />

      <span className="h-8 w-px bg-white/60 shrink-0" />

      {/* 2. Dados do orçamento */}
      {dadosOrcamento && (
        <div className="flex flex-col min-w-0 leading-tight shrink">
          <span className="text-sm font-semibold text-slate-900 truncate">{dadosOrcamento.titulo}</span>
          <span className="text-xs text-slate-500 truncate">{dadosOrcamento.subtitulo}</span>
        </div>
      )}

      <span className="text-slate-400 select-none shrink-0">·</span>

      {/* 3. Seletor de versão */}
      <VersaoSwitcher />

      {/* 4. Badge de status */}
      <VersaoBadge status={status} />

      <span className="h-8 w-px bg-white/60 shrink-0" />

      {/* 5. Última edição */}
      <UltimaEdicao />

      {/* Espaçador */}
      <div className="flex-1 min-w-0" />

      {/* 6. Elaboradores autorizados (editores) */}
      <ElaboradoresAvatares />

      <span className="h-8 w-px bg-white/60 shrink-0" />

      {/* 7. Ações */}
      <button
        type="button"
        disabled
        title="Disponível na Phase 2"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
      >
        <Plus size={12} />
        Novo forecast
      </button>
      <button
        type="button"
        title="Buscar"
        className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-white/50 focus:outline-none shrink-0"
      >
        <Search size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenGoverness}
        title="Histórico de versões"
        className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-white/50 focus:outline-none shrink-0"
      >
        <History size={16} />
      </button>
    </header>
  );
}
