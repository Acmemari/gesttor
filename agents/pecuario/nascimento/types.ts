/**
 * Tipos da tela de Nascimento (INTTEGRA Pecuário · Movimentação › Nascimento).
 * Conceito de camada dupla aditiva: por categoria, o total = quantidade
 * declarada sem detalhe + animais detalhados. Os dois caminhos coexistem e
 * são somados; o que ficar só declarado (sem detalhe) vira pendência.
 */

// Tipos genéricos do kit "Defina seus campos" (compartilhado entre os movimentos).
// Reexportados aqui para não quebrar os imports existentes da tela de Nascimento.
export type { FieldPlace, FieldType, LrField, FieldPlaces, MovimentoFieldConfig } from '../fichas/types';
import type { MovimentoFieldConfig } from '../fichas/types';

/** Configuração persistida dos campos do Lançamento Rápido (por organização). */
export type NascimentoFieldConfig = MovimentoFieldConfig;

/** Categoria declarada manualmente (modo DESLIGADO). */
export interface NascCat {
  catId: string;
  catNome: string;
  qtd: number;
}

/** Animal identificado inline (modo LIGADO). Valores são keyed por field id. */
export interface NascDetalhe {
  id: number;
  values: Record<string, string>;
}

/**
 * Linha consolidada por categoria: soma o declarado sem detalhe (cats[]) com
 * os animais detalhados (detalhe[]). É derivada — não é estado persistido.
 */
export interface ConsolidatedRow {
  catId: string;
  catNome: string;
  /** quantidade declarada sem detalhe (cats[]). */
  declarado: number;
  /** nº de animais detalhados nesta categoria (detalhe[]). */
  detalhado: number;
  /** declarado + detalhado. */
  total: number;
}

/** Item de aplicação sanitária. */
export interface SanItem {
  id: number;
  medId: string;
  nome: string;
  unidade: string;
  tipoDose: string;
  dose: number;
  porKg: number;
  /** custo da aplicação = custoUnit * dose */
  custo: number;
}

/** Ficha individual de um animal identificado (vinculado a um movimento). */
export interface AtribFicha {
  id: number;
  apelido: string;
  catId: string;
  rfid?: string;
  sisbov?: string;
  porte?: string;
  raca?: string;
  peso?: number;
}

/** Movimento de nascimento salvo (estado local). */
export interface MovimentoNasc {
  id: string;
  data: string;
  qtd: number;
  /** sempre null — a quantidade total é a âncora, agnóstica de categoria. */
  categoria: null;
  /** distribuição declarada/derivada por categoria. */
  catDecl: { catId: string; qtd: number }[];
  /** fichas individuais vinculadas a este movimento. */
  fichas: AtribFicha[];
  naoIdentificados: number;
  status: 'pendente' | 'conciliado';
  fazenda?: string;
  retiro?: string;
  local?: string;
  proprietario?: string;
  safra?: string;
  sanitario?: SanItem[];
}

/** Item simples de lookup estático (medicamento, protocolo, lote, raça...). */
export type { LookupItem } from '../fichas/types';
