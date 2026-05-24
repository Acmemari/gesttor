import React from 'react';
import { Pencil, Eye, Lock, BarChart3, Archive } from 'lucide-react';
import { STATUS_TOKENS } from './status-tokens';
import type { OrcamentoStatus } from './types';

const ICONS = { Pencil, Eye, Lock, BarChart3, Archive } as const;

interface VersaoBadgeProps {
  status: OrcamentoStatus;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

export default function VersaoBadge({ status, size = 'md', showTooltip = true }: VersaoBadgeProps) {
  const t = STATUS_TOKENS[status];
  const Icon = ICONS[t.iconName];
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 12 : 14;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${t.badgeBg} ${t.badgeText} ${padding}`}
      title={showTooltip ? t.tooltip : undefined}
    >
      <Icon size={iconSize} />
      {t.label}
    </span>
  );
}
