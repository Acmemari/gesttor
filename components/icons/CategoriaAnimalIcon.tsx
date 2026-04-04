import React from 'react';

/**
 * Ícone de silhueta de bovino para Categoria Animal.
 * SVG desenhado à mão, viewBox 24x24, compatível com lucide-react.
 */
export const CategoriaAnimalIcon: React.FC<{
  size?: number;
  className?: string;
}> = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Horns */}
    <path d="M7.5 4 L6 2" />
    <path d="M12.5 4 L14 2" />

    {/* Head */}
    <ellipse cx="10" cy="5.5" rx="3.2" ry="2" />

    {/* Ears */}
    <path d="M6.8 4.5 Q5.5 3.5 6.2 5.2" />
    <path d="M13.2 4.5 Q14.5 3.5 13.8 5.2" />

    {/* Eye */}
    <circle cx="11" cy="5.2" r="0.4" fill="currentColor" stroke="none" />

    {/* Snout */}
    <ellipse cx="9" cy="6.8" rx="1.2" ry="0.7" />
    <circle cx="8.5" cy="6.8" r="0.25" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="6.8" r="0.25" fill="currentColor" stroke="none" />

    {/* Neck */}
    <path d="M7.5 7.2 Q7 9 6.5 10" />
    <path d="M12.5 7.2 Q13.5 9 14.5 10" />

    {/* Body */}
    <path d="M6.5 10 Q4 10.5 3.5 13 Q3.2 14.5 4 16 L4.5 17" />
    <path d="M14.5 10 Q17 10.5 18 13 Q18.5 14.5 18 16 L17.5 17" />
    <path d="M4.5 17 L6.5 17" />
    <path d="M17.5 17 L15.5 17" />

    {/* Belly */}
    <path d="M6.5 17 Q11 18.5 15.5 17" />

    {/* Front legs */}
    <path d="M6.5 17 L6 20.5" />
    <path d="M8.5 17.5 L8 20.5" />

    {/* Back legs */}
    <path d="M14 17.5 L14.5 20.5" />
    <path d="M16 17 L16.5 20.5" />

    {/* Hooves */}
    <path d="M5.5 20.5 L6.5 20.5" />
    <path d="M7.5 20.5 L8.5 20.5" />
    <path d="M14 20.5 L15 20.5" />
    <path d="M16 20.5 L17 20.5" />

    {/* Tail */}
    <path d="M18 13 Q20 11 21 12 Q20.5 13 19 13.5" />
  </svg>
);
