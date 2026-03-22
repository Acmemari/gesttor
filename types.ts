export interface CattleCalculatorInputs {
  pesoCompra: number; // kg
  valorCompra: number; // R$/kg
  pesoAbate: number; // kg
  rendimentoCarcaca: number; // %
  valorVenda: number; // R$/@
  gmd: number; // kg/dia
  custoMensal: number; // R$/cab/mês
  lotacao: number; // UA/HA
}

export interface CalculationResults {
  pesoCompraArrobas: number;
  pesoFinalArrobas: number;
  pesoFinalKgCarcaca?: number; // Para Paraguai
  arrobasProduzidas: number;
  diasPermanencia: number;
  mesesPermanencia: number;
  valorBoi: number; // Revenue
  custoCompra: number; // Initial cost
  custoOperacional: number; // Operational cost
  custoTotal: number;
  resultadoPorBoi: number; // Profit
  margemVenda: number; // %
  resultadoMensal: number; // %
  resultadoAnual: number; // %
  custoPorArrobaProduzida: number;
  custoPorArrobaFinal: number;
  giroEstoque: number; // % - Indicador 13
  producaoArrobaPorHa: number; // @/ha - Indicador 14
  resultadoPorArrobaFinal: number; // R$ - Indicador 15
  resultadoPorHectareAno: number; // R$ - Indicador 16
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'financeiro' | 'zootecnico' | 'mercado' | 'consultoria' | 'admin';
  status: 'active' | 'dev' | 'planned' | 'locked';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface User {
  /** ID interno do usuário (PK em user_profiles) */
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  avatar?: string;
  plan?: 'basic' | 'pro' | 'enterprise';
  status?: 'active' | 'inactive';
  lastLogin?: string;
  organizationId?: string;
  clientId?: string;
  phone?: string;
  qualification?: 'visitante' | 'cliente' | 'analista' | 'administrador';
  full_name?: string;
}

export interface Plan {
  id: 'basic' | 'pro' | 'enterprise';
  name: string;
  price: number;
  features: string[];
  limits: {
    agents: number;
    historyDays: number;
    users: number;
  };
}

export interface Organization {
  id: string;
  name: string;
  plan: Plan['id'];
  ownerId: string;
  createdAt: string;
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
  sessionReady: boolean;
  isProfileReady: boolean;
  authError: Error | null;
  checkPermission: (feature: string) => boolean;
  checkLimit: (limit: keyof Plan['limits'], value: number) => boolean;
  upgradePlan: (planId: Plan['id']) => void;
  refreshProfile: () => Promise<void>;
  /** Obtém o token JWT atual do localStorage. Use em chamadas à API. */
  getAccessToken: () => Promise<string | null>;
  /** Solicita email de recuperação de senha. */
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  /** Redefine a senha usando token de recuperação (da URL). */
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export interface ComparatorResult {
  type: 'comparator_pdf';
  pdf_base64: string;
  scenarios: {
    id: string;
    name: string;
    inputs: CattleCalculatorInputs;
    results: CalculationResults;
  }[];
}

export interface InitiativesOverviewResult {
  type: 'initiatives_overview_pdf';
  pdf_base64: string;
}

export interface ProjectStructureResult {
  type: 'project_structure_pdf';
  pdf_base64: string;
}

export type ScenarioResult = CalculationResults | ComparatorResult | InitiativesOverviewResult | ProjectStructureResult;

export interface CattleScenario {
  id: string;
  user_id: string;
  client_id?: string | null;
  farm_id?: string | null;
  farm_name?: string | null;
  name: string;
  inputs: CattleCalculatorInputs;
  results?: ScenarioResult;
  created_at: string;
  updated_at: string;
}

export interface SavedQuestionnaireAnswer {
  questionId: string;
  answer: 'Sim' | 'Não';
  isPositive: boolean;
}

export interface SavedQuestionnaire {
  id: string;
  user_id: string;
  client_id?: string | null;
  name: string;
  farm_id?: string;
  farm_name?: string;
  production_system?: string;
  questionnaire_id?: string;
  answers: SavedQuestionnaireAnswer[];
  created_at: string;
  updated_at: string;
}

export type PropertyType = 'Própria' | 'Arrendada' | 'Parceria' | 'Comodato' | 'Mista';
export type WeightMetric = 'Arroba (@)' | 'Kg';
export type ProductionSystem = 'Cria' | 'Recria' | 'Engorda' | 'Ciclo Completo' | 'Cria e Recria' | 'Recria e Engorda' | 'Recria-Engorda';

export interface Farm {
  id: string;                          // text (slug), imutável após criação
  name: string;
  country: string;
  state: string;
  city: string;
  organizationId: string;              // uuid, NOT NULL
  // Dimensões (em hectares)
  totalArea?: number | null;
  pastureArea?: number | null;
  agricultureArea?: number | null;
  forageProductionArea?: number | null;
  agricultureAreaOwned?: number | null;
  agricultureAreaLeased?: number | null;
  otherCrops?: number | null;
  infrastructure?: number | null;
  reserveAndAPP?: number | null;
  otherArea?: number | null;
  // Valores financeiros
  propertyValue?: number | null;
  operationPecuary?: number | null;
  operationAgricultural?: number | null;
  otherOperations?: number | null;
  agricultureVariation?: number;
  // Configurações
  propertyType: PropertyType;
  weightMetric: WeightMetric;
  // Dados do rebanho
  averageHerd?: number | null;
  herdValue?: number | null;
  commercializesGenetics: boolean;
  productionSystem: ProductionSystem | null;
  // Controle
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  analystId: string; // ID do analista responsável
  createdAt: string;
  updatedAt: string;
}

export interface ClientFarm {
  id: string;
  clientId: string;
  farmId: string;
  createdAt: string;
}

export interface ClientAnalyst {
  id: string;
  clientId: string;
  analystId: string; // ID do usuário analista
  createdAt: string;
}

export interface ClientOwner {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// DOCUMENTOS DE CLIENTE (MENTORIA)
// ============================================================================

export type DocumentCategory = 'geral' | 'contrato' | 'relatorio' | 'financeiro' | 'tecnico' | 'outro';
export type DocumentFileType = 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls';

export interface ClientDocument {
  id: string;
  clientId: string;
  uploadedBy: string;
  fileName: string;
  originalName: string;
  fileType: DocumentFileType;
  fileSize: number; // em bytes
  storagePath: string;
  category: DocumentCategory;
  description?: string;
  createdAt: string;
  updatedAt: string;
  // Campos calculados/join
  uploaderName?: string;
  clientName?: string;
}

export interface DocumentUploadParams {
  clientId: string;
  file: File;
  category?: DocumentCategory;
  description?: string;
}

export interface DocumentFilter {
  clientId?: string;
  category?: DocumentCategory;
  fileType?: DocumentFileType;
  searchTerm?: string;
}
