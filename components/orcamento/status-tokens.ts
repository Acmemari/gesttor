/**
 * Tokens de cor/ícone/label por status de versão de orçamento.
 * Centralizado para o Header e o Badge usarem o mesmo mapping.
 */
import type { OrcamentoStatus } from './types';

export interface StatusToken {
  label: string;
  /** Tooltip explicativo do que o status permite. */
  tooltip: string;
  /** Classe Tailwind para o fundo do header (linha contínua). */
  headerBg: string;
  /** Classe Tailwind para borda inferior do header. */
  headerBorder: string;
  /** Classes Tailwind para o badge (pill). */
  badgeBg: string;
  badgeText: string;
  /** Nome do ícone lucide-react (caller importa). */
  iconName: 'Pencil' | 'Eye' | 'Lock' | 'BarChart3' | 'Archive';
}

export const STATUS_TOKENS: Record<OrcamentoStatus, StatusToken> = {
  rascunho: {
    label: 'Rascunho',
    tooltip: 'Edição livre. Submeta para aprovação para virar Baseline.',
    headerBg: 'bg-slate-100',
    headerBorder: 'border-slate-300',
    badgeBg: 'bg-slate-200',
    badgeText: 'text-slate-700',
    iconName: 'Pencil',
  },
  em_aprovacao: {
    label: 'Em Aprovação',
    tooltip: 'Aguardando aprovadores. Read-only para editores enquanto pendente.',
    headerBg: 'bg-blue-50',
    headerBorder: 'border-blue-300',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    iconName: 'Eye',
  },
  baseline: {
    label: 'Baseline',
    tooltip: 'Imutável. Para alterar, crie um Forecast a partir desta versão.',
    headerBg: 'bg-emerald-50',
    headerBorder: 'border-emerald-300',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    iconName: 'Lock',
  },
  forecast: {
    label: 'Forecast',
    tooltip: 'Edita meses futuros (após o mês de corte). Meses passados ficam read-only.',
    headerBg: 'bg-amber-50',
    headerBorder: 'border-amber-300',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    iconName: 'BarChart3',
  },
  arquivado: {
    label: 'Arquivado',
    tooltip: 'Apenas leitura.',
    headerBg: 'bg-slate-200',
    headerBorder: 'border-slate-400',
    badgeBg: 'bg-slate-300',
    badgeText: 'text-slate-600',
    iconName: 'Archive',
  },
};
