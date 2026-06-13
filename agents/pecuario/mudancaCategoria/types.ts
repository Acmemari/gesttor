/**
 * Tipos da tela de Mudança de Categoria (Movimentação › Mudança de Categoria).
 */
import type { ConsolidatedRow, LookupItem } from '../nascimento/types';

export type { ConsolidatedRow, LookupItem };

/** Linha da lista de animais (categoria de saída) disponíveis para mudança. */
export interface MudancaRow {
  /** ID Manejo (apelido). Chave da linha. */
  apelido: string;
  /** ID Eletrônico (rfid), quando houver. */
  rfid: string;
  /** Categoria atual (id) — a categoria de saída/origem. */
  categoriaAtualId: string;
  /** Origem da ficha: 'db' (persistida) | 'nascimento' (derivada). */
  src: string;
  /** Id da ficha persistida ou da ficha de nascimento, conforme `src`. */
  fichaId: string;
}

/** Estado editável de uma linha (categoria de destino + peso + valor digitados). */
export interface MudancaEdit {
  destino: string;
  peso: string;
  valor: string;
}
