/**
 * Taxonomia de chaves de permissão para acesso por analista à fazenda.
 * Cada chave mapeia para um nível: "hidden" | "view" | "edit"
 */

export type PermissionLevel = 'hidden' | 'view' | 'edit';

export type PermissionCategory =
  | 'cadastros'
  | 'gerenciamento'
  | 'assistentes'
  | 'documentos'
  | 'consultoria'
  | 'equipe'
  | 'configuracoes';

export interface PermissionKeyDef {
  key: string;
  label: string;
  description: string;
  location: string;
  icon: string;
  category: PermissionCategory;
}

/** Todas as chaves de permissão do sistema (ordem para UI) */
export const PERMISSION_KEYS: PermissionKeyDef[] = [
  // Cadastros
  {
    key: 'farms:card',
    label: 'Lista de fazendas',
    description: 'Ver os cards das fazendas cadastradas',
    location: 'Cadastros > Fazendas',
    icon: 'Home',
    category: 'cadastros',
  },
  {
    key: 'farms:form',
    label: 'Cadastro de fazenda',
    description: 'Formulário de dados da fazenda',
    location: 'Cadastros > Fazendas > Formulário',
    icon: 'FileText',
    category: 'cadastros',
  },
  {
    key: 'farms:delete',
    label: 'Excluir fazenda',
    description: 'Botão e ação de excluir fazenda',
    location: 'Cadastros > Fazendas > Ação',
    icon: 'Trash2',
    category: 'cadastros',
  },
  {
    key: 'clients:card',
    label: 'Lista de organizações',
    description: 'Ver as organizações',
    location: 'Cadastros > Organizações',
    icon: 'Building2',
    category: 'cadastros',
  },
  {
    key: 'clients:form',
    label: 'Cadastro de organização',
    description: 'Formulário de dados da organização',
    location: 'Cadastros > Organizações > Formulário',
    icon: 'FileText',
    category: 'cadastros',
  },
  {
    key: 'clients:farms_modal',
    label: 'Fazendas da organização',
    description: 'Modal com lista de fazendas da organização',
    location: 'Cadastros > Organizações > Modal Fazendas',
    icon: 'Home',
    category: 'cadastros',
  },
  {
    key: 'people:card',
    label: 'Lista de pessoas',
    description: 'Ver as pessoas cadastradas',
    location: 'Cadastros > Pessoas',
    icon: 'Users',
    category: 'cadastros',
  },
  {
    key: 'people:form',
    label: 'Cadastro de pessoa',
    description: 'Formulário de dados da pessoa',
    location: 'Cadastros > Pessoas > Formulário',
    icon: 'FileText',
    category: 'cadastros',
  },
  // Gerenciamento
  {
    key: 'projects:structure',
    label: 'Estrutura projetos/entregas/atividades',
    description: 'Árvore de projetos, entregas e atividades',
    location: 'Gerenciamento > Estrutura do Projeto',
    icon: 'FolderTree',
    category: 'gerenciamento',
  },
  {
    key: 'projects:program_modal',
    label: 'Modal de projeto',
    description: 'Cadastro e edição de projeto',
    location: 'Gerenciamento > Estrutura > Modal Projeto',
    icon: 'LayoutList',
    category: 'gerenciamento',
  },
  {
    key: 'projects:delivery_modal',
    label: 'Modal de entrega',
    description: 'Cadastro e edição de entrega',
    location: 'Gerenciamento > Estrutura > Modal Entrega',
    icon: 'Package',
    category: 'gerenciamento',
  },
  {
    key: 'projects:activity_modal',
    label: 'Modal de atividade',
    description: 'Cadastro e edição de atividade',
    location: 'Gerenciamento > Estrutura > Modal Atividade',
    icon: 'ListChecks',
    category: 'gerenciamento',
  },
  {
    key: 'projects:task_modal',
    label: 'Modal de tarefa',
    description: 'Cadastro e edição de tarefa',
    location: 'Gerenciamento > Estrutura > Modal Tarefa',
    icon: 'SquareCheck',
    category: 'gerenciamento',
  },
  {
    key: 'initiatives:overview',
    label: 'Visão de iniciativas',
    description: 'Tela de overview de iniciativas',
    location: 'Gerenciamento > Visão Geral',
    icon: 'LayoutDashboard',
    category: 'gerenciamento',
  },
  {
    key: 'initiatives:form',
    label: 'Cadastro de iniciativa',
    description: 'Formulário de iniciativa',
    location: 'Gerenciamento > Iniciativas > Formulário',
    icon: 'FileText',
    category: 'gerenciamento',
  },
  {
    key: 'initiatives:kanban',
    label: 'Kanban de tarefas',
    description: 'Quadro Kanban de tarefas',
    location: 'Gerenciamento > Kanban',
    icon: 'Columns',
    category: 'gerenciamento',
  },
  {
    key: 'initiatives:evidence',
    label: 'Evidências de entrega',
    description: 'Upload e visualização de evidências',
    location: 'Gerenciamento > Entregas > Evidências',
    icon: 'Paperclip',
    category: 'gerenciamento',
  },
  // Documentos
  {
    key: 'documents:client',
    label: 'Documentos da organização',
    description: 'Arquivos e documentos da organização',
    location: 'Documentos',
    icon: 'FolderOpen',
    category: 'documentos',
  },
  // Assistentes
  {
    key: 'calculator:scenarios',
    label: 'Cenários da calculadora',
    description: 'Cenários salvos da calculadora de rentabilidade',
    location: 'Assistentes > Meus Salvos',
    icon: 'Calculator',
    category: 'assistentes',
  },
  {
    key: 'calculator:simulator',
    label: 'Rentabilidade na Engorda',
    description: 'Simulador de rentabilidade na engorda de bovinos',
    location: 'Assistentes > Calculadora',
    icon: 'TrendingUp',
    category: 'assistentes',
  },
  {
    key: 'calculator:comparator',
    label: 'Comparador de cenários',
    description: 'Comparação lado a lado de cenários',
    location: 'Assistentes > Comparador',
    icon: 'GitCompare',
    category: 'assistentes',
  },
  {
    key: 'calculator:agile_planning',
    label: 'Planejamento Ágil',
    description: 'Planejamento ágil vinculado a organizações e fazendas',
    location: 'Assistentes > Planejamento Ágil',
    icon: 'Target',
    category: 'assistentes',
  },
  {
    key: 'calculator:avaliacao_protocolo',
    label: 'Avaliação Protocolo 5-3-9',
    description: 'Questionário de avaliação protocolar',
    location: 'Assistentes > Avaliação Protocolo',
    icon: 'ClipboardList',
    category: 'assistentes',
  },
  {
    key: 'calculator:feedback',
    label: 'Assistente de Feedback',
    description: 'Geração e adaptação de feedback construtivo',
    location: 'Assistentes > Feedback',
    icon: 'MessageSquare',
    category: 'assistentes',
  },
  // Consultoria
  {
    key: 'chat:antonio',
    label: 'Pergunte p/ Antonio',
    description: 'Chat com consultor virtual de pecuária',
    location: 'Consultoria > Chat IA',
    icon: 'MessageCircle',
    category: 'consultoria',
  },
  // Gerenciamento — Calendário
  {
    key: 'calendar:main',
    label: 'Calendário',
    description: 'Visualização e gestão de eventos e atividades',
    location: 'Gerenciamento > Calendário',
    icon: 'Calendar',
    category: 'gerenciamento',
  },
  // Equipe
  {
    key: 'equipe:feedback_rh',
    label: 'Feedback RH',
    description: 'Lista de feedbacks da equipe',
    location: 'Equipe > Feedback',
    icon: 'UsersRound',
    category: 'equipe',
  },
  // Configurações
  {
    key: 'config:settings',
    label: 'Configurações',
    description: 'Configurações gerais do usuário',
    location: 'Configurações',
    icon: 'Settings',
    category: 'configuracoes',
  },
  {
    key: 'config:subscription',
    label: 'Assinatura e Planos',
    description: 'Gestão de assinatura e plano contratado',
    location: 'Configurações > Assinatura',
    icon: 'CreditCard',
    category: 'configuracoes',
  },
  {
    key: 'config:login',
    label: 'Login / Autenticação',
    description: 'Tela de login e autenticação de usuário',
    location: 'Login',
    icon: 'LogIn',
    category: 'configuracoes',
  },
  {
    key: 'config:password_reset',
    label: 'Recuperação de Senha',
    description: 'Fluxo de esqueci/redefinir senha',
    location: 'Login > Recuperação de Senha',
    icon: 'KeyRound',
    category: 'configuracoes',
  },
];

/** Labels para categorias (espelham o sidebar) */
export const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  cadastros: 'Cadastros',
  gerenciamento: 'Gerenciamento',
  assistentes: 'Assistentes',
  documentos: 'Documentos',
  consultoria: 'Consultoria',
  equipe: 'Equipe',
  configuracoes: 'Configurações',
};

/** Valor padrão para novas permissões (analistas adicionados) */
export const DEFAULT_PERMISSIONS: Record<string, PermissionLevel> = {
  'farms:card': 'view',
  'farms:form': 'view',
  'farms:delete': 'hidden',
  'clients:card': 'view',
  'clients:form': 'view',
  'clients:farms_modal': 'view',
  'people:card': 'view',
  'people:form': 'view',
  'projects:structure': 'view',
  'projects:program_modal': 'view',
  'projects:delivery_modal': 'view',
  'projects:activity_modal': 'view',
  'projects:task_modal': 'view',
  'initiatives:overview': 'view',
  'initiatives:form': 'view',
  'initiatives:kanban': 'view',
  'initiatives:evidence': 'view',
  'documents:client': 'view',
  'calculator:scenarios': 'view',
  'calculator:simulator': 'view',
  'calculator:comparator': 'view',
  'calculator:agile_planning': 'view',
  'calculator:avaliacao_protocolo': 'view',
  'calculator:feedback': 'view',
  'chat:antonio': 'view',
  'calendar:main': 'view',
  'equipe:feedback_rh': 'view',
  'config:settings': 'view',
  'config:subscription': 'view',
  'config:login': 'view',
  'config:password_reset': 'view',
};
