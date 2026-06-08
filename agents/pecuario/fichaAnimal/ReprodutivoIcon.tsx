import React from 'react';

interface ReprodutivoIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone Reprodutivo: símbolos de fêmea (Vênus) e macho (Marte) entrelaçados —
 * representa a reprodução. Line-art, usa currentColor — herda a cor do contexto
 * (cinza padrão; verde quando ativo).
 */
const ReprodutivoIcon: React.FC<ReprodutivoIconProps> = ({ size = 20, className }) => (
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
    <circle cx="8.8" cy="13.6" r="3.4" />
    <path d="M8.8 17v4M6.9 19.2h3.8" />
    <circle cx="15.6" cy="8.6" r="3.1" />
    <path d="M17.9 6.4 21 3.2M17.6 3.2H21v3.4" />
  </svg>
);

export default ReprodutivoIcon;
