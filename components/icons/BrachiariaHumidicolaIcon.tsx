import React from 'react';

export const BrachiariaHumidicolaIcon: React.FC<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 24, className, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M4 19C6 18.3 7.5 18.3 9 19" />
    <path d="M9 19C11 20 13 18 15 19" />
    <path d="M15 19C17 18.3 18.8 18.4 20 19" />

    <path d="M8.5 18.8C7.6 16.4 6.4 14.8 4.8 13.7" />
    <path d="M8.5 18.8C8.2 16.2 7.8 14.2 6.8 12.3" />
    <path d="M8.5 18.8C9.3 16.3 10.4 14.6 11.8 13.5" />
    <path d="M8.5 18.8C7.1 17.5 5.4 16.8 3.6 16.7" />

    <path d="M15.5 18.8C14.6 16.4 13.6 14.8 12.2 13.7" />
    <path d="M15.5 18.8C15.8 16.2 16.2 14.2 17.2 12.3" />
    <path d="M15.5 18.8C16.5 16.4 17.8 14.8 19.5 13.8" />
    <path d="M15.5 18.8C16.9 17.5 18.6 16.8 20.4 16.7" />

    <path d="M11.5 18.5C11.2 17.2 10.7 16.3 10 15.6" />
    <path d="M12.5 18.5C12.8 17.2 13.3 16.3 14 15.6" />

    <path d="M11 19.2L10.3 20" />
    <path d="M13 19.2L13.7 20" />
  </svg>
);
