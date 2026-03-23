import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Farm } from '../types';
import {
  Plus,
  ArrowLeft,
  MapPin,
  Building2,
  Scale,
  Dna,
  Factory,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  X,
  Info,
  Users,
  Loader2,
  Map,
} from 'lucide-react';
import { evaluateSafeExpression, isExpression } from '../lib/evaluateExpression';
import { useClient } from '../contexts/ClientContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import { useAuth } from '../contexts/AuthContext';
import {
  createFarm as apiFarmCreate,
  updateFarm as apiFarmUpdate,
  deactivateFarm as apiFarmDeactivate,
} from '../lib/api/farmsClient';
import FarmPermissionsModal from '../components/FarmPermissionsModal';
import FarmMapTab from '../components/FarmMapTab';
import {
  useFarmPermissions,
  useBatchFarmPermissions,
  FULL_ACCESS,
  NO_ACCESS,
  VIEW_ONLY,
  CLIENTE_ACCESS,
  type FarmPermissionsResult,
} from '../lib/permissions/useFarmPermissions';

interface FarmCardProps {
  farm: Farm;
  onEdit: (farm: Farm) => void;
  onDelete: (farmId: string) => void;
  onToggleActive: (farmId: string, currentActive: boolean) => void;
  onOpenPermissions: (farm: Farm) => void;
  canManagePermissions: boolean;
  perms: FarmPermissionsResult;
}

const FarmCard: React.FC<FarmCardProps> = ({
  farm,
  onEdit,
  onDelete,
  onToggleActive,
  onOpenPermissions,
  canManagePermissions,
  perms,
}) => {
  const [toggling, setToggling] = React.useState(false);
  if (perms.isHidden('farms:card')) return null;
  const canViewForm = perms.canView('farms:form');
  const canEdit = perms.canEdit('farms:form');
  const canDelete = perms.canEdit('farms:delete');
  const isViewOnly = canViewForm && !canEdit;
  return (
    <div className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col w-full min-h-[200px] ${farm.ativo === false ? 'border-red-200 opacity-70' : 'border-gray-200 hover:border-gray-800'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900 truncate">{farm.name}</h3>
        </div>
        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">
              {farm.city}, {farm.state}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Building2 size={12} className="flex-shrink-0" />
            <span className="truncate">{farm.propertyType}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Factory size={12} className="flex-shrink-0" />
            <span className="truncate">{farm.productionSystem}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Scale size={12} className="flex-shrink-0" />
            <span className="truncate">{farm.weightMetric}</span>
          </div>
          {farm.commercializesGenetics && (
            <div className="flex items-center gap-1.5 text-ai-accent">
              <Dna size={12} className="flex-shrink-0" />
              <span className="truncate">Comercializa genética</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-200">
        <button
          onClick={() => onEdit(farm)}
          disabled={!canViewForm}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isViewOnly ? <Eye size={14} /> : <Edit2 size={14} />}
          {isViewOnly ? 'Visualizar' : 'Editar'}
        </button>
        {canEdit && (
          <button
            type="button"
            disabled={toggling}
            onClick={async (e) => {
              e.stopPropagation();
              setToggling(true);
              await onToggleActive(farm.id, farm.ativo ?? true);
              setToggling(false);
            }}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              farm.ativo === false ? 'bg-gray-300' : 'bg-green-500'
            } ${toggling ? 'opacity-60 cursor-wait' : ''}`}
            role="switch"
            aria-checked={farm.ativo !== false}
            aria-label="Ativar ou desativar fazenda"
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                farm.ativo === false ? 'translate-x-0' : 'translate-x-4'
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
};

interface FarmManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// Estados brasileiros
const BRAZILIAN_STATES = [
  'Acre',
  'Alagoas',
  'Amapá',
  'Amazonas',
  'Bahia',
  'Ceará',
  'Distrito Federal',
  'Espírito Santo',
  'Goiás',
  'Maranhão',
  'Mato Grosso',
  'Mato Grosso do Sul',
  'Minas Gerais',
  'Pará',
  'Paraíba',
  'Paraná',
  'Pernambuco',
  'Piauí',
  'Rio de Janeiro',
  'Rio Grande do Norte',
  'Rio Grande do Sul',
  'Rondônia',
  'Roraima',
  'Santa Catarina',
  'São Paulo',
  'Sergipe',
  'Tocantins',
];

const FarmManagement: React.FC<FarmManagementProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const {
    farms: hierarchyFarms,
    organizations: hierarchyClients,
    loading: hierarchyLoading,
    refreshCurrentLevel,
  } = useHierarchy();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [view, setView] = useState<'list' | 'form'>('list');
  const availableClientsCount = hierarchyClients.length;
  const loadingClientsAvailability = hierarchyLoading.clients;

  // Notificar App.tsx sobre mudanças de view
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('farmViewChange', { detail: view }));
  }, [view]);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionsModalFarm, setPermissionsModalFarm] = useState<Farm | null>(null);
  const [areaWarning, setAreaWarning] = useState<string | null>(null);
  const [farmActiveTab, setFarmActiveTab] = useState<'dados' | 'mapa'>('dados');
  const isLoading = hierarchyLoading.farms;

  const isCliente = user?.qualification === 'cliente';
  const isAnalyst = user?.qualification === 'analista' && user?.role !== 'admin';
  const formPerms = useFarmPermissions(editingFarm?.id ?? null, user?.id, user?.role);
  const batchPerms = useBatchFarmPermissions(
    farms.map(f => f.id),
    user?.id,
    user?.role,
  );
  // Analista no cadastro de fazendas: permitir incluir, editar e excluir (acesso via organização).
  const effectiveFormPerms = isCliente ? CLIENTE_ACCESS : isAnalyst ? FULL_ACCESS : formPerms;
  const effectiveBatchPerms =
    isCliente
      ? Object.fromEntries(farms.map(f => [f.id, CLIENTE_ACCESS]))
      : isAnalyst
        ? Object.fromEntries(farms.map(f => [f.id, FULL_ACCESS]))
        : batchPerms;
  const formReadOnly = editingFarm ? !effectiveFormPerms.canEdit('farms:form') : false;
  const needsOrgForCreate = !editingFarm && !selectedClient && !(isCliente && user?.clientId);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    country: 'Brasil',
    state: '',
    city: '',
    // Dimensões
    totalArea: '',
    pastureArea: '',
    forageProductionArea: '',
    agricultureAreaOwned: '',
    agricultureAreaLeased: '',
    otherCrops: '',
    infrastructure: '',
    reserveAndAPP: '',
    otherArea: '',
    propertyValue: '',
    operationPecuary: '', // Operação pecuária
    operationAgricultural: '', // Operação Agrícola
    otherOperations: '', // Outras Operações
    agricultureVariation: 0, // Variação de -50% a +50%
    // Dados da propriedade
    propertyType: 'Própria' as Farm['propertyType'],
    weightMetric: 'Arroba (@)' as Farm['weightMetric'],
    // Dados do rebanho
    averageHerd: '',
    herdValue: '',
    commercializesGenetics: false,
    productionSystem: '' as Farm['productionSystem'] | '',
    // Controle
    ativo: true,
  });

  // Países disponíveis
  const COUNTRIES = ['Brasil', 'Paraguai', 'Uruguai', 'Bolívia', 'Colômbia', 'Argentina'];

  // Verificar se o estado deve ser obrigatório (apenas para Brasil)
  const isStateRequired = formData.country === 'Brasil';

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Helper function to format number with thousands separator (.) and 2 decimals (,)
  const formatNumberWithDecimals = (value: string): string => {
    if (!value) return '';

    // Remove all non-numeric characters except comma and dot
    let cleaned = value.replace(/[^\d,.]/g, '');

    // Check if value originally had a comma (user is typing decimal separator)
    const hasComma = cleaned.includes(',');

    // If there's both comma and dot, determine which is decimal separator
    if (cleaned.includes(',') && cleaned.includes('.')) {
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      if (lastComma > lastDot) {
        // Comma is decimal separator, remove all dots (they are thousands separators being typed)
        cleaned = cleaned.replace(/\./g, '');
      } else {
        // Dot is decimal separator, convert to comma
        cleaned = cleaned.replace(/,/g, '');
        cleaned = cleaned.replace('.', ',');
      }
    } else if (cleaned.includes('.')) {
      // Only dot - could be decimal separator or thousands separator
      // If it's near the end (last 3 chars), assume decimal separator
      if (cleaned.length - cleaned.indexOf('.') <= 3) {
        cleaned = cleaned.replace('.', ',');
      } else {
        // Otherwise assume it's thousands separator and remove it
        cleaned = cleaned.replace(/\./g, '');
      }
    }

    // Split by comma to separate integer and decimal parts
    const parts = cleaned.split(',');
    let integerPart = parts[0] || '';
    let decimalPart = parts[1] || '';

    // Limit decimal part to 2 digits
    decimalPart = decimalPart.slice(0, 2);

    // Add thousands separator (.) to integer part (from right to left, every 3 digits)
    if (integerPart) {
      // Remove existing dots first
      integerPart = integerPart.replace(/\./g, '');
      // Add thousands separator
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Combine parts - preserve comma if user typed it (hasComma) or if decimal part exists
    if (hasComma || decimalPart) {
      return `${integerPart},${decimalPart}`;
    }
    return integerPart;
  };

  // Helper function to parse number from formatted string
  const parseNumber = (value: string): number | undefined => {
    if (!value || value.trim() === '') return undefined;
    // Remove thousands separators (.) and replace comma with dot for decimal
    const cleaned = value.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  };

  // Handle numeric input change (for hectare fields)
  const handleNumericChange = (field: string, value: string) => {
    if (isExpression(value)) {
      setFormData({ ...formData, [field]: value });
    } else {
      const formatted = formatNumberWithDecimals(value);
      setFormData({ ...formData, [field]: formatted });
    }

    // Limpar erro de área total quando qualquer área for modificada
    if (
      errors.totalArea &&
      (field === 'totalArea' ||
        field === 'pastureArea' ||
        field === 'forageProductionArea' ||
        field === 'agricultureAreaOwned' ||
        field === 'agricultureAreaLeased' ||
        field === 'otherCrops' ||
        field === 'infrastructure' ||
        field === 'reserveAndAPP' ||
        field === 'otherArea')
    ) {
      setErrors({ ...errors, totalArea: '' });
    }
  };

  // Handle blur event to ensure 2 decimals are always shown; evaluates expressions
  const handleNumericBlur = (field: string) => {
    const currentValue = formData[field as keyof typeof formData] as string;
    if (!currentValue) return;

    if (isExpression(currentValue)) {
      const result = evaluateSafeExpression(currentValue);
      if (result !== null && result >= 0) {
        const formatted = formatNumberForDisplay(result);
        setFormData({ ...formData, [field]: formatted });
      }
      return;
    }

    const numValue = parseNumber(currentValue);
    if (numValue !== undefined) {
      const formatted = formatNumberForDisplay(numValue);
      setFormData({ ...formData, [field]: formatted });
    }
  };

  // Calculate sum of all partial areas
  const calculateTotalAreaSum = (): number => {
    const pasture = parseNumber(formData.pastureArea) || 0;
    const forageProduction = parseNumber(formData.forageProductionArea) || 0;
    const agricultureOwned = parseNumber(formData.agricultureAreaOwned) || 0;
    const agricultureLeased = parseNumber(formData.agricultureAreaLeased) || 0;
    const otherCrops = parseNumber(formData.otherCrops) || 0;
    const infrastructure = parseNumber(formData.infrastructure) || 0;
    const reserve = parseNumber(formData.reserveAndAPP) || 0;
    const other = parseNumber(formData.otherArea) || 0;
    return (
      pasture + forageProduction + agricultureOwned + agricultureLeased + otherCrops + infrastructure + reserve + other
    );
  };

  // Check if total area matches the sum of partial areas
  const isTotalAreaValid = (): boolean => {
    const totalAreaValue = parseNumber(formData.totalArea);
    const calculatedSum = calculateTotalAreaSum();

    if (totalAreaValue === undefined) return false;

    // Compare with tolerance for rounding (0.01 ha)
    const difference = Math.abs(totalAreaValue - calculatedSum);
    return difference < 0.01;
  };

  const getAreaBalance = (): { diff: number; closed: boolean } | undefined => {
    const totalAreaValue = parseNumber(formData.totalArea);
    if (totalAreaValue === undefined || totalAreaValue === 0) return undefined;
    const diff = totalAreaValue - calculateTotalAreaSum();
    return { diff, closed: Math.abs(diff) < 0.01 };
  };

  // Handle currency input change (without decimals, only thousands separator)
  const handleCurrencyChange = (field: string, value: string) => {
    const rawValue = value.replace(/R\$\s?/g, '').trim();

    if (isExpression(rawValue)) {
      setFormData({ ...formData, [field]: rawValue });
      return;
    }

    const cleaned = rawValue.replace(/[^\d]/g, '');
    if (cleaned) {
      const formatted = cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setFormData({ ...formData, [field]: formatted });
    } else {
      setFormData({ ...formData, [field]: '' });
    }
  };

  // Handle currency blur: evaluate expression and format as integer
  const handleCurrencyBlur = (field: string) => {
    const currentValue = formData[field as keyof typeof formData] as string;
    if (!currentValue) return;

    if (isExpression(currentValue)) {
      const result = evaluateSafeExpression(currentValue);
      if (result !== null && result >= 0) {
        const formatted = formatIntegerForDisplay(Math.round(result));
        setFormData({ ...formData, [field]: formatted });
      }
    }
  };

  // Format integer number for display (with thousands separator, no decimals)
  // Aceita number ou string (ex.: dados vindos do localStorage/API) para evitar erro ao editar fazenda.
  const formatIntegerForDisplay = (value: number | string | undefined): string => {
    const num = typeof value === 'number' ? value : value === undefined || value === null || value === '' ? undefined : Number(String(value).replace(/\./g, ''));
    if (num === undefined || isNaN(num)) return '';
    // Convert to integer and format with thousands separator
    const integerValue = Math.floor(num);
    return integerValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Parse integer from formatted string (removes thousands separator)
  const parseInteger = (value: string): number | undefined => {
    if (!value || value.trim() === '') return undefined;
    // Remove thousands separators (.)
    const cleaned = value.replace(/\./g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? undefined : num;
  };

  // Habilitar botão Salvar apenas quando todos os campos obrigatórios estão preenchidos e a regra de dimensões é respeitada
  const isSaveEnabled = useMemo(() => {
    if (!formData.name.trim()) return false;
    if (!formData.country.trim()) return false;
    if (formData.country === 'Brasil' && !formData.state) return false;
    if (!formData.city.trim()) return false;
    return true;
  }, [formData.name, formData.country, formData.state, formData.city]);

  // Calcular valores das áreas baseado na proporção e variação
  // Seguindo os passos:
  // Passo 1: Valor por hectare produtivo = Valor total / (pastagem + agricultura + outras culturas)
  // Passo 2: Valor por hectare agrícola = Valor por hectare * (1 + variação%)
  // Passo 3: Valor agricultura = Valor por hectare agrícola * área agricultura
  //         Valor outras culturas = Valor por hectare agrícola * área outras culturas
  // Passo 4: Valor pecuária = Valor total - Valor agricultura - Valor outras culturas
  const calculateAreaValues = () => {
    const propertyValueNum = parseInteger(formData.propertyValue);
    const pastureAreaNum = parseNumber(formData.pastureArea) || 0;
    const agricultureAreaOwnedNum = parseNumber(formData.agricultureAreaOwned) || 0;
    const agricultureAreaLeasedNum = parseNumber(formData.agricultureAreaLeased) || 0;
    const agricultureAreaNum = agricultureAreaOwnedNum + agricultureAreaLeasedNum;
    const otherCropsAreaNum = parseNumber(formData.otherCrops) || 0;
    const variation = formData.agricultureVariation / 100; // Converter de porcentagem para decimal

    if (!propertyValueNum || propertyValueNum === 0) {
      return {
        pastureValue: 0,
        agricultureValue: 0,
        otherCropsValue: 0,
      };
    }

    // Passo 1: Calcular área total produtiva (pastagem + agricultura + outras culturas)
    const totalProductiveArea = pastureAreaNum + agricultureAreaNum + otherCropsAreaNum;

    if (totalProductiveArea === 0) {
      return {
        pastureValue: 0,
        agricultureValue: 0,
        otherCropsValue: 0,
      };
    }

    // Passo 1: Valor base por hectare produtivo (sem variação)
    const baseValuePerHectare = propertyValueNum / totalProductiveArea;

    // Passo 2: Valor por hectare agrícola ajustado pela variação
    const agricultureValuePerHectare = baseValuePerHectare * (1 + variation);

    // Passo 3: Multiplicar o valor por hectare agrícola pela área de agricultura
    const agricultureValue = agricultureAreaNum * agricultureValuePerHectare;

    // Passo 3: Multiplicar o valor por hectare agrícola pela área de outras culturas
    const otherCropsValue = otherCropsAreaNum * agricultureValuePerHectare;

    // Passo 4: Calcular valor da operação pecuária
    // Valor total da propriedade - valor agricultura - valor outras culturas
    const pastureValue = propertyValueNum - agricultureValue - otherCropsValue;

    return {
      pastureValue: Math.max(0, pastureValue), // Garantir que não seja negativo
      agricultureValue,
      otherCropsValue,
    };
  };

  const areaValues = calculateAreaValues();

  // Preencher automaticamente os campos "Valores de Operação" com os valores calculados
  useEffect(() => {
    const propertyValueNum = parseInteger(formData.propertyValue);
    const pastureAreaNum = parseNumber(formData.pastureArea) || 0;
    const agricultureAreaOwnedNum = parseNumber(formData.agricultureAreaOwned) || 0;
    const agricultureAreaLeasedNum = parseNumber(formData.agricultureAreaLeased) || 0;
    const agricultureAreaNum = agricultureAreaOwnedNum + agricultureAreaLeasedNum;
    const otherCropsAreaNum = parseNumber(formData.otherCrops) || 0;

    // Só preencher automaticamente se houver valor da propriedade e áreas produtivas
    if (
      propertyValueNum &&
      propertyValueNum > 0 &&
      (pastureAreaNum > 0 || agricultureAreaNum > 0 || otherCropsAreaNum > 0)
    ) {
      // Recalcular valores baseado nos dados atuais (incluindo agricultureVariation)
      const calculatedValues = calculateAreaValues();

      // Arredondar valores calculados para inteiros
      let calculatedPecuary = Math.round(calculatedValues.pastureValue);
      let calculatedAgricultural = Math.round(calculatedValues.agricultureValue);
      let calculatedOther = Math.round(calculatedValues.otherCropsValue);

      // Garantir que a soma seja exatamente igual ao valor da propriedade
      // Ajustar o valor pecuário para compensar diferenças de arredondamento
      const sumCalculated = calculatedPecuary + calculatedAgricultural + calculatedOther;
      const difference = propertyValueNum - sumCalculated;

      // Ajustar o valor pecuário para garantir que a soma seja exata
      calculatedPecuary = calculatedPecuary + difference;

      // Garantir que nenhum valor seja negativo
      if (calculatedPecuary < 0) {
        // Se o valor pecuário ficar negativo, redistribuir a diferença
        const excess = Math.abs(calculatedPecuary);
        calculatedPecuary = 0;

        // Redistribuir o excesso proporcionalmente entre agricultura e outras culturas
        const totalOther = calculatedAgricultural + calculatedOther;
        if (totalOther > 0) {
          const agriculturalRatio = calculatedAgricultural / totalOther;
          calculatedAgricultural = Math.max(0, calculatedAgricultural - excess * agriculturalRatio);
          calculatedOther = Math.max(0, calculatedOther - excess * (1 - agriculturalRatio));
        }
      }

      // Verificar valores atuais
      const currentPecuary = parseInteger(formData.operationPecuary);
      const currentAgricultural = parseInteger(formData.operationAgricultural);
      const currentOther = parseInteger(formData.otherOperations);

      // Sempre atualizar quando:
      // 1. Os campos estiverem vazios, OU
      // 2. A soma atual não bater com o valor total (para recalcular quando necessário), OU
      // 3. Os valores calculados são diferentes dos atuais (isso captura mudanças na variação)
      const sumCurrent = (currentPecuary || 0) + (currentAgricultural || 0) + (currentOther || 0);
      const shouldUpdate =
        (!currentPecuary && !currentAgricultural && !currentOther) ||
        Math.abs(sumCurrent - propertyValueNum) > 0 || // Qualquer diferença
        calculatedPecuary !== (currentPecuary || 0) ||
        calculatedAgricultural !== (currentAgricultural || 0) ||
        calculatedOther !== (currentOther || 0);

      if (shouldUpdate) {
        setFormData(prev => ({
          ...prev,
          operationPecuary: formatIntegerForDisplay(calculatedPecuary),
          operationAgricultural: formatIntegerForDisplay(calculatedAgricultural),
          otherOperations: formatIntegerForDisplay(calculatedOther),
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.propertyValue,
    formData.pastureArea,
    formData.agricultureAreaOwned,
    formData.agricultureAreaLeased,
    formData.otherCrops,
    formData.agricultureVariation,
  ]);

  // Fonte única de fazendas: HierarchyContext
  useEffect(() => {
    setFarms(hierarchyFarms);
  }, [hierarchyFarms]);

  // Se houver fazendas e estiver no formulário vazio (sem estar criando nova), mudar para lista
  useEffect(() => {
    if (!isLoading && farms.length > 0 && view === 'form' && !editingFarm && !isCreatingNew) {
      setView('list');
    }
  }, [farms.length, isLoading, view, editingFarm, isCreatingNew]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validar se há cliente/organização (obrigatório para criar fazenda; cliente usa user.clientId quando não há selectedClient)
    const clientIdForValidation = selectedClient?.id ?? (isCliente && user?.clientId ? user.clientId : null);
    if (!editingFarm && !clientIdForValidation) {
      const isAwaitingClients = !loadingClientsAvailability && (availableClientsCount ?? 0) === 0;
      newErrors.client = isAwaitingClients
        ? 'Aguardando cadastro de organizações para liberar o cadastro de fazendas.'
        : 'É necessário selecionar uma organização antes de cadastrar uma fazenda';
    }

    // Validar se o cliente está vinculado ao analista
    if (!editingFarm && selectedClient) {
      // Verificar se o usuário é analista ou admin
      if (user && (user.qualification === 'analista' || user.role === 'admin')) {
        // Verificar se o cliente pertence ao analista logado
        if (user.role !== 'admin' && selectedClient.analystId !== user.id) {
          newErrors.client = 'A organização selecionada não está vinculada ao seu perfil de analista';
        }
      }
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Nome da fazenda é obrigatório';
    }

    // Estado só é obrigatório para Brasil
    if (formData.country === 'Brasil' && !formData.state) {
      newErrors.state = 'Estado é obrigatório';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'Cidade é obrigatória';
    }

    if (!formData.productionSystem) {
      newErrors.productionSystem = 'Sistema de produção é obrigatório';
    }

    // Área total obrigatória
    const totalAreaValue = parseNumber(formData.totalArea);
    if (totalAreaValue === undefined || totalAreaValue <= 0) {
      newErrors.totalArea = 'Área total é obrigatória';
    }

    // Área de pastagem obrigatória
    const pastureAreaValue = parseNumber(formData.pastureArea);
    if (pastureAreaValue === undefined || pastureAreaValue < 0) {
      newErrors.pastureArea = 'Área de pastagem é obrigatória';
    }

    // Valor da propriedade obrigatório
    const propertyValueNum = parseInteger(formData.propertyValue);
    if (propertyValueNum === undefined || propertyValueNum < 0) {
      newErrors.propertyValue = 'Valor da propriedade é obrigatório';
    }

    // Valor do rebanho obrigatório
    const herdValueNum = parseInteger(formData.herdValue);
    if (herdValueNum === undefined || herdValueNum < 0) {
      newErrors.herdValue = 'Valor do rebanho é obrigatório';
    }

    // Validar se a soma dos valores de operação é igual ao valor da propriedade
    const operationPecuaryNum = parseInteger(formData.operationPecuary) || 0;
    const operationAgriculturalNum = parseInteger(formData.operationAgricultural) || 0;
    const otherOperationsNum = parseInteger(formData.otherOperations) || 0;
    const sumOperations = operationPecuaryNum + operationAgriculturalNum + otherOperationsNum;

    if (propertyValueNum !== undefined && propertyValueNum > 0) {
      if (sumOperations !== propertyValueNum) {
        newErrors.operationSum = `A soma dos valores de operação (${formatIntegerForDisplay(sumOperations)}) deve ser igual ao valor da propriedade (${formatIntegerForDisplay(propertyValueNum)})`;
      }
    }

    // Verificar soma das áreas (aviso, não bloqueio)
    const calculatedSum = calculateTotalAreaSum();
    if (totalAreaValue !== undefined && totalAreaValue > 0) {
      const difference = Math.abs(totalAreaValue - calculatedSum);
      if (difference >= 0.01) {
        const formattedTotal = formatNumberForDisplay(totalAreaValue);
        const formattedSum = formatNumberForDisplay(calculatedSum);
        setAreaWarning(`A soma das sub-áreas (${formattedSum} ha) difere da área total (${formattedTotal} ha). Verifique os valores.`);
      } else {
        setAreaWarning(null);
      }
    } else {
      setAreaWarning(null);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Limpar estado quando mudar de país
  const handleCountryChange = (country: string) => {
    setFormData({
      ...formData,
      country,
      state: country !== 'Brasil' ? '' : formData.state, // Limpa estado se não for Brasil
    });

    // Limpar erro de estado se o país não for Brasil (estado não é obrigatório)
    if (country !== 'Brasil' && errors.state) {
      setErrors({ ...errors, state: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const clientIdForNewFarm = selectedClient?.id ?? (isCliente ? user?.clientId ?? null : null);

      // Validação adicional: não permitir criar fazenda sem organização
      if (!editingFarm && !clientIdForNewFarm) {
        const isAwaitingClients = !loadingClientsAvailability && (availableClientsCount ?? 0) === 0;
        const waitingMessage = 'Aguardando cadastro de organizações para liberar o cadastro de fazendas';
        onToast?.(
          isAwaitingClients ? waitingMessage : 'Por favor, selecione uma organização antes de cadastrar uma fazenda',
          'error',
        );
        setErrors({
          client: isAwaitingClients
            ? `${waitingMessage}.`
            : 'É necessário selecionar uma organização antes de cadastrar uma fazenda',
        });
        return;
      }

      // Verificar se o cliente está vinculado ao analista (apenas analista/admin)
      if (!editingFarm && selectedClient && user) {
        if (user.role !== 'admin' && selectedClient.analystId !== user.id) {
          console.warn('[FarmManagement] Binding validation failed: analystId mismatch', {
            userId: user.id,
            selectedClientAnalystId: selectedClient.analystId,
            selectedClientId: selectedClient.id,
            userRole: user.role,
          });
          onToast?.('A organização selecionada não está vinculada ao seu perfil de analista', 'error');
          setErrors({ client: 'A organização selecionada não está vinculada ao seu perfil de analista' });
          return;
        }
      }

      if (!validateForm()) {
        return;
      }

      let updatedFarms: Farm[];

      // Prepare farm data with parsed numeric values
      const farmData: Partial<Farm> = {
        name: formData.name,
        country: formData.country,
        state: formData.state,
        city: formData.city,
        totalArea: parseNumber(formData.totalArea) ?? null,
        pastureArea: parseNumber(formData.pastureArea) ?? null,
        forageProductionArea: parseNumber(formData.forageProductionArea) ?? null,
        agricultureAreaOwned: parseNumber(formData.agricultureAreaOwned) ?? null,
        agricultureAreaLeased: parseNumber(formData.agricultureAreaLeased) ?? null,
        otherCrops: parseNumber(formData.otherCrops) ?? null,
        infrastructure: parseNumber(formData.infrastructure) ?? null,
        reserveAndAPP: parseNumber(formData.reserveAndAPP) ?? null,
        otherArea: parseNumber(formData.otherArea) ?? null,
        propertyValue: parseInteger(formData.propertyValue) ?? null,
        operationPecuary: parseInteger(formData.operationPecuary) ?? null,
        operationAgricultural: parseInteger(formData.operationAgricultural) ?? null,
        otherOperations: parseInteger(formData.otherOperations) ?? null,
        agricultureVariation: formData.agricultureVariation,
        propertyType: formData.propertyType,
        weightMetric: formData.weightMetric,
        averageHerd: formData.averageHerd ? parseInt(formData.averageHerd.replace(/\./g, ''), 10) : null,
        herdValue: parseInteger(formData.herdValue) ?? null,
        commercializesGenetics: formData.commercializesGenetics,
        productionSystem: (formData.productionSystem as Farm['productionSystem']) || null,
        ativo: formData.ativo,
      };

      if (!editingFarm && clientIdForNewFarm) {
        try {
          await apiFarmCreate({
            ...farmData,
            organizationId: clientIdForNewFarm,
            name: formData.name.trim(),
            city: formData.city.trim(),
          });
          await refreshCurrentLevel('farms');
          updatedFarms = farms; // placeholder para o check abaixo
        } catch (err) {
          console.error('[FarmManagement] Error saving farm:', err);
          onToast?.('Erro ao salvar fazenda: ' + (err as Error).message, 'error');
          return;
        }
      } else if (editingFarm) {
        try {
          await apiFarmUpdate(editingFarm.id, farmData);
          await refreshCurrentLevel('farms');
          updatedFarms = farms;
        } catch (err) {
          console.error('[FarmManagement] Error updating farm:', err);
          onToast?.('Erro ao atualizar fazenda: ' + (err as Error).message, 'error');
          return;
        }
      } else {
        updatedFarms = farms;
      }

      // Fonte única: HierarchyContext. Não aplicar setFarms local.

      // Show success toast with animation
      onToast?.(editingFarm ? 'Fazenda atualizada com sucesso!' : 'Fazenda cadastrada com sucesso!', 'success');

      // Reset form
      resetForm();
      setIsCreatingNew(false); // Marcar que não está mais criando

      // Switch to list view if there are farms (saveFarms already updates the state)
      if (updatedFarms.length > 0) {
        setView('list');
      }
    } catch (err) {
      console.error('[FarmManagement] Unexpected error in handleSubmit:', err);
      onToast?.('Erro inesperado ao salvar fazenda', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (farmId: string) => {
    if (window.confirm('Tem certeza que deseja desativar esta fazenda?')) {
      try {
        await apiFarmDeactivate(farmId);
        await refreshCurrentLevel('farms');
        onToast?.('Fazenda desativada com sucesso!', 'success');
      } catch (err) {
        console.error('[FarmManagement] Error deactivating farm:', err);
        onToast?.('Erro ao desativar fazenda', 'error');
      }
    }
  };

  const handleToggleActive = async (farmId: string, currentActive: boolean) => {
    const newActive = !currentActive;
    try {
      await apiFarmUpdate(farmId, { ativo: newActive } as Partial<Farm>);
      await refreshCurrentLevel('farms');
      onToast?.(newActive ? 'Fazenda ativada!' : 'Fazenda desativada!', 'success');
    } catch (err) {
      console.error('[FarmManagement] Error toggling farm active:', err);
      onToast?.('Erro ao alterar status da fazenda', 'error');
    }
  };

  // Format number for display (with thousands separator (.) and 2 decimals (,))
  // Aceita number ou string (ex.: dados vindos do localStorage/API) para evitar erro ao editar fazenda.
  const formatNumberForDisplay = (value: number | string | undefined): string => {
    const num = typeof value === 'number' ? value : value === undefined || value === null || value === '' ? undefined : Number(String(value).replace(',', '.'));
    if (num === undefined || isNaN(num)) return '';
    // Format with 2 decimals, then replace dot with comma for decimal separator
    const formatted = num.toFixed(2);
    const parts = formatted.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '00';

    // Add thousands separator to integer part
    const integerWithSeparator = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${integerWithSeparator},${decimalPart}`;
  };

  const handleEdit = (farm: Farm) => {
    setEditingFarm(farm);
    setIsCreatingNew(false);
    const avgHerd = farm.averageHerd;
    const averageHerdStr =
      avgHerd === undefined || avgHerd === null || avgHerd === ''
        ? ''
        : (typeof avgHerd === 'number' ? Math.floor(avgHerd) : parseInt(String(avgHerd).replace(/[^\d]/g, ''), 10) || 0)
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setFormData({
      name: farm.name ?? '',
      country: farm.country ?? 'Brasil',
      state: farm.state ?? '',
      city: farm.city ?? '',
      totalArea: formatNumberForDisplay(farm.totalArea),
      pastureArea: formatNumberForDisplay(farm.pastureArea),
      forageProductionArea: formatNumberForDisplay(farm.forageProductionArea),
      agricultureAreaOwned: formatNumberForDisplay(farm.agricultureAreaOwned),
      agricultureAreaLeased: formatNumberForDisplay(farm.agricultureAreaLeased),
      otherCrops: formatNumberForDisplay(farm.otherCrops),
      infrastructure: formatNumberForDisplay(farm.infrastructure),
      reserveAndAPP: formatNumberForDisplay(farm.reserveAndAPP),
      otherArea: formatNumberForDisplay(farm.otherArea),
      propertyValue: formatIntegerForDisplay(farm.propertyValue),
      operationPecuary: formatIntegerForDisplay(farm.operationPecuary),
      operationAgricultural: formatIntegerForDisplay(farm.operationAgricultural),
      otherOperations: formatIntegerForDisplay(farm.otherOperations),
      agricultureVariation: farm.agricultureVariation ?? 0,
      propertyType: (farm.propertyType as Farm['propertyType']) || 'Própria',
      weightMetric: (farm.weightMetric as Farm['weightMetric']) || 'Arroba (@)',
      averageHerd: averageHerdStr,
      herdValue: formatIntegerForDisplay(farm.herdValue),
      commercializesGenetics: !!farm.commercializesGenetics,
      productionSystem: (farm.productionSystem as Farm['productionSystem']) ?? '',
      ativo: farm.ativo ?? true,
    });
    setFarmActiveTab('dados');
    setView('form');
  };

  const resetForm = () => {
    setFarmActiveTab('dados');
    setFormData({
      name: '',
      country: 'Brasil',
      state: '',
      city: '',
      totalArea: '',
      pastureArea: '',
      forageProductionArea: '',
      agricultureAreaOwned: '',
      agricultureAreaLeased: '',
      otherCrops: '',
      infrastructure: '',
      reserveAndAPP: '',
      otherArea: '',
      propertyValue: '',
      operationPecuary: '',
      operationAgricultural: '',
      otherOperations: '',
      agricultureVariation: 0,
      propertyType: 'Própria',
      weightMetric: 'Arroba (@)',
      averageHerd: '',
      herdValue: '',
      commercializesGenetics: false,
      productionSystem: '' as Farm['productionSystem'] | '',
      ativo: true,
    });
    setEditingFarm(null);
    setErrors({});
    setAreaWarning(null);
  };

  const handleCancel = () => {
    resetForm();
    setIsCreatingNew(false);
    setView('list');
    window.dispatchEvent(new CustomEvent('farmCancelForm'));
  };

  // Escutar evento de cancelamento da barra superior
  useEffect(() => {
    const handleCancelForm = () => {
      if (view === 'form') {
        resetForm();
        setIsCreatingNew(false);
        setView('list');
      }
    };

    window.addEventListener('farmCancelForm', handleCancelForm);
    return () => {
      window.removeEventListener('farmCancelForm', handleCancelForm);
    };
  }, [view]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-ai-subtext">Carregando...</div>
      </div>
    );
  }

  const activeFarms = farms.filter(f => f.ativo !== false);
  const inactiveFarms = farms.filter(f => f.ativo === false);

  // List View
  if (view === 'list') {
    return (
      <>
        <div className="h-full flex flex-col p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-ai-text">Cadastro de Fazendas</h1>
            </div>
            {effectiveFormPerms.canEdit('farms:form') && (
              <button
                onClick={() => {
                  resetForm();
                  setIsCreatingNew(true);
                  setView('form');
                }}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center gap-2"
              >
                <Plus size={18} />
                Nova Fazenda
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto content-start">
            {activeFarms.map(farm => (
              <FarmCard
                key={farm.id}
                farm={farm}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
                onOpenPermissions={setPermissionsModalFarm}
                canManagePermissions={effectiveBatchPerms[farm.id]?.isResponsible ?? false}
                perms={effectiveBatchPerms[farm.id] ?? (isCliente ? CLIENTE_ACCESS : NO_ACCESS)}
              />
            ))}
          </div>
          {inactiveFarms.length > 0 && (
            <div className="flex justify-center pt-4 pb-2">
              <button
                onClick={() => setShowInactiveModal(true)}
                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-400 rounded-full px-3 py-1 transition-colors flex items-center gap-1"
              >
                <EyeOff size={12} />
                desativadas ({inactiveFarms.length})
              </button>
            </div>
          )}
        </div>
        {permissionsModalFarm && (
          <FarmPermissionsModal
            open={!!permissionsModalFarm}
            onClose={() => setPermissionsModalFarm(null)}
            farmId={permissionsModalFarm.id}
            farmName={permissionsModalFarm.name}
            orgId={permissionsModalFarm.organizationId}
            isCurrentUserResponsible={effectiveBatchPerms[permissionsModalFarm.id]?.isResponsible ?? false}
            onToast={onToast}
          />
        )}
        {showInactiveModal && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
            onClick={() => setShowInactiveModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-700">Fazendas Desativadas ({inactiveFarms.length})</h2>
                <button onClick={() => setShowInactiveModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inactiveFarms.map(farm => (
                  <FarmCard
                    key={farm.id}
                    farm={farm}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    onOpenPermissions={setPermissionsModalFarm}
                    canManagePermissions={effectiveBatchPerms[farm.id]?.isResponsible ?? false}
                    perms={effectiveBatchPerms[farm.id] ?? (isCliente ? CLIENTE_ACCESS : NO_ACCESS)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Form View
  return (
    <div className="h-full flex flex-col p-4 md:p-6 min-h-0 overflow-y-auto">
      <style>{`
        /* Estilos customizados para barras de rolagem dos selects */
        select::-webkit-scrollbar {
          width: 27px;
        }
        select::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 8px;
        }
        select::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 8px;
          border: 3px solid #f1f5f9;
        }
        select::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
        /* Firefox */
        select {
          scrollbar-width: thick;
          scrollbar-color: #9ca3af #f1f5f9;
        }
      `}</style>

      <form
        onSubmit={handleSubmit}
        className="max-w-7xl w-full bg-white rounded-lg border border-ai-border p-4 flex flex-col"
      >
        {/* Abas: Dados Gerais | Mapa */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFarmActiveTab('dados')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
              farmActiveTab === 'dados'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Info size={14} />
            Dados Gerais
          </button>
          <button
            type="button"
            onClick={() => {
              if (!editingFarm) {
                onToast?.('Salve a fazenda primeiro para acessar o mapa', 'warning');
                return;
              }
              setFarmActiveTab('mapa');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
              farmActiveTab === 'mapa'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Map size={14} />
            Mapa
          </button>
        </div>

        {/* ─── Aba 1: Dados Gerais ─── */}
        {farmActiveTab === 'dados' && (
        <fieldset disabled={formReadOnly} className={formReadOnly ? 'opacity-75' : ''}>
          <div className="flex flex-col min-h-0">
            {/* Alerta se não houver cliente/organização para criação (cliente usa user.clientId quando não há selectedClient) */}
            {needsOrgForCreate && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-600 font-semibold">⚠️ Atenção:</span>
                  <div className="flex-1">
                    {loadingClientsAvailability ? (
                      <p className="text-sm text-yellow-800">Verificando organizações cadastradas...</p>
                    ) : (availableClientsCount ?? 0) === 0 ? (
                      <p className="text-sm text-yellow-800">
                        Aguardando cadastro de organizações. Cadastre uma organização em Cadastro de Organizações para liberar o
                        cadastro de fazendas.
                      </p>
                    ) : (
                      <p className="text-sm text-yellow-800">
                        É necessário selecionar uma organização antes de cadastrar uma fazenda. Por favor, selecione uma
                        organização no cabeçalho da aplicação.
                      </p>
                    )}
                    {errors.client && <p className="text-red-600 text-sm mt-1 font-medium">{errors.client}</p>}
                  </div>
                </div>
              </div>
            )}
            {/* Aviso de soma de áreas (não bloqueante) */}
            {areaWarning && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <span className="text-amber-600 text-sm font-semibold flex-shrink-0">⚠</span>
                <p className="text-sm text-amber-800">{areaWarning}</p>
              </div>
            )}
            {/* Nome da Fazenda, Tipo, Sistema de Produção, País, Estado e Cidade - Todos na mesma linha */}
            <div className="mb-4 grid grid-cols-6 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  Nome da fazenda <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => {
                    setFormData({ ...formData, name: e.target.value });
                    // Limpar erro quando o usuário começar a digitar
                    if (errors.name && e.target.value.trim()) {
                      setErrors({ ...errors, name: '' });
                    }
                  }}
                  placeholder="Ex: Fazenda Santa Maria"
                  className={`w-full px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                    errors.name ? 'border-red-500' : 'border-ai-border'
                  }`}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  Tipo de propriedade
                </label>
                <select
                  value={formData.propertyType}
                  onChange={e => setFormData({ ...formData, propertyType: e.target.value as Farm['propertyType'] })}
                  className="w-full px-2 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                >
                  <option value="Própria">Própria</option>
                  <option value="Arrendada">Arrendada</option>
                  <option value="Parceria">Parceria</option>
                  <option value="Comodato">Comodato</option>
                  <option value="Mista">Mista</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  Sistema de produção <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.productionSystem}
                  onChange={e => {
                    setFormData({ ...formData, productionSystem: e.target.value as Farm['productionSystem'] | '' });
                    // Limpar erro quando o usuário selecionar um sistema
                    if (errors.productionSystem && e.target.value) {
                      setErrors({ ...errors, productionSystem: '' });
                    }
                  }}
                  className={`w-full px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                    errors.productionSystem ? 'border-red-500' : 'border-ai-border'
                  } bg-white`}
                >
                  <option value="">Selecione um sistema</option>
                  <option value="Cria">Cria</option>
                  <option value="Recria">Recria</option>
                  <option value="Engorda">Engorda</option>
                  <option value="Ciclo Completo">Ciclo Completo</option>
                  <option value="Cria e Recria">Cria e Recria</option>
                  <option value="Recria e Engorda">Recria e Engorda</option>
                </select>
                {errors.productionSystem && <p className="text-red-500 text-xs mt-1">{errors.productionSystem}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  País
                </label>
                <select
                  value={formData.country}
                  onChange={e => handleCountryChange(e.target.value)}
                  className="w-full px-2 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                >
                  {COUNTRIES.map(country => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  Estado {isStateRequired && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={formData.state}
                  onChange={e => {
                    setFormData({ ...formData, state: e.target.value });
                    // Limpar erro quando o usuário selecionar um estado
                    if (errors.state && e.target.value) {
                      setErrors({ ...errors, state: '' });
                    }
                  }}
                  disabled={!isStateRequired}
                  className={`w-full px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                    errors.state ? 'border-red-500' : 'border-ai-border'
                  } ${!isStateRequired ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                >
                  <option value="">{isStateRequired ? 'Selecione o estado' : 'N/A'}</option>
                  {isStateRequired &&
                    BRAZILIAN_STATES.map(state => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                </select>
                {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                  Cidade <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => {
                    setFormData({ ...formData, city: e.target.value });
                    // Limpar erro quando o usuário começar a digitar
                    if (errors.city && e.target.value.trim()) {
                      setErrors({ ...errors, city: '' });
                    }
                  }}
                  placeholder="Digite a cidade"
                  className={`w-full px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                    errors.city ? 'border-red-500' : 'border-ai-border'
                  }`}
                />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
              </div>
            </div>


            {/* Dimensões da Fazenda - Seção com fundo cinza claro */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-ai-text uppercase tracking-wide">
                  Dimensões da Fazenda (Hectares)
                </h3>
                <div className="flex flex-col items-end gap-0.5">
                  <p
                    className={`text-xs font-semibold ${
                      isTotalAreaValid() && formData.totalArea ? 'text-green-600' : 'text-ai-subtext'
                    }`}
                  >
                    SOMA TOTAL: {formatNumberForDisplay(calculateTotalAreaSum())} ha
                  </p>
                  {(() => {
                    const balance = getAreaBalance();
                    if (!balance) return null;
                    if (balance.closed) return (
                      <p className="text-[10px] font-medium text-green-600">Conta fechada</p>
                    );
                    return (
                      <p className={`text-[10px] font-medium ${balance.diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                        {balance.diff > 0
                          ? `Falta: ${formatNumberForDisplay(balance.diff)} ha`
                          : `Excede: ${formatNumberForDisplay(Math.abs(balance.diff))} ha`}
                      </p>
                    );
                  })()}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Área Total <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.totalArea}
                    onChange={e => handleNumericChange('totalArea', e.target.value)}
                    onBlur={() => handleNumericBlur('totalArea')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                      errors.totalArea
                        ? 'border-red-500'
                        : isTotalAreaValid() && formData.totalArea
                          ? 'border-green-500'
                          : 'border-ai-border'
                    }`}
                  />
                  {errors.totalArea && <p className="text-red-500 text-xs mt-1">{errors.totalArea}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Área Pastagem <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.pastureArea}
                    onChange={e => handleNumericChange('pastureArea', e.target.value)}
                    onBlur={() => handleNumericBlur('pastureArea')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                      errors.pastureArea ? 'border-red-500' : 'border-ai-border'
                    }`}
                  />
                  {errors.pastureArea && <p className="text-red-500 text-xs mt-1">{errors.pastureArea}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide flex items-center gap-1">
                    Prod. Volumoso
                    <span title="Área perene de produção de volumoso">
                      <Info size={12} className="text-ai-subtext cursor-help" />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.forageProductionArea}
                    onChange={e => handleNumericChange('forageProductionArea', e.target.value)}
                    onBlur={() => handleNumericBlur('forageProductionArea')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Agric. Própria
                  </label>
                  <input
                    type="text"
                    value={formData.agricultureAreaOwned}
                    onChange={e => handleNumericChange('agricultureAreaOwned', e.target.value)}
                    onBlur={() => handleNumericBlur('agricultureAreaOwned')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Agric. Arrendada
                  </label>
                  <input
                    type="text"
                    value={formData.agricultureAreaLeased}
                    onChange={e => handleNumericChange('agricultureAreaLeased', e.target.value)}
                    onBlur={() => handleNumericBlur('agricultureAreaLeased')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Outras Culturas
                  </label>
                  <input
                    type="text"
                    value={formData.otherCrops}
                    onChange={e => handleNumericChange('otherCrops', e.target.value)}
                    onBlur={() => handleNumericBlur('otherCrops')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Infraestrutura
                  </label>
                  <input
                    type="text"
                    value={formData.infrastructure}
                    onChange={e => handleNumericChange('infrastructure', e.target.value)}
                    onBlur={() => handleNumericBlur('infrastructure')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Reserva e APP
                  </label>
                  <input
                    type="text"
                    value={formData.reserveAndAPP}
                    onChange={e => handleNumericChange('reserveAndAPP', e.target.value)}
                    onBlur={() => handleNumericBlur('reserveAndAPP')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Outros
                  </label>
                  <input
                    type="text"
                    value={formData.otherArea}
                    onChange={e => handleNumericChange('otherArea', e.target.value)}
                    onBlur={() => handleNumericBlur('otherArea')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Dados da Propriedade e Rebanho - Seção com fundo cinza claro */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
              <h3 className="text-xs font-bold text-ai-text mb-3 uppercase tracking-wide">
                Dados da Propriedade e Rebanho
              </h3>

              {/* Valor da propriedade, Variação e Valores de Operação na mesma linha */}
              <div className="grid grid-cols-5 gap-2 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Valor da propriedade <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.propertyValue}
                      onChange={e => handleCurrencyChange('propertyValue', e.target.value)}
                      onBlur={() => handleCurrencyBlur('propertyValue')}
                      placeholder="0"
                      inputMode="numeric"
                      className={`w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                        errors.propertyValue ? 'border-red-500' : 'border-ai-border'
                      }`}
                    />
                  </div>
                  {errors.propertyValue && <p className="text-red-500 text-xs mt-1">{errors.propertyValue}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Variação Valor Agricultura
                    <span className="ml-1 text-[10px] font-normal text-ai-subtext">
                      {formData.agricultureVariation > 0 ? '+' : ''}
                      {formData.agricultureVariation}%
                    </span>
                  </label>
                  <div className="space-y-0.5">
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="1"
                      value={formData.agricultureVariation}
                      onChange={e => setFormData({ ...formData, agricultureVariation: parseInt(e.target.value) })}
                      className="w-full h-2 bg-ai-surface2 rounded-lg appearance-none cursor-pointer accent-ai-accent"
                      style={{
                        background: `linear-gradient(to right, #e2e8f0 0%, #e2e8f0 ${((formData.agricultureVariation + 50) / 100) * 100}%, #cbd5e1 ${((formData.agricultureVariation + 50) / 100) * 100}%, #cbd5e1 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-ai-subtext">
                      <span>-50%</span>
                      <span>0%</span>
                      <span>+50%</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Op. Pecuária
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.operationPecuary}
                      onChange={e => {
                        handleCurrencyChange('operationPecuary', e.target.value);
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
                      onBlur={() => handleCurrencyBlur('operationPecuary')}
                      placeholder="0"
                      inputMode="numeric"
                      className={`w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                        errors.operationSum ? 'border-red-500' : 'border-ai-border'
                      }`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Op. Agrícola
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.operationAgricultural}
                      onChange={e => {
                        handleCurrencyChange('operationAgricultural', e.target.value);
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
                      onBlur={() => handleCurrencyBlur('operationAgricultural')}
                      placeholder="0"
                      inputMode="numeric"
                      className={`w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                        errors.operationSum ? 'border-red-500' : 'border-ai-border'
                      }`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Outras Operações
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.otherOperations}
                      onChange={e => {
                        handleCurrencyChange('otherOperations', e.target.value);
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
                      onBlur={() => handleCurrencyBlur('otherOperations')}
                      placeholder="0"
                      inputMode="numeric"
                      className={`w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                        errors.operationSum ? 'border-red-500' : 'border-ai-border'
                      }`}
                    />
                  </div>
                </div>
              </div>
              {/* Mensagem de erro da soma (se houver) */}
              {errors.operationSum && (
                <div className="mb-3">
                  <p className="text-red-500 text-xs mt-1">{errors.operationSum}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Métrica de peso
                  </label>
                  <select
                    value={formData.weightMetric}
                    onChange={e => setFormData({ ...formData, weightMetric: e.target.value as Farm['weightMetric'] })}
                    className="w-full px-3 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  >
                    <option value="Arroba (@)">Arroba (@)</option>
                    <option value="Kg">Kg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Rebanho médio (12M)
                  </label>
                  <input
                    type="text"
                    value={formData.averageHerd}
                    onChange={e => {
                      // Remove all non-numeric characters
                      const cleaned = e.target.value.replace(/[^\d]/g, '');
                      // Format with thousands separator
                      const formatted = cleaned ? cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
                      setFormData({ ...formData, averageHerd: formatted });
                    }}
                    onBlur={() => {
                      // Ensure it's formatted on blur
                      if (formData.averageHerd) {
                        const cleaned = formData.averageHerd.replace(/\./g, '');
                        const formatted = cleaned ? cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
                        setFormData({ ...formData, averageHerd: formatted });
                      }
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    className="w-full px-3 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Valor do Rebanho <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.herdValue}
                      onChange={e => handleCurrencyChange('herdValue', e.target.value)}
                      onBlur={() => handleCurrencyBlur('herdValue')}
                      placeholder="0"
                      inputMode="numeric"
                      className={`w-full pl-10 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white ${
                        errors.herdValue ? 'border-red-500' : 'border-ai-border'
                      }`}
                    />
                  </div>
                  {errors.herdValue && <p className="text-red-500 text-xs mt-1">{errors.herdValue}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Comercializa genética animal
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer mt-1.5">
                    <input
                      type="checkbox"
                      checked={formData.commercializesGenetics}
                      onChange={e => setFormData({ ...formData, commercializesGenetics: e.target.checked })}
                      className="mt-0.5 w-4 h-4 text-ai-accent border-ai-border rounded focus:ring-ai-accent"
                    />
                    <div>
                      <span className="block text-xs font-medium text-ai-text">Sim</span>
                      <span className="block text-[10px] text-ai-subtext mt-0.5">Vende touros, matrizes ou sêmen</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </fieldset>
        )}

        {/* ─── Aba 2: Mapa ─── */}
        {farmActiveTab === 'mapa' && editingFarm && (
          <div className="flex-1">
            <FarmMapTab farmId={editingFarm.id} readOnly={formReadOnly} />
          </div>
        )}
        {/* Action Buttons - only on Dados Gerais tab */}
        {farmActiveTab === 'dados' && (
        <div className="flex gap-3 pt-4 border-t border-ai-border flex-shrink-0 mt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 px-4 py-2 text-sm border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={formReadOnly || needsOrgForCreate || !isSaveEnabled || isSubmitting}
            className="flex-1 px-4 py-2 text-sm bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title={needsOrgForCreate ? 'Selecione uma organização antes de cadastrar uma fazenda' : !isSaveEnabled ? 'Preencha todos os campos obrigatórios e respeite a soma total das dimensões' : ''}
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {isSubmitting
              ? editingFarm
                ? 'Salvando...'
                : 'Cadastrando...'
              : editingFarm
                ? 'Atualizar Fazenda'
                : 'Cadastrar Fazenda'}
          </button>
        </div>
        )}
      </form>
    </div>
  );
};

export default FarmManagement;
