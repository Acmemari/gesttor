import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useClient } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { Farm, Client } from '../types';
import { mapFarmsFromDatabase } from '../lib/utils/farmMapper';
import { getAuthHeaders } from '../lib/session';
import type { AgilePlanningReportData, HerdCompositionRow } from '../lib/agilePlanningReportTypes';
import { generateAgilePlanningReportPDF, generateAgilePlanningReportPDFAsBase64 } from '../lib/generateAgilePlanningReportPDF';
import { saveReportPdf } from '../lib/scenarios';
import AgilePlanningReportView from '../components/reports/AgilePlanningReportView';
import { Loader2, AlertCircle, CheckCircle2, Plus, Trash2, Edit3, X, ListChecks, Info } from 'lucide-react';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

/** Interface para fazenda estendida com campos adicionais do Planejamento Ágil */
interface ExtendedFarm extends Farm {
  operationPecuary?: number;
}

/** Categoria de animal para cálculo de valor médio de venda */
interface AnimalCategory {
  id: string;
  name: string;
  percentage: number;
  weight: number;
  valuePerKg: number;
  quantity?: number;
}

/** Configuração de margem por sistema de produção */
interface MarginConfig {
  min: number;
  max: number;
  default: number;
}

/** IDs das categorias padrão (para lógica de unidades kg/@) */
const CATEGORY_IDS = {
  BEZERRO: '1',
  BEZERRA: '2',
  GARROTE: '3',
  NOVILHA: '4',
  BOI_GORDO: '5',
  VACA_DESCARTE: '6',
  TOURO_DESCARTE: '7',
} as const;

// ============================================================================
// FUNÇÕES AUXILIARES PURAS
// ============================================================================

/** Formata valor monetário em R$ (otimizado com cache e validação) */
const formatCurrency = (value: number | undefined | null): string => {
  // Validação rápida
  if (!isValidNumber(value) || value === 0) {
    return 'R$ 0,00';
  }

  // Usa Intl.NumberFormat para formatação precisa e localizada
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/** Formata área em hectares */
const formatArea = (value: number | undefined | null): string => {
  if (value === undefined || value === null || !isFinite(value) || value === 0) {
    return '0 ha';
  }
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
};

/** Formata número com vírgula como separador decimal */
const formatNumberWithComma = (value: number | undefined | null): string => {
  if (value === undefined || value === null || !isFinite(value)) return '';
  return value.toFixed(1).replace('.', ',');
};

/** Parseia string com vírgula para número */
const parseNumberFromComma = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isFinite(num) ? num : 0;
};

/** Divisão segura - retorna 0 se divisor for 0 ou resultado inválido (otimizado) */
const safeDivide = (numerator: number, denominator: number): number => {
  // Validação rápida com early return
  if (denominator === 0) return 0;
  if (!isFinite(numerator) || !isFinite(denominator)) return 0;

  const result = numerator / denominator;
  return isFinite(result) ? result : 0;
};

/** Type guard para verificar se um valor é um número válido */
const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
};

/** Valida e sanitiza um valor numérico, retornando 0 se inválido */
const sanitizeNumber = (value: unknown, defaultValue = 0): number => {
  if (isValidNumber(value)) return value;
  return defaultValue;
};

/** Retorna configuração de margem baseada no sistema de produção */
const getMarginConfig = (system: Farm['productionSystem'] | ''): MarginConfig => {
  switch (system) {
    case 'Cria':
      return { min: 30, max: 50, default: 40 };
    case 'Ciclo Completo':
      return { min: 22, max: 37, default: 30 };
    case 'Recria-Engorda':
      return { min: 10, max: 30, default: 20 };
    default:
      return { min: 10, max: 50, default: 30 };
  }
};

/** Retorna percentuais iniciais das categorias baseado no sistema de produção */
const getInitialPercentages = (system: Farm['productionSystem'] | ''): Record<string, number> => {
  const defaults = {
    [CATEGORY_IDS.BEZERRO]: 50,
    [CATEGORY_IDS.BEZERRA]: 0,
    [CATEGORY_IDS.GARROTE]: 0,
    [CATEGORY_IDS.NOVILHA]: 17,
    [CATEGORY_IDS.BOI_GORDO]: 0,
    [CATEGORY_IDS.VACA_DESCARTE]: 33,
    [CATEGORY_IDS.TOURO_DESCARTE]: 0,
  };

  switch (system) {
    case 'Cria':
      return defaults;
    case 'Ciclo Completo':
      return {
        ...defaults,
        [CATEGORY_IDS.BEZERRO]: 5,
        [CATEGORY_IDS.BEZERRA]: 5,
        [CATEGORY_IDS.NOVILHA]: 12,
        [CATEGORY_IDS.BOI_GORDO]: 45,
        [CATEGORY_IDS.VACA_DESCARTE]: 33,
      };
    case 'Recria-Engorda':
      return {
        ...defaults,
        [CATEGORY_IDS.BEZERRO]: 0,
        [CATEGORY_IDS.NOVILHA]: 0,
        [CATEGORY_IDS.BOI_GORDO]: 100,
        [CATEGORY_IDS.VACA_DESCARTE]: 0,
      };
    default:
      return defaults;
  }
};

/** Categorias padrão de animais */
const getDefaultCategories = (): AnimalCategory[] => [
  { id: CATEGORY_IDS.BEZERRO, name: 'Bezerro Desm.', percentage: 50, weight: 220, valuePerKg: 14 },
  { id: CATEGORY_IDS.BEZERRA, name: 'Bezerra Desm.', percentage: 0, weight: 200, valuePerKg: 12 },
  { id: CATEGORY_IDS.GARROTE, name: 'Garrote', percentage: 0, weight: 20, valuePerKg: 300 },
  { id: CATEGORY_IDS.NOVILHA, name: 'Novilha', percentage: 17, weight: 13, valuePerKg: 290 },
  { id: CATEGORY_IDS.BOI_GORDO, name: 'Boi Gordo', percentage: 0, weight: 20, valuePerKg: 270 },
  { id: CATEGORY_IDS.VACA_DESCARTE, name: 'Vaca Descarte', percentage: 33, weight: 15, valuePerKg: 320 },
  { id: CATEGORY_IDS.TOURO_DESCARTE, name: 'Touro Descarte', percentage: 0, weight: 24, valuePerKg: 280 },
];

/** Verifica se a categoria usa kg (bezerros) ou @ (demais) */
const isKgCategory = (categoryId: string): boolean => {
  return categoryId === CATEGORY_IDS.BEZERRO || categoryId === CATEGORY_IDS.BEZERRA;
};

// ============================================================================
// CONSTANTES DO REBANHO MÉDIO
// ============================================================================

/** Constantes de conversão e cálculo */
const HERD_CONSTANTS = {
  /** Fator de conversão de @ para kg */
  ARROBA_TO_KG: 30,
  /** Percentual do peso médio das matrizes em relação à vaca descarte */
  MATRIZ_WEIGHT_FACTOR: 0.97,
  /** Tempo fixo em meses para categorias permanentes */
  TEMPO_MATRIZES: 12,
  TEMPO_NOVILHAS_8_12: 5,
  TEMPO_TOUROS: 12,
  /** Ajuste no cálculo do peso médio de bezerros mamando */
  BEZERRO_WEIGHT_ADJUSTMENT: 30,
} as const;

/** Tipo para identificar categorias na tabela de rebanho médio */
type WeightInfoCategory =
  | 'matrizes'
  | 'bezerros'
  | 'novilhas8a12'
  | 'novilhas13a24'
  | 'machos8a12'
  | 'machos13a24'
  | 'machos25a36'
  | 'touros'
  | 'cowSlaughter'
  | 'tempoMatrizes';

/** Interface para os dados da tabela de rebanho médio */
interface AverageHerdData {
  vacas: number;
  bezerrosMamando: number;
  novilhas8a12: number;
  novilhas13a24: number;
  machos8a12: number;
  machos13a24: number;
  machos25a36: number;
  touros: number;
  tempoVacas: number;
  tempoBezerros: number;
  tempoNovilhas8a12: number;
  tempoNovilhas13a24: number;
  tempoMachos8a12: number;
  tempoMachos13a24: number;
  tempoMachos25a36: number;
  tempoTouros: number;
  pesoVivoVacas: number;
  pesoVivoBezerros: number;
  pesoVivoNovilhas8a12: number;
  pesoVivoNovilhas13a24: number;
  pesoVivoMachos8a12: number;
  pesoVivoMachos13a24: number;
  pesoVivoMachos25a36: number;
  pesoVivoTouros: number;
  pesoIndividualVaca: number;
  pesoIndividualBezerro: number;
  pesoIndividualNovilha8a12: number;
  pesoIndividualNovilha13a24: number;
  pesoIndividualMachos8a12: number;
  pesoIndividualMachos13a24: number;
  pesoIndividualMachos25a36: number;
  pesoIndividualTouro: number;
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

interface AgilePlanningProps {
  // Props mantidas para retrocompatibilidade
  selectedFarm?: Farm | null;
  onSelectFarm?: (farm: Farm | null) => void;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const AgilePlanning: React.FC<AgilePlanningProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClient();
  const { selectedFarm, setSelectedFarm } = useFarm();

  // Cast para ExtendedFarm para acesso seguro ao operationPecuary
  const farm = selectedFarm as ExtendedFarm | null;

  // ============================================================================
  // ESTADOS
  // ============================================================================

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [showReportView, setShowReportView] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIndicatorsModalOpen, setIsIndicatorsModalOpen] = useState(false);
  const [isAverageHerdModalOpen, setIsAverageHerdModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof AnimalCategory } | null>(null);
  const [tempValue, setTempValue] = useState('');

  // Estados de seleção
  const [clients, setClients] = useState<Client[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [tempSelectedClient, setTempSelectedClient] = useState<Client | null>(null);
  const [tempSelectedFarm, setTempSelectedFarm] = useState<Farm | null>(null);

  // Estados de parâmetros
  const [percentage, setPercentage] = useState(4);
  const [productionSystem, setProductionSystem] = useState<Farm['productionSystem'] | ''>('');
  const [expectedMargin, setExpectedMargin] = useState(40);
  const [analysisMethod, setAnalysisMethod] = useState<'ancoragem' | 'desempenho'>('ancoragem');

  // Relação Matrizes/Touro (para o modal de Rebanho Médio)
  const [bullCowRatioPercent, setBullCowRatioPercent] = useState(4); // 0% a 6%, default 4%
  const [isBullCowRatioOpen, setIsBullCowRatioOpen] = useState(false);
  // Peso médio dos touros (para o modal de Rebanho Médio)
  const [pesoMedioTouro, setPesoMedioTouro] = useState(710); // 600 a 900 kg, default 710
  // Idade ao desmame (para o modal de Rebanho Médio)
  const [weaningAgeMonths, setWeaningAgeMonths] = useState(7); // 4 a 8 meses, default 7
  const [isWeaningAgeOpen, setIsWeaningAgeOpen] = useState(false);
  // Explicação do cálculo de peso individual
  const [weightCalculationInfoOpen, setWeightCalculationInfoOpen] = useState<WeightInfoCategory | null>(null);
  const [popoverPositions, setPopoverPositions] = useState<
    Partial<Record<WeightInfoCategory, { top: number; left: number }>>
  >({});
  const weightInfoRefs = useRef<Partial<Record<WeightInfoCategory, HTMLDivElement | null>>>({});
  const weightButtonRefs = useRef<Partial<Record<WeightInfoCategory, HTMLButtonElement | null>>>({});

  // Estados de índices de Recria-Engorda
  const [recriaGmd, setRecriaGmd] = useState(0.65); // Ganho Médio Diário: 0.4 a 1.1 kg/dia, default 0.65
  const [recriaMortalidade, setRecriaMortalidade] = useState(0.8); // Mortalidade: 0.2% a 2%, default 0.8%
  const [recriaRendimentoCarcaca, setRecriaRendimentoCarcaca] = useState(54.5); // Rendimento de Carcaça: 50% a 60%, default 54.5%

  // Estados de Compra e Venda - Recria-Engorda
  const [recriaPesoCompra, setRecriaPesoCompra] = useState(220); // Peso de Compra: 160 a 400 kg, default 220
  const [recriaValorCompra, setRecriaValorCompra] = useState(15); // Valor de Compra: R$ 10 a R$ 20/kg, default R$ 15
  const [recriaPesoVenda, setRecriaPesoVenda] = useState(550); // Peso de Venda: 360 a 600 kg, default 550
  const [recriaValorVenda, setRecriaValorVenda] = useState(310); // Valor de Venda: R$ 260 a R$ 360/@, default R$ 310

  // Estados de índices reprodutivos
  const [fertility, setFertility] = useState(85);
  const [prePartumLoss, setPrePartumLoss] = useState(6);
  const [calfMortality, setCalfMortality] = useState(3.5);
  const [maleWeaningWeight, setMaleWeaningWeight] = useState(220);
  const [femaleWeaningWeight, setFemaleWeaningWeight] = useState(200);
  const [firstMatingAge, setFirstMatingAge] = useState(14);
  const [pesoPrimeiraMonta, setPesoPrimeiraMonta] = useState(300); // 270 a 360 kg, default 300
  const [matingPeriodDays, setMatingPeriodDays] = useState(90); // 40 a 120 dias, default 90
  const [cowSlaughterDays, setCowSlaughterDays] = useState(30); // 0 a 90 dias, default 30
  const [vendaBezerrasAoDesmame, setVendaBezerrasAoDesmame] = useState(0); // 0% a 70%, passo 5%

  // Estados de Recria-Terminação — Ciclo Completo
  const [cicloGmdPosDesmame, setCicloGmdPosDesmame] = useState(0.65); // 0.4 a 1.1 kg/dia
  const [cicloPesoAbate, setCicloPesoAbate] = useState(550); // 480 a 600 kg
  const [cicloRendimentoCarcaca, setCicloRendimentoCarcaca] = useState(54); // 48% a 60%
  const [cicloVendaAoDesmame, setCicloVendaAoDesmame] = useState(10); // 0% a 90%, default 10%

  // Estado de categorias
  const [animalCategories, setAnimalCategories] = useState<AnimalCategory[]>(getDefaultCategories);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    'weaningRate',
    'kgPerMatrix',
    'gmdGlobal',
    'lotacaoCabHa',
    'producaoArrobaHa',
  ]);
  const [selectedRecriaIndicators, setSelectedRecriaIndicators] = useState<string[]>([
    'tempoPerm',
    'pesoArroba',
    'producaoArrobaHa',
    'giroEstoque',
    'lotacaoCabHa',
  ]);
  const [isRecriaIndicatorsModalOpen, setIsRecriaIndicatorsModalOpen] = useState(false);

  // ============================================================================
  // VALORES DERIVADOS
  // ============================================================================

  const showReproductiveIndices = productionSystem === 'Cria' || productionSystem === 'Ciclo Completo';
  const operationPecuaryValue = farm?.operationPecuary ?? 0;

  // ============================================================================
  // HANDLERS DE CATEGORIAS
  // ============================================================================

  const handleAddCategory = useCallback(() => {
    const maxId = Math.max(...animalCategories.map(c => parseInt(c.id, 10)));
    const newId = (isFinite(maxId) ? maxId + 1 : 8).toString();
    const newCategory: AnimalCategory = {
      id: newId,
      name: 'Nova Categoria',
      percentage: 0,
      weight: 0,
      valuePerKg: 0,
    };
    setAnimalCategories(prev => [...prev, newCategory]);
  }, [animalCategories]);

  const handleDeleteCategory = useCallback((id: string) => {
    setAnimalCategories(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateCategory = useCallback((id: string, field: keyof AnimalCategory, value: number | string | undefined) => {
    setAnimalCategories(prev => prev.map(cat => (cat.id === id ? { ...cat, [field]: value } : cat)));
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Fechar modal com ESC e bloquear scroll do body
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isModalOpen) {
          setIsModalOpen(false);
          setEditingCell(null);
          setTempValue('');
        } else if (isIndicatorsModalOpen) {
          setIsIndicatorsModalOpen(false);
        } else if (isRecriaIndicatorsModalOpen) {
          setIsRecriaIndicatorsModalOpen(false);
        } else if (isAverageHerdModalOpen) {
          setIsAverageHerdModalOpen(false);
        }
      }
    };

    const hasOpenModal = isModalOpen || isIndicatorsModalOpen || isRecriaIndicatorsModalOpen || isAverageHerdModalOpen;

    if (hasOpenModal) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isModalOpen, isIndicatorsModalOpen, isRecriaIndicatorsModalOpen, isAverageHerdModalOpen]);

  // Fechar popovers de peso ao clicar fora
  useEffect(() => {
    if (!weightCalculationInfoOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const containerRef = weightInfoRefs.current[weightCalculationInfoOpen];
      const buttonRef = weightButtonRefs.current[weightCalculationInfoOpen];
      const target = event.target as Node;

      const isOutsideContainer = !containerRef?.contains(target);
      const isOutsideButton = !buttonRef?.contains(target);

      if (isOutsideContainer && isOutsideButton) {
        setWeightCalculationInfoOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [weightCalculationInfoOpen]);

  // ============================================================================
  // HANDLERS DE POPOVER
  // ============================================================================

  /** Calcula posição e toggle do popover de peso */
  const handleWeightInfoToggle = useCallback((category: WeightInfoCategory) => {
    const buttonEl = weightButtonRefs.current[category];
    if (buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      setPopoverPositions(prev => ({
        ...prev,
        [category]: {
          top: rect.top - 110,
          left: Math.max(10, rect.left - 230),
        },
      }));
    }
    setWeightCalculationInfoOpen(prev => (prev === category ? null : category));
  }, []);

  // ============================================================================
  // HANDLERS DE INPUT
  // ============================================================================

  const handleInputFocus = useCallback(
    (_e: React.FocusEvent<HTMLInputElement>, id: string, field: keyof AnimalCategory) => {
      setEditingCell({ id, field });
      setTempValue('');
    },
    [],
  );

  const handleInputBlur = useCallback(() => {
    setEditingCell(null);
    setTempValue('');
  }, []);

  const handleNumericChange = useCallback(
    (id: string, field: keyof AnimalCategory, rawValue: string) => {
      // Permite ponto como vírgula
      const treatedValue = rawValue.replace(/\./g, ',');
      setTempValue(treatedValue);

      // Remove caracteres inválidos
      let cleaned = treatedValue.replace(/[^\d,]/g, '');

      // Permite apenas uma vírgula
      const parts = cleaned.split(',');
      if (parts.length > 2) {
        cleaned = parts[0] + ',' + parts.slice(1).join('');
      }

      if (cleaned === '') {
        updateCategory(id, field, 0);
        return;
      }

      const parsed = parseNumberFromComma(cleaned);
      if (isFinite(parsed)) {
        // Validação de limites por campo
        let validValue = parsed;
        if (field === 'percentage') {
          validValue = Math.max(0, Math.min(100, parsed));
        } else if (field === 'weight') {
          validValue = Math.max(0, Math.min(9999, parsed));
        } else if (field === 'valuePerKg') {
          validValue = Math.max(0, Math.min(9999, parsed));
        }
        updateCategory(id, field, validValue);
      }
    },
    [updateCategory],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  }, []);

  // ============================================================================
  // CÁLCULOS MEMOIZADOS
  // ============================================================================

  /** Soma total dos percentuais das categorias */
  const percentageSum = useMemo(() => {
    return animalCategories.reduce((sum, cat) => sum + (cat.percentage || 0), 0);
  }, [animalCategories]);

  /** Verifica se a soma dos percentuais é 100% */
  const isPercentageSumValid = useMemo(() => {
    return Math.abs(percentageSum - 100) < 0.01;
  }, [percentageSum]);

  /** Calcula valor por cabeça de uma categoria */
  const calculateValuePerHead = useCallback((category: AnimalCategory): number => {
    const weight = category.weight ?? 0;
    const valuePerKg = category.valuePerKg ?? 0;
    return weight * valuePerKg;
  }, []);

  /** Valor do Boi Recria-Engorda: Peso de venda × valor de venda × rendimento de carcaça / 15 */
  const recriaValorBoi = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda') return 0;
    return (recriaPesoVenda * recriaValorVenda * (recriaRendimentoCarcaca / 100)) / 15;
  }, [productionSystem, recriaPesoVenda, recriaValorVenda, recriaRendimentoCarcaca]);

  /** Valor médio de venda: Recria-Engorda usa valor do boi (premissas); demais sistemas usam soma ponderada das categorias */
  const averageValue = useMemo(() => {
    if (productionSystem === 'Recria-Engorda') return recriaValorBoi;
    return animalCategories.reduce((sum, category) => {
      const valuePerHead = calculateValuePerHead(category);
      return sum + safeDivide(category.percentage * valuePerHead, 100);
    }, 0);
  }, [productionSystem, recriaValorBoi, animalCategories, calculateValuePerHead]);

  /** Valor calculado (percentual × operação pecuária) */
  const calculatedValue = useMemo(() => {
    return safeDivide(percentage * operationPecuaryValue, 100);
  }, [percentage, operationPecuaryValue]);

  /** Faturamento necessário (valor calculado ÷ margem esperada) */
  const requiredRevenue = useMemo(() => {
    if (!productionSystem || expectedMargin <= 0) return 0;
    return safeDivide(calculatedValue * 100, expectedMargin);
  }, [calculatedValue, expectedMargin, productionSystem]);

  /** Vendas necessárias (faturamento necessário ÷ valor do boi ou valor médio) */
  const requiredSales = useMemo(() => {
    if (averageValue <= 0 || requiredRevenue <= 0) return 0;
    if (productionSystem === 'Recria-Engorda') return Math.round(safeDivide(requiredRevenue, averageValue));
    if (!isPercentageSumValid) return 0;
    return Math.round(safeDivide(requiredRevenue, averageValue));
  }, [productionSystem, isPercentageSumValid, averageValue, requiredRevenue]);

  /** Taxa de desmame: Fertilidade × (1 - Perda pré parto) × (1 - Mortalidade) */
  const weaningRate = useMemo(() => {
    const fertilityDecimal = safeDivide(fertility, 100);
    const prePartumLossDecimal = safeDivide(prePartumLoss, 100);
    const calfMortalityDecimal = safeDivide(calfMortality, 100);
    return fertilityDecimal * (1 - prePartumLossDecimal) * (1 - calfMortalityDecimal);
  }, [fertility, prePartumLoss, calfMortality]);

  /** Kg desmamados por matriz */
  const kgPerMatrix = useMemo(() => {
    const avgWeaningWeight = (maleWeaningWeight + femaleWeaningWeight) / 2;
    return weaningRate * avgWeaningWeight;
  }, [weaningRate, maleWeaningWeight, femaleWeaningWeight]);

  /** Matrizes necessárias */
  const requiredMatrixes = useMemo(() => {
    if (weaningRate <= 0 || requiredSales <= 0) return 0;
    return Math.ceil(safeDivide(requiredSales, weaningRate));
  }, [weaningRate, requiredSales]);

  /** Vendas por hectare = Vendas necessárias ÷ Área pecuária (ha) */
  const salesPerHectare = useMemo(() => {
    if (!selectedFarm?.pastureArea || selectedFarm.pastureArea <= 0 || requiredSales <= 0) return 0;
    return safeDivide(requiredSales, selectedFarm.pastureArea);
  }, [selectedFarm?.pastureArea, requiredSales]);

  // ============================================================================
  // CÁLCULOS FINANCEIROS (OTIMIZADO - Consolidado)
  // ============================================================================

  const isRecriaTerminacao = productionSystem === 'Recria-Engorda' || productionSystem === 'Ciclo Completo';

  /** Cálculos financeiros consolidados para melhor performance */
  const financialCalculations = useMemo(() => {
    const pastureArea = selectedFarm?.pastureArea ?? 0;
    const propertyValue = selectedFarm?.propertyValue ?? 0;

    // Receita: Valor médio por cabeça × Vendas necessárias
    const revenue = !isPercentageSumValid || averageValue <= 0 || requiredSales <= 0 ? 0 : averageValue * requiredSales;

    // Desembolso total: Receita - Valor calculado
    const totalDisbursement = revenue <= 0 ? 0 : revenue - calculatedValue;

    // Resultado: Receita - Desembolso
    const result = revenue - totalDisbursement;

    // Cálculos derivados
    const resultPerHectare = pastureArea <= 0 || result <= 0 ? 0 : safeDivide(result, pastureArea);

    const marginOverSale = revenue <= 0 || result <= 0 ? 0 : safeDivide(result, revenue) * 100;

    const resultPerHead = result <= 0 || requiredSales <= 0 ? 0 : safeDivide(result, requiredSales);

    const resultOnLandValue = result <= 0 || propertyValue <= 0 ? 0 : safeDivide(result, propertyValue) * 100;

    const disbursementPerCalf =
      totalDisbursement <= 0 || requiredSales <= 0 ? 0 : safeDivide(totalDisbursement, requiredSales);

    const averageMonthlyDisbursement = totalDisbursement <= 0 ? 0 : safeDivide(totalDisbursement, 12);

    return {
      revenue,
      totalDisbursement,
      result,
      resultPerHectare,
      marginOverSale,
      resultPerHead,
      resultOnLandValue,
      disbursementPerCalf,
      averageMonthlyDisbursement,
    };
  }, [
    isPercentageSumValid,
    averageValue,
    requiredSales,
    calculatedValue,
    selectedFarm?.pastureArea,
    selectedFarm?.propertyValue,
  ]);

  // Desestruturação para manter compatibilidade com código existente
  const {
    revenue,
    totalDisbursement,
    result,
    resultPerHectare,
    marginOverSale,
    resultPerHead,
    resultOnLandValue,
    disbursementPerCalf,
    averageMonthlyDisbursement,
  } = financialCalculations;

  /** Calcula quantidade para uma categoria (otimizado com validação) */
  const calculateQuantity = useCallback(
    (categoryPercentage: number): number => {
      // Validação rápida com early return
      if (!isPercentageSumValid || requiredSales === 0 || categoryPercentage <= 0) return 0;
      if (!isValidNumber(categoryPercentage)) return 0;

      return Math.round(safeDivide(requiredSales * categoryPercentage, 100));
    },
    [isPercentageSumValid, requiredSales],
  );

  /** Calcula Index RB (quantidade × tempo) para cada categoria do rebanho médio */
  const calculateIndexRB = useMemo(() => {
    if (!showReproductiveIndices || !isPercentageSumValid || requiredSales === 0) {
      return {
        matricesMonta: 0,
        bezerrosMamando: 0,
        novilhas8a12: 0,
        novilhas12a24: 0,
        touros: 0,
        total: 0,
      };
    }

    // Matizes em monta = matrizes necessárias, tempo = 12 meses
    const matricesMonta = requiredMatrixes;
    const tempoMatrices = 12;
    const indexRBMatrices = matricesMonta * tempoMatrices;

    // Bezerros mamando = quantidade de bezerros desmamados, tempo = 7 meses
    const bezerroCategory = animalCategories.find(c => c.id === CATEGORY_IDS.BEZERRO);
    const bezerrosMamando = bezerroCategory ? calculateQuantity(bezerroCategory.percentage) : 0;
    const tempoBezerros = 7;
    const indexRBBezerros = bezerrosMamando * tempoBezerros;

    // Novilhas: dividir em duas faixas (8-12 e 12-24 meses)
    const novilhaCategory = animalCategories.find(c => c.id === CATEGORY_IDS.NOVILHA);
    const totalNovilhas = novilhaCategory ? calculateQuantity(novilhaCategory.percentage) : 0;
    const novilhas8a12 = totalNovilhas / 2; // 50% das novilhas
    const novilhas12a24 = totalNovilhas / 2; // 50% das novilhas

    const tempoNovilhas8a12 = 5; // Fixo: 5 meses
    const tempoNovilhas12a24 = Math.max(0, firstMatingAge - 12); // Idade primeira monta - 12

    const indexRBNovilhas8a12 = novilhas8a12 * tempoNovilhas8a12;
    const indexRBNovilhas12a24 = novilhas12a24 * tempoNovilhas12a24;

    // Touros = quantidade de touros descarte, tempo = 12 meses
    const touroCategory = animalCategories.find(c => c.id === CATEGORY_IDS.TOURO_DESCARTE);
    const touros = touroCategory ? calculateQuantity(touroCategory.percentage) : 0;
    const tempoTouros = 12;
    const indexRBTouros = touros * tempoTouros;

    // Soma total do Index RB
    const totalIndexRB = indexRBMatrices + indexRBBezerros + indexRBNovilhas8a12 + indexRBNovilhas12a24 + indexRBTouros;

    return {
      matricesMonta: indexRBMatrices,
      bezerrosMamando: indexRBBezerros,
      novilhas8a12: indexRBNovilhas8a12,
      novilhas12a24: indexRBNovilhas12a24,
      touros: indexRBTouros,
      total: totalIndexRB,
    };
  }, [
    showReproductiveIndices,
    isPercentageSumValid,
    requiredSales,
    requiredMatrixes,
    animalCategories,
    calculateQuantity,
    firstMatingAge,
  ]);

  /** Cálculos do índice de rebanho consolidados para melhor performance */
  const herdIndexCalculations = useMemo(() => {
    if (!showReproductiveIndices) {
      return {
        indiceTempo: 0,
        indiceNovilhas: 0,
        indexValorRebanho: 0,
        matricesOverAverageHerd: 0,
        averageHerd: 0,
      };
    }

    // Passo 1: indice_tempo = idade_primeira_monta - 12
    const indiceTempo = Math.max(0, firstMatingAge - 12);

    // Passo 2: indice_novilhas = (indice_tempo × 37.5) ÷ 12
    const indiceNovilhas = safeDivide(indiceTempo * 37.5, 12);

    // Passo 3: index_valor_rebanho = indice_novilhas + 163.375
    const indexValorRebanho = indiceNovilhas + 163.375;

    // Passo 4: matrizes_sobre_rebanho_medio = 100 / index_valor_rebanho
    const matricesOverAverageHerd = indexValorRebanho <= 0 ? 0 : safeDivide(100, indexValorRebanho);

    // Rebanho médio para exibição = Matrizes necessárias / Matrizes sobre rebanho médio
    const averageHerd =
      matricesOverAverageHerd <= 0 || requiredMatrixes <= 0 ? 0 : safeDivide(requiredMatrixes, matricesOverAverageHerd);

    return {
      indiceTempo,
      indiceNovilhas,
      indexValorRebanho,
      matricesOverAverageHerd,
      averageHerd,
    };
  }, [showReproductiveIndices, firstMatingAge, requiredMatrixes]);

  // Desestruturação para manter compatibilidade
  const { indiceTempo, indiceNovilhas, indexValorRebanho, matricesOverAverageHerd, averageHerd } =
    herdIndexCalculations;

  /** Desembolso por cabeça mês (legado - Cria): (Desembolso ÷ Rebanho médio) ÷ 12 */
  const reproductiveDisbursementPerHeadMonth = useMemo(() => {
    if (!showReproductiveIndices || averageHerd <= 0 || totalDisbursement <= 0) return 0;
    return safeDivide(safeDivide(totalDisbursement, averageHerd), 12);
  }, [showReproductiveIndices, averageHerd, totalDisbursement]);

  /** GMD global: soma(quantidade × peso em kg) ÷ rebanho médio ÷ 365 */
  const gmdGlobal = useMemo(() => {
    if (!showReproductiveIndices || averageHerd <= 0) return 0;
    const totalPesoKg = animalCategories.reduce((sum, category) => {
      const quantity = calculateQuantity(category.percentage);
      if (quantity <= 0) return sum;
      const weightKg = isKgCategory(category.id) ? category.weight : category.weight * 30;
      return sum + quantity * weightKg;
    }, 0);
    return safeDivide(safeDivide(totalPesoKg, averageHerd), 365);
  }, [showReproductiveIndices, averageHerd, animalCategories, calculateQuantity]);

  /** Total de arrobas produzidas: soma(quantidade × peso em @) (otimizado) */
  const totalArroba = useMemo(() => {
    if (!animalCategories.length) return 0;

    return animalCategories.reduce((sum, category) => {
      const quantity = calculateQuantity(category.percentage);
      if (quantity <= 0) return sum;

      // Converter peso para @ (arrobas) - otimizado
      const weightArroba = isKgCategory(category.id)
        ? category.weight / HERD_CONSTANTS.ARROBA_TO_KG // Usa constante
        : category.weight; // Já está em @

      if (!isValidNumber(weightArroba)) return sum;

      return sum + quantity * weightArroba;
    }, 0);
  }, [animalCategories, calculateQuantity]);


  /** Desembolso/@: Desembolso total ÷ Total de arrobas produzidas */
  const disbursementPerArroba = useMemo(() => {
    if (totalDisbursement <= 0 || totalArroba <= 0) return 0;
    return safeDivide(totalDisbursement, totalArroba);
  }, [totalDisbursement, totalArroba]);

  // Função auxiliar para verificar se indicadores estão implementados
  const formatIndicatorValue = useCallback(
    (
      value: number | undefined,
      format: 'currency' | 'currency1' | 'percentage',
      hasRequiredData: boolean,
    ): string => {
      if (!hasRequiredData) return '!!!';
      if (!isFinite(value) || value === 0) return '-';
      if (format === 'percentage') return `${value.toFixed(1)}%`;
      if (format === 'currency1')
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(value);
      return formatCurrency(value);
    },
    [],
  );

  // Verificações de disponibilidade de dados para cada indicador (usando useMemo para performance)
  const hasDisbursementPerArrobaData = useMemo(
    () => totalDisbursement > 0 && totalArroba > 0,
    [totalDisbursement, totalArroba],
  );
  const hasAverageMonthlyDisbursementData = useMemo(() => totalDisbursement > 0, [totalDisbursement]);
  const hasResultPerHeadData = useMemo(() => result > 0 && requiredSales > 0, [result, requiredSales]);
  const hasResultOnLandValueData = useMemo(
    () => result > 0 && (selectedFarm?.propertyValue ?? 0) > 0,
    [result, selectedFarm?.propertyValue],
  );

  /** Cálculos para tabela de Rebanho Médio */
  const averageHerdTable = useMemo((): AverageHerdData => {
    const {
      ARROBA_TO_KG,
      MATRIZ_WEIGHT_FACTOR,
      TEMPO_MATRIZES,
      TEMPO_NOVILHAS_8_12,
      TEMPO_TOUROS,
      BEZERRO_WEIGHT_ADJUSTMENT,
    } = HERD_CONSTANTS;

    const DIAS_POR_MES = 30.4;
    // Valores padrão quando não há dados
    const emptyResult: AverageHerdData = {
      vacas: 0,
      bezerrosMamando: 0,
      novilhas8a12: 0,
      novilhas13a24: 0,
      machos8a12: 0,
      machos13a24: 0,
      machos25a36: 0,
      touros: 0,
      tempoVacas: (282 + matingPeriodDays + cowSlaughterDays) / DIAS_POR_MES,
      tempoBezerros: weaningAgeMonths,
      tempoNovilhas8a12: TEMPO_NOVILHAS_8_12,
      tempoNovilhas13a24: Math.max(0, firstMatingAge - 12),
      tempoMachos8a12: 5,
      tempoMachos13a24: 0,
      tempoMachos25a36: 0,
      tempoTouros: TEMPO_TOUROS,
      pesoVivoVacas: 0,
      pesoVivoBezerros: 0,
      pesoVivoNovilhas8a12: 0,
      pesoVivoNovilhas13a24: 0,
      pesoVivoMachos8a12: 0,
      pesoVivoMachos13a24: 0,
      pesoVivoMachos25a36: 0,
      pesoVivoTouros: 0,
      pesoIndividualVaca: 0,
      pesoIndividualBezerro: 0,
      pesoIndividualNovilha8a12: 0,
      pesoIndividualNovilha13a24: 0,
      pesoIndividualMachos8a12: 0,
      pesoIndividualMachos13a24: 0,
      pesoIndividualMachos25a36: 0,
      pesoIndividualTouro: 0,
    };

    if (!showReproductiveIndices || requiredMatrixes <= 0) {
      return emptyResult;
    }

    // Buscar peso da categoria Vaca Descarte
    const vacaDescarteCategory = animalCategories.find(c => c.id === CATEGORY_IDS.VACA_DESCARTE);
    const pesoVacaDescarteArroba = vacaDescarteCategory?.weight || 0;

    // === MATRIZES ===
    const vacas = Math.round(requiredMatrixes);
    // Fórmula: (282 + tempo de monta + dias para abate) / 30,4
    const tempoVacas = (282 + matingPeriodDays + cowSlaughterDays) / 30.4;
    const pesoMedioVaca = pesoVacaDescarteArroba * ARROBA_TO_KG * MATRIZ_WEIGHT_FACTOR;
    const pesoVivoVacas = vacas * pesoMedioVaca;

    // === BEZERROS MAMANDO ===
    const bezerrosMamando = Math.round(vacas * weaningRate);
    const tempoBezerros = weaningAgeMonths;
    // Fórmula: ((pesoMachos + pesoFêmeas) / 2 - 30) / 2
    const pesoMedioDesmame = (maleWeaningWeight + femaleWeaningWeight) / 2;
    const pesoMedioBezerroMamando = (pesoMedioDesmame - BEZERRO_WEIGHT_ADJUSTMENT) / 2;
    const pesoVivoBezerros = bezerrosMamando * pesoMedioBezerroMamando;

    // === NOVILHAS: Cálculo do ganho mensal até primeira monta ===
    const ganhoTotalAteMonta = pesoPrimeiraMonta - femaleWeaningWeight;
    const periodoAteMonta = firstMatingAge - weaningAgeMonths;
    const ganhoMensal = periodoAteMonta > 0 ? safeDivide(ganhoTotalAteMonta, periodoAteMonta) : 0;
    const pesoInicialDesmame = femaleWeaningWeight;

    // === NOVILHAS 8-12 MESES ===
    const novilhas8a12 = Math.round((bezerrosMamando / 2) * (1 - vendaBezerrasAoDesmame / 100));
    const tempoNovilhas8a12 = TEMPO_NOVILHAS_8_12;
    const mesesAte12Meses = 12 - weaningAgeMonths;
    const pesoAos12Meses = pesoInicialDesmame + ganhoMensal * mesesAte12Meses;
    const pesoMedioNovilha8a12 = (pesoInicialDesmame + pesoAos12Meses) / 2;
    const pesoVivoNovilhas8a12 = novilhas8a12 * pesoMedioNovilha8a12;

    // === NOVILHAS 13-24 MESES ===
    const novilhas13a24 = novilhas8a12;
    const tempoNovilhas13a24 = Math.max(0, firstMatingAge - 12);
    const mesesAte13Meses = 13 - weaningAgeMonths;
    const pesoAos13Meses = pesoInicialDesmame + ganhoMensal * mesesAte13Meses;
    const pesoMedioNovilha13a24 = (pesoAos13Meses + pesoPrimeiraMonta) / 2;
    const pesoVivoNovilhas13a24 = novilhas13a24 * pesoMedioNovilha13a24;

    // === MACHOS (somente Ciclo Completo) ===
    const isCicloCompleto = productionSystem === 'Ciclo Completo';
    let machos8a12 = 0;
    let machos13a24 = 0;
    let machos25a36 = 0;
    let tempoMachos8a12 = 5;
    let tempoMachos13a24 = 0;
    let tempoMachos25a36 = 0;
    let pesoIndividualMachos8a12 = 0;
    let pesoIndividualMachos13a24 = 0;
    let pesoIndividualMachos25a36 = 0;

    if (isCicloCompleto && cicloGmdPosDesmame > 0) {
      const totalDias =
        (cicloPesoAbate - maleWeaningWeight) / cicloGmdPosDesmame;
      const totalMeses = totalDias / DIAS_POR_MES;
      const qtdMachos = Math.round(
        vacas * weaningRate * 0.5 * (1 - cicloVendaAoDesmame / 100),
      );

      // Peso em mês M: maleWeaningWeight + GMD * (M - weaningAgeMonths) * 30.4
      const pesoEmMeses = (meses: number) =>
        maleWeaningWeight +
        cicloGmdPosDesmame * (meses - weaningAgeMonths) * DIAS_POR_MES;

      machos8a12 = qtdMachos;
      tempoMachos8a12 = 5;
      const peso8 = pesoEmMeses(8);
      const peso12 = pesoEmMeses(12);
      pesoIndividualMachos8a12 = (peso8 + peso12) / 2;

      if (totalMeses > 12) {
        machos13a24 = qtdMachos;
        // Limite de 12 meses na categoria; excedente deve ir para a categoria posterior.
        tempoMachos13a24 = Math.min(12, totalMeses - 12);
        const peso13 = pesoEmMeses(13);
        const peso24 = Math.min(pesoEmMeses(24), cicloPesoAbate);
        pesoIndividualMachos13a24 = (peso13 + peso24) / 2;
      }

      if (totalMeses > 24) {
        machos25a36 = qtdMachos;
        // Recebe o excedente da categoria anterior (13-24).
        tempoMachos25a36 = totalMeses - 24;
        const peso25 = pesoEmMeses(25);
        pesoIndividualMachos25a36 = (peso25 + cicloPesoAbate) / 2;
      }
    }

    const pesoVivoMachos8a12 = machos8a12 * pesoIndividualMachos8a12;
    const pesoVivoMachos13a24 = machos13a24 * pesoIndividualMachos13a24;
    const pesoVivoMachos25a36 = machos25a36 * pesoIndividualMachos25a36;

    // === TOUROS ===
    const touros = bullCowRatioPercent > 0 ? Math.ceil(vacas * (bullCowRatioPercent / 100)) : 0;
    const tempoTouros = TEMPO_TOUROS;
    const pesoVivoTouros = touros * pesoMedioTouro;

    return {
      vacas,
      bezerrosMamando,
      novilhas8a12,
      novilhas13a24,
      machos8a12,
      machos13a24,
      machos25a36,
      touros,
      tempoVacas,
      tempoBezerros,
      tempoNovilhas8a12,
      tempoNovilhas13a24,
      tempoMachos8a12,
      tempoMachos13a24,
      tempoMachos25a36,
      tempoTouros,
      pesoVivoVacas,
      pesoVivoBezerros,
      pesoVivoNovilhas8a12,
      pesoVivoNovilhas13a24,
      pesoVivoMachos8a12,
      pesoVivoMachos13a24,
      pesoVivoMachos25a36,
      pesoVivoTouros,
      // Pesos individuais (para exibição na tabela)
      pesoIndividualVaca: pesoMedioVaca,
      pesoIndividualBezerro: pesoMedioBezerroMamando,
      pesoIndividualNovilha8a12: pesoMedioNovilha8a12,
      pesoIndividualNovilha13a24: pesoMedioNovilha13a24,
      pesoIndividualMachos8a12,
      pesoIndividualMachos13a24,
      pesoIndividualMachos25a36,
      pesoIndividualTouro: pesoMedioTouro,
    };
  }, [
    showReproductiveIndices,
    productionSystem,
    requiredMatrixes,
    weaningRate,
    bullCowRatioPercent,
    firstMatingAge,
    maleWeaningWeight,
    femaleWeaningWeight,
    animalCategories,
    weaningAgeMonths,
    pesoPrimeiraMonta,
    pesoMedioTouro,
    matingPeriodDays,
    cowSlaughterDays,
    cicloGmdPosDesmame,
    cicloPesoAbate,
    cicloVendaAoDesmame,
    vendaBezerrasAoDesmame,
  ]);

  /** Rebanho Médio calculado: Σ(quantidade × tempo) / 12 */
  const rebanhoMedioCalculado = useMemo(() => {
    if (!showReproductiveIndices) return 0;
    const categorias = [
      { quantidade: averageHerdTable.vacas, tempo: averageHerdTable.tempoVacas },
      { quantidade: averageHerdTable.bezerrosMamando, tempo: averageHerdTable.tempoBezerros },
      { quantidade: averageHerdTable.novilhas8a12, tempo: averageHerdTable.tempoNovilhas8a12 },
      { quantidade: averageHerdTable.novilhas13a24, tempo: averageHerdTable.tempoNovilhas13a24 },
      { quantidade: averageHerdTable.machos8a12, tempo: averageHerdTable.tempoMachos8a12 },
      { quantidade: averageHerdTable.machos13a24, tempo: averageHerdTable.tempoMachos13a24 },
      { quantidade: averageHerdTable.machos25a36, tempo: averageHerdTable.tempoMachos25a36 },
      { quantidade: averageHerdTable.touros, tempo: averageHerdTable.tempoTouros },
    ];
    const somaQtdTempo = categorias.reduce((sum, c) => sum + c.quantidade * c.tempo, 0);
    return somaQtdTempo / 12;
  }, [showReproductiveIndices, averageHerdTable]);

  /** Rebanho médio ajustado pela mortalidade */
  const rebanhoMedioAjustado = useMemo(() => {
    if (!showReproductiveIndices || rebanhoMedioCalculado <= 0) return 0;
    return rebanhoMedioCalculado * (1 + safeDivide(calfMortality, 100));
  }, [showReproductiveIndices, rebanhoMedioCalculado, calfMortality]);

  /** Valor do rebanho calculado (Cria): rebanho médio × valor médio por cabeça */
  const valorRebanhoCalculadoCria = useMemo(() => {
    if (productionSystem !== 'Cria' || !showReproductiveIndices || rebanhoMedioCalculado <= 0 || averageValue <= 0)
      return 0;
    return rebanhoMedioCalculado * averageValue;
  }, [productionSystem, showReproductiveIndices, rebanhoMedioCalculado, averageValue]);

  /** Rebanho Médio Recria-Engorda: vendas × (ciclo em meses / 12) */
  const recriaRebanhoMedio = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || recriaGmd <= 0 || requiredSales <= 0) return 0;
    const cicloDias = (recriaPesoVenda - recriaPesoCompra) / recriaGmd;
    const cicloMeses = cicloDias / 30.4;
    return requiredSales * (cicloMeses / 12);
  }, [productionSystem, recriaPesoVenda, recriaPesoCompra, recriaGmd, requiredSales]);

  /** Rebanho médio da recria ajustado pela mortalidade */
  const recriaRebanhoMedioAjustado = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || recriaRebanhoMedio <= 0) return 0;
    return recriaRebanhoMedio * (1 + safeDivide(recriaMortalidade, 100));
  }, [productionSystem, recriaRebanhoMedio, recriaMortalidade]);

  /** Tempo de Permanência Recria-Engorda (meses): (Peso final - Peso inicial) / GMD / 30,4166666667 */
  const recriaTempoPermanenciaMeses = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || recriaGmd <= 0) return 0;
    const meses = (recriaPesoVenda - recriaPesoCompra) / recriaGmd / 30.4166666667;
    return meses > 0 ? meses : 0;
  }, [productionSystem, recriaPesoVenda, recriaPesoCompra, recriaGmd]);

  /** Giro de Estoque Recria-Engorda: 12 / tempo de permanência (meses) × 100 */
  const recriaGiroEstoque = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || recriaTempoPermanenciaMeses <= 0) return 0;
    return (12 / recriaTempoPermanenciaMeses) * 100;
  }, [productionSystem, recriaTempoPermanenciaMeses]);

  /** Lotação Cab/ha Recria-Engorda: Rebanho médio ÷ área pecuária */
  const recriaLotacaoCabHa = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || !farm?.pastureArea || farm.pastureArea <= 0) return 0;
    return safeDivide(recriaRebanhoMedioAjustado, farm.pastureArea);
  }, [productionSystem, recriaRebanhoMedioAjustado, farm?.pastureArea]);

  /** Lotação UA/ha Recria-Engorda: ((peso entrada + peso venda) / 450) × lotação cabeça */
  const recriaLotacaoUaHa = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || recriaLotacaoCabHa <= 0) return 0;
    const pesoMedio = (recriaPesoCompra + recriaPesoVenda) / 2;
    return (pesoMedio / 450) * recriaLotacaoCabHa;
  }, [productionSystem, recriaPesoCompra, recriaPesoVenda, recriaLotacaoCabHa]);

  /** Peso em @ Recria-Engorda: Peso de venda (kg) × (Rendimento de carcaça % / 100) / 15 */
  const recriaPesoArroba = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda') return 0;
    return (recriaPesoVenda * (recriaRendimentoCarcaca / 100)) / 15;
  }, [productionSystem, recriaPesoVenda, recriaRendimentoCarcaca]);

  const boiGordoSaleValue = useMemo(() => {
    const boiGordoCategory = animalCategories.find(c => c.id === CATEGORY_IDS.BOI_GORDO);
    return boiGordoCategory?.valuePerKg ?? 0;
  }, [animalCategories]);

  const rebanhoMedioParaRecriaTerminacao = useMemo(() => {
    if (productionSystem === 'Recria-Engorda') return recriaRebanhoMedio;
    if (productionSystem === 'Ciclo Completo') return rebanhoMedioCalculado;
    return 0;
  }, [productionSystem, recriaRebanhoMedio, rebanhoMedioCalculado]);

  /** Investimento em Reposição (Recria-Engorda): peso de compra × valor de compra × vendas necessárias */
  const investimentoReposicao = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda' || requiredSales <= 0) return 0;
    return recriaPesoCompra * recriaValorCompra * requiredSales;
  }, [productionSystem, recriaPesoCompra, recriaValorCompra, requiredSales]);

  /** Desembolso Produção (Recria-Engorda): Receita necessária - investimento em reposição - resultado esperado */
  const desembolsoProducao = useMemo(() => {
    if (productionSystem !== 'Recria-Engorda') return 0;
    return Math.max(0, requiredRevenue - investimentoReposicao - calculatedValue);
  }, [productionSystem, requiredRevenue, investimentoReposicao, calculatedValue]);

  /** Prod. @/ha/ano (Recria-Terminação)
   * Passo 1: Peso venda @ = peso venda × rendimento carcaça / 15
   * Passo 2: Peso entrada @ = peso entrada / 30
   * Passo 3: Produção animal mês = (peso venda @ - peso entrada @) / tempo permanência
   * Passo 4: Produção @/ha = produção animal mês × 12 × rebanho médio / área pecuária
   */
  const producaoArrobaHa = useMemo(() => {
    if (!selectedFarm?.pastureArea || selectedFarm.pastureArea <= 0) return 0;
    if (isRecriaTerminacao) {
      const pesoVendaKg = productionSystem === 'Recria-Engorda' ? recriaPesoVenda : cicloPesoAbate;
      const pesoEntradaKg = productionSystem === 'Recria-Engorda' ? recriaPesoCompra : maleWeaningWeight;
      const rendimentoCarcaca =
        productionSystem === 'Recria-Engorda' ? recriaRendimentoCarcaca : cicloRendimentoCarcaca;
      const tempoPermanenciaMeses =
        productionSystem === 'Recria-Engorda'
          ? recriaGmd > 0
            ? (recriaPesoVenda - recriaPesoCompra) / recriaGmd / 30.4166666667
            : 0
          : cicloGmdPosDesmame > 0
            ? (cicloPesoAbate - maleWeaningWeight) / cicloGmdPosDesmame / 30.4166666667
            : 0;

      const pesoVendaArroba = safeDivide(pesoVendaKg * safeDivide(rendimentoCarcaca, 100), 15);
      const pesoEntradaArroba = safeDivide(pesoEntradaKg, 30);
      const producaoAnimalMes =
        tempoPermanenciaMeses > 0
          ? safeDivide(pesoVendaArroba - pesoEntradaArroba, tempoPermanenciaMeses)
          : 0;
      const producaoTotalAno = producaoAnimalMes * 12 * rebanhoMedioParaRecriaTerminacao;
      return safeDivide(producaoTotalAno, selectedFarm.pastureArea);
    }
    return safeDivide(totalArroba, selectedFarm.pastureArea);
  }, [
    selectedFarm?.pastureArea,
    isRecriaTerminacao,
    productionSystem,
    rebanhoMedioParaRecriaTerminacao,
    recriaPesoVenda,
    recriaPesoCompra,
    recriaGmd,
    recriaRendimentoCarcaca,
    cicloPesoAbate,
    cicloRendimentoCarcaca,
    cicloGmdPosDesmame,
    maleWeaningWeight,
    totalArroba,
  ]);

  const rebanhoMedioReaisRecriaTerminacao = useMemo(() => {
    if (!isRecriaTerminacao || rebanhoMedioParaRecriaTerminacao <= 0) return 0;

    const pesoCompra = productionSystem === 'Recria-Engorda' ? recriaPesoCompra : maleWeaningWeight;
    const pesoVenda = productionSystem === 'Recria-Engorda' ? recriaPesoVenda : cicloPesoAbate;
    const rendimentoCarcaca =
      productionSystem === 'Recria-Engorda' ? recriaRendimentoCarcaca : cicloRendimentoCarcaca;
    const valorVenda = productionSystem === 'Recria-Engorda' ? recriaValorVenda : boiGordoSaleValue;

    if (valorVenda <= 0 || pesoVenda <= 0) return 0;

    // Passo 1: Peso @ entrada = Peso de compra / 30
    const pesoEntradaArroba = safeDivide(pesoCompra, 30);
    // Passo 2: Peso @ saída = Peso de venda × rendimento de carcaça (%) / 15
    const pesoSaidaArroba = safeDivide(pesoVenda * safeDivide(rendimentoCarcaca, 100), 15);
    // Passo 3: Peso médio = média dos passos anteriores
    const pesoMedioArroba = (pesoEntradaArroba + pesoSaidaArroba) / 2;
    // Passo 4: Valor do rebanho = Peso médio × valor de venda × Rebanho Médio
    const valorUnitario = pesoMedioArroba * valorVenda;

    return rebanhoMedioParaRecriaTerminacao * valorUnitario;
  }, [
    isRecriaTerminacao,
    rebanhoMedioParaRecriaTerminacao,
    productionSystem,
    recriaPesoCompra,
    maleWeaningWeight,
    recriaPesoVenda,
    cicloPesoAbate,
    recriaRendimentoCarcaca,
    cicloRendimentoCarcaca,
    recriaValorVenda,
    boiGordoSaleValue,
  ]);

  /** Valor do rebanho calculado no planejamento (usado em vez do cadastro da fazenda) */
  const valorRebanhoCalculado = useMemo(() => {
    if (isRecriaTerminacao) return rebanhoMedioReaisRecriaTerminacao;
    return valorRebanhoCalculadoCria;
  }, [isRecriaTerminacao, rebanhoMedioReaisRecriaTerminacao, valorRebanhoCalculadoCria]);

  /** Resultado sobre ativo pecuário (Cria): usa valor do rebanho calculado, não do cadastro */
  const resultOnLivestockAssetLegacy = useMemo(() => {
    if (result <= 0 || valorRebanhoCalculadoCria <= 0) return 0;
    return safeDivide(result, valorRebanhoCalculadoCria) * 100;
  }, [result, valorRebanhoCalculadoCria]);

  const hasDisbursementPerCalfData = useMemo(() => {
    if (productionSystem === 'Recria-Engorda')
      return rebanhoMedioParaRecriaTerminacao > 0; // usa desembolsoProducao / rebanho / 12
    if (productionSystem === 'Ciclo Completo')
      return totalDisbursement > 0 && rebanhoMedioParaRecriaTerminacao > 0;
    return totalDisbursement > 0 && requiredSales > 0;
  }, [productionSystem, totalDisbursement, rebanhoMedioParaRecriaTerminacao, requiredSales]);
  const hasResultOnLivestockAssetData = useMemo(() => {
    return result > 0 && valorRebanhoCalculado > 0;
  }, [result, valorRebanhoCalculado]);

  const resultOnLivestockAsset = useMemo(() => {
    if (result <= 0) return 0;
    if (isRecriaTerminacao) {
      if (rebanhoMedioReaisRecriaTerminacao <= 0) return 0;
      return safeDivide(result, rebanhoMedioReaisRecriaTerminacao) * 100;
    }
    return resultOnLivestockAssetLegacy;
  }, [result, isRecriaTerminacao, rebanhoMedioReaisRecriaTerminacao, resultOnLivestockAssetLegacy]);

  /** Desembolso/cabeça/mês para Recria-Engorda: orçamento operacional / rebanho necessário / 12
   * (orçamento operacional = Desembolso Produção)
   * Para Ciclo Completo: usa fórmula legada (totalDisbursement / rebanho / 12) */
  const disbursementPerHeadMonth = useMemo(() => {
    if (totalDisbursement <= 0) return 0;
    if (productionSystem === 'Recria-Engorda') {
      if (rebanhoMedioParaRecriaTerminacao <= 0) return 0;
      return safeDivide(safeDivide(desembolsoProducao, rebanhoMedioParaRecriaTerminacao), 12);
    }
    if (productionSystem === 'Ciclo Completo') {
      if (rebanhoMedioParaRecriaTerminacao <= 0) return 0;
      return safeDivide(safeDivide(totalDisbursement, rebanhoMedioParaRecriaTerminacao), 12);
    }
    return reproductiveDisbursementPerHeadMonth;
  }, [
    totalDisbursement,
    productionSystem,
    desembolsoProducao,
    rebanhoMedioParaRecriaTerminacao,
    reproductiveDisbursementPerHeadMonth,
  ]);

  /** Total de UAs: Σ(quantidade × tempo × peso) / 12 / 450 */
  const totalUAsCalculado = useMemo(() => {
    if (!showReproductiveIndices) return 0;
    const categorias = [
      {
        quantidade: averageHerdTable.vacas,
        tempo: averageHerdTable.tempoVacas,
        peso: averageHerdTable.pesoIndividualVaca,
      },
      {
        quantidade: averageHerdTable.bezerrosMamando,
        tempo: averageHerdTable.tempoBezerros,
        peso: averageHerdTable.pesoIndividualBezerro,
      },
      {
        quantidade: averageHerdTable.novilhas8a12,
        tempo: averageHerdTable.tempoNovilhas8a12,
        peso: averageHerdTable.pesoIndividualNovilha8a12,
      },
      {
        quantidade: averageHerdTable.novilhas13a24,
        tempo: averageHerdTable.tempoNovilhas13a24,
        peso: averageHerdTable.pesoIndividualNovilha13a24,
      },
      {
        quantidade: averageHerdTable.machos8a12,
        tempo: averageHerdTable.tempoMachos8a12,
        peso: averageHerdTable.pesoIndividualMachos8a12,
      },
      {
        quantidade: averageHerdTable.machos13a24,
        tempo: averageHerdTable.tempoMachos13a24,
        peso: averageHerdTable.pesoIndividualMachos13a24,
      },
      {
        quantidade: averageHerdTable.machos25a36,
        tempo: averageHerdTable.tempoMachos25a36,
        peso: averageHerdTable.pesoIndividualMachos25a36,
      },
      {
        quantidade: averageHerdTable.touros,
        tempo: averageHerdTable.tempoTouros,
        peso: averageHerdTable.pesoIndividualTouro,
      },
    ];
    const somaQtdTempoPeso = categorias.reduce((sum, c) => sum + c.quantidade * c.tempo * c.peso, 0);
    return somaQtdTempoPeso / 12 / 450;
  }, [showReproductiveIndices, averageHerdTable]);

  /** Total de UAs ajustado pela mortalidade */
  const totalUAsAjustado = useMemo(() => {
    if (!showReproductiveIndices || totalUAsCalculado <= 0) return 0;
    return totalUAsCalculado * (1 + safeDivide(calfMortality, 100));
  }, [showReproductiveIndices, totalUAsCalculado, calfMortality]);

  /** Lotação: Total de UAs ÷ área pecuária */
  const lotacaoCabHa = useMemo(() => {
    if (!showReproductiveIndices || totalUAsAjustado <= 0 || !farm?.pastureArea) return 0;
    return safeDivide(totalUAsAjustado, farm.pastureArea);
  }, [showReproductiveIndices, totalUAsAjustado, farm?.pastureArea]);

  /** Lotação Cab./ha: Rebanho médio ÷ área pecuária */
  const lotacaoCabecasHa = useMemo(() => {
    if (!showReproductiveIndices || rebanhoMedioAjustado <= 0 || !farm?.pastureArea) return 0;
    return safeDivide(rebanhoMedioAjustado, farm.pastureArea);
  }, [showReproductiveIndices, rebanhoMedioAjustado, farm?.pastureArea]);

  const MAX_PERFORMANCE_INDICATORS = 5;
  const performanceIndicators = useMemo(
    () => [
      {
        id: 'weaningRate',
        label: 'Taxa de Desmame',
        value: weaningRate * 100,
        format: (value: number) => `${value.toFixed(2)}%`,
      },
      {
        id: 'kgPerMatrix',
        label: 'Kg desm./Matriz',
        value: kgPerMatrix,
        format: (value: number) => `${value.toFixed(1)} kg`,
      },
      {
        id: 'matricesOverAverageHerd',
        label: 'Matrizes s/ Rebanho',
        value: matricesOverAverageHerd * 100,
        format: (value: number) => `${value.toFixed(1)}%`,
      },
      {
        id: 'salesPerHectare',
        label: 'Vendas/ha',
        value: salesPerHectare,
        format: (value: number) => value.toFixed(2),
      },
      {
        id: 'gmdGlobal',
        label: 'GMD global',
        value: gmdGlobal,
        format: (value: number) => `${value.toFixed(2)} kg/dia`,
      },
      {
        id: 'lotacaoCabHa',
        label: 'Lotação UA/ha',
        value: lotacaoCabHa,
        format: (value: number) => value.toFixed(2),
      },
      {
        id: 'producaoArrobaHa',
        label: 'Produção de @/ha',
        value: producaoArrobaHa,
        format: (value: number) => `${value.toFixed(2)} @/ha`,
      },
      {
        id: 'lotacaoCabecasHa',
        label: 'Lotação Cab./ha',
        value: lotacaoCabecasHa,
        format: (value: number) => value.toFixed(2),
      },
    ],
    [
      weaningRate,
      kgPerMatrix,
      matricesOverAverageHerd,
      salesPerHectare,
      gmdGlobal,
      lotacaoCabHa,
      producaoArrobaHa,
      lotacaoCabecasHa,
    ],
  );

  const visiblePerformanceIndicators = useMemo(
    () => performanceIndicators.filter(indicator => selectedIndicators.includes(indicator.id)),
    [performanceIndicators, selectedIndicators],
  );

  const toggleIndicatorSelection = useCallback(
    (indicatorId: string) => {
      setSelectedIndicators(prev => {
        if (prev.includes(indicatorId)) {
          return prev.filter(id => id !== indicatorId);
        }
        if (prev.length >= MAX_PERFORMANCE_INDICATORS) {
          onToast?.('Selecione no máximo 5 indicadores.', 'warning');
          return prev;
        }
        return [...prev, indicatorId];
      });
    },
    [onToast],
  );

  const MAX_RECRIA_PERFORMANCE_INDICATORS = 5;
  const recriaPerformanceIndicators = useMemo(
    () =>
      productionSystem === 'Recria-Engorda'
        ? [
          { id: 'tempoPerm', label: 'Tempo Perm.', value: recriaTempoPermanenciaMeses, format: (v: number) => `${v.toFixed(1)} meses` },
          { id: 'pesoArroba', label: 'Peso em @', value: recriaPesoArroba, format: (v: number) => `${v.toFixed(1)} @` },
          { id: 'producaoArrobaHa', label: 'Prod. @/ha/ano', value: producaoArrobaHa, format: (v: number) => `${v.toFixed(2)} @/ha` },
          { id: 'giroEstoque', label: 'Giro de Estoque', value: recriaGiroEstoque, format: (v: number) => `${v.toFixed(1)}%` },
          { id: 'lotacaoCabHa', label: 'Lotação Cab/ha', value: recriaLotacaoCabHa, format: (v: number) => v.toFixed(2) },
          { id: 'lotacaoUaHa', label: 'Lotação UA/ha', value: recriaLotacaoUaHa, format: (v: number) => v.toFixed(2) },
        ]
        : [],
    [
      productionSystem,
      recriaTempoPermanenciaMeses,
      recriaPesoArroba,
      producaoArrobaHa,
      recriaGiroEstoque,
      recriaLotacaoCabHa,
      recriaLotacaoUaHa,
    ],
  );
  const visibleRecriaPerformanceIndicators = useMemo(
    () => recriaPerformanceIndicators.filter(ind => selectedRecriaIndicators.includes(ind.id)),
    [recriaPerformanceIndicators, selectedRecriaIndicators],
  );
  const toggleRecriaIndicatorSelection = useCallback(
    (indicatorId: string) => {
      setSelectedRecriaIndicators(prev => {
        if (prev.includes(indicatorId)) return prev.filter(id => id !== indicatorId);
        if (prev.length >= MAX_RECRIA_PERFORMANCE_INDICATORS) {
          onToast?.('Selecione no máximo 5 indicadores.', 'warning');
          return prev;
        }
        return [...prev, indicatorId];
      });
    },
    [onToast],
  );

  /** Configuração de margem para o sistema atual */
  const marginConfig = useMemo(() => getMarginConfig(productionSystem), [productionSystem]);

  /** Dados consolidados para o Relatório do Planejamento Ágil */
  const reportData = useMemo((): AgilePlanningReportData | null => {
    if (!farm || !productionSystem) return null;

    const reportDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const header = {
      farmName: farm.name ?? '',
      city: farm.city ?? '',
      state: farm.state ?? '',
      country: farm.country ?? 'Brasil',
      productionSystem,
      reportDate,
    };

    const dimensions = {
      totalArea: sanitizeNumber(farm.totalArea),
      pastureArea: sanitizeNumber(farm.pastureArea),
      reserveAndAPP: sanitizeNumber(farm.reserveAndAPP),
      agricultureLeased: sanitizeNumber(farm.agricultureAreaLeased),
      forageProduction: sanitizeNumber(farm.forageProductionArea),
      infrastructure: sanitizeNumber(farm.infrastructure),
      agricultureOwned: sanitizeNumber(farm.agricultureAreaOwned),
      otherCrops: sanitizeNumber(farm.otherCrops),
      otherArea: sanitizeNumber(farm.otherArea),
    };

    const assets = {
      propertyValue: sanitizeNumber(farm.propertyValue),
      herdValue: sanitizeNumber(farm.herdValue),
      operationPecuary: sanitizeNumber(farm.operationPecuary),
      operationAgricultural: sanitizeNumber(farm.operationAgricultural),
      agricultureVariationPercent: farm.agricultureVariation ?? 0,
      commercializesGenetics: !!farm.commercializesGenetics,
    };

    const buildHerdRows = (): HerdCompositionRow[] => {
      const rows: HerdCompositionRow[] = [];
      const t = averageHerdTable;
      const m = (qty: number, tempo: number) => (qty * tempo) / 12;
      const mortalidadeCriaFator = 1 + safeDivide(calfMortality, 100);

      if (showReproductiveIndices) {
        rows.push({
          categoria: 'Matrizes',
          quantidadeCabecas: Math.round(t.vacas),
          tempoMeses: Math.round(t.tempoVacas * 10) / 10,
          rebanhoMedio: Math.round(m(t.vacas, t.tempoVacas) * mortalidadeCriaFator),
          pesoVivoKg: Math.round(t.pesoIndividualVaca),
        });
        rows.push({
          categoria: 'Bezerros mamando',
          quantidadeCabecas: Math.round(t.bezerrosMamando),
          tempoMeses: t.tempoBezerros,
          rebanhoMedio: Math.round(m(t.bezerrosMamando, t.tempoBezerros) * mortalidadeCriaFator),
          pesoVivoKg: Math.round(t.pesoIndividualBezerro),
        });
        rows.push({
          categoria: 'Novilhas 8 a 12 meses',
          quantidadeCabecas: Math.round(t.novilhas8a12),
          tempoMeses: t.tempoNovilhas8a12,
          rebanhoMedio: Math.round(m(t.novilhas8a12, t.tempoNovilhas8a12) * mortalidadeCriaFator),
          pesoVivoKg: Math.round(t.pesoIndividualNovilha8a12),
        });
        rows.push({
          categoria: 'Novilhas 13 a 24 meses',
          quantidadeCabecas: Math.round(t.novilhas13a24),
          tempoMeses: Math.round(t.tempoNovilhas13a24 * 10) / 10,
          rebanhoMedio: Math.round(m(t.novilhas13a24, t.tempoNovilhas13a24) * mortalidadeCriaFator),
          pesoVivoKg: Math.round(t.pesoIndividualNovilha13a24),
        });
        if (productionSystem === 'Ciclo Completo') {
          rows.push({
            categoria: 'Machos 8 a 12 meses (Ciclo Completo)',
            quantidadeCabecas: Math.round(t.machos8a12),
            tempoMeses: t.tempoMachos8a12,
            rebanhoMedio: Math.round(m(t.machos8a12, t.tempoMachos8a12) * mortalidadeCriaFator),
            pesoVivoKg: Math.round(t.pesoIndividualMachos8a12),
          });
          rows.push({
            categoria: 'Machos 13 a 24 meses (Ciclo Completo)',
            quantidadeCabecas: Math.round(t.machos13a24),
            tempoMeses: Math.round(t.tempoMachos13a24 * 10) / 10,
            rebanhoMedio: Math.round(m(t.machos13a24, t.tempoMachos13a24) * mortalidadeCriaFator),
            pesoVivoKg: Math.round(t.pesoIndividualMachos13a24),
          });
          rows.push({
            categoria: 'Machos 25 a 36 meses (Ciclo Completo)',
            quantidadeCabecas: Math.round(t.machos25a36),
            tempoMeses: Math.round(t.tempoMachos25a36 * 10) / 10,
            rebanhoMedio: Math.round(m(t.machos25a36, t.tempoMachos25a36) * mortalidadeCriaFator),
            pesoVivoKg: Math.round(t.pesoIndividualMachos25a36),
          });
        }
        rows.push({
          categoria: 'Touros',
          quantidadeCabecas: Math.round(t.touros),
          tempoMeses: t.tempoTouros,
          rebanhoMedio: Math.round(m(t.touros, t.tempoTouros) * mortalidadeCriaFator),
          pesoVivoKg: Math.round(t.pesoIndividualTouro),
        });
      }

      if (productionSystem === 'Recria-Engorda' && requiredSales > 0 && recriaRebanhoMedioAjustado > 0) {
        const avgWeight = recriaPesoCompra + (recriaPesoVenda - recriaPesoCompra) / 2;
        rows.push({
          categoria: 'Animais em recria/terminação',
          quantidadeCabecas: Math.round(requiredSales),
          tempoMeses: Math.round(recriaTempoPermanenciaMeses * 10) / 10,
          rebanhoMedio: Math.round(recriaRebanhoMedioAjustado),
          pesoVivoKg: Math.round(avgWeight),
        });
      }

      return rows;
    };

    const herdRows = buildHerdRows();
    const totalRebanhoMedio =
      showReproductiveIndices && productionSystem !== 'Recria-Engorda'
        ? Math.round(rebanhoMedioAjustado)
        : productionSystem === 'Recria-Engorda'
          ? Math.round(recriaRebanhoMedioAjustado)
          : 0;
    const totalPesoVivo =
      herdRows.length > 0 && totalRebanhoMedio > 0
        ? Math.round(
          herdRows.reduce((sum, r) => sum + r.rebanhoMedio * r.pesoVivoKg, 0) / totalRebanhoMedio,
        )
        : 0;

    const herdComposition = {
      rows: herdRows,
      totalRebanhoMedio,
      totalPesoVivoKg: totalPesoVivo,
    };

    const rebanhoMedioForReport =
      productionSystem === 'Recria-Engorda' ? recriaRebanhoMedioAjustado : rebanhoMedioAjustado;
    const totalUAsForReport = totalUAsAjustado;
    const pesoMedioForReport =
      totalRebanhoMedio > 0
        ? herdRows.reduce((s, r) => s + r.rebanhoMedio * r.pesoVivoKg, 0) / totalRebanhoMedio
        : 0;
    const pesoMedioUAForReport =
      totalRebanhoMedio > 0 && totalUAsForReport > 0 ? totalUAsForReport / totalRebanhoMedio : 0;

    const zootechnical = {
      rebanhoMedio: Math.round(rebanhoMedioForReport),
      totalUAs: Math.round(totalUAsForReport * 10) / 10,
      pesoMedio: Math.round(pesoMedioForReport),
      pesoMedioUA: Math.round(pesoMedioUAForReport * 100) / 100,
      gmdGlobal: gmdGlobal,
      producaoArrobaHaAno: Math.round(producaoArrobaHa * 100) / 100,
      ...(showReproductiveIndices && {
        reproductive: {
          fertilidade: fertility,
          fertilidadeRef: '> 85%',
          perdaPreParto: prePartumLoss,
          perdaPrePartoRef: '< 6%',
          mortalidadeBezerros: calfMortality,
          mortalidadeBezerrosRef: '< 3%',
          taxaDesmame: Math.round(weaningRate * 1000) / 10,
          taxaDesmameRef: '> 75%',
        },
      }),
      ...((productionSystem === 'Ciclo Completo' || productionSystem === 'Recria-Engorda') && {
        recriaTerminacao: {
          gmdPosDesmame: productionSystem === 'Recria-Engorda' ? recriaGmd : cicloGmdPosDesmame,
          gmdGlobal: gmdGlobal,
          lotacaoUaHa:
            productionSystem === 'Recria-Engorda'
              ? Math.round(recriaLotacaoUaHa * 100) / 100
              : Math.round(lotacaoCabHa * 100) / 100,
          producaoArrobaHa: Math.round(producaoArrobaHa * 100) / 100,
        },
      }),
    };

    const denomPct =
      productionSystem === 'Recria-Engorda' ? gmdGlobal * 10 * recriaValorVenda : 0;
    const pctArrobaPor100g =
      productionSystem === 'Recria-Engorda' && denomPct > 0
        ? Math.round((disbursementPerHeadMonth / denomPct) * 1000) / 10
        : undefined;

    const financial = {
      retornoValorTerra: Math.round(resultOnLandValue * 10) / 10,
      retornoAtivoPecuario: Math.round(resultOnLivestockAsset * 10) / 10,
      valorRebanhoCalculado: Math.round(valorRebanhoCalculado),
      resultadoPorHectare: Math.round(resultPerHectare),
      resultadoLiquidoTotal: Math.round(result),
      receitaTotal: Math.round(revenue),
      desembolsoTotal: Math.round(totalDisbursement),
      margemSobreVenda: Math.round(marginOverSale * 10) / 10,
      desembolsoPorArroba: Math.round(disbursementPerArroba),
      desembolsoPorBezerro: Math.round(disbursementPerCalf),
      desembolsoPorCabecaMes: Math.round(disbursementPerHeadMonth * 10) / 10,
      desembolsoMedioMensal: Math.round(averageMonthlyDisbursement),
      resultadoPorCabeca: Math.round(resultPerHead),
      pctArrobaPor100g,
    };

    return {
      header,
      dimensions,
      assets,
      herdComposition,
      zootechnical,
      financial,
      productionSystem,
    };
  }, [
    farm,
    productionSystem,
    averageHerdTable,
    showReproductiveIndices,
    rebanhoMedioAjustado,
    recriaRebanhoMedioAjustado,
    recriaTempoPermanenciaMeses,
    requiredSales,
    recriaPesoCompra,
    recriaPesoVenda,
    totalUAsAjustado,
    lotacaoCabHa,
    producaoArrobaHa,
    gmdGlobal,
    fertility,
    prePartumLoss,
    calfMortality,
    weaningRate,
    recriaGmd,
    cicloGmdPosDesmame,
    financialCalculations,
    resultOnLandValue,
    resultOnLivestockAsset,
    valorRebanhoCalculado,
    resultPerHectare,
    result,
    revenue,
    totalDisbursement,
    marginOverSale,
    disbursementPerArroba,
    disbursementPerCalf,
    disbursementPerHeadMonth,
    averageMonthlyDisbursement,
    resultPerHead,
    recriaValorVenda,
  ]);

  const handleSaveReport = useCallback(async () => {
    if (!user?.id || !reportData || isSavingReport) return;
    setIsSavingReport(true);
    try {
      const base64 = generateAgilePlanningReportPDFAsBase64(reportData);
      const reportName = `Planejamento Ágil - ${reportData.header.farmName} - ${new Date().toLocaleDateString('pt-BR')}`;
      await saveReportPdf(user.id, reportName, base64, 'agile_planning_pdf', {
        clientId: selectedClient?.id ?? null,
        farmId: selectedFarm?.id ?? null,
        farmName: reportData.header.farmName || null,
      });
      onToast?.('Relatório salvo em Meus Salvos.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível salvar o relatório.';
      onToast?.(msg, 'error');
    } finally {
      setIsSavingReport(false);
    }
  }, [user?.id, reportData, selectedClient?.id, selectedFarm?.id, onToast, isSavingReport]);

  // ============================================================================
  // FUNÇÕES DE CARREGAMENTO
  // ============================================================================

  const loadFarmsForClient = useCallback(
    async (clientId: string) => {
      // Validação de entrada
      if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
        setFarms([]);
        return;
      }

      try {
        // Fonte canônica: farms.client_id
        const { data: farmsData, error } = await supabase
          .from('farms')
          .select('*')
          .eq('client_id', clientId)
          .order('name', { ascending: true });

        if (error) {
          console.error('[AgilePlanning] Error loading client farms:', error);
          onToast?.('Erro ao carregar fazendas da organização.', 'error');
          setFarms([]);
          return;
        }

        const farmsForClient = farmsData ? mapFarmsFromDatabase(farmsData) : [];
        setFarms(farmsForClient);

        if (farmsForClient.length > 0) {
          setTempSelectedFarm(prev => prev || farmsForClient[0]);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error('[AgilePlanning] Unexpected error:', errorMessage, err);
        onToast?.('Erro inesperado ao carregar fazendas.', 'error');
        setFarms([]);
      }
    },
    [onToast],
  );

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Inicializar quando cliente/fazenda selecionados
  useEffect(() => {
    if (selectedClient && farm) {
      setIsLoading(false);
      setShowSelectionModal(false);
      setProductionSystem(farm.productionSystem || '');
    } else {
      setIsLoading(false);
      setShowSelectionModal(true);
      // Só carrega clientes se user estiver disponível
      if (user) {
        // Carregar clientes diretamente aqui para evitar dependência circular
        const fetchClients = async () => {
          try {
            // Validação de user
            if (!user?.id) {
              console.warn('[AgilePlanning] User ID not available');
              return;
            }

            const headers = await getAuthHeaders();
            const res = await fetch('/api/organizations?limit=100', { headers });
            const json = await res.json() as { ok: boolean; data?: Array<{ id: string; name: string; phone?: string | null; email?: string | null; analystId?: string | null; createdAt?: string; updatedAt?: string }>; error?: string };

            if (!json.ok) {
              console.error('[AgilePlanning] Error loading organizations:', json.error);
              onToast?.('Erro ao carregar organizações. Tente novamente.', 'error');
              return;
            }

            const data = json.data ?? [];
            if (data.length > 0) {
              const mappedClients: Client[] = data
                .filter(o => o?.id && o?.name)
                .map(o => ({
                  id: o.id,
                  name: o.name,
                  phone: o.phone || '',
                  email: o.email || '',
                  analystId: o.analystId || null,
                  createdAt: o.createdAt || new Date().toISOString(),
                  updatedAt: o.updatedAt || new Date().toISOString(),
                }));

              setClients(mappedClients);
              if (mappedClients.length > 0) {
                setTempSelectedClient(prev => prev || mappedClients[0]);
              }
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
            console.error('[AgilePlanning] Unexpected error:', errorMessage, err);
            onToast?.('Erro inesperado ao carregar organizações.', 'error');
          }
        };
        fetchClients();
      }
    }
  }, [selectedClient, farm, user, onToast]);

  useEffect(() => {
    if (tempSelectedClient) {
      loadFarmsForClient(tempSelectedClient.id);
    }
  }, [tempSelectedClient, loadFarmsForClient]);

  // Atualizar percentuais quando sistema de produção mudar
  useEffect(() => {
    if (productionSystem) {
      const initialPercentages = getInitialPercentages(productionSystem);
      setAnimalCategories(prev =>
        prev.map(cat => ({
          ...cat,
          percentage: initialPercentages[cat.id] ?? cat.percentage,
        })),
      );
    }
  }, [productionSystem]);

  // Sincronizar valor de venda do slider com a tabela de categorias (Recria-Engorda)
  useEffect(() => {
    if (productionSystem === 'Recria-Engorda') {
      setAnimalCategories(prev =>
        prev.map(cat => (cat.id === CATEGORY_IDS.BOI_GORDO ? { ...cat, valuePerKg: recriaValorVenda } : cat)),
      );
    }
  }, [productionSystem, recriaValorVenda]);

  // Atualizar margem esperada quando sistema de produção mudar
  useEffect(() => {
    setExpectedMargin(marginConfig.default);
  }, [marginConfig.default]);

  // Atualizar pesos das categorias quando os sliders de peso ao desmame mudarem
  useEffect(() => {
    setAnimalCategories(prev =>
      prev.map(cat => {
        if (cat.id === CATEGORY_IDS.BEZERRO) {
          // Peso ao desmame de machos = Bezerro Desm.
          return { ...cat, weight: maleWeaningWeight };
        }
        if (cat.id === CATEGORY_IDS.BEZERRA) {
          // Peso ao desmame de fêmeas = Bezerra Desm.
          return { ...cat, weight: femaleWeaningWeight };
        }
        return cat;
      }),
    );
  }, [maleWeaningWeight, femaleWeaningWeight]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleConfirmSelection = useCallback(() => {
    if (tempSelectedClient && tempSelectedFarm) {
      setSelectedClient(tempSelectedClient);
      setSelectedFarm(tempSelectedFarm);
      setShowSelectionModal(false);
      onToast?.('Organização e fazenda selecionadas com sucesso!', 'success');
    } else {
      onToast?.('Por favor, selecione uma organização e uma fazenda', 'warning');
    }
  }, [tempSelectedClient, tempSelectedFarm, setSelectedClient, setSelectedFarm, onToast]);

  // Handlers memoizados para melhor performance (devem estar antes de qualquer return condicional)
  const handleProductionSystemChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Farm['productionSystem'] | '';
    // Validação de segurança
    if (value === '' || ['Cria', 'Ciclo Completo', 'Recria-Engorda'].includes(value)) {
      setProductionSystem(value);
    }
  }, []);

  const handleAnalysisMethodChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'ancoragem' | 'desempenho';
    // Validação de segurança
    if (value === 'ancoragem' || value === 'desempenho') {
      setAnalysisMethod(value);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ai-accent" />
      </div>
    );
  }

  // Modal de seleção de cliente e fazenda
  if (showSelectionModal) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-ai-bg">
        <div className="bg-white rounded-lg border border-ai-border shadow-lg p-6 max-w-2xl w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-ai-accent/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-ai-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ai-text">Seleção Necessária</h2>
              <p className="text-sm text-ai-subtext">
                Para acessar o Planejamento Ágil, é necessário selecionar uma organização e uma fazenda.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Seletor de Organização */}
            <div>
              <label className="block text-sm font-medium text-ai-text mb-2">
                Organização <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={tempSelectedClient?.id || ''}
                  onChange={e => {
                    const client = clients.find(c => c.id === e.target.value);
                    setTempSelectedClient(client || null);
                    setTempSelectedFarm(null);
                  }}
                  className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                >
                  <option value="">Selecione uma organização</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} - {client.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Seletor de Fazenda */}
            {tempSelectedClient && (
              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">
                  Fazenda <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {farms.length === 0 ? (
                    <div className="px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-subtext">
                      Nenhuma fazenda vinculada a esta organização
                    </div>
                  ) : (
                    <select
                      value={tempSelectedFarm?.id || ''}
                      onChange={e => {
                        const farm = farms.find(f => f.id === e.target.value);
                        setTempSelectedFarm(farm || null);
                      }}
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    >
                      <option value="">Selecione uma fazenda</option>
                      {farms.map(farm => (
                        <option key={farm.id} value={farm.id}>
                          {farm.name} - {farm.city}, {farm.state}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-3 pt-4 border-t border-ai-border">
              <button
                onClick={handleConfirmSelection}
                disabled={!tempSelectedClient || !tempSelectedFarm}
                className="flex-1 px-4 py-2 bg-ai-accent text-white rounded-md font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Confirmar Seleção
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showReportView && reportData) {
    return (
      <AgilePlanningReportView
        data={reportData}
        onExportPDF={() => generateAgilePlanningReportPDF(reportData)}
        onBack={() => setShowReportView(false)}
        onSave={user?.id ? handleSaveReport : undefined}
        isSaving={isSavingReport}
      />
    );
  }

  // Tela principal do Planejamento Ágil
  return (
    <div className="h-full flex flex-col p-6 bg-ai-bg">
      {/* Header - Sistema de Produção e Informações da Fazenda */}
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm text-ai-subtext flex-wrap">
          {/* Ver Relatório */}
          {selectedFarm && reportData && (
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowReportView(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ai-accent text-white text-xs font-medium rounded-md hover:bg-ai-accentHover transition-colors"
              >
                Ver Relatório
              </button>
            </div>
          )}
          {/* Sistema de Produção */}
          {selectedFarm && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <label className="text-ai-subtext text-xs leading-tight">
                <span className="block">Sistema de</span>
                <span className="block">Produção:</span>
              </label>
              <select
                value={productionSystem}
                onChange={handleProductionSystemChange}
                className="px-2 py-1 bg-ai-surface2 border border-ai-border rounded-md text-ai-text text-xs focus:outline-none focus:ring-2 focus:ring-ai-accent min-w-[130px] max-w-[150px] flex-shrink-0"
              >
                <option value="">Selecione...</option>
                <option value="Cria">Cria</option>
                <option value="Ciclo Completo">Ciclo Completo</option>
                <option value="Recria-Engorda">Recria-Engorda</option>
              </select>
            </div>
          )}

          {/* Método de Análise */}
          {selectedFarm && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <label className="text-ai-subtext text-xs whitespace-nowrap">Método:</label>
              <select
                value={analysisMethod}
                onChange={handleAnalysisMethodChange}
                disabled={true}
                className="px-2 py-1 bg-ai-surface2 border border-ai-border rounded-md text-ai-text text-xs focus:outline-none focus:ring-2 focus:ring-ai-accent min-w-[130px] max-w-[150px] flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="ancoragem">Ancoragem de Resultado</option>
                <option value="desempenho">Resultado pelo Desempenho</option>
              </select>
            </div>
          )}

          {/* Informações da Fazenda */}
          {selectedFarm && (
            <div className="flex items-start gap-2 pl-2 border-l border-ai-border flex-shrink-0 min-w-0">
              {/* Valor Total da Fazenda */}
              {farm?.propertyValue && isValidNumber(farm.propertyValue) && (
                <div className="flex flex-col gap-0.5 whitespace-nowrap">
                  <span className="text-ai-subtext text-[10px]">Valor Total</span>
                  <span className="font-semibold text-ai-text text-xs">{formatCurrency(farm.propertyValue)}</span>
                </div>
              )}

              {/* Valor Operação Pecuária */}
              {farm?.operationPecuary && isValidNumber(farm.operationPecuary) && (
                <>
                  <div className="h-7 w-px bg-ai-border flex-shrink-0 self-stretch" />
                  <div className="flex flex-col gap-0.5 whitespace-nowrap">
                    <span className="text-ai-subtext text-[10px]">Op. Pecuária</span>
                    <span className="font-semibold text-ai-text text-xs">{formatCurrency(farm.operationPecuary)}</span>
                  </div>
                </>
              )}

              {/* Área Produtiva Pecuária */}
              {selectedFarm.pastureArea && isValidNumber(selectedFarm.pastureArea) && (
                <>
                  <div className="h-7 w-px bg-ai-border flex-shrink-0 self-stretch" />
                  <div className="flex flex-col gap-0.5 whitespace-nowrap flex-shrink-0 min-w-fit">
                    <span className="text-ai-subtext text-[10px]">Área Pecuária</span>
                    <span className="font-semibold text-ai-text text-xs">{formatArea(selectedFarm.pastureArea)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="bg-white rounded-lg border border-ai-border p-4 min-h-0">
        <div className="max-w-6xl mx-auto">
          {/* Barras de Deslizamento com Valores ao Lado */}
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Barra de Percentual de Investimento com Valor Calculado */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-ai-text mb-1">Percentual de Investimento</label>
                  <div className="relative pt-3 pb-1">
                    {/* Track */}
                    <div className="relative h-1.5 bg-gray-200 rounded-full overflow-visible">
                      {/* Área destacada (4% a 9%) */}
                      <div
                        className="absolute top-0 bottom-0 bg-blue-300/40 rounded-full border-l border-r border-blue-500"
                        style={{
                          left: `${((4 - 2) / (11 - 2)) * 100}%`,
                          width: `${((9 - 4) / (11 - 2)) * 100}%`,
                        }}
                      />

                      {/* Marcadores reduzidos */}
                      <div className="absolute -top-3 left-0 right-0 flex justify-between px-0.5">
                        {[2, 4, 6, 8, 10, 11].map(val => (
                          <div key={val} className="flex flex-col items-center">
                            <div className={`w-0.5 h-0.5 ${val >= 4 && val <= 9 ? 'bg-blue-500' : 'bg-gray-400'}`} />
                            <span
                              className={`text-[8px] mt-0.5 ${val >= 4 && val <= 9 ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
                            >
                              {val}%
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Input Range */}
                      <input
                        type="range"
                        min={2}
                        max={11}
                        step={0.1}
                        value={percentage}
                        onChange={e => setPercentage(parseFloat(e.target.value))}
                        onInput={e => setPercentage(parseFloat((e.target as HTMLInputElement).value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-40"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                      />

                      {/* Thumb menor */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-600 rounded-full border border-white shadow z-20 pointer-events-none transition-all duration-75"
                        style={{ left: `${((percentage - 2) / (11 - 2)) * 100}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        {/* Tooltip menor */}
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-semibold px-1 py-0.5 rounded whitespace-nowrap shadow">
                          {percentage.toFixed(1)}%
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-blue-600"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Valor Calculado - Compacto */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-1.5 border border-blue-200 min-w-[140px]">
                  <div className="text-[8px] text-blue-700 mb-0 font-medium">Valor Calculado</div>
                  <div className="text-[12.6px] font-bold text-blue-900">{formatCurrency(calculatedValue)}</div>
                  <div className="text-[7px] text-blue-600 bg-blue-50 rounded px-1 py-0.5 border border-blue-200 mt-0.5">
                    {percentage.toFixed(1)}% × {formatCurrency(operationPecuaryValue)}
                  </div>
                </div>
              </div>

              {/* Barra de Margem Esperada com Faturamento Necessário */}
              {productionSystem && (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-ai-text mb-1">Margem Esperada</label>
                    {(() => {
                      const { min, max } = marginConfig;
                      const step = 0.5;
                      const range = max - min;
                      const marks: number[] = [];
                      for (let i = min; i <= max; i += 5) {
                        marks.push(i);
                      }

                      return (
                        <div className="relative pt-3 pb-1">
                          {/* Track */}
                          <div className="relative h-1.5 bg-gray-200 rounded-full overflow-visible">
                            {/* Área destacada */}
                            <div
                              className="absolute top-0 bottom-0 bg-green-300/40 rounded-full"
                              style={{ left: '0%', width: '100%' }}
                            />

                            {/* Marcadores reduzidos */}
                            <div className="absolute -top-3 left-0 right-0 flex justify-between px-0.5">
                              {marks.map(val => (
                                <div key={val} className="flex flex-col items-center">
                                  <div className="w-0.5 h-0.5 bg-green-500" />
                                  <span className="text-[8px] mt-0.5 text-green-600 font-semibold">{val}%</span>
                                </div>
                              ))}
                            </div>

                            {/* Input Range */}
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={step}
                              value={expectedMargin}
                              onChange={e => setExpectedMargin(parseFloat(e.target.value))}
                              onInput={e => setExpectedMargin(parseFloat((e.target as HTMLInputElement).value))}
                              className="absolute right-0 bottom-0 w-full h-full opacity-0 cursor-pointer z-40"
                              style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            />

                            {/* Thumb menor */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-green-600 rounded-full border border-white shadow z-20 pointer-events-none transition-all duration-75"
                              style={{
                                left: `${safeDivide((expectedMargin - min) * 100, range)}%`,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              {/* Tooltip menor */}
                              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-semibold px-1 py-0.5 rounded whitespace-nowrap shadow">
                                {expectedMargin.toFixed(1)}%
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-green-600"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Faturamento Necessário - Compacto */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-1.5 border border-purple-200 min-w-[140px]">
                    <div className="text-[8px] text-purple-700 mb-0 font-medium">Faturamento Necessário</div>
                    <div className="text-[12.6px] font-bold text-purple-900">{formatCurrency(requiredRevenue)}</div>
                    <div className="text-[7px] text-purple-600 bg-purple-50 rounded px-1 py-0.5 border border-purple-200 mt-0.5">
                      {formatCurrency(calculatedValue)} ÷ {expectedMargin.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Valor Médio de Venda */}
          <div className="mb-4">
            <div className="flex items-stretch gap-4">
              {/* Caixa de Valor Médio */}
              <div className="bg-white border border-ai-border/70 rounded-lg p-2 min-w-[180px] flex flex-col">
                <div className="pb-1.5 mb-2 border-b border-ai-border/60">
                  <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text">Valores</h3>
                </div>
                {isPercentageSumValid ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between pb-2 border-b border-ai-border/60">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-ai-subtext leading-tight">
                          Valor Médio de
                          <br />
                          Venda
                        </span>
                        {productionSystem !== 'Recria-Engorda' && (
                          <button
                            onClick={() => setIsModalOpen(true)}
                            className="p-0.5 rounded hover:bg-ai-surface2 transition-colors"
                            title="Editar categorias"
                            aria-label="Editar categorias"
                          >
                            <Edit3 size={12} className="text-ai-accent" />
                          </button>
                        )}
                      </div>
                      <span className="text-[12.6px] font-bold text-ai-text">{formatCurrency(averageValue)}</span>
                    </div>
                    <div
                      className={`flex items-start justify-between ${showReproductiveIndices || productionSystem === 'Recria-Engorda' ? 'pb-2 border-b border-ai-border/60' : ''}`}
                    >
                      <span className="text-[9px] text-ai-subtext leading-tight">
                        Vendas
                        <br />
                        Necessárias
                      </span>
                      <span className="text-[12.6px] font-bold text-ai-text">
                        {requiredSales > 0 ? `${requiredSales} Cabeças` : '-'}
                      </span>
                    </div>
                    {productionSystem === 'Recria-Engorda' && (
                      <div className="flex items-start justify-between">
                        <span className="text-[9px] text-ai-subtext leading-tight">
                          Rebanho
                          <br />
                          Médio
                        </span>
                        <span className="text-[12.6px] font-bold text-ai-text">
                          {recriaRebanhoMedioAjustado > 0 ? `${Math.round(recriaRebanhoMedioAjustado)} Cabeças` : '-'}
                        </span>
                      </div>
                    )}
                    {showReproductiveIndices && (
                      <>
                        <div className="flex items-start justify-between pb-2 border-b border-ai-border/60">
                          <span className="text-[9px] text-ai-subtext leading-tight">
                            Matrizes
                            <br />
                            Necessárias
                          </span>
                          <span className="text-[12.6px] font-bold text-ai-text">
                            {requiredMatrixes > 0 ? `${requiredMatrixes} Matrizes` : '-'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-ai-subtext leading-tight">
                              Rebanho
                              <br />
                              Médio
                            </span>
                            <button
                              onClick={() => setIsAverageHerdModalOpen(true)}
                              className="p-0.5 rounded hover:bg-ai-surface2 transition-colors"
                              title="Ver detalhes do rebanho médio"
                              aria-label="Ver detalhes do rebanho médio"
                            >
                              <Edit3 size={12} className="text-ai-accent" />
                            </button>
                          </div>
                          <span className="text-[12.6px] font-bold text-ai-text">
                            {rebanhoMedioAjustado > 0 ? `${Math.round(rebanhoMedioAjustado)} Cabeças` : '-'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between pt-1 border-t border-ai-border/40">
                          <span className="text-[9px] text-ai-subtext leading-tight">
                            Total
                            <br />
                            UAs
                          </span>
                          <span className="text-[12.6px] font-bold text-ai-text">
                            {totalUAsAjustado > 0 ? `${Math.round(totalUAsAjustado)} UA's` : '-'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-red-600 flex items-center gap-1">
                    <AlertCircle size={16} />
                    Soma deve ser 100%
                  </div>
                )}
              </div>

              {/* Card de Índices de Referência - Recria-Engorda (na mesma linha que Valores) */}
              {productionSystem === 'Recria-Engorda' && (
                <div className="bg-white border border-ai-border/70 rounded-lg p-1 flex-1 flex flex-col min-w-0">
                  <div className="pb-0.5 mb-1 border-b border-ai-border/60">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text">
                      Índices de Referência
                    </h3>
                  </div>
                  <div className="flex flex-col justify-between flex-1 gap-1">
                    {/* Ganho Médio Diário */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Ganho Médio Diário</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          {recriaGmd.toFixed(2)} kg/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">0,40</span>
                        <input
                          type="range"
                          min={0.4}
                          max={1.1}
                          step={0.01}
                          value={recriaGmd}
                          onChange={e => setRecriaGmd(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">1,10</span>
                      </div>
                    </div>

                    {/* Mortalidade */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Mortalidade</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          {recriaMortalidade.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">0,2%</span>
                        <input
                          type="range"
                          min={0.2}
                          max={2}
                          step={0.1}
                          value={recriaMortalidade}
                          onChange={e => setRecriaMortalidade(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">2,0%</span>
                      </div>
                    </div>

                    {/* Rendimento de Carcaça */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Rend. de Carcaça</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          {recriaRendimentoCarcaca.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">50%</span>
                        <input
                          type="range"
                          min={50}
                          max={60}
                          step={0.5}
                          value={recriaRendimentoCarcaca}
                          onChange={e => setRecriaRendimentoCarcaca(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">60%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Card de Valores de Compra e Venda - Recria-Engorda */}
              {productionSystem === 'Recria-Engorda' && (
                <div className="bg-white border border-ai-border/70 rounded-lg p-1 flex-1 flex flex-col min-w-0">
                  <div className="pb-0.5 mb-1 border-b border-ai-border/60">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text">
                      Valores de Compra e Venda
                    </h3>
                  </div>
                  <div className="flex flex-col justify-between flex-1 gap-1">
                    {/* Peso de Compra */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Peso de Compra</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          {recriaPesoCompra} kg
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">160</span>
                        <input
                          type="range"
                          min={160}
                          max={400}
                          step={5}
                          value={recriaPesoCompra}
                          onChange={e => setRecriaPesoCompra(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">400</span>
                      </div>
                    </div>

                    {/* Valor de Compra */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Valor de Compra</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          R$ {recriaValorCompra.toFixed(2)}/kg
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">R$10</span>
                        <input
                          type="range"
                          min={10}
                          max={20}
                          step={0.5}
                          value={recriaValorCompra}
                          onChange={e => setRecriaValorCompra(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">R$20</span>
                      </div>
                    </div>

                    {/* Peso de Venda */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Peso de Venda</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          {recriaPesoVenda} kg
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">360</span>
                        <input
                          type="range"
                          min={360}
                          max={600}
                          step={5}
                          value={recriaPesoVenda}
                          onChange={e => setRecriaPesoVenda(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">600</span>
                      </div>
                    </div>

                    {/* Valor de Venda */}
                    <div>
                      <div className="flex items-center justify-between text-[9px] mb-0.5">
                        <label className="text-ai-subtext">Valor de Venda</label>
                        <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                          R$ {recriaValorVenda.toFixed(2)}/@
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">R$260</span>
                        <input
                          type="range"
                          min={260}
                          max={360}
                          step={5}
                          value={recriaValorVenda}
                          onChange={e => setRecriaValorVenda(parseFloat(e.target.value))}
                          className="flex-1 accent-ai-accent h-1.5"
                        />
                        <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">R$360</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Resultados de Performance - Recria-Engorda */}
              {productionSystem === 'Recria-Engorda' && (
                <div className="bg-white border border-ai-border/70 rounded-lg p-2 min-w-[150px] flex flex-col">
                  <div className="pb-1.5 mb-2 border-b border-ai-border/60 flex items-center justify-between gap-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text">
                      Resultados de Performance
                    </h3>
                    <button
                      onClick={() => setIsRecriaIndicatorsModalOpen(true)}
                      className="p-1 rounded hover:bg-ai-surface2 transition-colors"
                      title="Selecionar indicadores"
                      aria-label="Selecionar indicadores"
                    >
                      <ListChecks size={14} className="text-ai-subtext" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {visibleRecriaPerformanceIndicators.map((indicator, index, list) => (
                      <div
                        key={indicator.id}
                        className={`flex items-center justify-between ${index < list.length - 1 ? 'pb-2 border-b border-ai-border/60' : ''}`}
                      >
                        <span className="text-[9px] text-ai-subtext">{indicator.label}</span>
                        <span className="text-[12.6px] font-bold text-ai-text">
                          {indicator.value > 0 ? indicator.format(indicator.value) : '-'}
                        </span>
                      </div>
                    ))}
                    {visibleRecriaPerformanceIndicators.length === 0 && (
                      <div className="text-[9px] text-ai-subtext">Selecione indicadores</div>
                    )}
                  </div>
                </div>
              )}

              {showReproductiveIndices && (
                <div className="flex gap-3 flex-1 items-stretch">
                  <div className="bg-white border border-ai-border/70 rounded-lg p-2 flex flex-col min-w-0 flex-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text pb-1.5 mb-2 border-b border-ai-border/60">
                      Índices Reprodutivos
                    </h3>
                    <div className="flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Fertilidade</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {fertility.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0">70%</span>
                          <input
                            type="range"
                            min={70}
                            max={90}
                            step={0.5}
                            value={fertility}
                            onChange={e => setFertility(parseFloat(e.target.value))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0 text-right">90%</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Perda Pré Parto</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {prePartumLoss.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0">3%</span>
                          <input
                            type="range"
                            min={3}
                            max={15}
                            step={0.5}
                            value={prePartumLoss}
                            onChange={e => setPrePartumLoss(parseFloat(e.target.value))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0 text-right">15%</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Mortalidade de Bezerros</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {calfMortality.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0">1,5%</span>
                          <input
                            type="range"
                            min={1.5}
                            max={7}
                            step={0.1}
                            value={calfMortality}
                            onChange={e => setCalfMortality(parseFloat(e.target.value))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-7 flex-shrink-0 text-right">7%</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Peso ao desmame de machos</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {maleWeaningWeight} kg
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">170 kg</span>
                          <input
                            type="range"
                            min={170}
                            max={260}
                            step={1}
                            value={maleWeaningWeight}
                            onChange={e => setMaleWeaningWeight(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">260 kg</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Peso ao desmame de fêmeas</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {femaleWeaningWeight} kg
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">170 kg</span>
                          <input
                            type="range"
                            min={170}
                            max={260}
                            step={1}
                            value={femaleWeaningWeight}
                            onChange={e => setFemaleWeaningWeight(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">260 kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-ai-border/70 rounded-lg p-2 flex flex-col min-w-0 flex-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text pb-1.5 mb-2 border-b border-ai-border/60">
                      Índices Reprodutivos
                    </h3>
                    <div className="flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Venda bezerras ao desmame</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {vendaBezerrasAoDesmame}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">0%</span>
                          <input
                            type="range"
                            min={0}
                            max={70}
                            step={5}
                            value={vendaBezerrasAoDesmame}
                            onChange={e => setVendaBezerrasAoDesmame(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">70%</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Idade a primeira monta</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {firstMatingAge} meses
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">12 meses</span>
                          <input
                            type="range"
                            min={12}
                            max={24}
                            step={1}
                            value={firstMatingAge}
                            onChange={e => setFirstMatingAge(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">24 meses</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Peso a primeira monta</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {pesoPrimeiraMonta} kg
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">270 kg</span>
                          <input
                            type="range"
                            min={270}
                            max={360}
                            step={1}
                            value={pesoPrimeiraMonta}
                            onChange={e => setPesoPrimeiraMonta(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">360 kg</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <label className="text-ai-subtext">Tempo de monta</label>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {matingPeriodDays} dias
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">40 dias</span>
                          <input
                            type="range"
                            min={40}
                            max={120}
                            step={1}
                            value={matingPeriodDays}
                            onChange={e => setMatingPeriodDays(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">120 dias</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <div
                            className="flex items-center gap-1 relative"
                            ref={el => {
                              weightInfoRefs.current['cowSlaughter'] = el;
                            }}
                          >
                            <label className="text-ai-subtext">Dias para abate de vacas</label>
                            <button
                              ref={el => {
                                weightButtonRefs.current['cowSlaughter'] = el;
                              }}
                              type="button"
                              onClick={() => handleWeightInfoToggle('cowSlaughter')}
                              className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                              title="Mais informações"
                              aria-label="Mais informações"
                            >
                              <Info size={10} />
                            </button>
                            {weightCalculationInfoOpen === 'cowSlaughter' && popoverPositions.cowSlaughter && (
                              <div
                                className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                  top: popoverPositions.cowSlaughter.top,
                                  left: popoverPositions.cowSlaughter.left,
                                }}
                              >
                                <p className="font-medium text-gray-800 mb-1 text-left">Dias para abate de vacas</p>
                                <p className="text-[10px] text-left">
                                  Dias necessários para terminação das matrizes vazias após o desmame.
                                </p>
                              </div>
                            )}
                          </div>
                          <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                            {cowSlaughterDays} dias
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">0 dias</span>
                          <input
                            type="range"
                            min={0}
                            max={90}
                            step={1}
                            value={cowSlaughterDays}
                            onChange={e => setCowSlaughterDays(parseInt(e.target.value, 10))}
                            className="flex-1 accent-ai-accent h-1.5"
                          />
                          <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">90 dias</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {productionSystem === 'Ciclo Completo' && (
                    <div className="bg-white border border-ai-border/70 rounded-lg p-2 flex flex-col min-w-0 flex-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-wide text-ai-text pb-1.5 mb-2 border-b border-ai-border/60">
                        INDICES RECRIA TERMINAÇÃO
                      </h3>
                      <div className="flex flex-col justify-between flex-1 gap-2">
                        <div>
                          <div className="flex items-center justify-between text-[9px] mb-0.5">
                            <label className="text-ai-subtext">Venda bezerros ao desmame</label>
                            <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                              {cicloVendaAoDesmame}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">0%</span>
                            <input
                              type="range"
                              min={0}
                              max={90}
                              step={10}
                              value={cicloVendaAoDesmame}
                              onChange={e => setCicloVendaAoDesmame(parseInt(e.target.value, 10))}
                              className="flex-1 accent-ai-accent h-1.5"
                            />
                            <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">90%</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[9px] mb-0.5">
                            <label className="text-ai-subtext">GMD Pós desmame</label>
                            <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                              {cicloGmdPosDesmame.toFixed(2)} kg/dia
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">0,4</span>
                            <input
                              type="range"
                              min={0.4}
                              max={1.1}
                              step={0.05}
                              value={cicloGmdPosDesmame}
                              onChange={e => setCicloGmdPosDesmame(parseFloat(e.target.value))}
                              className="flex-1 accent-ai-accent h-1.5"
                            />
                            <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">1,1</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[9px] mb-0.5">
                            <label className="text-ai-subtext">Peso ao Abate M</label>
                            <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                              {cicloPesoAbate} kg
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0">480</span>
                            <input
                              type="range"
                              min={480}
                              max={600}
                              step={5}
                              value={cicloPesoAbate}
                              onChange={e => setCicloPesoAbate(parseInt(e.target.value, 10))}
                              className="flex-1 accent-ai-accent h-1.5"
                            />
                            <span className="text-[7px] text-ai-subtext w-9 flex-shrink-0 text-right">600</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[9px] mb-0.5">
                            <label className="text-ai-subtext">Rendimento de Carcaça</label>
                            <span className="font-semibold text-ai-text bg-ai-surface2/70 border border-ai-border/70 rounded px-1.5 py-0.5">
                              {cicloRendimentoCarcaca.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0">48%</span>
                            <input
                              type="range"
                              min={48}
                              max={60}
                              step={0.5}
                              value={cicloRendimentoCarcaca}
                              onChange={e => setCicloRendimentoCarcaca(parseFloat(e.target.value))}
                              className="flex-1 accent-ai-accent h-1.5"
                            />
                            <span className="text-[7px] text-ai-subtext w-8 flex-shrink-0 text-right">60%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card de Outputs Calculados */}
                  <div className="bg-white border border-ai-border/70 rounded-lg p-2 min-w-[120px] flex flex-col">
                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-ai-border/60">
                      <h3 className="text-[9px] font-bold uppercase tracking-wide text-ai-text">
                        Resultados de Performance
                      </h3>
                      <button
                        onClick={() => setIsIndicatorsModalOpen(true)}
                        className="p-1 rounded hover:bg-ai-surface2 transition-colors"
                        title="Selecionar indicadores"
                        aria-label="Selecionar indicadores"
                      >
                        <ListChecks size={14} className="text-ai-subtext" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {visiblePerformanceIndicators.map((indicator, index, list) => (
                        <div
                          key={indicator.id}
                          className={`flex items-center justify-between ${index < list.length - 1 ? 'pb-2 border-b border-ai-border/60' : ''}`}
                        >
                          <span className="text-[8px] text-ai-subtext">{indicator.label}</span>
                          <span className="text-xs font-bold text-ai-text">
                            {indicator.value > 0 ? indicator.format(indicator.value) : '-'}
                          </span>
                        </div>
                      ))}
                      {visiblePerformanceIndicators.length === 0 && (
                        <div className="text-[8px] text-ai-subtext">Selecione indicadores</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bloco Finanças */}
          <div className="mb-4">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-1.5 border border-indigo-200">
              <h3 className="text-[8px] font-semibold text-indigo-700 mb-1">
                Finanças: <span className="text-green-700">Meta de Resultado: {formatCurrency(calculatedValue)}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1.5">
                {/* Coluna A: Receita/Desembolso (Recria-Engorda: + Invest. Reposição, Desemb. Produção) */}
                <div className="space-y-0.5">
                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Receita</div>
                    <div className="text-xs font-bold text-indigo-900 leading-tight">
                      {isFinite(revenue) && revenue !== 0 ? formatCurrency(revenue) : '-'}
                    </div>
                    {isFinite(revenue) && revenue !== 0 && requiredSales > 0 && (
                      <div className="text-[6px] text-indigo-500 mt-0 leading-tight">
                        {formatCurrency(safeDivide(revenue, requiredSales))} × {requiredSales} cabeças
                      </div>
                    )}
                  </div>

                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso Total</div>
                    <div className="text-xs font-bold text-indigo-900 leading-tight">
                      {isFinite(totalDisbursement) && totalDisbursement !== 0 ? formatCurrency(totalDisbursement) : '-'}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Custo operacional efetivo</div>
                  </div>

                  {productionSystem === 'Recria-Engorda' && (
                    <>
                      <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                        <div className="text-[7px] text-indigo-600 mb-0 font-medium">Investimento em Reposição</div>
                        <div className="text-xs font-bold text-indigo-900 leading-tight">
                          {investimentoReposicao > 0 ? formatCurrency(investimentoReposicao) : '-'}
                        </div>
                        <div className="text-[6px] text-indigo-500 mt-0 leading-tight">
                          Peso compra × valor compra × vendas
                        </div>
                      </div>
                      <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                        <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso Produção</div>
                        <div className="text-xs font-bold text-indigo-900 leading-tight">
                          {desembolsoProducao > 0 ? formatCurrency(desembolsoProducao) : '-'}
                        </div>
                        <div className="text-[6px] text-indigo-500 mt-0 leading-tight">
                          Receita - invest. reposição - resultado esperado
                        </div>
                      </div>
                    </>
                  )}

                </div>

                {/* Coluna B: Valor do rebanho (calculado) / Desembolso/@ / Desembolso/Cab/mês (ou Desembolso/Bezerro para Cria) */}
                <div className="space-y-0.5">
                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Valor do rebanho</div>
                    <div className="text-xs font-bold text-indigo-900 leading-tight">
                      {valorRebanhoCalculado > 0 ? formatCurrency(valorRebanhoCalculado) : '-'}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Ativo pecuário calculado</div>
                  </div>

                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso/@</div>
                    <div className="text-xs font-bold text-indigo-900 leading-tight">
                      {formatIndicatorValue(disbursementPerArroba, 'currency', hasDisbursementPerArrobaData)}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Custo por arroba produzida</div>
                  </div>

                  {productionSystem === 'Recria-Engorda' && (
                    <>
                      <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                        <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso/Cab/Mês</div>
                        <div className="text-xs font-bold text-indigo-900 leading-tight">
                          {formatIndicatorValue(disbursementPerHeadMonth, 'currency1', hasDisbursementPerCalfData)}
                        </div>
                        <div className="text-[6px] text-indigo-500 mt-0 leading-tight">
                          Desembolso total por cabeça ao mês
                        </div>
                      </div>
                      {recriaGmd * 10 * recriaValorVenda > 0 && (
                        <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                          <div className="text-[7px] text-indigo-600 mb-0 font-medium">% @/100g</div>
                          <div className="text-xs font-bold text-indigo-900 leading-tight">
                            {((disbursementPerHeadMonth / (recriaGmd * 10 * recriaValorVenda)) * 100).toFixed(1)}%
                          </div>
                          <div className="text-[6px] text-indigo-500 mt-0 leading-tight">
                            Desemb./cab/mês ÷ (GMD×10) ÷ valor @. Ideal até 7%
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {productionSystem === 'Ciclo Completo' && (
                    <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                      <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso/Cab/Mês</div>
                      <div className="text-xs font-bold text-indigo-900 leading-tight">
                        {formatIndicatorValue(disbursementPerHeadMonth, 'currency1', hasDisbursementPerCalfData)}
                      </div>
                      <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Desembolso total por cabeça ao mês</div>
                    </div>
                  )}
                  {productionSystem === 'Cria' && (
                    <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                      <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso/Bezerro</div>
                      <div className="text-xs font-bold text-indigo-900 leading-tight">
                        {formatIndicatorValue(disbursementPerCalf, 'currency', hasDisbursementPerCalfData)}
                      </div>
                      <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Custo por animal desmamado</div>
                    </div>
                  )}

                  {showReproductiveIndices && !isRecriaTerminacao && (
                    <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                      <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso/Cab/Mês</div>
                      <div className="text-xs font-bold text-indigo-900 leading-tight">
                        {isFinite(disbursementPerHeadMonth) && disbursementPerHeadMonth !== 0
                          ? formatIndicatorValue(disbursementPerHeadMonth, 'currency1', true)
                          : '-'}
                      </div>
                      <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Custo de manutenção mensal</div>
                    </div>
                  )}
                </div>

                {/* Coluna C: Resultado por ha / Resultado por Cabeça / Margem sobre a venda */}
                <div className="space-y-0.5">
                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Resultado/ha</div>
                    <div
                      className={`text-xs font-bold leading-tight ${isFinite(resultPerHectare) && resultPerHectare >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {isFinite(resultPerHectare) && resultPerHectare !== 0 ? formatCurrency(resultPerHectare) : '-'}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Lucro por hectare de pasto</div>
                  </div>

                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Resultado por Cabeça</div>
                    <div
                      className={`text-xs font-bold leading-tight ${hasResultPerHeadData && isFinite(resultPerHead) && resultPerHead >= 0 ? 'text-green-700' : hasResultPerHeadData ? 'text-red-700' : 'text-indigo-900'}`}
                    >
                      {formatIndicatorValue(resultPerHead, 'currency', hasResultPerHeadData)}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Lucro médio por animal</div>
                  </div>

                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Margem Sobre a Venda</div>
                    <div
                      className={`text-xs font-bold leading-tight ${isFinite(marginOverSale) && marginOverSale >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {isFinite(marginOverSale) && marginOverSale !== 0 ? `${marginOverSale.toFixed(1)}%` : '-'}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Rentabilidade operacional</div>
                  </div>
                </div>

                {/* Coluna D: Resultado sobre ativo Pecuário / Resultado sobre o valor da terra / Desembolso Médio Mensal */}
                <div className="space-y-0.5">
                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Resultado Sobre Ativo Pecuário</div>
                    <div
                      className={`text-xs font-bold leading-tight ${hasResultOnLivestockAssetData && isFinite(resultOnLivestockAsset) && resultOnLivestockAsset >= 0 ? 'text-green-700' : hasResultOnLivestockAssetData ? 'text-red-700' : 'text-indigo-900'}`}
                    >
                      {formatIndicatorValue(resultOnLivestockAsset, 'percentage', hasResultOnLivestockAssetData)}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Retorno sobre o rebanho</div>
                  </div>

                  <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                    <div className="text-[7px] text-indigo-600 mb-0 font-medium">Resultado Sobre Valor da Terra</div>
                    <div
                      className={`text-xs font-bold leading-tight ${hasResultOnLandValueData && isFinite(resultOnLandValue) && resultOnLandValue >= 0 ? 'text-green-700' : hasResultOnLandValueData ? 'text-red-700' : 'text-indigo-900'}`}
                    >
                      {formatIndicatorValue(resultOnLandValue, 'percentage', hasResultOnLandValueData)}
                    </div>
                    <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Retorno patrimonial imobiliário</div>
                  </div>

                  {showReproductiveIndices && (
                    <div className="bg-white/70 rounded-md px-1 py-0.5 border border-indigo-200/50">
                      <div className="text-[7px] text-indigo-600 mb-0 font-medium">Desembolso Médio Mensal</div>
                      <div className="text-xs font-bold text-indigo-900 leading-tight">
                        {formatIndicatorValue(
                          averageMonthlyDisbursement,
                          'currency',
                          hasAverageMonthlyDisbursementData,
                        )}
                      </div>
                      <div className="text-[6px] text-indigo-500 mt-0 leading-tight">Média de gastos operacionais</div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal - Seleção de Indicadores */}
      {isIndicatorsModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setIsIndicatorsModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-ai-border flex items-center justify-between bg-gradient-to-r from-ai-accent/10 to-transparent">
              <div className="flex flex-col">
                <h2 className="text-base font-bold text-ai-text">Selecionar Indicadores</h2>
                <span className="text-[10px] text-ai-subtext">Escolha até {MAX_PERFORMANCE_INDICATORS}</span>
              </div>
              <button
                onClick={() => setIsIndicatorsModalOpen(false)}
                className="p-2 hover:bg-ai-surface2 rounded-lg transition-colors"
                title="Fechar"
              >
                <X size={18} className="text-ai-subtext" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {performanceIndicators.map(indicator => {
                  const isChecked = selectedIndicators.includes(indicator.id);
                  const isDisabled = !isChecked && selectedIndicators.length >= MAX_PERFORMANCE_INDICATORS;
                  return (
                    <label
                      key={indicator.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border border-ai-border/70 px-3 py-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-ai-surface2/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleIndicatorSelection(indicator.id)}
                          className="accent-ai-accent"
                        />
                        <span className="text-sm text-ai-text">{indicator.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-ai-border bg-ai-surface flex items-center justify-between">
              <span className="text-xs text-ai-subtext">
                Selecionados: {selectedIndicators.length}/{MAX_PERFORMANCE_INDICATORS}
              </span>
              <button
                onClick={() => setIsIndicatorsModalOpen(false)}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accentHover transition-colors font-medium"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Seleção de Indicadores Recria-Engorda */}
      {isRecriaIndicatorsModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setIsRecriaIndicatorsModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-ai-border flex items-center justify-between bg-gradient-to-r from-ai-accent/10 to-transparent">
              <div className="flex flex-col">
                <h2 className="text-base font-bold text-ai-text">Selecionar Indicadores</h2>
                <span className="text-[10px] text-ai-subtext">Escolha até {MAX_RECRIA_PERFORMANCE_INDICATORS}</span>
              </div>
              <button
                onClick={() => setIsRecriaIndicatorsModalOpen(false)}
                className="p-2 hover:bg-ai-surface2 rounded-lg transition-colors"
                title="Fechar"
              >
                <X size={18} className="text-ai-subtext" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {recriaPerformanceIndicators.map(indicator => {
                  const isChecked = selectedRecriaIndicators.includes(indicator.id);
                  const isDisabled =
                    !isChecked && selectedRecriaIndicators.length >= MAX_RECRIA_PERFORMANCE_INDICATORS;
                  return (
                    <label
                      key={indicator.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border border-ai-border/70 px-3 py-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-ai-surface2/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleRecriaIndicatorSelection(indicator.id)}
                          className="accent-ai-accent"
                        />
                        <span className="text-sm text-ai-text">{indicator.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-ai-border bg-ai-surface flex items-center justify-between">
              <span className="text-xs text-ai-subtext">
                Selecionados: {selectedRecriaIndicators.length}/{MAX_RECRIA_PERFORMANCE_INDICATORS}
              </span>
              <button
                onClick={() => setIsRecriaIndicatorsModalOpen(false)}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accentHover transition-colors font-medium"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Tabela de Rebanho Médio */}
      {isAverageHerdModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setIsAverageHerdModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-ai-border flex items-center justify-between bg-gradient-to-r from-ai-accent/10 to-transparent">
              <h2 className="text-lg font-bold text-ai-text">Rebanho Médio</h2>
              <button
                onClick={() => setIsAverageHerdModalOpen(false)}
                className="p-2 hover:bg-ai-surface2 rounded-lg transition-colors"
                title="Fechar"
              >
                <X size={20} className="text-ai-subtext" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ai-surface2 border-b border-ai-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text">Categoria</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-ai-text">Quantidade (Cabeças)</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-ai-text">Tempo (meses)</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-ai-text">Rebanho médio</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-ai-text">Peso Vivo (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ai-border">
                    <tr className="hover:bg-ai-surface2/50">
                      <td className="px-4 py-3 text-sm text-ai-text font-medium">Matrizes</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.vacas > 0 ? averageHerdTable.vacas : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['tempoMatrizes'] = el;
                          }}
                        >
                          <span>{averageHerdTable.vacas > 0 ? averageHerdTable.tempoVacas.toFixed(1) : '-'}</span>
                          {averageHerdTable.vacas > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['tempoMatrizes'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('tempoMatrizes')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'tempoMatrizes' && popoverPositions.tempoMatrizes && (
                                <div
                                  className="fixed z-[100] w-64 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                  style={{
                                    top: popoverPositions.tempoMatrizes.top,
                                    left: popoverPositions.tempoMatrizes.left,
                                  }}
                                >
                                  <p className="font-medium text-gray-800 mb-1 text-left">Tempo (meses) - Matrizes</p>
                                  <p className="text-[10px] text-left mb-2">
                                    Permanência de fêmeas em reprodução e fêmeas descarte considerando período de monta
                                    e dias para abate de vacas.
                                  </p>
                                  <div className="text-[10px] text-left pt-2 border-t border-gray-200">
                                    <strong>Fórmula:</strong> (282 + Tempo de monta + Dias para abate) / 30,4
                                    <br />
                                    <strong>Cálculo:</strong> (282 + {matingPeriodDays} + {cowSlaughterDays}) / 30,4 ={' '}
                                    <strong>{averageHerdTable.tempoVacas.toFixed(1)} meses</strong>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.vacas > 0
                          ? ((averageHerdTable.vacas * averageHerdTable.tempoVacas) / 12).toLocaleString('pt-BR', {
                            maximumFractionDigits: 0,
                          })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['matrizes'] = el;
                          }}
                        >
                          <span>
                            {averageHerdTable.vacas > 0
                              ? Math.round(averageHerdTable.pesoIndividualVaca).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                          {averageHerdTable.vacas > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['matrizes'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('matrizes')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'matrizes' &&
                                popoverPositions.matrizes &&
                                (() => {
                                  const { ARROBA_TO_KG, MATRIZ_WEIGHT_FACTOR } = HERD_CONSTANTS;
                                  const vacaDescarteCategory = animalCategories.find(
                                    c => c.id === CATEGORY_IDS.VACA_DESCARTE,
                                  );
                                  const pesoVacaDescarteArroba = vacaDescarteCategory?.weight || 0;
                                  const pesoCalculado = pesoVacaDescarteArroba * ARROBA_TO_KG * MATRIZ_WEIGHT_FACTOR;
                                  return (
                                    <div
                                      className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.matrizes.top,
                                        left: popoverPositions.matrizes.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">1. Matrizes</p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          • <strong>Fórmula:</strong> Peso Vaca Descarte (@) × 30 × 97%
                                        </div>
                                        <div>• O peso da Vaca Descarte é convertido de arrobas para kg (× 30)</div>
                                        <div>• Aplicado 97% para refletir o peso médio das matrizes em produção</div>
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                          <strong>Exemplo:</strong> {pesoVacaDescarteArroba} @ × 30 × 0,97 ={' '}
                                          <strong>{pesoCalculado.toFixed(1)} kg</strong>
                                        </div>
                                      </p>
                                    </div>
                                  );
                                })()}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-ai-surface2/50">
                      <td className="px-4 py-3 text-sm text-ai-text font-medium">Bezerros mamando</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.bezerrosMamando > 0 ? averageHerdTable.bezerrosMamando : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text">
                        <div className="flex items-center justify-center gap-2">
                          <span>{averageHerdTable.bezerrosMamando > 0 ? averageHerdTable.tempoBezerros : '-'}</span>
                          {averageHerdTable.bezerrosMamando > 0 && (
                            <button
                              type="button"
                              onClick={() => setIsWeaningAgeOpen(v => !v)}
                              className="p-1 rounded hover:bg-ai-surface2 transition-colors"
                              title="Selecione a idade ao desmame"
                              aria-label="Selecione a idade ao desmame"
                            >
                              <Edit3 size={12} className="text-ai-accent" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.bezerrosMamando > 0
                          ? (
                            (averageHerdTable.bezerrosMamando * averageHerdTable.tempoBezerros) /
                            12
                          ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['bezerros'] = el;
                          }}
                        >
                          <span>
                            {averageHerdTable.bezerrosMamando > 0
                              ? Math.round(averageHerdTable.pesoIndividualBezerro).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                          {averageHerdTable.bezerrosMamando > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['bezerros'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('bezerros')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'bezerros' &&
                                popoverPositions.bezerros &&
                                (() => {
                                  const { BEZERRO_WEIGHT_ADJUSTMENT } = HERD_CONSTANTS;
                                  const pesoMedioDesmame = (maleWeaningWeight + femaleWeaningWeight) / 2;
                                  const pesoMedioAjustado = pesoMedioDesmame - BEZERRO_WEIGHT_ADJUSTMENT;
                                  const pesoMedioBezerroMamando = pesoMedioAjustado / 2;
                                  return (
                                    <div
                                      className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.bezerros.top,
                                        left: popoverPositions.bezerros.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">2. Bezerros mamando</p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          <strong>Passo 1:</strong> Peso médio ao desmame = (Peso machos + Peso fêmeas)
                                          / 2
                                        </div>
                                        <div>
                                          <strong>Passo 2:</strong> Peso médio ao desmame - {BEZERRO_WEIGHT_ADJUSTMENT}{' '}
                                          kg
                                        </div>
                                        <div>
                                          <strong>Passo 3:</strong> Resultado do Passo 2 / 2
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                          <strong>Exemplo:</strong>
                                          <br />
                                          Passo 1: ({maleWeaningWeight} + {femaleWeaningWeight}) / 2 ={' '}
                                          <strong>{pesoMedioDesmame.toFixed(1)} kg</strong>
                                          <br />
                                          Passo 2: {pesoMedioDesmame.toFixed(1)} - {BEZERRO_WEIGHT_ADJUSTMENT} ={' '}
                                          <strong>{pesoMedioAjustado.toFixed(1)} kg</strong>
                                          <br />
                                          Passo 3: {pesoMedioAjustado.toFixed(1)} / 2 ={' '}
                                          <strong>{pesoMedioBezerroMamando.toFixed(1)} kg</strong>
                                        </div>
                                      </p>
                                    </div>
                                  );
                                })()}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isWeaningAgeOpen && averageHerdTable.bezerrosMamando > 0 && (
                      <tr className="bg-ai-surface2/30">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-ai-text">Selecione a idade ao desmame</span>
                              <span className="text-xs font-bold text-ai-text">{weaningAgeMonths} meses</span>
                            </div>

                            <input
                              type="range"
                              min={4}
                              max={8}
                              step={1}
                              value={weaningAgeMonths}
                              onChange={e => {
                                const next = parseInt(e.target.value, 10);
                                setWeaningAgeMonths(isFinite(next) ? next : 7);
                              }}
                              className="w-full accent-ai-accent h-2"
                            />

                            <div className="flex items-center justify-between text-[10px] text-ai-subtext">
                              <span>4 meses</span>
                              <span>8 meses</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-ai-surface2/50">
                      <td className="px-4 py-3 text-sm text-ai-text font-medium">
                        Novilhas {weaningAgeMonths + 1} a 12 meses
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.novilhas8a12 > 0 ? averageHerdTable.novilhas8a12 : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text">
                        {averageHerdTable.novilhas8a12 > 0 ? averageHerdTable.tempoNovilhas8a12 : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.novilhas8a12 > 0
                          ? (
                            (averageHerdTable.novilhas8a12 * averageHerdTable.tempoNovilhas8a12) /
                            12
                          ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['novilhas8a12'] = el;
                          }}
                        >
                          <span>
                            {averageHerdTable.novilhas8a12 > 0
                              ? Math.round(averageHerdTable.pesoIndividualNovilha8a12).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                          {averageHerdTable.novilhas8a12 > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['novilhas8a12'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('novilhas8a12')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'novilhas8a12' &&
                                popoverPositions.novilhas8a12 &&
                                (() => {
                                  const periodoAteMonta = firstMatingAge - weaningAgeMonths;
                                  const ganhoTotal = pesoPrimeiraMonta - femaleWeaningWeight;
                                  const ganhoMensal = periodoAteMonta > 0 ? ganhoTotal / periodoAteMonta : 0;
                                  const mesesAte12Meses = 12 - weaningAgeMonths;
                                  const pesoAos12Meses = femaleWeaningWeight + ganhoMensal * mesesAte12Meses;
                                  return (
                                    <div
                                      className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.novilhas8a12.top,
                                        left: popoverPositions.novilhas8a12.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">
                                        3. Novilhas {weaningAgeMonths + 1} a 12 meses
                                      </p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          • A novilha entra em monta aos <strong>{pesoPrimeiraMonta} kg</strong> aos{' '}
                                          <strong>{firstMatingAge} meses</strong>
                                        </div>
                                        <div>
                                          • <strong>Ganho Total:</strong> {pesoPrimeiraMonta} kg - Peso ao Desmame (
                                          {femaleWeaningWeight} kg) = <strong>{ganhoTotal} kg</strong>
                                        </div>
                                        <div>
                                          • <strong>Período:</strong> {firstMatingAge} meses - {weaningAgeMonths} meses
                                          = <strong>{periodoAteMonta} meses</strong>
                                        </div>
                                        {periodoAteMonta > 0 && (
                                          <>
                                            <div>
                                              • <strong>Ganho Mensal:</strong> {ganhoTotal} kg ÷ {periodoAteMonta} meses
                                              = <strong>{ganhoMensal.toFixed(2)} kg/mês</strong>
                                            </div>
                                            <div>
                                              • <strong>Peso aos 12 meses:</strong> {femaleWeaningWeight} kg + (
                                              {ganhoMensal.toFixed(2)} × {mesesAte12Meses}) ={' '}
                                              <strong>{pesoAos12Meses.toFixed(1)} kg</strong>
                                            </div>
                                            <div>
                                              • <strong>Peso Médio:</strong> ({femaleWeaningWeight} +{' '}
                                              {pesoAos12Meses.toFixed(1)}) / 2 ={' '}
                                              <strong>
                                                {averageHerdTable.pesoIndividualNovilha8a12.toFixed(1)} kg
                                              </strong>
                                            </div>
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  );
                                })()}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-ai-surface2/50">
                      <td className="px-4 py-3 text-sm text-ai-text font-medium">Novilhas 13 a 24 meses</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.novilhas13a24 > 0 ? averageHerdTable.novilhas13a24 : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text">
                        {averageHerdTable.novilhas13a24 > 0 ? averageHerdTable.tempoNovilhas13a24 : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.novilhas13a24 > 0
                          ? (
                            (averageHerdTable.novilhas13a24 * averageHerdTable.tempoNovilhas13a24) /
                            12
                          ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['novilhas13a24'] = el;
                          }}
                        >
                          <span>
                            {averageHerdTable.novilhas13a24 > 0
                              ? Math.round(averageHerdTable.pesoIndividualNovilha13a24).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                          {averageHerdTable.novilhas13a24 > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['novilhas13a24'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('novilhas13a24')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'novilhas13a24' &&
                                popoverPositions.novilhas13a24 &&
                                (() => {
                                  const periodoAteMonta = firstMatingAge - weaningAgeMonths;
                                  const ganhoTotal = pesoPrimeiraMonta - femaleWeaningWeight;
                                  const ganhoMensal = periodoAteMonta > 0 ? ganhoTotal / periodoAteMonta : 0;
                                  const mesesAte13Meses = 13 - weaningAgeMonths;
                                  const pesoAos13Meses = femaleWeaningWeight + ganhoMensal * mesesAte13Meses;
                                  return (
                                    <div
                                      className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.novilhas13a24.top,
                                        left: popoverPositions.novilhas13a24.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">
                                        4. Novilhas 13 a 24 meses
                                      </p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          • A novilha entra em monta aos <strong>{pesoPrimeiraMonta} kg</strong> aos{' '}
                                          <strong>{firstMatingAge} meses</strong>
                                        </div>
                                        <div>
                                          • <strong>Ganho Total:</strong> {pesoPrimeiraMonta} kg - Peso ao Desmame (
                                          {femaleWeaningWeight} kg) = <strong>{ganhoTotal} kg</strong>
                                        </div>
                                        <div>
                                          • <strong>Período:</strong> {firstMatingAge} meses - {weaningAgeMonths} meses
                                          = <strong>{periodoAteMonta} meses</strong>
                                        </div>
                                        {periodoAteMonta > 0 && (
                                          <>
                                            <div>
                                              • <strong>Ganho Mensal:</strong> {ganhoTotal} kg ÷ {periodoAteMonta} meses
                                              = <strong>{ganhoMensal.toFixed(2)} kg/mês</strong>
                                            </div>
                                            <div>
                                              • <strong>Peso aos 13 meses:</strong> {femaleWeaningWeight} kg + (
                                              {ganhoMensal.toFixed(2)} × {mesesAte13Meses}) ={' '}
                                              <strong>{pesoAos13Meses.toFixed(1)} kg</strong>
                                            </div>
                                            <div>
                                              • <strong>Peso Médio:</strong> ({pesoAos13Meses.toFixed(1)} +{' '}
                                              {pesoPrimeiraMonta}) / 2 ={' '}
                                              <strong>
                                                {averageHerdTable.pesoIndividualNovilha13a24.toFixed(1)} kg
                                              </strong>
                                            </div>
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  );
                                })()}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {productionSystem === 'Ciclo Completo' && (
                      <>
                        <tr className="hover:bg-ai-surface2/50">
                          <td className="px-4 py-3 text-sm text-ai-text font-medium">Machos 8 a 12 meses</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos8a12 > 0 ? averageHerdTable.machos8a12 : '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-ai-text">
                            <div
                              className="flex items-center justify-center gap-1 relative"
                              ref={el => {
                                weightInfoRefs.current['machos8a12'] = el;
                              }}
                            >
                              <span>
                                {averageHerdTable.machos8a12 > 0 ? averageHerdTable.tempoMachos8a12.toFixed(1) : '-'}
                              </span>
                              {averageHerdTable.machos8a12 > 0 && (
                                <>
                                  <button
                                    ref={el => {
                                      weightButtonRefs.current['machos8a12'] = el;
                                    }}
                                    type="button"
                                    onClick={() => handleWeightInfoToggle('machos8a12')}
                                    className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                    title="Explicação do cálculo"
                                    aria-label="Explicação do cálculo"
                                  >
                                    <Info size={10} />
                                  </button>
                                  {weightCalculationInfoOpen === 'machos8a12' && popoverPositions.machos8a12 && (
                                    <div
                                      className="fixed z-[100] w-64 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.machos8a12.top,
                                        left: popoverPositions.machos8a12.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">
                                        Machos 8 a 12 meses (Ciclo Completo)
                                      </p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          <strong>Quantidade:</strong> (Matrizes × Taxa desmame) / 2 × (1 - Venda ao
                                          desmame %)
                                        </div>
                                        <div>
                                          <strong>Tempo:</strong> 5 meses
                                        </div>
                                        <div>
                                          <strong>Peso:</strong> Média entre peso aos 8 e 12 meses (curva GMD pós
                                          desmame)
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                          {averageHerdTable.vacas} × {(weaningRate * 100).toFixed(1)}% / 2 × (1 -{' '}
                                          {cicloVendaAoDesmame}%) = <strong>{averageHerdTable.machos8a12}</strong>{' '}
                                          cabeças
                                        </div>
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos8a12 > 0
                              ? (
                                (averageHerdTable.machos8a12 * averageHerdTable.tempoMachos8a12) /
                                12
                              ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos8a12 > 0
                              ? Math.round(averageHerdTable.pesoIndividualMachos8a12).toLocaleString('pt-BR')
                              : '-'}
                          </td>
                        </tr>
                        <tr className="hover:bg-ai-surface2/50">
                          <td className="px-4 py-3 text-sm text-ai-text font-medium">Machos 13 a 24 meses</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos13a24 > 0 ? averageHerdTable.machos13a24 : '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-ai-text">
                            <div
                              className="flex items-center justify-center gap-1 relative"
                              ref={el => {
                                weightInfoRefs.current['machos13a24'] = el;
                              }}
                            >
                              <span>
                                {averageHerdTable.machos13a24 > 0 ? averageHerdTable.tempoMachos13a24.toFixed(1) : '-'}
                              </span>
                              {averageHerdTable.machos13a24 > 0 && (
                                <>
                                  <button
                                    ref={el => {
                                      weightButtonRefs.current['machos13a24'] = el;
                                    }}
                                    type="button"
                                    onClick={() => handleWeightInfoToggle('machos13a24')}
                                    className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                    title="Explicação do cálculo"
                                    aria-label="Explicação do cálculo"
                                  >
                                    <Info size={10} />
                                  </button>
                                  {weightCalculationInfoOpen === 'machos13a24' && popoverPositions.machos13a24 && (
                                    <div
                                      className="fixed z-[100] w-64 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: popoverPositions.machos13a24.top,
                                        left: popoverPositions.machos13a24.left,
                                      }}
                                    >
                                      <p className="font-medium text-gray-800 mb-1 text-left">
                                        Machos 13 a 24 meses (Ciclo Completo)
                                      </p>
                                      <p className="text-[10px] space-y-1 text-left">
                                        <div>
                                          <strong>Quantidade:</strong> mesma de Machos 8-12
                                        </div>
                                        <div>
                                          <strong>Tempo:</strong> (Total dias pós-desmame / 30,4) - 12 meses
                                        </div>
                                        <div>
                                          Total dias = ({cicloPesoAbate} - {maleWeaningWeight}) /{' '}
                                          {cicloGmdPosDesmame.toFixed(2)} ={' '}
                                          {(
                                            (cicloPesoAbate - maleWeaningWeight) /
                                            cicloGmdPosDesmame
                                          ).toFixed(0)}{' '}
                                          dias
                                        </div>
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos13a24 > 0
                              ? (
                                (averageHerdTable.machos13a24 * averageHerdTable.tempoMachos13a24) /
                                12
                              ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                            {averageHerdTable.machos13a24 > 0
                              ? Math.round(averageHerdTable.pesoIndividualMachos13a24).toLocaleString('pt-BR')
                              : '-'}
                          </td>
                        </tr>
                        {averageHerdTable.tempoMachos25a36 > 0 && (
                          <tr className="hover:bg-ai-surface2/50">
                            <td className="px-4 py-3 text-sm text-ai-text font-medium">Machos 25 a 36 meses</td>
                            <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                              {averageHerdTable.machos25a36}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-ai-text">
                              <div
                                className="flex items-center justify-center gap-1 relative"
                                ref={el => {
                                  weightInfoRefs.current['machos25a36'] = el;
                                }}
                              >
                                <span>{averageHerdTable.tempoMachos25a36.toFixed(1)}</span>
                                <button
                                  ref={el => {
                                    weightButtonRefs.current['machos25a36'] = el;
                                  }}
                                  type="button"
                                  onClick={() => handleWeightInfoToggle('machos25a36')}
                                  className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                  title="Explicação do cálculo"
                                  aria-label="Explicação do cálculo"
                                >
                                  <Info size={10} />
                                </button>
                                {weightCalculationInfoOpen === 'machos25a36' && popoverPositions.machos25a36 && (
                                  <div
                                    className="fixed z-[100] w-64 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                    style={{
                                      top: popoverPositions.machos25a36.top,
                                      left: popoverPositions.machos25a36.left,
                                    }}
                                  >
                                    <p className="font-medium text-gray-800 mb-1 text-left">
                                      Machos 25 a 36 meses (Ciclo Completo)
                                    </p>
                                    <p className="text-[10px] space-y-1 text-left">
                                      <div>
                                        Aparece quando tempo total pós-desmame &gt; 24 meses
                                      </div>
                                      <div>
                                        <strong>Quantidade:</strong> mesma de Machos 13-24
                                      </div>
                                      <div>
                                        <strong>Tempo:</strong> (Total dias / 30,4) - 24 meses
                                      </div>
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                              {(
                                (averageHerdTable.machos25a36 * averageHerdTable.tempoMachos25a36) /
                                12
                              ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                              {Math.round(averageHerdTable.pesoIndividualMachos25a36).toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                    <tr className="hover:bg-ai-surface2/50">
                      <td className="px-4 py-3 text-sm text-ai-text font-medium">
                        <div className="flex items-center gap-2">
                          <span>Touros</span>
                          <button
                            type="button"
                            onClick={() => setIsBullCowRatioOpen(v => !v)}
                            className="p-1 rounded hover:bg-ai-surface2 transition-colors"
                            title="Relação Matrizes/Touro (%)"
                            aria-label="Relação Matrizes/Touro (%)"
                          >
                            <Edit3 size={12} className="text-ai-accent" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.touros > 0 ? averageHerdTable.touros : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text">
                        {averageHerdTable.touros > 0 ? averageHerdTable.tempoTouros : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        {averageHerdTable.touros > 0
                          ? (
                            (averageHerdTable.touros * averageHerdTable.tempoTouros) /
                            12
                          ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-ai-text">
                        <div
                          className="flex items-center justify-center gap-1 relative"
                          ref={el => {
                            weightInfoRefs.current['touros'] = el;
                          }}
                        >
                          <span>
                            {averageHerdTable.touros > 0
                              ? Math.round(averageHerdTable.pesoIndividualTouro).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                          {averageHerdTable.touros > 0 && (
                            <>
                              <button
                                ref={el => {
                                  weightButtonRefs.current['touros'] = el;
                                }}
                                type="button"
                                onClick={() => handleWeightInfoToggle('touros')}
                                className="text-gray-300 hover:text-blue-500 transition-colors focus:outline-none"
                                title="Explicação do cálculo"
                                aria-label="Explicação do cálculo"
                              >
                                <Info size={10} />
                              </button>
                              {weightCalculationInfoOpen === 'touros' && popoverPositions.touros && (
                                <div
                                  className="fixed z-[100] w-56 p-2.5 bg-white rounded-lg shadow-2xl border border-gray-200 text-xs text-gray-600 leading-relaxed animate-in fade-in zoom-in-95 duration-200"
                                  style={{
                                    top: popoverPositions.touros.top,
                                    left: popoverPositions.touros.left,
                                  }}
                                >
                                  <p className="font-medium text-gray-800 mb-1 text-left">5. Touros</p>
                                  <p className="text-[10px] space-y-1 text-left">
                                    <div>
                                      • <strong>Peso Individual:</strong> {pesoMedioTouro} kg
                                    </div>
                                    <div>• Este valor pode ser ajustado na faixa de 600 a 900 kg</div>
                                    <div>• Representa o peso médio de touros adultos utilizados na reprodução</div>
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isBullCowRatioOpen && (
                      <tr className="bg-ai-surface2/30">
                        <td colSpan={5} className="px-4 py-3">
                          {(() => {
                            const vacas = averageHerdTable.vacas;
                            const totalTouros =
                              bullCowRatioPercent > 0 ? Math.ceil(vacas * (bullCowRatioPercent / 100)) : 0;
                            const matrizesPorTouro = totalTouros > 0 ? safeDivide(vacas, totalTouros) : 0;
                            const matrizesPorTouroDisplay = totalTouros > 0 ? Math.round(matrizesPorTouro) : 0;
                            const bullPercentLabel = `${bullCowRatioPercent.toFixed(1).replace('.', ',')}%`;

                            return (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Slider de Relação Matrizes/Touro */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-semibold text-ai-text">
                                        Relação Matrizes/touro (%)
                                      </span>
                                      <span className="text-xs font-bold text-ai-text">{bullPercentLabel}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={6}
                                      step={0.5}
                                      value={bullCowRatioPercent}
                                      onChange={e => {
                                        const next = parseFloat(e.target.value);
                                        setBullCowRatioPercent(isFinite(next) ? next : 0);
                                      }}
                                      className="w-full accent-ai-accent h-2"
                                    />
                                    <div className="text-xs font-semibold text-ai-text mt-1">
                                      {totalTouros > 0
                                        ? `${matrizesPorTouroDisplay} matrizes por touro`
                                        : '- matrizes por touro'}
                                    </div>
                                  </div>

                                  {/* Slider de Peso Médio */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-semibold text-ai-text">Peso Médio (kg)</span>
                                      <span className="text-xs font-bold text-ai-text">{pesoMedioTouro} kg</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={600}
                                      max={900}
                                      step={1}
                                      value={pesoMedioTouro}
                                      onChange={e => {
                                        const next = parseInt(e.target.value, 10);
                                        setPesoMedioTouro(isFinite(next) ? next : 710);
                                      }}
                                      className="w-full accent-ai-accent h-2"
                                    />
                                    <div className="flex items-center justify-between text-[7px] text-ai-subtext mt-1">
                                      <span>600 kg</span>
                                      <span>900 kg</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-ai-surface2 border-t-2 border-ai-border">
                    <tr>
                      <td className="px-4 py-3 text-sm text-ai-text font-bold">Total</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-ai-text">-</td>
                      <td className="px-4 py-3 text-center text-sm text-ai-text font-bold">-</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-ai-text">
                        {rebanhoMedioAjustado > 0
                          ? Math.round(rebanhoMedioAjustado).toLocaleString('pt-BR')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-ai-text">
                        {(() => {
                          // Peso Médio Ponderado = Σ(Quantidade × Peso Individual) / Σ(Quantidade)
                          const somaProdutoPesoQuantidade =
                            averageHerdTable.pesoVivoVacas +
                            averageHerdTable.pesoVivoBezerros +
                            averageHerdTable.pesoVivoNovilhas8a12 +
                            averageHerdTable.pesoVivoNovilhas13a24 +
                            averageHerdTable.pesoVivoMachos8a12 +
                            averageHerdTable.pesoVivoMachos13a24 +
                            averageHerdTable.pesoVivoMachos25a36 +
                            averageHerdTable.pesoVivoTouros;

                          const somaQuantidades =
                            averageHerdTable.vacas +
                            averageHerdTable.bezerrosMamando +
                            averageHerdTable.novilhas8a12 +
                            averageHerdTable.novilhas13a24 +
                            averageHerdTable.machos8a12 +
                            averageHerdTable.machos13a24 +
                            averageHerdTable.machos25a36 +
                            averageHerdTable.touros;

                          const pesoMedioPonderado =
                            somaQuantidades > 0 ? safeDivide(somaProdutoPesoQuantidade, somaQuantidades) : 0;

                          return pesoMedioPonderado > 0 ? Math.round(pesoMedioPonderado).toLocaleString('pt-BR') : '-';
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Resumo Calculado */}
            <div className="px-6 py-4 border-t border-ai-border bg-ai-surface2/50">
              {(() => {
                // Dados das categorias
                const categorias = [
                  {
                    quantidade: averageHerdTable.vacas,
                    tempo: averageHerdTable.tempoVacas,
                    peso: averageHerdTable.pesoIndividualVaca,
                  },
                  {
                    quantidade: averageHerdTable.bezerrosMamando,
                    tempo: averageHerdTable.tempoBezerros,
                    peso: averageHerdTable.pesoIndividualBezerro,
                  },
                  {
                    quantidade: averageHerdTable.novilhas8a12,
                    tempo: averageHerdTable.tempoNovilhas8a12,
                    peso: averageHerdTable.pesoIndividualNovilha8a12,
                  },
                  {
                    quantidade: averageHerdTable.novilhas13a24,
                    tempo: averageHerdTable.tempoNovilhas13a24,
                    peso: averageHerdTable.pesoIndividualNovilha13a24,
                  },
                  {
                    quantidade: averageHerdTable.machos8a12,
                    tempo: averageHerdTable.tempoMachos8a12,
                    peso: averageHerdTable.pesoIndividualMachos8a12,
                  },
                  {
                    quantidade: averageHerdTable.machos13a24,
                    tempo: averageHerdTable.tempoMachos13a24,
                    peso: averageHerdTable.pesoIndividualMachos13a24,
                  },
                  {
                    quantidade: averageHerdTable.machos25a36,
                    tempo: averageHerdTable.tempoMachos25a36,
                    peso: averageHerdTable.pesoIndividualMachos25a36,
                  },
                  {
                    quantidade: averageHerdTable.touros,
                    tempo: averageHerdTable.tempoTouros,
                    peso: averageHerdTable.pesoIndividualTouro,
                  },
                ];

                // Rebanho médio: Σ(quantidade × tempo) / 12
                const somaQtdTempo = categorias.reduce((sum, c) => sum + c.quantidade * c.tempo, 0);
                const fatorMortalidade = 1 + safeDivide(calfMortality, 100);
                const rebanhoMedioBase = somaQtdTempo / 12;
                const rebanhoMedio = rebanhoMedioBase * fatorMortalidade;

                // Total de UAs: Σ(quantidade × tempo × peso) / 12 / 450
                const somaQtdTempoPeso = categorias.reduce((sum, c) => sum + c.quantidade * c.tempo * c.peso, 0);
                const somaQtdTempoPesoAjustado = somaQtdTempoPeso * fatorMortalidade;
                const totalUAs = somaQtdTempoPesoAjustado / 12 / 450;

                // Peso médio em kg: Σ(quantidade × peso × tempo) / 12 / rebanho médio
                const pesoMedioKg = rebanhoMedio > 0 ? somaQtdTempoPesoAjustado / 12 / rebanhoMedio : 0;

                // Peso médio em UA: peso médio em kg / 450
                const pesoMedioUA = pesoMedioKg / 450;

                return (
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3 border border-ai-border/50">
                      <div className="text-[10px] text-ai-subtext uppercase tracking-wide mb-1">Rebanho Médio</div>
                      <div className="text-lg font-bold text-ai-text">{rebanhoMedio.toFixed(0)}</div>
                      <div className="text-[9px] text-ai-subtext">cabeças</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-ai-border/50">
                      <div className="text-[10px] text-ai-subtext uppercase tracking-wide mb-1">Total de UAs</div>
                      <div className="text-lg font-bold text-ai-text">{totalUAs.toFixed(1)}</div>
                      <div className="text-[9px] text-ai-subtext">unidades animais</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-ai-border/50">
                      <div className="text-[10px] text-ai-subtext uppercase tracking-wide mb-1">Peso Médio</div>
                      <div className="text-lg font-bold text-ai-text">{pesoMedioKg.toFixed(0)}</div>
                      <div className="text-[9px] text-ai-subtext">kg</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-ai-border/50">
                      <div className="text-[10px] text-ai-subtext uppercase tracking-wide mb-1">Peso Médio UA</div>
                      <div className="text-lg font-bold text-ai-text">{pesoMedioUA.toFixed(2)}</div>
                      <div className="text-[9px] text-ai-subtext">UA/cabeça</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer do Modal */}
            <div className="px-6 py-4 border-t border-ai-border bg-ai-surface flex items-center justify-end">
              <button
                onClick={() => setIsAverageHerdModalOpen(false)}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accentHover transition-colors font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Tabela de Categorias */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => {
            // Fecha o modal ao clicar no overlay (fundo escuro)
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-ai-border flex items-center justify-between bg-gradient-to-r from-ai-accent/10 to-transparent">
              <h2 className="text-lg font-bold text-ai-text">Editar Categorias de Animais</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-ai-surface2 rounded-lg transition-colors"
                title="Fechar"
              >
                <X size={20} className="text-ai-subtext" />
              </button>
            </div>

            {/* Conteúdo do Modal - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              {!isPercentageSumValid && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <span className="text-sm text-red-700 font-medium">
                    A soma dos percentuais deve ser exatamente 100%. Atualmente: {percentageSum.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ai-surface2 border-b border-ai-border">
                    <tr>
                      <th className="px-2 py-1 text-left text-[10px] font-semibold text-ai-text">
                        <div className="flex items-center gap-1">
                          Categoria
                          <button
                            onClick={handleAddCategory}
                            className="text-ai-accent hover:text-ai-accentHover"
                            title="Adicionar Categoria"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </th>
                      <th className="px-2 py-1 text-center text-[10px] font-semibold text-green-600 w-20">%</th>
                      <th className="px-2 py-1 text-center text-[10px] font-semibold text-ai-text w-24">Peso (kg/@)</th>
                      <th className="px-2 py-1 text-center text-[10px] font-semibold text-ai-text w-24">
                        Valor (kg/@)
                      </th>
                      <th className="px-2 py-1 text-center text-[10px] font-semibold text-ai-text w-28">Valor/cab</th>
                      <th className="px-2 py-1 text-center text-[10px] font-semibold text-ai-text w-24">Quantidade</th>
                      <th className="px-2 py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ai-border">
                    {animalCategories.map(category => {
                      const valuePerHead = calculateValuePerHead(category);
                      return (
                        <tr key={category.id} className="hover:bg-ai-surface2/50 group">
                          <td className="p-0">
                            <input
                              type="text"
                              value={category.name}
                              onChange={e => updateCategory(category.id, 'name', e.target.value)}
                              onFocus={e => e.target.select()}
                              onKeyDown={handleKeyDown}
                              className="w-full h-full px-2 py-2 text-xs border-0 bg-transparent focus:ring-2 focus:ring-inset focus:ring-ai-accent outline-none"
                            />
                          </td>
                          <td className="p-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                editingCell?.id === category.id && editingCell?.field === 'percentage'
                                  ? tempValue
                                  : category.percentage
                              }
                              onChange={e => handleNumericChange(category.id, 'percentage', e.target.value)}
                              onFocus={e => handleInputFocus(e, category.id, 'percentage')}
                              onBlur={handleInputBlur}
                              onKeyDown={handleKeyDown}
                              className="w-full h-full px-1 py-2 text-center text-[10px] border-0 bg-transparent text-green-600 font-bold focus:ring-2 focus:ring-inset focus:ring-ai-accent outline-none"
                            />
                          </td>
                          <td className="p-0 relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                editingCell?.id === category.id && editingCell?.field === 'weight'
                                  ? tempValue
                                  : formatNumberWithComma(category.weight)
                              }
                              onChange={e => handleNumericChange(category.id, 'weight', e.target.value)}
                              onFocus={e => handleInputFocus(e, category.id, 'weight')}
                              onBlur={handleInputBlur}
                              onKeyDown={handleKeyDown}
                              className="w-full h-full px-1 py-2 text-center text-[10px] border-0 bg-transparent focus:ring-2 focus:ring-inset focus:ring-ai-accent outline-none"
                            />
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-ai-subtext font-medium pointer-events-none">
                              {isKgCategory(category.id) ? 'kg' : '@'}
                            </span>
                          </td>
                          <td className="p-0 relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                editingCell?.id === category.id && editingCell?.field === 'valuePerKg'
                                  ? tempValue
                                  : formatNumberWithComma(category.valuePerKg)
                              }
                              onChange={e => handleNumericChange(category.id, 'valuePerKg', e.target.value)}
                              onFocus={e => handleInputFocus(e, category.id, 'valuePerKg')}
                              onBlur={handleInputBlur}
                              onKeyDown={handleKeyDown}
                              className="w-full h-full px-1 py-2 text-center text-[10px] border-0 bg-transparent focus:ring-2 focus:ring-inset focus:ring-ai-accent outline-none"
                            />
                          </td>
                          <td className="px-2 py-1 text-center text-ai-text font-semibold text-xs">
                            {formatCurrency(valuePerHead)}
                          </td>
                          <td className="px-2 py-1 text-center text-ai-text font-semibold text-[10px]">
                            {isPercentageSumValid ? calculateQuantity(category.percentage) : '-'}
                          </td>
                          <td className="px-1 py-1 text-center">
                            {animalCategories.length > 1 && (
                              <button
                                onClick={() => handleDeleteCategory(category.id)}
                                className="p-1 text-ai-subtext hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="Excluir categoria"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-ai-surface2 border-t-2 border-ai-border">
                    <tr>
                      <td className="px-2 py-1 text-ai-text font-bold text-xs">Total</td>
                      <td
                        className={`px-2 py-1 text-center font-bold text-xs ${isPercentageSumValid ? 'text-ai-text' : 'text-red-600'
                          }`}
                      >
                        {percentageSum.toFixed(1)}%
                        {!isPercentageSumValid && <span className="ml-1 text-[9px]">⚠️</span>}
                      </td>
                      <td className="px-2 py-1 text-center text-ai-subtext text-xs">-</td>
                      <td className="px-2 py-1 text-center text-ai-subtext text-xs">-</td>
                      <td className="px-2 py-1 text-center text-ai-text font-bold text-xs">
                        {isPercentageSumValid ? formatCurrency(averageValue) : '-'}
                      </td>
                      <td className="px-2 py-1 text-center text-ai-text font-bold text-xs">
                        {isPercentageSumValid ? requiredSales : '-'}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="px-6 py-4 border-t border-ai-border bg-ai-surface flex items-center justify-between">
              <div className="text-sm text-ai-subtext">
                {isPercentageSumValid ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 size={16} />
                    Percentuais corretos (100%)
                  </span>
                ) : (
                  <span className="text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle size={16} />
                    Ajuste para 100%
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accentHover transition-colors font-medium"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgilePlanning;
