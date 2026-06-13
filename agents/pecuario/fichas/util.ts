/**
 * Funções puras do kit de fichas — sem dependência de React/DOM (testáveis
 * isoladamente). Estas são as mesmas usadas hoje na tela de Nascimento; aqui
 * ficam no kit compartilhado para servir a todos os movimentos.
 */
import type { LookupItem } from './types';

export { parseBRL } from '../../../lib/format/brl';

/** Hoje em ISO (YYYY-MM-DD), data local. */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Formata ISO → DD/MM/YYYY. */
export function formatDateBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Converte string de peso ("0,0" / "12.5") para número; 0 se inválido. */
export function parseWeight(str: string | undefined | null): number {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Próximo ID na sequência, preservando prefixo, sufixo e zeros à esquerda.
 * Ex.: 001 → 002 · BZ-09 → BZ-10. Sem número, retorna o original.
 */
export function proximoApelido(prev: string): string {
  if (!prev) return '';
  const m = String(prev).match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return prev;
  const [, pre, num, suf] = m;
  const inc = (parseInt(num, 10) + 1).toString().padStart(num.length, '0');
  return `${pre}${inc}${suf}`;
}

/**
 * Sexo ('Macho' | 'Fêmea') derivado da categoria selecionada. O cadastro guarda
 * o sexo cru ('macho' | 'femea'); aqui é normalizado para o formato do controle.
 * Retorna undefined quando a categoria não tem sexo definido.
 */
export function sexoFromCategoria(categories: LookupItem[], catId: string): string | undefined {
  if (!catId) return undefined;
  const raw = categories.find((c) => c.id === catId)?.sexo;
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  if (['femea', 'fêmea', 'f', '♀', 'female', 'feminino'].includes(v)) return 'Fêmea';
  if (['macho', 'm', '♂', 'male', 'masculino'].includes(v)) return 'Macho';
  return undefined;
}
