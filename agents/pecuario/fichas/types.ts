/**
 * Tipos genéricos do kit "Defina seus campos" (Lançamento configurável de fichas),
 * compartilhado entre as movimentações (Nascimento, Compra, Venda, Morte). Cada
 * movimento fornece o seu próprio registro de campos (LrField[]); o restante do
 * kit é agnóstico de movimento.
 */

/** Onde um campo aparece no painel. */
export type FieldPlace = 'top' | 'bottom' | 'dados' | 'off';

/** Tipo de controle de um campo configurável. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'weight'
  | 'money'
  | 'select'
  | 'cat'
  | 'lote'
  | 'lookup'
  | 'sexo'
  | 'sanitario';

/** Definição de um campo configurável (linha do lápis "Defina seus campos"). */
export interface LrField {
  id: string;
  label: string;
  type: FieldType;
  req?: boolean;
  placeholder?: string;
  options?: readonly string[];
  /** Para type 'lookup': chave no mapa `lookups` (default = id). */
  lookupKey?: string;
  /** Valor padrão ao iniciar uma entrada (texto/seleção). 'date' assume hoje quando ausente. */
  default?: string;
  /** destino padrão */
  def: FieldPlace;
  /** Campo-âncora de ID (ex.: ID Manejo): travado em 'bottom' (só Tabela ou Desativar) + numeração automática. */
  locked?: boolean;
  /** Sanitário/seções: só 'top' (Superior) ou 'off' (Desativar). */
  enableOnly?: boolean;
  /** colunas que o campo ocupa no grid de Dados Adicionais. */
  span?: 1 | 2 | 3;
}

/** Mapa campo → destino atual. */
export type FieldPlaces = Record<string, FieldPlace>;

/** Configuração persistida dos campos (por organização e movimento). */
export interface MovimentoFieldConfig {
  /** destino de cada campo */
  places: FieldPlaces;
  /** ordem global de exibição (lista de field ids) */
  order: string[];
  /** numeração automática do campo-âncora de ID */
  autonum: boolean;
}

/** Item simples de lookup (categoria, lote, motivo, medicamento...). */
export interface LookupItem {
  id: string;
  nome: string;
  /** opcional: unidade/custo (medicamentos). */
  unidade?: string;
  custoUnit?: number;
  /**
   * Sexo associado (categorias animais). Quando presente, a seleção da categoria
   * preenche automaticamente o campo Sexo. Valor cru: 'macho' | 'femea'.
   */
  sexo?: string;
}

/** Ficha (animal) detalhada inline. Valores keyed por field id. */
export interface FichaDetalhe {
  id: number;
  values: Record<string, string>;
}
