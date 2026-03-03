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
  qualification?: 'visitante' | 'cliente' | 'analista';
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
  logout: () => void;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  checkPermission: (feature: string) => boolean;
  checkLimit: (limit: keyof Plan['limits'], value: number) => boolean;
  upgradePlan: (planId: Plan['id']) => void;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  clearPasswordRecovery: () => void;
  signInWithOAuth: (provider: 'google') => Promise<{ provider: string; url: string } | null>;
  signup: (
    email: string,
    password: string,
    name: string,
    phone: string,
    organizationName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
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

export interface Farm {
  id: string;
  name: string;
  country: string;
  state: string;
  city: string;
  clientId?: string;
  // Dimensões (em hectares)
  totalArea?: number;
  pastureArea?: number;
  forageProductionArea?: number;
  agricultureAreaOwned?: number;
  agricultureAreaLeased?: number;
  otherCrops?: number;
  infrastructure?: number;
  reserveAndAPP?: number;
  otherArea?: number;
  propertyValue?: number;
  // Valores de operação
  operationPecuary?: number;
  operationAgricultural?: number;
  otherOperations?: number;
  agricultureVariation?: number;
  // Dados da propriedade
  propertyType: 'Própria' | 'Arrendada';
  weightMetric: 'Arroba (@)' | 'Quilograma (Kg)';
  // Dados do rebanho
  averageHerd?: number;
  herdValue?: number;
  commercializesGenetics: boolean;
  productionSystem: 'Cria' | 'Recria-Engorda' | 'Ciclo Completo';
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
