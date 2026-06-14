/**
 * Tipos da tela de Vendas (INTTEGRA Pecuário · Movimentação › Vendas).
 *
 * Esta etapa cobre apenas a Venda Abate (peso morto), versão "Lote de animais".
 * Os valores comerciais (valor por arroba e peso morto total) são informados POR
 * CATEGORIA, junto com quantidade e peso vivo por cabeça — tudo
 * vive em `itens`. Os resultados (peso morto/cabeça, @, rendimento, valor total)
 * são consolidados a partir do somatório das categorias. Venda em Pé, em quilos
 * e detalhamento individual entram em implementações futuras.
 */
import type { LookupItem } from '../nascimento/types';

export type { LookupItem };

export type TipoVenda = 'abate' | 'pe';
export type TipoPeso = 'arroba' | 'kg';

/** Linha de categoria (lote) da Venda Abate. `id` é chave local p/ edição/remoção. */
export interface VendaCat {
  id: number;
  catId: string;
  catNome: string;
  qtd: number;
  pesoVivoKg: number | null;
  /**
   * Valor unitário (R$) desta categoria. No modo arroba é o valor por @; no modo
   * kg (Venda Abate kg ou Venda em Pé) é o valor por quilo. O nome é histórico.
   */
  valorArroba: number | null;
  /** Peso morto total (kg) desta categoria (na Venda em Pé, o peso vivo total bruto). */
  pesoMortoTotal: number | null;
  /** Desconto % desta categoria. */
  desconto: number | null;
}

/**
 * Animal detalhado por ID na Venda Abate (modo individual / "Com ID"). Guarda
 * identificação, pesos e o valor/@ do animal (padrão = valor/@ do lote, mas
 * editável por animal). `id` é chave local p/ remoção.
 */
export interface VendaFicha {
  id: number;
  idManejo: string;
  idEletronico: string;
  catId: string;
  pesoVivoKg: number | null;
  pesoMortoKg: number | null;
  /** Valor por arroba (R$) do animal; o padrão é o valor/@ do lote (topo). */
  valorArroba: number | null;
  /** Valores dos Campos Personalizados (chaves `cp_*`). */
  extras?: Record<string, string>;
}

/** Venda salva (modelo de exibição da tela). */
export interface MovimentoVenda {
  id: string;
  data: string;
  tipoVenda: TipoVenda;
  tipoPeso: TipoPeso;
  qtd: number;
  itens: VendaCat[];
  // Animais detalhados por ID (modo individual / "Com ID").
  fichas: VendaFicha[];
  // Snapshots consolidados (somatório das categorias). valorArroba é o valor/@
  // médio ponderado pela arroba; pesoMortoTotal é a soma dos pesos por categoria.
  valorArroba: number | null;
  pesoMortoTotal: number | null;
  valorTotal: number | null;
  pesoMortoArroba: number | null;
  rendimento: number | null;
  status: 'pendente' | 'conciliado';
  desconto: number | null;
  fazenda?: string;
  retiro?: string;
  local?: string;
  proprietario?: string;
  cliente?: string;
  safra?: string;
  obs?: string;
}
