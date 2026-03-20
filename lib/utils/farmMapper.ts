import { Farm, PropertyType, WeightMetric, ProductionSystem } from '../../types';

interface DatabaseFarm {
  id: string;
  name: string;
  country: string;
  state?: string | null;
  city: string;
  organization_id?: string | null;
  client_id?: string | null;          // alias legado
  total_area?: string | number | null;
  pasture_area?: string | number | null;
  forage_production_area?: string | number | null;
  agriculture_area_owned?: string | number | null;
  agriculture_area_leased?: string | number | null;
  agriculture_area?: string | number | null;
  other_crops?: string | number | null;
  infrastructure?: string | number | null;
  reserve_and_app?: string | number | null;
  other_area?: string | number | null;
  property_value?: string | number | null;
  operation_pecuary?: string | number | null;
  operation_agricultural?: string | number | null;
  other_operations?: string | number | null;
  agriculture_variation?: string | number | null;
  property_type?: string | null;
  weight_metric?: string | null;
  average_herd?: string | number | null;
  herd_value?: string | number | null;
  commercializes_genetics?: boolean | null;
  production_system?: string | null;
  ativo?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function toNum(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

export function mapFarmFromDatabase(dbFarm: DatabaseFarm): Farm {
  const rawWeight = dbFarm.weight_metric;
  // Normalizar valor legado 'Quilograma (Kg)' → 'Kg'
  const weightMetric: WeightMetric =
    rawWeight === 'Quilograma (Kg)' ? 'Kg' : ((rawWeight as WeightMetric) || 'Arroba (@)');

  return {
    id: dbFarm.id,
    name: dbFarm.name,
    country: dbFarm.country,
    state: dbFarm.state || '',
    city: dbFarm.city,
    organizationId: dbFarm.organization_id ?? dbFarm.client_id ?? '',
    totalArea: toNum(dbFarm.total_area) ?? null,
    pastureArea: toNum(dbFarm.pasture_area) ?? null,
    agricultureArea: toNum(dbFarm.agriculture_area) ?? null,
    forageProductionArea: toNum(dbFarm.forage_production_area) ?? null,
    agricultureAreaOwned: toNum(dbFarm.agriculture_area_owned) ?? null,
    agricultureAreaLeased: toNum(dbFarm.agriculture_area_leased) ?? null,
    otherCrops: toNum(dbFarm.other_crops) ?? null,
    infrastructure: toNum(dbFarm.infrastructure) ?? null,
    reserveAndAPP: toNum(dbFarm.reserve_and_app) ?? null,
    otherArea: toNum(dbFarm.other_area) ?? null,
    propertyValue: toNum(dbFarm.property_value) ?? null,
    operationPecuary: toNum(dbFarm.operation_pecuary) ?? null,
    operationAgricultural: toNum(dbFarm.operation_agricultural) ?? null,
    otherOperations: toNum(dbFarm.other_operations) ?? null,
    agricultureVariation: toNum(dbFarm.agriculture_variation) ?? 0,
    propertyType: (dbFarm.property_type as PropertyType) || 'Própria',
    weightMetric,
    averageHerd: toNum(dbFarm.average_herd) ?? null,
    herdValue: toNum(dbFarm.herd_value) ?? null,
    commercializesGenetics: dbFarm.commercializes_genetics ?? false,
    productionSystem: (dbFarm.production_system as ProductionSystem) ?? null,
    ativo: dbFarm.ativo ?? true,
    createdAt: dbFarm.created_at || new Date().toISOString(),
    updatedAt: dbFarm.updated_at || new Date().toISOString(),
  };
}

export function mapFarmsFromDatabase(dbFarms: DatabaseFarm[]): Farm[] {
  return dbFarms.map(mapFarmFromDatabase);
}

/**
 * Monta o payload para insert/upsert no banco.
 * Retorna { base, extended } onde:
 *   - base: campos da tabela original (compatibilidade)
 *   - extended: base + colunas novas (dimensões v2)
 */
export function buildFarmDatabasePayload(farm: Partial<Farm>, organizationId?: string | null) {
  const agricultureTotal =
    ((farm.agricultureAreaOwned || 0) + (farm.agricultureAreaLeased || 0)) || null;
  const orgId = organizationId ?? farm.organizationId ?? null;

  const base: Record<string, unknown> = {
    id: farm.id,
    name: farm.name,
    country: farm.country,
    state: farm.state || null,
    city: farm.city,
    organization_id: orgId,
    client_id: orgId,               // alias legado para compatibilidade
    total_area: farm.totalArea ?? null,
    pasture_area: farm.pastureArea ?? null,
    agriculture_area: agricultureTotal,
    other_crops: farm.otherCrops ?? null,
    infrastructure: farm.infrastructure ?? null,
    reserve_and_app: farm.reserveAndAPP ?? null,
    property_value: farm.propertyValue ?? null,
    operation_pecuary: farm.operationPecuary ?? null,
    operation_agricultural: farm.operationAgricultural ?? null,
    other_operations: farm.otherOperations ?? null,
    agriculture_variation: farm.agricultureVariation ?? 0,
    property_type: farm.propertyType,
    weight_metric: farm.weightMetric,
    average_herd: farm.averageHerd ?? null,
    herd_value: farm.herdValue ?? null,
    commercializes_genetics: farm.commercializesGenetics ?? false,
    production_system: farm.productionSystem || null,
    ativo: farm.ativo ?? true,
  };

  const extended: Record<string, unknown> = {
    ...base,
    forage_production_area: farm.forageProductionArea ?? null,
    agriculture_area_owned: farm.agricultureAreaOwned ?? null,
    agriculture_area_leased: farm.agricultureAreaLeased ?? null,
    other_area: farm.otherArea ?? null,
  };

  return { base, extended };
}

export function isMissingColumnError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || '').toLowerCase();
  return msg.includes('in the schema cache') || (msg.includes("could not find the '") && msg.includes("' column"));
}
