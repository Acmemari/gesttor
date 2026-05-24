/**
 * Tipos compartilhados do workspace de Gestão Orçamentária.
 */

export type OrcamentoStatus =
  | 'rascunho'
  | 'em_aprovacao'
  | 'baseline'
  | 'forecast'
  | 'arquivado';

export type OrcamentoView =
  | 'dashboard'
  | 'cadastro-wizard'
  | 'prev-real'
  | 'fluxo'
  | 'receitas'
  | 'despesas'
  | 'despesas:2'
  | 'despesas:3'
  | 'despesas:4'
  | 'despesas:5'
  | 'despesas:6'
  | 'despesas:8'
  | 'pecuaria'
  | 'agricultura'
  | 'premissas'
  | 'centro-custo:mao-de-obra'
  | 'simulador'
  | 'copiloto'
  | 'config:plano-contas';

/**
 * Papel do colaborador no orçamento.
 * - 'editor'    → pode elaborar/editar (única função que combina com aprovador).
 * - 'consultor' → consulta apenas; pode ser aprovador puro se eAprovador=true.
 *
 * Combinações suportadas (na UI: 3 checkboxes Editar / Aprovar / Consultar):
 *   Editar              → papel='editor',    eAprovador=false
 *   Aprovar             → papel='consultor', eAprovador=true
 *   Editar + Aprovar    → papel='editor',    eAprovador=true   (única combinação permitida)
 *   Consultar           → papel='consultor', eAprovador=false
 */
export type PapelColaborador = 'editor' | 'consultor';

export interface Orcamento {
  id: string;
  organizationId: string;
  nome: string;
  safra: string;
  dataInicio: string;
  dataFim: string;
  descricao: string | null;
  criadoPor: string;
  arquivado: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrcamentoVersao {
  id: string;
  orcamentoId: string;
  parentId: string | null;
  tipo: OrcamentoStatus;
  nome: string;
  criadoPor: string;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  mesCorte: string | null;
  imutavel: boolean;
  createdAt: string;
  updatedAt: string;
  /** Preenchido por GET via join com userProfiles. Pode ser null em payloads de criação. */
  autor?: { id: string; name: string | null; email: string } | null;
  /** Descrição opcional da mudança (mock no MVP; futuramente vem do log de auditoria). */
  descricaoMudanca?: string | null;
}

export interface OrcamentoColaborador {
  id: string;
  orcamentoId: string;
  userId: string;
  papel: PapelColaborador;
  eAprovador: boolean;
  createdAt: string;
  user: { id: string; name: string | null; email: string; role: string } | null;
}

export interface OrcamentoFarm {
  orcamentoId: string;
  farmId: string;
  createdAt: string;
}

export interface OrcamentoDetalhado extends Orcamento {
  farms: OrcamentoFarm[];
  versoes: OrcamentoVersao[];
  colaboradores: OrcamentoColaborador[];
}

export interface AuditEvent {
  id: string;
  orcamentoId: string;
  versaoId: string | null;
  usuarioId: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  before: unknown;
  after: unknown;
  justificativa: string | null;
  createdAt: string;
  usuario: { id: string; name: string | null; email: string } | null;
}
