import React from 'react';

interface UltrassomIconProps {
  size?: number;
  className?: string;
}

/**
 * Ícone Ultrassonografia: transdutor (probe) no topo emitindo um feixe em leque
 * com arcos de eco — representa o exame de ultrassom. Line-art, usa currentColor
 * (cinza padrão; verde quando a aba está ativa).
 */
const UltrassomIcon: React.FC<UltrassomIconProps> = ({ size = 20, className }) => (
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
    {/* Transdutor (probe) */}
    <path d="M10 3.2h4l-.6 3.2h-2.8L10 3.2Z" />
    {/* Feixe em leque */}
    <path d="M10.6 6.4 6 19.6M13.4 6.4 18 19.6" />
    {/* Arcos de eco */}
    <path d="M8.9 11.1q3.1 1.5 6.2 0" />
    <path d="M7.8 15.2q4.2 1.8 8.4 0" />
  </svg>
);

export default UltrassomIcon;
