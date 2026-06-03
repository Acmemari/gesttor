import React from 'react';

interface IconCardButtonProps {
  /** Ícone a exibir (SVG/line-art). Herda a cor via currentColor. */
  icon: React.ReactNode;
  /** Tooltip nativo + aria-label padrão. */
  title?: string;
  /** Rótulo de acessibilidade (sobrescreve o title para leitores de tela). */
  ariaLabel?: string;
  /** Estado ativo: aplica o destaque azul (mesmo padrão do botão de brinco). */
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Lado do quadrado em px. Padrão: 40 (h-10/w-10). */
  size?: number;
  className?: string;
}

/**
 * Botão-card quadrado e reutilizável (cantos arredondados, fundo branco, borda
 * sutil) seguindo o padrão visual de botões de ícone da aplicação. Quando
 * `active`, recebe o destaque azul. O ícone herda a cor pelo currentColor.
 */
const IconCardButton: React.FC<IconCardButtonProps> = ({
  icon,
  title,
  ariaLabel,
  active = false,
  onClick,
  disabled = false,
  size = 40,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel ?? title}
    aria-pressed={active}
    style={{ height: size, width: size }}
    className={`grid shrink-0 place-items-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? 'border-[#cfe0fb] bg-[#eaf1fb] text-[#2563eb]'
        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
    } ${className}`}
  >
    {icon}
  </button>
);

export default IconCardButton;
