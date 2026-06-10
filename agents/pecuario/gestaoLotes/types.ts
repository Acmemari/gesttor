/**
 * Tipos da Gestão de Lotes (Pecuário › Movimentações).
 *
 * Modelo mental: o lote é uma IDENTIDADE (sua finalidade). Os estados
 * (composição, localização, regime, fase reprodutiva) são SEMPRE derivados de
 * uma sequência de eventos — o usuário nunca edita o estado, ele lança um evento.
 */
import type { LoteEventoRow, LoteEventoTipo } from '../../../lib/api/loteEventosClient';

export type { LoteEventoRow, LoteEventoTipo };

export type Finalidade = 'Cria' | 'Recria' | 'Terminação' | 'Outra Finalidade';

export const FINALIDADES: Finalidade[] = ['Cria', 'Recria', 'Terminação', 'Outra Finalidade'];

/** Tipos de local possíveis numa transferência de lote. */
export type TipoLocal = 'Retiro' | 'Pasto' | 'Setor' | 'Confinamento' | 'Curral';

export const TIPOS_LOCAL: TipoLocal[] = ['Retiro', 'Pasto', 'Setor', 'Confinamento', 'Curral'];

/** Fases reprodutivas (lotes de finalidade Cria). */
export const FASES_REPRO: string[] = [
  'Estação de monta',
  'Diagnóstico de gestação',
  'Parição',
  'Desmama',
  'Repasse com touro',
  'Descarte de vazias',
];

/** Dimensões de manejo (regime). */
export type DimManejo = 'nutricional' | 'reprodutivo';

// ── Payloads de `dados` por tipo de evento ────────────────────────────────────

export interface AlocacaoDados {
  sentido: 'entrada' | 'saida';
  outroLoteId: string | null;       // lote de origem (entrada) ou destino (saída); null = entrada nova
  qtd: number;
  categoriaId: string | null;
  categoriaNome?: string;           // snapshot opcional p/ resiliência
  naoIdent: number;                 // cabeças sem identificação individual → pendência
  animais: string[];                // IDs de animais (quando por ID)
}

export interface TransferenciaDados {
  de: string;                       // local de origem (texto)
  para: string;                     // local de destino (texto)
  tipoLocal: TipoLocal;
}

export interface ManejoDados {
  dim: DimManejo;
  plano: string;
}

export interface ReproDados {
  fase: string;
  detalhe: string;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

export interface CategoriaLookup {
  id: string;
  nome: string;
}

/** Animal disponível para vínculo individual ("Incluir por ID"). */
export interface AnimalLite {
  id: string;
  apelido: string;        // ID Manejo
  rfid: string | null;    // ID Eletrônico
  raca: string | null;
  categoriaId: string | null;
  lote: string | null;    // vínculo atual (texto)
  situacao: string;
}

// ── Item da linha do tempo (derivado) ─────────────────────────────────────────

export interface TimelineItem {
  id: string;
  data: string;
  tipo: LoteEventoTipo;
  cor: string;            // cor do ponto/ícone
  titulo: string;
  meta: string;           // detalhe
  resp: string | null;
}
