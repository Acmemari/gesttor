import React from 'react';

/**
 * Ícone de "morte de bovino" para o cadastro de Motivos de Morte.
 * Cabeça de bovino em perfil (voltada à esquerda) com o olho marcado por um X
 * e um triângulo de alerta com sinal de menos (–) abaixo.
 *
 * SVG desenhado à mão (viewBox 48x48), no estilo dos demais ícones do projeto:
 * usa `currentColor` no traço, então herda a cor do contexto (ex.: verde-limão
 * da marca). Cantos arredondados, minimalista vetorial, sem preenchimento.
 */
export const MotivoMorteIcon: React.FC<{
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
    {/* Testa, ponte do nariz e focinho arredondado */}
    <path d="M22 9.5C17 9.8 12.5 14 10 19.5C8.7 22.2 7.8 24.5 9 25.8C10 27 12 27 13 26" />
    {/* Mandíbula / garganta */}
    <path d="M13 26C15 28 17 28.5 19 28.5" />
    {/* Frente do pescoço / peito */}
    <path d="M19 28.5C23 29.5 26 32 28.5 38" />
    {/* Nuca / parte de trás do pescoço */}
    <path d="M28.5 38C35 30 36 22 30 15" />
    {/* Orelha */}
    <path d="M22.5 9.8C25 7 30 6.5 31.5 9.5C32.3 11.2 31.5 13.5 30 15" />
    {/* Chifre */}
    <path d="M21 9.6C20 7 20 5.5 20.6 5" />
    {/* Olho marcado com X */}
    <path d="M16.3 15.3 19.7 18.7" />
    <path d="M19.7 15.3 16.3 18.7" />
    {/* Narina */}
    <path d="M9 23 10.3 23.4" />
    {/* Triângulo de alerta com sinal de menos */}
    <path d="M20 28.5 26 38 14 38Z" />
    <path d="M17 34.8 23 34.8" />
  </svg>
);

export default MotivoMorteIcon;
