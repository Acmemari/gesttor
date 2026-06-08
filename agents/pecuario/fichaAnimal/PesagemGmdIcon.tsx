import React from 'react';

interface PesagemGmdIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone de Pesagens e GMD: gráfico de linha em tendência de alta com seta
 * (representa o ganho de peso). Line-art, usa currentColor — herda a cor do
 * contexto (cinza padrão; verde quando ativo).
 */
const PesagemGmdIcon: React.FC<PesagemGmdIconProps> = ({ size = 20, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="3.5 16.5 9 11 12.5 13.5 20.5 5.5" />
    <polyline points="15.5 5.5 20.5 5.5 20.5 10.5" />
  </svg>
);

export default PesagemGmdIcon;
