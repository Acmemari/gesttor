/**
 * Funções puras da tela de Vendas (Venda Abate · lote). Sem dependência de
 * React/DOM para serem testáveis isoladamente. Reaproveita os helpers de data
 * do Nascimento e o parser/formatador monetário de lib/format/brl.
 */
import type { TipoPeso, TipoVenda, VendaCat } from './types';
import { formatBRLFull } from '../../../lib/format/brl';

// Reaproveitados (data/safra + parsers de input pt-BR).
export { todayISO, formatDateBR, safraDaData, parseWeight } from '../nascimento/util';
export { parseBRL } from '../../../lib/format/brl';

/** 1 arroba de carcaça = 15 kg. */
export const ARROBA_KG = 15;

export interface VendaCalc {
  totalCab: number;
  totalPesoVivo: number;
  /** Peso morto total consolidado (kg) — soma das categorias. */
  totalPesoMorto: number;
  /**
   * Valor médio (R$). No modo arroba é o valor por @ médio ponderado pela arroba;
   * no modo kg é o valor por quilo médio (valor total / peso morto total). NULL sem valor.
   */
  valorArroba: number | null;
  /** Peso morto por cabeça (kg). */
  pesoMortoCab: number | null;
  /** Peso morto por cabeça em arrobas (peso morto por cabeça / 15). */
  pesoMortoArroba: number | null;
  /** Rendimento de carcaça (%). NULL quando falta peso vivo em alguma linha. */
  rendimento: number | null;
  /** Valor total da venda (R$). */
  valorTotal: number | null;
  /** Valor por cabeça (R$). */
  valorCab: number | null;
}

/** Soma das cabeças de todas as linhas de categoria. */
export function somaCabecas(itens: VendaCat[]): number {
  return itens.reduce((a, it) => a + (it.qtd || 0), 0);
}

/**
 * Cálculos consolidados da Venda Abate. Valor por arroba e peso morto total são
 * informados POR CATEGORIA; aqui agregamos sobre todas as linhas. Todos os
 * divisores são guardados; quando os dados são parciais o resultado é `null`
 * (a tela renderiza "—").
 *
 * - Peso morto total = Σ peso morto da categoria.
 * - Valor total = Σ (peso morto da categoria / 15 · valor/@ da categoria) — usa
 *   o valor por arroba próprio de cada categoria, não um valor único.
 *   No modo kg (tipoPeso='kg') o valor da categoria é por QUILO e o valor total
 *   passa a ser Σ (peso morto da categoria · valor/kg da categoria).
 * - Valor médio = valor total / total de arrobas (modo @, ponderado pela arroba)
 *   ou valor total / peso morto total (modo kg, valor por quilo médio).
 * - Rendimento agregado = peso morto total / Σ(qtd·peso vivo) × 100, calculado
 *   somente quando TODAS as linhas têm peso vivo; caso contrário o peso morto não
 *   pode ser atribuído honestamente.
 */
export function computeVendaAbate(
  itens: VendaCat[],
  tipoVenda: TipoVenda = 'abate',
  tipoPeso: TipoPeso = 'arroba',
  descontoPercent: number | null = 0,
): VendaCalc {
  const totalCab = somaCabecas(itens);
  const todosTemPesoVivo = itens.length > 0 && itens.every((it) => (it.pesoVivoKg ?? 0) > 0);
  const totalPesoVivo = itens.reduce((a, it) => a + (it.qtd || 0) * (it.pesoVivoKg ?? 0), 0);

  if (tipoVenda === 'pe') {
    // Venda em Pé (Peso Vivo)
    // No frontend, para Venda em Pé, pesoMortoTotal no item representa o Peso Vivo Total bruto da categoria.
    // valorArroba representa o Valor/kg da categoria.
    // Peso Líquido Total (Peso vivo total já com desconto)
    const totalPesoLiquido = itens.reduce((a, it) => {
      const desc = it.desconto ?? descontoPercent ?? 0;
      const pBruto = it.pesoMortoTotal ?? 0;
      return a + pBruto * (1 - desc / 100);
    }, 0);

    // Valor total da venda
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
      // pesoMortoTotal servirá como o peso líquido total consolidado para fins de Preview e DB.
      totalPesoMorto: totalPesoLiquido,
      valorArroba: valorKgMedio, // Exibido como Valor por quilo médio
      pesoMortoCab: totalCab > 0 && totalPesoLiquido > 0 ? totalPesoLiquido / totalCab : null, // Peso líquido por cabeça
      pesoMortoArroba: null, // Sem arroba
      rendimento: null, // Sem rendimento
      valorTotal,
      valorCab,
    };
  } else {
    // Venda Abate (carcaça). tipoPeso='arroba' → preço por @; 'kg' → preço por kg.
    // No modo kg o campo valorArroba (item) carrega o valor POR QUILO da categoria.
    const porKg = tipoPeso === 'kg';
    const totalPesoMorto = itens.reduce((a, it) => a + (it.pesoMortoTotal ?? 0), 0);
    const valorTotalRaw = itens.reduce((a, it) => {
      const pm = it.pesoMortoTotal ?? 0;
      const va = it.valorArroba ?? 0;
      if (!(pm > 0 && va > 0)) return a;
      // Por kg: peso morto (kg) × valor/kg. Por @: (peso morto / 15) × valor/@.
      return a + (porKg ? pm * va : (pm / ARROBA_KG) * va);
    }, 0);
    const valorTotal = valorTotalRaw > 0 ? valorTotalRaw : null;

    const pesoMortoCab = totalCab > 0 && totalPesoMorto > 0 ? totalPesoMorto / totalCab : null;
    // No modo kg não há métrica em arroba (a tela esconde "Peso morto @").
    const pesoMortoArroba = porKg ? null : pesoMortoCab != null ? pesoMortoCab / ARROBA_KG : null;
    const valorCab = totalCab > 0 && valorTotal != null ? valorTotal / totalCab : null;
    const rendimento = todosTemPesoVivo && totalPesoVivo > 0 ? (totalPesoMorto / totalPesoVivo) * 100 : null;
    // Valor médio: por kg = valor total / peso morto total (kg); por @ = valor total / arrobas.
    const arrobaTotal = totalPesoMorto > 0 ? totalPesoMorto / ARROBA_KG : 0;
    const valorArroba =
      valorTotal == null
        ? null
        : porKg
        ? totalPesoMorto > 0
          ? valorTotal / totalPesoMorto
          : null
        : arrobaTotal > 0
        ? valorTotal / arrobaTotal
        : null;

    return { totalCab, totalPesoVivo, totalPesoMorto, valorArroba, pesoMortoCab, pesoMortoArroba, rendimento, valorTotal, valorCab };
  }
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
