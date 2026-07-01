import React from 'react';

interface PatternProps {
  className?: string;
  style?: React.CSSProperties;
}

export const solid: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.22" stroke="currentColor" />
  </svg>
);

export const mata: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <circle cx="20" cy="15" r="3" />
    <path d="M20 18v5" />
    <circle cx="32" cy="13" r="3" />
    <path d="M32 16v6" />
    <circle cx="44" cy="15" r="3" />
    <path d="M44 18v5" />
    <circle cx="26" cy="23" r="3" />
    <path d="M26 26v4" />
    <circle cx="38" cy="22" r="3" />
    <path d="M38 25v4" />
  </svg>
);

export const pastagem: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M20 16c-1.5-2-3-2.5-4-2.5M20 16c0-2.5.5-3 1-3M20 16c1.5-2 3-2.5 4-2.5" />
    <path d="M42 15c-1.5-2-3-2.5-4-2.5M42 15c0-2.5.5-3 1-3M42 15c1.5-2 3-2.5 4-2.5" />
    <path d="M31 22c-1.5-2-3-2.5-4-2.5M31 22c0-2.5.5-3 1-3M31 22c1.5-2 3-2.5 4-2.5" />
    <path d="M18 28c-1.5-2-3-2.5-4-2.5M18 28c0-2.5.5-3 1-3M18 28c1.5-2 3-2.5 4-2.5" />
    <path d="M44 27c-1.5-2-3-2.5-4-2.5M44 27c0-2.5.5-3 1-3M44 27c1.5-2 3-2.5 4-2.5" />
  </svg>
);

export const lavoura: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <line x1="8" y1="13.5" x2="56" y2="13.5" />
    <line x1="8" y1="20" x2="56" y2="20" />
    <line x1="8" y1="26.5" x2="56" y2="26.5" />
  </svg>
);

export const ilp: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <line x1="8" y1="14" x2="56" y2="14" />
    <path d="M20 25c-1.5-2-3-2.5-4-2.5M20 25c0-2.5.5-3 1-3M20 25c1.5-2 3-2.5 4-2.5" />
    <path d="M32 23c-1.5-2-3-2.5-4-2.5M32 23c0-2.5.5-3 1-3M32 23c1.5-2 3-2.5 4-2.5" />
    <path d="M44 25c-1.5-2-3-2.5-4-2.5M44 25c0-2.5.5-3 1-3M44 25c1.5-2 3-2.5 4-2.5" />
  </svg>
);

export const capineira: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M18 29V12M18 24c-1.5-1-3-1-4.5.5M18 20c1.5-1 3-1 4.5.5M18 16c-1.5-1-3-1-4.5.5" />
    <path d="M32 29V12M32 24c-1.5-1-3-1-4.5.5M32 20c1.5-1 3-1 4.5.5M32 16c-1.5-1-3-1-4.5.5" />
    <path d="M46 29V12M46 24c-1.5-1-3-1-4.5.5M46 20c1.5-1 3-1 4.5.5M46 16c-1.5-1-3-1-4.5.5" />
  </svg>
);

export const feno: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M15.5 13.5l5 5M20.5 13.5l-5 5" />
    <circle cx="32" cy="15" r="3.5" />
    <path d="M29.5 12.5l5 5M34.5 12.5l-5 5" />
    <circle cx="46" cy="16" r="3.5" />
    <path d="M43.5 13.5l5 5M48.5 13.5l-5 5" />
    <circle cx="25" cy="25" r="3.5" />
    <path d="M22.5 22.5l5 5M27.5 22.5l-5 5" />
    <circle cx="39" cy="25" r="3.5" />
    <path d="M36.5 22.5l5 5M41.5 22.5l-5 5" />
  </svg>
);

export const agua: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M8 13.5c4-2 8-2 12 0s8 2 12 0 8-2 12 0 8 2 12 0" />
    <path d="M8 20c4-2 8-2 12 0s8 2 12 0 8-2 12 0 8 2 12 0" />
    <path d="M8 26.5c4-2 8-2 12 0s8 2 12 0 8-2 12 0 8 2 12 0" />
  </svg>
);

export const hachura: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <line x1="8" y1="12" x2="13" y2="7" />
    <line x1="8" y1="20" x2="21" y2="7" />
    <line x1="8" y1="30" x2="31" y2="7" />
    <line x1="15" y1="33" x2="41" y2="7" />
    <line x1="25" y1="33" x2="51" y2="7" />
    <line x1="35" y1="33" x2="56" y2="12" />
    <line x1="45" y1="33" x2="56" y2="22" />
  </svg>
);

export const opcao1: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <line x1="16" y1="13" x2="16" y2="13" />
    <line x1="32" y1="13" x2="32" y2="13" />
    <line x1="48" y1="13" x2="48" y2="13" />
    <line x1="24" y1="20" x2="24" y2="20" />
    <line x1="40" y1="20" x2="40" y2="20" />
    <line x1="16" y1="27" x2="16" y2="27" />
    <line x1="32" y1="27" x2="32" y2="27" />
    <line x1="48" y1="27" x2="48" y2="27" />
  </svg>
);

export const opcao2: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <line x1="8" y1="15" x2="56" y2="15" />
    <line x1="8" y1="25" x2="56" y2="25" />
  </svg>
);

export const opcao3: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M18 13l-3 5h6z" />
    <path d="M32 13l-3 5h6z" />
    <path d="M46 13l-3 5h6z" />
    <path d="M25 22l-3 5h6z" />
    <path d="M39 22l-3 5h6z" />
  </svg>
);

export const opcao4: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M16 15h4M18 13v4" />
    <path d="M30 14h4M32 12v4" />
    <path d="M44 15h4M46 13v4" />
    <path d="M23 25h4M25 23v4" />
    <path d="M37 25h4M39 23v4" />
  </svg>
);

export const opcao5: React.FC<PatternProps> = ({ className, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="8" y="7" width="48" height="26" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" />
    <path d="M15.5 16h5v4h-5z" />
    <path d="M14.5 16l3.5-3 3.5 3" />
    <path d="M43.5 16h5v4h-5z" />
    <path d="M42.5 16l3.5-3 3.5 3" />
    <path d="M29.5 24h5v4h-5z" />
    <path d="M28.5 24l3.5-3 3.5 3" />
  </svg>
);
