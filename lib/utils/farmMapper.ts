import { Farm, PropertyType, WeightMetric, ProductionSystem } from '../../types';

interface DatabaseFarm {
  id: string;
  name: string;
  country: string;
  state?: string | null;
  city: string;
  organization_id?: string | null;
  organizationId?: string | null;
  client_id?: string | null;          // alias legado
  total_area?: string | number | null;
  totalArea?: string | number | null;
  pasture_area?: string | number | null;
  pastureArea?: string | number | null;
  forage_production_area?: string | number | null;
  forageProductionArea?: string | number | null;
  agriculture_area_owned?: string | number | null;
  agricultureAreaOwned?: string | number | null;
  agriculture_area_leased?: string | number | null;
  agricultureAreaLeased?: string | number | null;
  agriculture_area?: string | number | null;
  agricultureArea?: string | number | null;
  other_crops?: string | number | null;
  otherCrops?: string | number | null;
  infrastructure?: string | number | null;
  reserve_and_app?: string | number | null;
  reserveAndAPP?: string | number | null;
  other_area?: string | number | null;
  otherArea?: string | number | null;
  property_value?: string | number | null;
  propertyValue?: string | number | null;
  operation_pecuary?: string | number | null;
  operationPecuary?: string | number | null;
  operation_agricultural?: string | number | null;
  operationAgricultural?: string | number | null;
  other_operations?: string | number | null;
  otherOperations?: string | number | null;
  agriculture_variation?: string | number | null;
  agricultureVariation?: string | number | null;
  property_type?: string | null;
  propertyType?: string | null;
  weight_metric?: string | null;
  weightMetric?: string | null;
  average_herd?: string | number | null;
  averageHerd?: string | number | null;
  herd_value?: string | number | null;
  herdValue?: string | number | null;
  commercializes_genetics?: boolean | null;
  commercializesGenetics?: boolean | null;
  production_system?: string | null;
  productionSystem?: string | null;
  ativo?: boolean | null;
  created_at?: string | null | Date;
  createdAt?: string | null | Date;
  updated_at?: string | null | Date;
  updatedAt?: string | null | Date;
}

function toNum(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

export function mapFarmFromDatabase(dbFarm: DatabaseFarm): Farm {
  const rawWeight = dbFarm.weight_metric ?? dbFarm.weightMetric;
  // Normalizar valor legado 'Quilograma (Kg)' → 'Kg'
  const weightMetric: WeightMetric =
    rawWeight === 'Quilograma (Kg)' ? 'Kg' : ((rawWeight as WeightMetric) || 'Arroba (@)');

  const resolveDate = (d: string | Date | null | undefined): string => {
    if (!d) return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : d;
  };

  return {
    id: dbFarm.id,
    name: dbFarm.name,
    country: dbFarm.country,
    state: dbFarm.state || '',
    city: dbFarm.city,
    organizationId: dbFarm.organizationId ?? dbFarm.organization_id ?? dbFarm.client_id ?? '',
    totalArea: toNum(dbFarm.totalArea ?? dbFarm.total_area) ?? null,
    pastureArea: toNum(dbFarm.pastureArea ?? dbFarm.pasture_area) ?? null,
    agricultureArea: toNum(dbFarm.agricultureArea ?? dbFarm.agriculture_area) ?? null,
    forageProductionArea: toNum(dbFarm.forageProductionArea ?? dbFarm.forage_production_area) ?? null,
    agricultureAreaOwned: toNum(dbFarm.agricultureAreaOwned ?? dbFarm.agriculture_area_owned) ?? null,
    agricultureAreaLeased: toNum(dbFarm.agricultureAreaLeased ?? dbFarm.agriculture_area_leased) ?? null,
    otherCrops: toNum(dbFarm.otherCrops ?? dbFarm.other_crops) ?? null,
    infrastructure: toNum(dbFarm.infrastructure) ?? null,
    reserveAndAPP: toNum(dbFarm.reserveAndAPP ?? dbFarm.reserve_and_app) ?? null,
    otherArea: toNum(dbFarm.otherArea ?? dbFarm.other_area) ?? null,
    propertyValue: toNum(dbFarm.propertyValue ?? dbFarm.property_value) ?? null,
    operationPecuary: toNum(dbFarm.operationPecuary ?? dbFarm.operation_pecuary) ?? null,
    operationAgricultural: toNum(dbFarm.operationAgricultural ?? dbFarm.operation_agricultural) ?? null,
    otherOperations: toNum(dbFarm.otherOperations ?? dbFarm.other_operations) ?? null,
    agricultureVariation: toNum(dbFarm.agricultureVariation ?? dbFarm.agriculture_variation) ?? 0,
    propertyType: ((dbFarm.propertyType ?? dbFarm.property_type) as PropertyType) || 'Própria',
    weightMetric,
    averageHerd: toNum(dbFarm.averageHerd ?? dbFarm.average_herd) ?? null,
    herdValue: toNum(dbFarm.herdValue ?? dbFarm.herd_value) ?? null,
    commercializesGenetics: dbFarm.commercializesGenetics ?? dbFarm.commercializes_genetics ?? false,
    productionSystem: ((dbFarm.productionSystem ?? dbFarm.production_system) as ProductionSystem) ?? null,
    ativo: dbFarm.ativo ?? true,
    createdAt: resolveDate(dbFarm.createdAt ?? dbFarm.created_at),
    updatedAt: resolveDate(dbFarm.updatedAt ?? dbFarm.updated_at),
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
