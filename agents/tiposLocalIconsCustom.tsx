import { createLucideIcon, type LucideIcon } from 'lucide-react';

/**
 * Ícones customizados no MESMO estilo do lucide-react (traço preto-e-branco,
 * viewBox 24, stroke 2, currentColor, cantos arredondados).
 *
 * Cobrem silhuetas de pecuária/agricultura que o lucide não oferece (bovinos
 * zebu/taurino, cavalo, caprino, ovino, quadriciclo, moto, silos, capins, sorgo,
 * cascalho). São construídos via `createLucideIcon`, então são 100% compatíveis
 * com o tipo `LucideIcon` e renderizam idênticos aos demais (ver tiposLocalIcons).
 *
 * Cada nó segue o formato lucide `[tag, attrs]`; o `key` evita warning do React
 * ao mapear os nós (o <Icon> do lucide não injeta keys automaticamente).
 */
type CustomIconNode = ReadonlyArray<readonly [string, Record<string, string>]>;
const mk = (name: string, node: CustomIconNode): LucideIcon =>
  createLucideIcon(name, node as unknown as Parameters<typeof createLucideIcon>[1]);

// ── Rebanho / animais ────────────────────────────────────────────────────────────

/** Bovino taurino — silhueta lateral, lombo reto, chifres curtos. */
export const BovinoTaurino = mk('bovino-taurino', [
  ['path', { d: 'M5.5 8.4 4.7 6.3', key: 'bt1' }],
  ['path', { d: 'M6.4 8.3 7.1 6.2', key: 'bt2' }],
  ['path', { d: 'M5.5 8.4C4.2 8.3 3.3 9.4 3.4 11c0 .6.5 1 1.1 1l1.9-.1', key: 'bt3' }],
  ['path', { d: 'M6.3 8.6c.5-.3 1.1-.3 1.6 0', key: 'bt4' }],
  ['path', { d: 'M6.7 8.4h7.7c1.2 0 2 .6 2.3 1.6', key: 'bt5' }],
  ['path', { d: 'M16.4 9.4c1.3.5 1.7 2 1 3.6l-.4-1-.8.5', key: 'bt6' }],
  ['path', { d: 'M7.6 12.8V18', key: 'bt7' }],
  ['path', { d: 'M9.9 13.1V18', key: 'bt8' }],
  ['path', { d: 'M13.6 13.1V18', key: 'bt9' }],
  ['path', { d: 'M15.9 12.8V18', key: 'bt10' }],
  ['path', { d: 'M7.6 13.1h8.3', key: 'bt11' }],
]);

/** Bovino zebu — silhueta lateral com cupim (corcova) e barbela. */
export const BovinoZebu = mk('bovino-zebu', [
  ['path', { d: 'M5.5 8.7 4.7 6.6', key: 'bz1' }],
  ['path', { d: 'M6.4 8.6 7.1 6.5', key: 'bz2' }],
  ['path', { d: 'M5.5 8.7C4.2 8.6 3.3 9.7 3.4 11.3c0 .6.5 1 1.1 1l1.9-.1', key: 'bz3' }],
  ['path', { d: 'M6.3 8.9c.5-.3 1.1-.3 1.6 0', key: 'bz4' }],
  ['path', { d: 'M6.7 8.7c.4-2.5 1.4-3.9 2.9-3.9 1.3 0 2.2 1.2 2.6 3.2', key: 'bz5' }],
  ['path', { d: 'M12.2 8h2.2c1.2 0 2 .6 2.3 1.6', key: 'bz6' }],
  ['path', { d: 'M16.4 9.6c1.3.5 1.7 2 1 3.6l-.4-1-.8.5', key: 'bz7' }],
  ['path', { d: 'M4.6 12.4c-.3 1.2 0 2.2 1 2.8', key: 'bz8' }],
  ['path', { d: 'M7.8 12.9V18', key: 'bz9' }],
  ['path', { d: 'M10.1 13.2V18', key: 'bz10' }],
  ['path', { d: 'M13.6 13.2V18', key: 'bz11' }],
  ['path', { d: 'M15.9 12.9V18', key: 'bz12' }],
  ['path', { d: 'M7.8 13.2h8.1', key: 'bz13' }],
]);

/** Cavalo / equino — cabeça e pescoço (perfil). */
export const Cavalo = mk('cavalo', [
  ['path', { d: 'M8 20c-.6-4.2-.6-7.4.5-9.6.5-1-.3-1.6-1.3-1.2l-1.1.4c-.9.3-1.6-.7-1-1.4l2.4-3.2C9 2.7 11 2 13 2c2.3 0 4 1.7 4.2 4.3.2 3-1.1 5.2-3.5 6.6-1.3.8-2 2.1-2 3.6V20Z', key: 'cv1' }],
  ['path', { d: 'M13 2.2c.3-.9.9-1.5 1.8-1.9', key: 'cv2' }],
  ['path', { d: 'M16.4 6.2c-1.3 1-2.2 2.6-2.4 4.5', key: 'cv3' }],
  ['circle', { cx: '9.6', cy: '6.6', r: '.7', fill: 'currentColor', stroke: 'none', key: 'cv4' }],
]);

/** Caprino / cabra — cabeça com chifres voltados para trás e barbicha. */
export const Caprino = mk('caprino', [
  ['path', { d: 'M5.4 11c-1 0-1.7-.7-1.7-1.7 0-.7.4-1.3 1.1-1.6', key: 'cp1' }],
  ['path', { d: 'M4.8 7.7C5.6 5.7 7.5 4.3 9.8 4.3c2.3 0 3.9 1.5 3.9 3.6 0 2.6-2.2 4.7-5.1 4.7', key: 'cp2' }],
  ['path', { d: 'M8.7 12.6c-.1 1.6-.5 3-1 4.4', key: 'cp3' }],
  ['path', { d: 'M11.5 4.9c1.6-.4 3-1.5 4-3.1', key: 'cp4' }],
  ['path', { d: 'M12.8 6c1.6-.1 3-1 4-2.6', key: 'cp5' }],
  ['path', { d: 'M13.4 8.6c1.2.4 2.3.1 3.2-.7', key: 'cp6' }],
  ['circle', { cx: '9', cy: '7.9', r: '.7', fill: 'currentColor', stroke: 'none', key: 'cp7' }],
]);

/** Ovino / ovelha — corpo lanoso com cabeça e patas. */
export const Ovino = mk('ovino', [
  ['path', { d: 'M8 13.6c-1.4 0-2.5-1.1-2.5-2.5 0-1 .6-1.9 1.5-2.3-.1-1.5 1-2.8 2.5-2.8.5 0 1 .2 1.5.5.5-1 1.5-1.7 2.6-1.7 1.5 0 2.7 1.1 2.9 2.5 1.2.2 2 1.3 2 2.5 0 1.4-1.1 2.5-2.5 2.5', key: 'ov1' }],
  ['path', { d: 'M7.2 12.6c-1.3.2-2.3 1.3-2.3 2.6 0 1 .7 1.7 1.7 1.7 1.2 0 2-1 2-2.3', key: 'ov2' }],
  ['path', { d: 'M4.9 14.6c-.8-.3-1.6-.1-2.2.5', key: 'ov3' }],
  ['path', { d: 'M9 13.6v3', key: 'ov4' }],
  ['path', { d: 'M12 13.6v3', key: 'ov5' }],
  ['path', { d: 'M15 13.4v3', key: 'ov6' }],
]);

// ── Forragens / lavoura ──────────────────────────────────────────────────────────

/** Capim alto — touceira de folhas altas. */
export const CapimAlto = mk('capim-alto', [
  ['path', { d: 'M12 21c-.5-6-2.5-10.5-5.5-13.5', key: 'ca1' }],
  ['path', { d: 'M12 21c0-7 0-12 0-16', key: 'ca2' }],
  ['path', { d: 'M12 21c.5-6 2.5-10.5 5.5-13.5', key: 'ca3' }],
  ['path', { d: 'M12 21c-.3-4-1.3-7-3-9.5', key: 'ca4' }],
  ['path', { d: 'M12 21c.3-4 1.3-7 3-9.5', key: 'ca5' }],
]);

/** Capim baixo — tufos curtos sobre a linha do solo. */
export const CapimBaixo = mk('capim-baixo', [
  ['path', { d: 'M3 19h18', key: 'cb1' }],
  ['path', { d: 'M6 19c0-2.5.4-4.5 1.8-6.3', key: 'cb2' }],
  ['path', { d: 'M9.5 19c0-3 0-5 0-7', key: 'cb3' }],
  ['path', { d: 'M12 19c0-3.2.2-5.2 0-7.2', key: 'cb4' }],
  ['path', { d: 'M14.5 19c0-3 0-5 0-7', key: 'cb5' }],
  ['path', { d: 'M18 19c0-2.5-.4-4.5-1.8-6.3', key: 'cb6' }],
]);

/** Sorgo — colmo com panícula (cabeça de grãos) e folhas. */
export const Sorgo = mk('sorgo', [
  ['path', { d: 'M12 21V9', key: 'sg1' }],
  ['ellipse', { cx: '12', cy: '5.5', rx: '2.6', ry: '3.6', key: 'sg2' }],
  ['path', { d: 'M12 14c-2.2 0-4-1.4-5-3.6', key: 'sg3' }],
  ['path', { d: 'M12 11.5c2.2 0 4-1.4 5-3.6', key: 'sg4' }],
]);

// ── Armazenamento / solo ─────────────────────────────────────────────────────────

/** Silo bolsa — bag horizontal selado com vincos. */
export const SiloBolsa = mk('silo-bolsa', [
  ['rect', { x: '3', y: '9', width: '18', height: '6', rx: '3', key: 'sb1' }],
  ['path', { d: 'M9 9v6', key: 'sb2' }],
  ['path', { d: 'M13 9v6', key: 'sb3' }],
  ['path', { d: 'M17 9v6', key: 'sb4' }],
  ['path', { d: 'M2 19h20', key: 'sb5' }],
]);

/** Silo de superfície — montículo coberto com pneus por cima. */
export const SiloSuperficie = mk('silo-superficie', [
  ['path', { d: 'M2 19h20', key: 'ss1' }],
  ['path', { d: 'M4 19l3-9h10l3 9', key: 'ss2' }],
  ['circle', { cx: '8.5', cy: '8', r: '1.1', key: 'ss3' }],
  ['circle', { cx: '12', cy: '7.3', r: '1.1', key: 'ss4' }],
  ['circle', { cx: '15.5', cy: '8', r: '1.1', key: 'ss5' }],
]);

/** Cascalho / brita — pilha de pedras. */
export const Cascalho = mk('cascalho', [
  ['path', { d: 'M2 19h20', key: 'cs1' }],
  ['circle', { cx: '7', cy: '15.5', r: '2.6', key: 'cs2' }],
  ['circle', { cx: '12.4', cy: '16.4', r: '2.8', key: 'cs3' }],
  ['circle', { cx: '17.4', cy: '15.5', r: '2.4', key: 'cs4' }],
  ['circle', { cx: '9.8', cy: '11', r: '2.3', key: 'cs5' }],
  ['circle', { cx: '14.8', cy: '11', r: '2.3', key: 'cs6' }],
]);

// ── Veículos / máquinas ──────────────────────────────────────────────────────────

/** Quadriciclo (ATV) — quatro rodas largas, vista frontal. */
export const Quadriciclo = mk('quadriciclo', [
  ['rect', { x: '2.5', y: '13', width: '4.6', height: '6.5', rx: '1.6', key: 'qc1' }],
  ['rect', { x: '16.9', y: '13', width: '4.6', height: '6.5', rx: '1.6', key: 'qc2' }],
  ['path', { d: 'M7.1 15.5h9.8', key: 'qc3' }],
  ['path', { d: 'M8.2 15.5 9.6 11h4.8l1.4 4.5', key: 'qc4' }],
  ['path', { d: 'M9.5 11.4h5', key: 'qc5' }],
  ['path', { d: 'M12 11.4V9.4', key: 'qc6' }],
]);

/** Moto — motocicleta de perfil. */
export const Moto = mk('moto', [
  ['circle', { cx: '5.5', cy: '16', r: '3', key: 'mt1' }],
  ['circle', { cx: '18.5', cy: '16', r: '3', key: 'mt2' }],
  ['path', { d: 'M8.5 16l1.8-5h5.2l1.5 5', key: 'mt3' }],
  ['path', { d: 'M10.3 11 8 8.5H5.5', key: 'mt4' }],
  ['path', { d: 'M5.5 16 7.5 11', key: 'mt5' }],
]);
