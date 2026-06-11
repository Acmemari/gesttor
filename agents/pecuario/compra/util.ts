import type { CompraCat } from './types';
import { formatBRLFull } from '../../../lib/format/brl';

export { todayISO, formatDateBR, safraDaData, parseWeight } from '../nascimento/util';
export { parseBRL } from '../../../lib/format/brl';

export interface CompraCalc {
  totalCab: number;
  totalPesoVivo: number;
  totalPesoMorto: number; // For compras, acts as total peso vivo consolidado
  valorArroba: number | null; // valor/kg médio ponderado
  pesoMortoCab: number | null; // peso vivo/cab médio consolidado
  pesoMortoArroba: number | null;
  rendimento: number | null;
  valorTotal: number | null;
  valorCab: number | null;
}

/** Soma das cabeças de todas as linhas de categoria. */
export function somaCabecas(itens: CompraCat[]): number {
  return itens.reduce((a, it) => a + (it.qtd || 0), 0);
}

/**
 * Cálculos consolidados da Compra.
 * Focado estritamente em Peso Vivo e Valor/kg (R$/kg).
 */
export function computeCompra(
  itens: CompraCat[],
  descontoPercent: number | null = 0,
): CompraCalc {
  const totalCab = somaCabecas(itens);
  const totalPesoVivo = itens.reduce((a, it) => a + (it.qtd || 0) * (it.pesoVivoKg ?? 0), 0);

  // Peso Vivo total consolidado (considerando desconto de lote individual se houver)
  const totalPesoLiquido = itens.reduce((a, it) => {
    const desc = it.desconto ?? descontoPercent ?? 0;
    const pBruto = it.pesoMortoTotal ?? 0;
    return a + pBruto * (1 - desc / 100);
  }, 0);

  // Valor total da compra
  const valorTotalRaw = itens.reduce((a, it) => {
    const desc = it.desconto ?? descontoPercent ?? 0;
    const pBruto = it.pesoMortoTotal ?? 0;
    const pLiquido = pBruto * (1 - desc / 100);
    const vKg = it.valorArroba ?? 0;
    return a + (pLiquido > 0 && vKg > 0 ? pLiquido * vKg : 0);
  }, 0);
  const valorTotal = valorTotalRaw > 0 ? valorTotalRaw : null;

  // Valor por quilo médio ponderado = valor total / peso líquido total
  const valorKgMedio = valorTotal != null && totalPesoLiquido > 0 ? valorTotal / totalPesoLiquido : null;
  
  // Valor por cabeça
  const valorCab = totalCab > 0 && valorTotal != null ? valorTotal / totalCab : null;

  return {
    totalCab,
    totalPesoVivo,
    totalPesoMorto: totalPesoLiquido,
    valorArroba: valorKgMedio,
    pesoMortoCab: totalCab > 0 && totalPesoLiquido > 0 ? totalPesoLiquido / totalCab : null,
    pesoMortoArroba: null,
    rendimento: null,
    valorTotal,
    valorCab,
  };
}

/** Número pt-BR com casas fixas; null/NaN → "—". */
export function fmtNum(n: number | null | undefined, casas = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Percentual xx,xx%; null/NaN → "—". */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Moeda completa (R$ x.xxx,xx); null/0 → "—". */
export function fmtBRL(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return '—';
  return formatBRLFull(n);
}

/** Número → string de input pt-BR (vírgula decimal). null/0 → "". */
export function numToInput(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return '';
  return String(n).replace('.', ',');
}
