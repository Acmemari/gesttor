/**
 * Tipos da tela de Mortes (INTTEGRA Pecuário · Movimentação › Mortes).
 * Espelha o conceito de camada dupla do Nascimento: por categoria, o total =
 * quantidade declarada sem detalhe (baixa coletiva) + animais detalhados
 * individualmente (por ID). Os dois caminhos coexistem e são somados; o que
 * ficar só declarado (sem detalhe) vira pendência.
 */
import type { LookupItem, ConsolidatedRow } from '../nascimento/types';

export type { LookupItem, ConsolidatedRow };

/** Como o animal foi identificado no detalhamento individual. */
export type IdTipo = 'manejo' | 'eletronico';

/** Categoria declarada em baixa coletiva (modo lote). */
export interface MorteCat {
  catId: string;
  catNome: string;
  qtd: number;
  motivoId: string;
}

/**
 * Animal identificado individualmente (modo por ID). As duas formas de
 * identificação coexistem: o usuário pode informar o ID de Manejo, o ID
 * Eletrônico (RFID), ou ambos — preencher um carrega o outro quando o cadastro
 * do animal estiver disponível. Ao menos um dos dois é obrigatório.
 */
export interface MorteDetalhe {
  id: number;
  /** ID de Manejo (apelido/brinco visual). */
  idManejo: string;
  /** ID Eletrônico (RFID). */
  idEletronico: string;
  /** categoria do animal (hoje manual; futura busca automática pelo ID). */
  categoria: string;
  motivoId: string;
  obs: string;
}

/** Movimento de morte salvo (estado local). */
export interface MovimentoMorte {
  id: string;
  data: string;
  qtd: number;
  /** linhas coletivas declaradas (sem detalhe), com motivo. */
  catDecl: { catId: string; qtd: number; motivoId?: string | null }[];
  /** fichas individuais vinculadas a este movimento. */
  fichas: {
    id: number;
    idManejo: string;
    idEletronico: string;
    catId: string;
    motivoId: string;
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
