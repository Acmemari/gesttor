/**
 * Funções puras da tela de Consumo/Doação. Reaproveita os helpers genéricos de
 * data e status do Nascimento; o que é específico do modelo vive aqui.
 */
import type { ConsumoCat } from './types';

// Reaproveitados do Nascimento (idênticos em comportamento).
export { todayISO, formatDateBR, safraDaData, statusFrom, proximoApelido } from '../nascimento/util';

/** Soma das quantidades de categorias declaradas (baixa coletiva). */
export function somaCategorias(cats: ConsumoCat[]): number {
  return cats.reduce((a, c) => a + (c.qtd || 0), 0);
}
