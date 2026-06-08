/**
 * Funções puras da tela de Mortes. Reaproveita os helpers genéricos de data e
 * status do Nascimento; o que é específico do modelo de morte vive aqui.
 */
import type { MorteCat, MorteDetalhe } from './types';

// Reaproveitados do Nascimento (idênticos em comportamento).
export { todayISO, formatDateBR, safraDaData, statusFrom, proximoApelido } from '../nascimento/util';

/** Soma das quantidades de categorias declaradas (baixa coletiva). */
export function somaCategorias(cats: MorteCat[]): number {
  return cats.reduce((a, c) => a + (c.qtd || 0), 0);
}

/** Contagem de detalhados por categoria (catId → nº de animais). */
export function tallyPorCategoria(detalhe: MorteDetalhe[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const d of detalhe) {
    if (!d.categoria) continue;
    tally[d.categoria] = (tally[d.categoria] || 0) + 1;
  }
  return tally;
}
