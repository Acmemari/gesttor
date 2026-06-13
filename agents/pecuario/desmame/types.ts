/**
 * Tipos da tela de Desmame (Movimentação › Desmame).
 */
import type { ConsolidatedRow, LookupItem } from '../nascimento/types';

export type { ConsolidatedRow, LookupItem };

/** Linha da lista de bezerros mamando disponível para desmame. */
export interface DesmameRow {
  /** ID Manejo (apelido). Chave da linha. */
  apelido: string;
  /** ID Eletrônico (rfid), quando houver. */
  rfid: string;
  /** Categoria atual (id) — do grupo bezerros_mamando. */
  categoriaAtualId: string;
  /** Origem da ficha: 'db' (persistida) | 'nascimento' (derivada). */
  src: string;
  /** Id da ficha persistida ou da ficha de nascimento, conforme `src`. */
  fichaId: string;
}

/** Estado editável de uma linha (categoria de destino + peso digitados). */
export interface DesmameEdit {
  destino: string;
  peso: string;
}
