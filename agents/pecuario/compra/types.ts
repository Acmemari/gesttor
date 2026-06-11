import type { LookupItem } from '../nascimento/types';

export type { LookupItem };

/** Linha de categoria (lote) da Compra. `id` é chave local p/ edição/remoção. */
export interface CompraCat {
  id: number;
  catId: string;
  catNome: string;
  qtd: number;
  pesoVivoKg: number | null; // peso vivo/cab
  /** Valor unitário (R$/kg) desta categoria. */
  valorArroba: number | null;
  /** Peso vivo total (kg) desta categoria (peso vivo/cab * qtd). */
  pesoMortoTotal: number | null;
  desconto: number | null;
}

/**
 * Animal detalhado por ID na Compra (modo individual / "Com ID").
 */
export interface CompraFicha {
  id: number;
  idManejo: string;
  idEletronico: string;
  catId: string;
  pesoVivoKg: number | null;
  pesoMortoKg: number | null; // Pode não ser usado, mas mantido por simetria
  valorArroba: number | null; // Valor por quilo do animal (R$/kg)
}

/** Compra salva. */
export interface MovimentoCompra {
  id: string;
  data: string;
  tipoVenda: string; // 'pe' | 'abate' (padrão 'pe')
  tipoPeso: string;  // 'kg' | 'arroba' (padrão 'kg')
  qtd: number;
  itens: CompraCat[];
  fichas: CompraFicha[];
  valorArroba: number | null; // valor/kg médio ponderado
  pesoMortoTotal: number | null; // peso vivo total
  valorTotal: number | null;
  pesoMortoArroba: number | null;
  rendimento: number | null;
  status: string;
  desconto: number | null;
  fazenda?: string;
  retiro?: string;
  local?: string;
  proprietario?: string;
  cliente?: string;
  safra?: string;
  obs?: string;
}
