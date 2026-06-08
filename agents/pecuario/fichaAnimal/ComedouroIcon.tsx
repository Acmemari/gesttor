import React from 'react';

interface ComedouroIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone Nutricional: comedouro/cocho de chão visto de frente. Line-art, usa
 * currentColor — herda a cor do contexto (cinza padrão; verde quando ativo).
 */
const ComedouroIcon: React.FC<ComedouroIconProps> = ({ size = 20, className }) => (
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
    <path d="M3.8 7h16.4l-1.9 8.6a1.7 1.7 0 0 1-1.7 1.3H7.4a1.7 1.7 0 0 1-1.7-1.3L3.8 7z" />
    <path d="M5 9.6h14" />
    <path d="M4.5 19.8h15" />
  </svg>
);

export default ComedouroIcon;
