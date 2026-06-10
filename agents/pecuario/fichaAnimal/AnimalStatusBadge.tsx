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

/** Rótulo do momento que inativou o animal. */
const MOMENTO_LABEL: Record<AnimalSituacao, string> = {
  ativo: '',
  morte: 'Morte',
  venda: 'Venda',
};

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (datas já vêm normalizadas do back-end). */
function formatDataBR(raw?: string | null): string {
  const v = (raw || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

interface AnimalSituacaoFieldProps {
  /** Valor bruto do campo de situação da ficha. */
  situacao?: string | null;
  /** Data do evento que inativou o animal (morte/venda), em 'AAAA-MM-DD'. */
  data?: string | null;
  /** Detalhe do evento (ex.: motivo da morte). */
  motivo?: string | null;
}

/**
 * Campo automático "Situação" exibido no Cadastro Essencial da Ficha Animal.
 * Sinalizador verde = Ativo; vermelho = Inativo, seguido de um campo com o
 * momento da inativação (Morte/Venda) e seu detalhe (data/motivo). O valor é
 * derivado das telas de Morte e Venda — não é editável aqui.
 */
export const AnimalSituacaoField: React.FC<AnimalSituacaoFieldProps> = ({ situacao, data, motivo }) => {
  const s = resolveSituacao(situacao);
  const ativo = s === 'ativo';
  const momento = MOMENTO_LABEL[s];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="truncate text-xs font-semibold text-gray-700">Situação</label>
      <div className="flex flex-wrap items-center gap-2">
        {/* Sinalizador Ativo (verde) / Inativo (vermelho) */}
        <span
          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${
            ativo
              ? 'border-[#16a34a]/30 bg-[#e7f6ec] text-[#15803d]'
              : 'border-[#dc2626]/30 bg-[#fdecec] text-[#b91c1c]'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${ativo ? 'bg-[#16a34a]' : 'bg-[#dc2626]'}`} />
          {ativo ? 'Ativo' : 'Inativo'}
        </span>

        {/* Momento da inativação — vem das telas de Morte/Venda */}
        {!ativo && momento ? (
          <span className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700">
            {momento}
            {data ? <span className="font-medium text-gray-400">· {formatDataBR(data)}</span> : null}
            {motivo ? <span className="truncate font-medium text-gray-400">· {motivo}</span> : null}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-gray-400">
        Preenchido automaticamente pelas telas de Morte e Venda.
      </p>
    </div>
  );
};
