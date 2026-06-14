/**
 * Tipos da tela de Consumo/Doação (INTTEGRA Pecuário · Movimentação › Consumo/Doação).
 * Espelha o conceito de camada dupla da Morte: por categoria, o total = quantidade
 * declarada sem detalhe (baixa coletiva) + animais detalhados individualmente (por
 * ID). Os dois caminhos coexistem e são somados; o que ficar só declarado (sem
 * detalhe) vira pendência. Difere da Morte por trocar o "motivo" dinâmico por um
 * `tipo` fixo (consumo abate/acidente, doação) e por registrar peso vivo/morto e
 * valor por cabeça.
 */
import type { LookupItem, ConsolidatedRow } from '../nascimento/types';

export type { LookupItem, ConsolidatedRow };

/** Tipo da baixa: consumo (abate/acidente) ou doação. */
export type ConsumoTipo = 'consumo-abate' | 'consumo-acidente' | 'doacao';

/** Opções fixas do campo Tipo (id persistido + rótulo exibido). */
export const CONSUMO_TIPOS: { id: ConsumoTipo; nome: string }[] = [
  { id: 'consumo-abate', nome: 'CONSUMO - ABATE' },
  { id: 'consumo-acidente', nome: 'CONSUMO - ACIDENTE' },
  { id: 'doacao', nome: 'DOAÇÃO' },
];

/** Rótulo de um tipo a partir do id. */
export function tipoNome(id: string | null | undefined): string {
  return CONSUMO_TIPOS.find((t) => t.id === id)?.nome || '—';
}

/** Categoria declarada em baixa coletiva (modo lote). */
export interface ConsumoCat {
  catId: string;
  catNome: string;
  qtd: number;
  tipo: string;
  /** Peso vivo por cabeça (kg). */
  pesoVivo: number | null;
  /** Peso morto por cabeça (kg). */
  pesoMorto: number | null;
  /** Valor por cabeça (R$). */
  valor: number | null;
}

/** Movimento de consumo/doação salvo (estado local). */
export interface MovimentoConsumo {
  id: string;
  data: string;
  qtd: number;
  /** linhas coletivas declaradas (sem detalhe), com tipo/peso/valor. */
  catDecl: {
    catId: string;
    qtd: number;
    tipo?: string | null;
    pesoVivo?: number | null;
    pesoMorto?: number | null;
    valor?: number | null;
  }[];
  /** fichas individuais vinculadas a este movimento. */
  fichas: {
    id: number;
    idManejo: string;
    idEletronico: string;
    catId: string;
    tipo: string;
    pesoVivo: number | null;
    pesoMorto: number | null;
    valor: number | null;
    obs: string;
    /** Valores dos Campos Personalizados (chaves `cp_*`). */
    extras?: Record<string, string>;
  }[];
  naoIdentificados: number;
  status: 'pendente' | 'conciliado';
  fazenda?: string;
  retiro?: string;
  local?: string;
  proprietario?: string;
  safra?: string;
  obs?: string;
}
