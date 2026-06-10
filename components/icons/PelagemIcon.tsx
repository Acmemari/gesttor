import React from 'react';

/**
 * Ícone de "pelagem" para o cadastro de Pelagens.
 * Representa uma paleta de pintor, no mesmo estilo vetorial minimalista
 * dos demais ícones do projeto (viewBox 48x48, stroke currentColor).
 */
export const PelagemIcon: React.FC<{
  size?: number;
  className?: string;
  strokeWidth?: number;
}> = ({ size = 24, className, strokeWidth = 3 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Corpo principal da paleta */}
    <path d="M12 36C8 34 6 28 6 22C6 12 16 6 26 6C36 6 42 12 42 20C42 26 38 30 35 30C32.5 30 31 28.5 30 27C29 25.5 28 24 26 24C24 24 22 26 22 28.5C22 31 24 33 24 36C24 40.5 16 38 12 36Z" />
    {/* Furo para o dedo */}
    <circle cx="16" cy="18" r="2.5" />
    {/* Manchas de tinta/pelagem */}
    <circle cx="25" cy="14" r="1.5" />
    <circle cx="33" cy="18" r="1.5" />
    <circle cx="31" cy="25" r="1.5" />
  </svg>
);

export default PelagemIcon;
