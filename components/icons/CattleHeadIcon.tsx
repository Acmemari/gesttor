import React from 'react';

export const CattleHeadIcon: React.FC<{
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
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M7 8C4.5 7 2.5 7.5 3 10.5" />
    <path d="M17 8c2.5-1 4.5-.5 4 2.5" />
    <path d="M5 11c-1.5.5-2 2-1 3.5" />
    <path d="M19 11c1.5.5 2 2 1 3.5" />
    <path d="M6 10.5c.3 4.5 2.5 8.5 6 8.5s5.7-4 6-8.5" />
    <path d="M9.5 16.5h5" />
  </svg>
);
