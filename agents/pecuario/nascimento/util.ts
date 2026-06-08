/**
 * Funções puras da tela de Nascimento — derivações, validações e formatação.
 * Mantidas sem dependência de React/DOM para serem testáveis isoladamente.
 */
import type { LookupItem, NascCat, NascDetalhe, SanItem } from './types';

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

/** Safra corrente (jul→jun): 2025/2026. */
export function safraAtual(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const ini = m >= 6 ? y : y - 1;
  return `${ini}/${ini + 1}`;
}

/**
 * Safra (jul→jun) correspondente a uma data ISO (YYYY-MM-DD).
 * Ex.: 2026-06-04 → "2025/2026" (junho ainda pertence à safra que começou em julho/2025).
 */
export function safraDaData(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return '';
  const ini = m >= 7 ? y : y - 1; // safra inicia em julho (mês 7)
  return `${ini}/${ini + 1}`;
}

/**
 * Próximo ID Manejo na sequência, preservando prefixo, sufixo e zeros à
 * esquerda. Ex.: 001 → 002 · BZ-09 → BZ-10. Sem número, retorna o original.
 */
export function proximoApelido(prev: string): string {
  if (!prev) return '';
  const m = String(prev).match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return prev;
  const [, pre, num, suf] = m;
  const inc = (parseInt(num, 10) + 1).toString().padStart(num.length, '0');
  return `${pre}${inc}${suf}`;
}

/** Converte string de peso ("0,0" / "12.5") para número; 0 se inválido. */
export function parseWeight(str: string | undefined | null): number {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Soma das quantidades de categorias declaradas. */
export function somaCategorias(cats: NascCat[]): number {
  return cats.reduce((a, c) => a + (c.qtd || 0), 0);
}

/** Quantidade ainda "sem categoria (a detalhar)". Nunca negativa. */
export function semCategoria(total: number, contribuido: number): number {
  return Math.max(0, total - contribuido);
}

/** Status derivado: pendente se há não identificados, senão conciliado. */
export function statusFrom(naoIdentificados: number): 'pendente' | 'conciliado' {
  return naoIdentificados > 0 ? 'pendente' : 'conciliado';
}

/** Custo total das aplicações sanitárias. */
export function custoSanitario(items: SanItem[]): number {
  return items.reduce((a, i) => a + (i.custo || 0), 0);
}

/** Contagem de detalhados por categoria (catId → nº de animais). */
export function tallyPorCategoria(detalhe: NascDetalhe[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const d of detalhe) {
    const catId = d.values.categoria;
    if (!catId) continue;
    tally[catId] = (tally[catId] || 0) + 1;
  }
  return tally;
}

/** Formata número como moeda BR sem o símbolo (12,40). */
export function fmtMoeda(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/**
 * Sexo do campo Sexo (formato 'Macho' | 'Fêmea') derivado da categoria
 * selecionada. O cadastro guarda o sexo cru ('macho' | 'femea'); aqui ele é
 * normalizado para o formato do controle de Sexo. Retorna undefined quando a
 * categoria não tem sexo definido (não sobrescreve o valor atual).
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
