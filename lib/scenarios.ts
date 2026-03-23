import { CattleScenario, CattleCalculatorInputs, CalculationResults, ComparatorResult } from '../types';
import { sanitizeText } from './inputSanitizer';
import { logger } from './logger';
import { normalizeCattleCalculatorInputs } from './cattleInputs';
import { getAuthHeaders } from './session';

const log = logger.withContext({ component: 'scenarios' });

const MAX_SCENARIOS = 10;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(id: string, fieldName: string): void {
  if (!id || !UUID_REGEX.test(id)) {
    throw new Error(`${fieldName} inválido.`);
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export interface ScenarioFilters {
  organizationId?: string | null;
  farmId?: string | null;
}

/**
 * Get all saved scenarios for the current user or filtered by client/farm
 */
export const getSavedScenarios = async (userId: string, filters?: ScenarioFilters): Promise<CattleScenario[]> => {
  try {
    const params = new URLSearchParams({ userId });
    if (filters?.organizationId) params.set('orgId', filters.organizationId);
    if (filters?.farmId) params.set('farmId', filters.farmId);

    const res = await apiFetch(`/api/cattle-scenarios?${params}`);
    if (!res.ok) return [];

    const json = await res.json();
    if (!json.ok) return [];

    const data: Array<Record<string, unknown>> = json.data ?? [];
    return data
      .map(scenario => {
        if (!scenario.id || !scenario.userId || !scenario.name || !scenario.inputs) {
          log.warn('Invalid scenario data found, skipping');
          return null;
        }
        return {
          id: scenario.id as string,
          user_id: scenario.userId as string,
          client_id: (scenario.organizationId as string | null) ?? null,
          organizationId: (scenario.organizationId as string | null) ?? null,
          farm_id: (scenario.farmId as string | null) ?? null,
          farm_name: (scenario.farmName as string | null) ?? null,
          name: scenario.name as string,
          inputs: scenario.inputs as CattleCalculatorInputs,
          results: scenario.results ? (scenario.results as CalculationResults) : undefined,
          created_at: scenario.createdAt as string,
          updated_at: (scenario.updatedAt as string) || (scenario.createdAt as string),
        } as CattleScenario;
      })
      .filter((scenario): scenario is CattleScenario => scenario !== null);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error('Error in getSavedScenarios', error);
    throw new Error(error.message || 'Erro ao carregar cenários salvos');
  }
};

/**
 * Check if user has reached the limit of saved scenarios.
 */
export const checkScenarioLimit = async (userId: string): Promise<boolean> => {
  try {
    const res = await apiFetch(`/api/cattle-scenarios?userId=${encodeURIComponent(userId)}&countOnly=true`);
    if (!res.ok) return false;
    const json = await res.json();
    return (json.data?.count ?? 0) >= MAX_SCENARIOS;
  } catch {
    return false;
  }
};

const FIELD_LABELS: Record<keyof CattleCalculatorInputs, string> = {
  pesoCompra: 'Peso de Compra',
  valorCompra: 'Valor de Compra',
  pesoAbate: 'Peso de Abate',
  rendimentoCarcaca: 'Rendimento de Carcaça',
  valorVenda: 'Valor de Venda',
  gmd: 'GMD',
  custoMensal: 'Custo Mensal',
  lotacao: 'Lotação',
};

const validateScenarioData = (name?: string, inputs?: CattleCalculatorInputs) => {
  if (name !== undefined) {
    if (!name || name.trim() === '') {
      throw new Error('O nome do cenário é obrigatório');
    }
    if (name.trim().length > 200) {
      throw new Error('O nome do cenário é muito longo (máx 200 caracteres)');
    }
  }

  if (inputs !== undefined) {
    if (!inputs || typeof inputs !== 'object') {
      throw new Error('Dados de entrada inválidos');
    }

    const requiredFields: (keyof CattleCalculatorInputs)[] = [
      'pesoCompra',
      'valorCompra',
      'pesoAbate',
      'rendimentoCarcaca',
      'valorVenda',
      'gmd',
      'custoMensal',
      'lotacao',
    ];

    for (const field of requiredFields) {
      const label = FIELD_LABELS[field];
      const value = inputs[field];
      if (value === undefined || value === null || isNaN(Number(value))) {
        throw new Error(`Campo obrigatório inválido: ${label}`);
      }
      if (Number(value) < 0) {
        throw new Error(`O campo ${label} não pode ser negativo`);
      }
      if (Number(value) > 1_000_000) {
        throw new Error(`O valor de ${label} parece excessivo (máx 1.000.000)`);
      }
    }
  }
};

export interface SaveScenarioOptions {
  organizationId?: string | null;
  farmId?: string | null;
  farmName?: string | null;
}

export const saveReportPdf = async (
  userId: string,
  name: string,
  pdfBase64: string,
  reportType: string,
  options?: SaveScenarioOptions,
): Promise<CattleScenario> => {
  validateUUID(userId, 'ID do usuário');

  const sanitizedName = sanitizeText(name);
  if (!sanitizedName) {
    throw new Error('O nome do relatório é obrigatório');
  }

  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new Error('PDF inválido para salvamento');
  }

  if (!reportType || typeof reportType !== 'string') {
    throw new Error('Tipo de relatório inválido');
  }

  const res = await apiFetch('/api/cattle-scenarios', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      organizationId: options?.organizationId || null,
      farmId: options?.farmId || null,
      farmName: options?.farmName || null,
      name: sanitizedName,
      inputs: {},
      results: {
        type: reportType,
        pdf_base64: pdfBase64,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao salvar relatório.');
  }

  const json = await res.json();
  const data = json.data;
  return {
    ...data,
    user_id: data.userId,
    client_id: data.organizationId ?? null,
    organizationId: data.organizationId ?? null,
    farm_id: data.farmId ?? null,
    farm_name: data.farmName ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt || data.createdAt,
    inputs: data.inputs as CattleCalculatorInputs,
    results: data.results as CalculationResults | undefined,
  };
};

/**
 * Save a comparator report (PDF + 3 scenarios)
 */
export const saveComparatorReport = async (
  userId: string,
  name: string,
  comparatorResult: ComparatorResult,
  options?: SaveScenarioOptions,
): Promise<CattleScenario> => {
  validateUUID(userId, 'ID do usuário');

  const sanitizedName = sanitizeText(name);
  if (!sanitizedName) {
    throw new Error('O nome do comparativo é obrigatório');
  }

  if (!comparatorResult.pdf_base64 || typeof comparatorResult.pdf_base64 !== 'string') {
    throw new Error('PDF do comparativo inválido para salvamento');
  }

  if (
    !comparatorResult.scenarios ||
    !Array.isArray(comparatorResult.scenarios) ||
    comparatorResult.scenarios.length < 2 ||
    comparatorResult.scenarios.length > 3
  ) {
    throw new Error('O comparativo deve conter 2 ou 3 cenários');
  }

  const validIds = comparatorResult.scenarios.length === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
  const hasValidIds = comparatorResult.scenarios.every(
    (s: { id?: string }) => s?.id && validIds.includes(s.id),
  );
  if (!hasValidIds) {
    throw new Error('IDs dos cenários inválidos (esperado A, B ou A, B, C)');
  }

  const res = await apiFetch('/api/cattle-scenarios', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      organizationId: options?.organizationId || null,
      farmId: options?.farmId || null,
      farmName: options?.farmName || null,
      name: sanitizedName,
      inputs: {},
      results: comparatorResult,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao salvar comparativo.');
  }

  const json = await res.json();
  const data = json.data;
  return {
    ...data,
    user_id: data.userId,
    client_id: data.organizationId ?? null,
    organizationId: data.organizationId ?? null,
    farm_id: data.farmId ?? null,
    farm_name: data.farmName ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt || data.createdAt,
    inputs: (data.inputs || {}) as CattleCalculatorInputs,
    results: data.results as CalculationResults | undefined,
  };
};

/**
 * Save a new scenario
 */
export const saveScenario = async (
  userId: string,
  name: string,
  inputs: CattleCalculatorInputs,
  results?: CalculationResults,
  options?: SaveScenarioOptions,
): Promise<CattleScenario> => {
  validateUUID(userId, 'ID do usuário');

  const sanitizedName = sanitizeText(name);
  const normalizedInputs = normalizeCattleCalculatorInputs(inputs);
  validateScenarioData(sanitizedName, normalizedInputs);

  // Check limit
  const atLimit = await checkScenarioLimit(userId);
  if (atLimit) {
    throw new Error(`Você já possui ${MAX_SCENARIOS} cenários salvos. Exclua um para salvar outro.`);
  }

  const res = await apiFetch('/api/cattle-scenarios', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      organizationId: options?.organizationId || null,
      farmId: options?.farmId || null,
      farmName: options?.farmName || null,
      name: sanitizedName,
      inputs: normalizedInputs,
      results,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao salvar cenário');
  }

  const json = await res.json();
  const data = json.data;
  return {
    ...data,
    user_id: data.userId,
    client_id: data.organizationId ?? null,
    organizationId: data.organizationId ?? null,
    farm_id: data.farmId ?? null,
    farm_name: data.farmName ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt || data.createdAt,
    inputs: data.inputs as CattleCalculatorInputs,
    results: data.results as CalculationResults | undefined,
  };
};

/**
 * Update an existing scenario
 */
export const updateScenario = async (
  scenarioId: string,
  userId: string,
  updates: {
    name?: string;
    inputs?: CattleCalculatorInputs;
    results?: CalculationResults;
  },
): Promise<CattleScenario> => {
  validateUUID(scenarioId, 'ID do cenário');
  validateUUID(userId, 'ID do usuário');

  if (updates.name) updates.name = sanitizeText(updates.name);
  if (updates.inputs) {
    updates.inputs = normalizeCattleCalculatorInputs(updates.inputs);
  }
  validateScenarioData(updates.name, updates.inputs);

  const res = await apiFetch(`/api/cattle-scenarios?id=${encodeURIComponent(scenarioId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ userId, ...updates }),
  });

  if (!res.ok) {
    log.error('Error updating scenario', new Error(`HTTP ${res.status}`));
    throw new Error('Erro ao atualizar cenário');
  }

  const json = await res.json();
  const data = json.data;
  return {
    ...data,
    user_id: data.userId,
    client_id: data.organizationId ?? null,
    organizationId: data.organizationId ?? null,
    farm_id: data.farmId ?? null,
    farm_name: data.farmName ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt || data.createdAt,
    inputs: data.inputs as CattleCalculatorInputs,
    results: data.results as CalculationResults | undefined,
  };
};

/**
 * Delete a scenario
 */
export const deleteScenario = async (scenarioId: string, userId: string): Promise<void> => {
  validateUUID(scenarioId, 'ID do cenário');
  validateUUID(userId, 'ID do usuário');

  const res = await apiFetch(
    `/api/cattle-scenarios?id=${encodeURIComponent(scenarioId)}&userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );

  if (!res.ok) {
    log.error('Error deleting scenario', new Error(`HTTP ${res.status}`));
    throw new Error('Erro ao excluir cenário');
  }
};

/**
 * Get a single scenario by ID
 */
export const getScenario = async (scenarioId: string, userId: string): Promise<CattleScenario | null> => {
  validateUUID(scenarioId, 'ID do cenário');
  validateUUID(userId, 'ID do usuário');

  const res = await apiFetch(
    `/api/cattle-scenarios?id=${encodeURIComponent(scenarioId)}&userId=${encodeURIComponent(userId)}`,
  );

  if (!res.ok) {
    log.error('Error fetching scenario', new Error(`HTTP ${res.status}`));
    throw new Error('Erro ao carregar cenário');
  }

  const json = await res.json();
  const data = json.data;
  if (!data) return null;

  return {
    ...data,
    user_id: data.userId,
    client_id: data.organizationId ?? null,
    organizationId: data.organizationId ?? null,
    farm_id: data.farmId ?? null,
    farm_name: data.farmName ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt || data.createdAt,
    inputs: data.inputs as CattleCalculatorInputs,
    results: data.results as CalculationResults | undefined,
  };
};
