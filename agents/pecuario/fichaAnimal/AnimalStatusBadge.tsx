import React from 'react';

/**
 * Situação do animal no rebanho.
 * `ativo` = no plantel; `morte`/`venda` = saídas que tornam o animal inativo.
 */
export type AnimalSituacao = 'ativo' | 'morte' | 'venda';

/**
 * Normaliza o valor bruto do campo de situação (vindo da ficha/back-end) para
 * uma das situações canônicas. Vazio ou desconhecido é tratado como `ativo`.
 * Quando os movimentos de Venda/Morte existirem, basta gravar 'morte'/'venda'
 * em `situacao` que o badge passa a refletir o estado automaticamente.
 */
export function resolveSituacao(raw?: string | null): AnimalSituacao {
  const v = (raw || '').trim().toLowerCase();
  if (['morte', 'morto', 'morta', 'óbito', 'obito', 'abate', 'abatido'].includes(v)) return 'morte';
  if (['venda', 'vendido', 'vendida'].includes(v)) return 'venda';
  return 'ativo';
}

interface StatusStyle {
  /** Rótulo exibido (ex.: "Inativo · Morte"). */
  label: string;
  /** True quando o animal está no plantel. */
  ativo: boolean;
  dot: string;
  text: string;
  bg: string;
  ring: string;
}

const STYLES: Record<AnimalSituacao, StatusStyle> = {
  ativo: {
    label: 'Ativo',
    ativo: true,
    dot: 'bg-[#16a34a]',
    text: 'text-[#15803d]',
    bg: 'bg-[#e7f6ec]',
    ring: 'ring-[#16a34a]/20',
  },
  morte: {
    label: 'Inativo · Morte',
    ativo: false,
    dot: 'bg-[#dc2626]',
    text: 'text-[#b91c1c]',
    bg: 'bg-[#fdecec]',
    ring: 'ring-[#dc2626]/20',
  },
  venda: {
    label: 'Inativo · Venda',
    ativo: false,
    dot: 'bg-[#d97706]',
    text: 'text-[#b45309]',
    bg: 'bg-[#fef3e2]',
    ring: 'ring-[#d97706]/20',
  },
};

interface AnimalStatusBadgeProps {
  /** Valor bruto do campo de situação da ficha. */
  situacao?: string | null;
  /** Tamanho do badge. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Badge que indica automaticamente se o animal está Ativo ou Inativo
 * (Morte/Venda), derivado do campo de situação da ficha.
 */
const AnimalStatusBadge: React.FC<AnimalStatusBadgeProps> = ({ situacao, size = 'md', className = '' }) => {
  const style = STYLES[resolveSituacao(situacao)];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ring-1 ${pad} ${style.bg} ${style.text} ${style.ring} ${className}`}
      title={style.ativo ? 'Animal ativo no rebanho' : `Animal inativo — ${style.label.split('· ')[1]?.toLowerCase()}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
};

export default AnimalStatusBadge;
