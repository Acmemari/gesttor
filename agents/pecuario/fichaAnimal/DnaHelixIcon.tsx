import React from 'react';

interface DnaHelixIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone de dupla hélice (gene) para o Programa de Melhoramento Genético.
 * Line-art com as duas fitas cruzadas e os "degraus" das bases ligando-as.
 * Usa currentColor — herda a cor do contexto (cinza padrão; verde quando ativo).
 */
const DnaHelixIcon: React.FC<DnaHelixIconProps> = ({ size = 20, className }) => (
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
    <path d="M9.2 3.2c0 4.4 5.6 4.4 5.6 8.8s-5.6 4.4-5.6 8.8" />
    <path d="M14.8 3.2c0 4.4-5.6 4.4-5.6 8.8s5.6 4.4 5.6 8.8" />
    <path d="M9.7 5.6h4.6M9 12h6M9.7 18.4h4.6" />
  </svg>
);

export default DnaHelixIcon;
