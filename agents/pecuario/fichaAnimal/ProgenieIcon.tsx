import React from 'react';

interface ProgenieIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone de Progênies: uma vaca (matriz) com seu bezerro à frente — representa a
 * descendência. Line-art, usa currentColor — herda a cor do contexto
 * (cinza padrão; verde quando ativo).
 */
const ProgenieIcon: React.FC<ProgenieIconProps> = ({ size = 20, className }) => (
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
    {/* Vaca (matriz) — corpo, pernas e cabeça */}
    <path d="M5 5.5h4a1.75 1.75 0 0 1 0 3.5H5a1.75 1.75 0 0 1 0-3.5z" />
    <path d="M5 9v3.3M9 9v3.3" />
    <path d="M10.6 7.1 12 6.9" />
    <circle cx="14" cy="6.5" r="2" />
    <path d="M12.6 5 12 4.2M15.4 5 16 4.2" />
    <circle cx="14.5" cy="6.3" r="0.55" fill="currentColor" stroke="none" />

    {/* Bezerro (progênie) — corpo, pernas e cabeça */}
    <path d="M10.6 11.8h3.9a1.25 1.25 0 0 1 0 2.5h-3.9a1.25 1.25 0 0 1 0-2.5z" />
    <path d="M10.9 14.3v3.2M14.2 14.3v3.2" />
    <path d="M15.6 13 16.3 12.9" />
    <circle cx="17.6" cy="12.8" r="1.5" />
    <path d="M16.6 11.6 16.1 10.9M18.6 11.6 19.1 10.9" />
    <circle cx="18" cy="12.6" r="0.45" fill="currentColor" stroke="none" />
  </svg>
);

export default ProgenieIcon;
