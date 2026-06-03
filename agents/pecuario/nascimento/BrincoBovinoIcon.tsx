import React from 'react';

interface BrincoBovinoIconProps {
  size?: number;
  /** Número exibido dentro do corpo da etiqueta. Padrão: "001". */
  numero?: string;
  className?: string;
}

/**
 * Ícone de brinco/etiqueta bovina (line-art).
 * Corpo arredondado com furo no "pescoço" e número centralizado na metade inferior.
 * Usa currentColor — herda a cor do contexto (cinza padrão; azul quando ativo).
 */
const BrincoBovinoIcon: React.FC<BrincoBovinoIconProps> = ({ size = 20, numero = '001', className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2.5C9.2 2.5 7 4.7 7 7.5 7 8.4 6.6 9 6 9.4L5.2 10C4.7 10.4 4.5 11 4.5 11.6V19A2.5 2.5 0 0 0 7 21.5H17A2.5 2.5 0 0 0 19.5 19V11.6C19.5 11 19.3 10.4 18.8 10L18 9.4C17.4 9 17 8.4 17 7.5 17 4.7 14.8 2.5 12 2.5Z" />
    <circle cx="12" cy="7.2" r="1.7" />
    <text
      x="12"
      y="17.7"
      textAnchor="middle"
      fontSize="5.6"
      fontWeight="700"
      fontFamily="Inter,system-ui,sans-serif"
      fill="currentColor"
      stroke="none"
    >
      {numero}
    </text>
  </svg>
);

export default BrincoBovinoIcon;
