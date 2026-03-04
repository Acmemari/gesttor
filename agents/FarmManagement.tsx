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
  CheckCircle2,
  XCircle,
  Info,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useClient } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import { mapFarmsFromDatabase, buildFarmDatabasePayload, isMissingColumnError } from '../lib/utils/farmMapper';
import FarmPermissionsModal from '../components/FarmPermissionsModal';
import {
  useFarmPermissions,
  useBatchFarmPermissions,
  NO_ACCESS,
  type FarmPermissionsResult,
} from '../lib/permissions/useFarmPermissions';

interface FarmCardProps {
  farm: Farm;
  onEdit: (farm: Farm) => void;
  onDelete: (farmId: string) => void;
  onOpenPermissions: (farm: Farm) => void;
  canManagePermissions: boolean;
  perms: FarmPermissionsResult;
}

const FarmCard: React.FC<FarmCardProps> = ({
  farm,
  onEdit,
  onDelete,
  onOpenPermissions,
  canManagePermissions,
  perms,
}) => {
  if (perms.isHidden('farms:card')) return null;
  const canEdit = perms.canEdit('farms:form');
  const canDelete = perms.canEdit('farms:delete');
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-gray-800 transition-all duration-200 flex flex-col w-full min-h-[200px]">
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-gray-900 mb-3 truncate">{farm.name}</h3>
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
          disabled={!canEdit}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Edit2 size={14} />
          Editar
        </button>
        {canManagePermissions && (
          <button
            onClick={() => onOpenPermissions(farm)}
            className="px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
            title="Gerenciar permissões"
          >
            <Users size={14} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(farm.id)}
            className="px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

interface FarmManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const STORAGE_KEY = 'agro-farms';

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
  const [farms, setFarms] = useState<Farm[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [availableClientsCount, setAvailableClientsCount] = useState<number | null>(null);
  const [loadingClientsAvailability, setLoadingClientsAvailability] = useState(false);

  // Notificar App.tsx sobre mudanças de view
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('farmViewChange', { detail: view }));
  }, [view]);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [permissionsModalFarm, setPermissionsModalFarm] = useState<Farm | null>(null);

  const formPerms = useFarmPermissions(editingFarm?.id ?? null, user?.id, user?.role);
  const batchPerms = useBatchFarmPermissions(
    farms.map(f => f.id),
    user?.id,
    user?.role,
  );
  const formReadOnly = editingFarm ? !formPerms.canEdit('farms:form') : false;

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
    const formatted = formatNumberWithDecimals(value);
    setFormData({ ...formData, [field]: formatted });

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

  // Handle blur event to ensure 2 decimals are always shown
  const handleNumericBlur = (field: string) => {
    const currentValue = formData[field as keyof typeof formData] as string;
    if (!currentValue) return;

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

  // Handle currency input change (without decimals, only thousands separator)
  const handleCurrencyChange = (field: string, value: string) => {
    // Remove all non-numeric characters and remove "R$"
    const cleaned = value.replace(/[^\d]/g, '').replace('R$', '').trim();

    // Format with thousands separator (.) only, no decimals
    if (cleaned) {
      const formatted = cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setFormData({ ...formData, [field]: formatted });
    } else {
      setFormData({ ...formData, [field]: '' });
    }
  };

  // Format integer number for display (with thousands separator, no decimals)
  const formatIntegerForDisplay = (value: number | undefined): string => {
    if (value === undefined || value === null || isNaN(value)) return '';
    // Convert to integer and format with thousands separator
    const integerValue = Math.floor(value);
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

  // Load farms from localStorage
  useEffect(() => {
    loadFarms();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchAvailableClients = async () => {
      if (!user) {
        if (isMounted) {
          setAvailableClientsCount(0);
          setLoadingClientsAvailability(false);
        }
        return;
      }

      setLoadingClientsAvailability(true);
      try {
        let query = supabase.from('clients').select('*', { count: 'exact', head: true });

        if (user.qualification === 'analista' && user.role !== 'admin') {
          query = query.eq('analyst_id', user.id);
        }

        const { count, error } = await query;
        if (error) {
          console.error('[FarmManagement] Error loading clients count:', error);
          if (isMounted) setAvailableClientsCount(0);
          return;
        }

        if (isMounted) setAvailableClientsCount(count ?? 0);
      } catch (err) {
        console.error('[FarmManagement] Unexpected error loading clients count:', err);
        if (isMounted) setAvailableClientsCount(0);
      } finally {
        if (isMounted) setLoadingClientsAvailability(false);
      }
    };

    fetchAvailableClients();

    const handleClientsChanged = () => {
      fetchAvailableClients();
    };

    window.addEventListener('clientAdded', handleClientsChanged);
    window.addEventListener('clientUpdated', handleClientsChanged);
    window.addEventListener('clientDeleted', handleClientsChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('clientAdded', handleClientsChanged);
      window.removeEventListener('clientUpdated', handleClientsChanged);
      window.removeEventListener('clientDeleted', handleClientsChanged);
    };
  }, [user]);

  // Se houver fazendas e estiver no formulário vazio (sem estar criando nova), mudar para lista
  useEffect(() => {
    if (!isLoading && farms.length > 0 && view === 'form' && !editingFarm && !isCreatingNew) {
      setView('list');
    }
  }, [farms.length, isLoading, view, editingFarm, isCreatingNew]);

  const loadFarms = async () => {
    try {
      // Primeiro, tentar carregar do banco de dados (farms vinculadas ao analista/cliente)
      if (user && (user.qualification === 'analista' || user.role === 'admin')) {
        // Buscar fazendas do banco que pertencem aos clientes do analista
        const { data: dbFarms, error: dbError } = await supabase
          .from('farms')
          .select('*')
          .order('created_at', { ascending: false });

        if (!dbError && dbFarms && dbFarms.length > 0) {
          const convertedFarms = mapFarmsFromDatabase(dbFarms);
          setFarms(convertedFarms);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(convertedFarms));
          return convertedFarms;
        }
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const farmsArray = Array.isArray(parsed) ? parsed : [];
        setFarms(farmsArray);
        return farmsArray;
      }
      setFarms([]);
      return [];
    } catch (error) {
      console.error('[FarmManagement] Erro ao carregar fazendas:', error);
      setFarms([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const saveFarms = (farmsToSave: Farm[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(farmsToSave));
      setFarms(farmsToSave);
    } catch (error) {
      console.error('[FarmManagement] Erro ao salvar cache local:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validar se há cliente selecionado (obrigatório para criar fazenda)
    if (!editingFarm && !selectedClient) {
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

    // Validar se a soma dos valores de operação é igual ao valor da propriedade
    const propertyValueNum = parseInteger(formData.propertyValue);
    const operationPecuaryNum = parseInteger(formData.operationPecuary) || 0;
    const operationAgriculturalNum = parseInteger(formData.operationAgricultural) || 0;
    const otherOperationsNum = parseInteger(formData.otherOperations) || 0;
    const sumOperations = operationPecuaryNum + operationAgriculturalNum + otherOperationsNum;

    if (propertyValueNum !== undefined && propertyValueNum > 0) {
      if (sumOperations !== propertyValueNum) {
        newErrors.operationSum = `A soma dos valores de operação (${formatIntegerForDisplay(sumOperations)}) deve ser igual ao valor da propriedade (${formatIntegerForDisplay(propertyValueNum)})`;
      }
    }

    // Validar se a área total bate com a soma das áreas parciais
    const totalAreaValue = parseNumber(formData.totalArea);
    const calculatedSum = calculateTotalAreaSum();

    // Se a área total foi preenchida, deve bater com a soma das áreas parciais
    if (totalAreaValue !== undefined && totalAreaValue > 0) {
      const difference = Math.abs(totalAreaValue - calculatedSum);
      if (difference >= 0.01) {
        // Tolerância de 0.01 ha para arredondamentos
        const formattedTotal = formatNumberForDisplay(totalAreaValue);
        const formattedSum = formatNumberForDisplay(calculatedSum);
        newErrors.totalArea = `A área total (${formattedTotal} ha) não corresponde à soma das áreas parciais (${formattedSum} ha). Por favor, verifique os valores.`;
      }
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

  const linkFarmToClient = async (farmId: string, clientId: string) => {
    try {
      // Verificar se o vínculo já existe
      const { data: existing } = await supabase
        .from('client_farms')
        .select('id')
        .eq('client_id', clientId)
        .eq('farm_id', farmId)
        .single();

      if (!existing) {
        // Criar vínculo se não existir
        const { error } = await supabase.from('client_farms').insert({
          client_id: clientId,
          farm_id: farmId,
        });

        if (error) {
          console.error('[FarmManagement] Error linking farm to client:', error);
        } else {
          console.log('[FarmManagement] Farm linked to client successfully');
        }
      }
    } catch (err: any) {
      console.error('[FarmManagement] Error linking farm to client:', err);
    }
  };

  const linkFarmToAnalyst = async (farmId: string, analystId: string, isResponsible = false) => {
    try {
      // Verificar se o vínculo já existe
      const { data: existing } = await supabase
        .from('analyst_farms')
        .select('id')
        .eq('analyst_id', analystId)
        .eq('farm_id', farmId)
        .maybeSingle();

      if (!existing) {
        // Criar vínculo se não existir
        const { error } = await supabase.from('analyst_farms').insert({
          analyst_id: analystId,
          farm_id: farmId,
          is_responsible: isResponsible,
          permissions: {},
        });

        if (error) {
          console.error('[FarmManagement] Error linking farm to analyst:', error);
        } else {
          console.log('[FarmManagement] Farm linked to analyst successfully');
        }
      }
    } catch (err: any) {
      console.error('[FarmManagement] Error linking farm to analyst:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação adicional: não permitir criar fazenda sem cliente
    if (!editingFarm && !selectedClient) {
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

    // Verificar se o cliente está vinculado ao analista
    if (!editingFarm && selectedClient && user) {
      if (user.role !== 'admin' && selectedClient.analystId !== user.id) {
        onToast?.('A organização selecionada não está vinculada ao seu perfil de analista', 'error');
        setErrors({ client: 'A organização selecionada não está vinculada ao seu perfil de analista' });
        return;
      }
    }

    if (!validateForm()) {
      return;
    }

    const now = new Date().toISOString();
    let updatedFarms: Farm[];

    // Prepare farm data with parsed numeric values
    const farmData: Partial<Farm> = {
      name: formData.name,
      country: formData.country,
      state: formData.state,
      city: formData.city,
      totalArea: parseNumber(formData.totalArea),
      pastureArea: parseNumber(formData.pastureArea),
      forageProductionArea: parseNumber(formData.forageProductionArea),
      agricultureAreaOwned: parseNumber(formData.agricultureAreaOwned),
      agricultureAreaLeased: parseNumber(formData.agricultureAreaLeased),
      otherCrops: parseNumber(formData.otherCrops),
      infrastructure: parseNumber(formData.infrastructure),
      reserveAndAPP: parseNumber(formData.reserveAndAPP),
      otherArea: parseNumber(formData.otherArea),
      propertyValue: parseInteger(formData.propertyValue),
      operationPecuary: parseInteger(formData.operationPecuary),
      operationAgricultural: parseInteger(formData.operationAgricultural),
      otherOperations: parseInteger(formData.otherOperations),
      agricultureVariation: formData.agricultureVariation,
      propertyType: formData.propertyType,
      weightMetric: formData.weightMetric,
      averageHerd: formData.averageHerd ? parseInt(formData.averageHerd.replace(/\./g, ''), 10) : undefined,
      herdValue: parseInteger(formData.herdValue),
      commercializesGenetics: formData.commercializesGenetics,
      productionSystem: formData.productionSystem as Farm['productionSystem'],
    };

    if (editingFarm) {
      // Update existing farm
      updatedFarms = farms.map(farm =>
        farm.id === editingFarm.id
          ? ({
              ...farm,
              ...farmData,
              updatedAt: now,
            } as Farm)
          : farm,
      );
    } else {
      // Create new farm
      const newFarm: Farm = {
        id: `farm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...farmData,
        createdAt: now,
        updatedAt: now,
      } as Farm;
      updatedFarms = [...farms, newFarm];
    }

    saveFarms(updatedFarms);

    // Para novas fazendas, sempre deve haver cliente selecionado (já validado acima)
    if (!editingFarm) {
      if (!selectedClient) {
        onToast?.('Erro: Organização não selecionada. A fazenda não foi cadastrada.', 'error');
        return;
      }

      const newFarm = updatedFarms[updatedFarms.length - 1];

      try {
        const { base, extended } = buildFarmDatabasePayload(newFarm, selectedClient.id);

        let { error: dbError } = await supabase.from('farms').insert(extended);
        if (dbError && isMissingColumnError(dbError)) {
          ({ error: dbError } = await supabase.from('farms').insert(base));
        }

        if (dbError) {
          console.error('[FarmManagement] Error saving farm to database:', dbError);
          onToast?.('Erro ao salvar fazenda no banco de dados: ' + dbError.message, 'error');
          return;
        }

        await linkFarmToClient(newFarm.id, selectedClient.id);
        if (user && (user.qualification === 'analista' || user.role === 'admin')) {
          await linkFarmToAnalyst(newFarm.id, user.id, true);
        }
      } catch (err) {
        console.error('[FarmManagement] Error saving farm to database:', err);
        onToast?.('Erro ao salvar fazenda no banco de dados', 'error');
        return;
      }

      // Disparar evento para atualizar o FarmSelector
      window.dispatchEvent(new CustomEvent('farmAdded'));
    } else if (editingFarm) {
      try {
        const updatedFarm: Partial<Farm> = {
          ...farmData,
          id: editingFarm.id,
        };
        const clientIdForDb = selectedClient?.id || editingFarm.clientId || null;
        const { base, extended } = buildFarmDatabasePayload(updatedFarm, clientIdForDb);

        let { error: dbError } = await supabase.from('farms').upsert(extended, { onConflict: 'id' });

        if (dbError && isMissingColumnError(dbError)) {
          ({ error: dbError } = await supabase.from('farms').upsert(base, { onConflict: 'id' }));
        }

        if (dbError) {
          console.error('[FarmManagement] Error updating farm in database:', dbError);
          onToast?.('Erro ao atualizar fazenda no banco de dados: ' + dbError.message, 'error');
          return;
        }
      } catch (err) {
        console.error('[FarmManagement] Error updating farm in database:', err);
        onToast?.('Erro ao atualizar fazenda no banco de dados', 'error');
        return;
      }

      window.dispatchEvent(new CustomEvent('farmUpdated'));
    }

    // Show success toast with animation
    onToast?.(editingFarm ? 'Fazenda atualizada com sucesso!' : 'Fazenda cadastrada com sucesso!', 'success');

    // Reset form
    resetForm();
    setIsCreatingNew(false); // Marcar que não está mais criando

    // Switch to list view if there are farms (saveFarms already updates the state)
    if (updatedFarms.length > 0) {
      setView('list');
    }
  };

  const handleDelete = async (farmId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta fazenda?')) {
      try {
        // Primeiro, remover vínculos client_farms e analyst_farms
        await supabase.from('client_farms').delete().eq('farm_id', farmId);
        await supabase.from('analyst_farms').delete().eq('farm_id', farmId);

        // Depois, excluir do banco de dados
        const { error: dbError } = await supabase.from('farms').delete().eq('id', farmId);

        if (dbError) {
          console.error('[FarmManagement] Error deleting farm from database:', dbError);
        }

        // Atualizar localStorage
        const updatedFarms = farms.filter(farm => farm.id !== farmId);
        saveFarms(updatedFarms);

        onToast?.('Fazenda excluída com sucesso!', 'success');

        // Disparar evento para atualizar FarmSelector
        window.dispatchEvent(new CustomEvent('farmUpdated'));
      } catch (err) {
        console.error('[FarmManagement] Error deleting farm:', err);
        onToast?.('Erro ao excluir fazenda', 'error');
      }
    }
  };

  // Format number for display (with thousands separator (.) and 2 decimals (,))
  const formatNumberForDisplay = (value: number | undefined): string => {
    if (value === undefined || value === null || isNaN(value)) return '';
    // Format with 2 decimals, then replace dot with comma for decimal separator
    const formatted = value.toFixed(2);
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
    setFormData({
      name: farm.name,
      country: farm.country,
      state: farm.state,
      city: farm.city,
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
      agricultureVariation: farm.agricultureVariation || 0,
      propertyType: farm.propertyType,
      weightMetric: farm.weightMetric,
      averageHerd: farm.averageHerd ? farm.averageHerd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '',
      herdValue: formatIntegerForDisplay(farm.herdValue),
      commercializesGenetics: farm.commercializesGenetics,
      productionSystem: farm.productionSystem,
    });
    setView('form');
  };

  const resetForm = () => {
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
    });
    setEditingFarm(null);
    setErrors({});
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

  // List View
  if (view === 'list') {
    return (
      <>
        <div className="h-full flex flex-col p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-ai-text">Cadastro de Fazendas</h1>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto content-start">
            {farms.map(farm => (
              <FarmCard
                key={farm.id}
                farm={farm}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenPermissions={setPermissionsModalFarm}
                canManagePermissions={batchPerms[farm.id]?.isResponsible ?? false}
                perms={batchPerms[farm.id] ?? NO_ACCESS}
              />
            ))}
          </div>
        </div>
        {permissionsModalFarm && (
          <FarmPermissionsModal
            open={!!permissionsModalFarm}
            onClose={() => setPermissionsModalFarm(null)}
            farmId={permissionsModalFarm.id}
            farmName={permissionsModalFarm.name}
            isCurrentUserResponsible={batchPerms[permissionsModalFarm.id]?.isResponsible ?? false}
            onToast={onToast}
          />
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
        <fieldset disabled={formReadOnly} className={formReadOnly ? 'opacity-75' : ''}>
          <div className="flex flex-col min-h-0">
            {/* Alerta se não houver cliente selecionado */}
            {!editingFarm && !selectedClient && (
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
                  <option value="Recria-Engorda">Recria-Engorda</option>
                  <option value="Ciclo Completo">Ciclo Completo</option>
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
                <p
                  className={`text-xs font-semibold ${
                    isTotalAreaValid() && formData.totalArea ? 'text-green-600' : 'text-ai-subtext'
                  }`}
                >
                  SOMA TOTAL: {formatNumberForDisplay(calculateTotalAreaSum())} ha
                </p>
              </div>
              <div className="grid grid-cols-5 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ai-text mb-1.5 uppercase tracking-wide">
                    Área Total
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
                    Área Pastagem
                  </label>
                  <input
                    type="text"
                    value={formData.pastureArea}
                    onChange={e => handleNumericChange('pastureArea', e.target.value)}
                    onBlur={() => handleNumericBlur('pastureArea')}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                  />
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
                    Valor da propriedade
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.propertyValue}
                      onChange={e => handleCurrencyChange('propertyValue', e.target.value)}
                      placeholder="0"
                      inputMode="numeric"
                      className="w-full pl-8 pr-2 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                    />
                  </div>
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
                        // Limpar erro quando o usuário começar a digitar
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
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
                        // Limpar erro quando o usuário começar a digitar
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
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
                        // Limpar erro quando o usuário começar a digitar
                        if (errors.operationSum) {
                          setErrors({ ...errors, operationSum: '' });
                        }
                      }}
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
                    <option value="Quilograma (Kg)">Quilograma (Kg)</option>
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
                    Valor do Rebanho
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm text-ai-subtext">
                      R$
                    </span>
                    <input
                      type="text"
                      value={formData.herdValue}
                      onChange={e => handleCurrencyChange('herdValue', e.target.value)}
                      placeholder="0"
                      inputMode="numeric"
                      className="w-full pl-10 pr-3 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                    />
                  </div>
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
        {/* Action Buttons */}
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
            disabled={formReadOnly || (!editingFarm && !selectedClient)}
            className="flex-1 px-4 py-2 text-sm bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!editingFarm && !selectedClient ? 'Selecione uma organização antes de cadastrar uma fazenda' : ''}
          >
            <CheckCircle2 size={16} />
            {editingFarm ? 'Atualizar Fazenda' : 'Cadastrar Fazenda'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FarmManagement;
