/**
 * Reconstrução do mapa por data (linha do tempo) + helpers de realocação/tolerância.
 *
 * Módulo PURO (sem React/Leaflet/turf) para ser testável de forma isolada — espelha
 * o padrão de agents/pecuario/gestaoLotes/util.ts. Recebe as versões (do endpoint
 * /api/area-versoes) e devolve o conjunto de Area vigente numa data.
 */
import type { Area, Nivel, Uso } from './types';

// Mirror de areasClient.fazRootId / util.cleanRing — inlinado para manter o módulo
// puro (sem importar a cadeia que puxa turf), preservando o mesmo comportamento.
const FAZ_PREFIX = 'faz:';
export const fazRootId = (farmId: string) => FAZ_PREFIX + farmId;

/** Limpa um anel [lat,lng][]: descarta não-finitos, fora de faixa e o (0,0). */
export function cleanRing(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const out: [number, number][] = [];
  for (const p of coords as any[]) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;
    out.push([lat, lng]);
  }
  return out;
}

export interface VersaoLike {
  areaId: string;
  nivel: Nivel;                // 'retiro'|'setor'|'local'
  name?: string | null;
  parentId?: string | null;
  geometry?: unknown;
  geometrySource?: string | null;
  uso?: string | null;
  tipo?: string | null;
  validFrom: string;           // 'AAAA-MM-DD'
  validTo?: string | null;     // null = aberta
}

export interface ReconstructLike {
  farmId?: string;
  farmName?: string | null;
  perimeter?: { geometry: unknown; source?: string | null } | null;
  retiros?: VersaoLike[];
  setores?: VersaoLike[];
  locais?: VersaoLike[];
}

/** Vigente em X ⇔ validFrom <= X AND (validTo == null OR validTo > X). */
export function vigenteEm(v: VersaoLike, date: string): boolean {
  if (v.validFrom > date) return false;
  return v.validTo == null || v.validTo > date;
}

export function versaoToArea(v: VersaoLike, root: string): Area {
  return {
    id: v.areaId,
    nivel: v.nivel,
    nome: v.name ?? '',
    parent: v.parentId ?? root,
    tipo: v.tipo ?? null,
    uso: (v.uso as Uso) ?? null,
    coords: cleanRing(v.geometry),
    fonte: (v.geometrySource as any) || 'desenho',
    dataInicial: v.validFrom ?? null,
    visivel: true,
  };
}

/**
 * Reconstrói o conjunto de Area vigente numa data. Aceita o DTO do endpoint (já
 * agrupado por nível) ou uma lista plana de versões (testes). Mantém só a versão
 * vigente de cada identidade (intervalo meio-aberto). Inclui a raiz "fazenda" a
 * partir do perímetro, quando disponível.
 */
export function reconstructAsOf(
  input: ReconstructLike | VersaoLike[],
  date: string,
  opts: { farmName?: string | null; farmId?: string; perimeter?: { geometry: unknown; source?: string | null } | null } = {},
): Area[] {
  const isArray = Array.isArray(input);
  const versoes: VersaoLike[] = isArray
    ? (input as VersaoLike[])
    : [...(input.retiros ?? []), ...(input.setores ?? []), ...(input.locais ?? [])];
  const farmId = (isArray ? opts.farmId : (input.farmId ?? opts.farmId)) ?? '';
  const farmName = (isArray ? opts.farmName : (input.farmName ?? opts.farmName)) ?? 'Fazenda';
  const perimeter = (isArray ? opts.perimeter : (input.perimeter ?? opts.perimeter)) ?? null;
  const root = fazRootId(farmId);

  // Uma versão por identidade: a vigente em `date` (se dado bruto vier desordenado,
  // fica a de maior validFrom — empate impossível com intervalos não sobrepostos).
  const porArea = new Map<string, VersaoLike>();
  for (const v of versoes) {
    if (!vigenteEm(v, date)) continue;
    const cur = porArea.get(v.areaId);
    if (!cur || v.validFrom > cur.validFrom) porArea.set(v.areaId, v);
  }

  const out: Area[] = [];
  if (perimeter?.geometry) {
    out.push({
      id: root, nivel: 'fazenda', nome: farmName ?? 'Fazenda', parent: null, tipo: null, uso: null,
      coords: cleanRing(perimeter.geometry),
      fonte: (perimeter.source as any) || 'desenho', dataInicial: null, visivel: true,
    });
  }
  for (const v of porArea.values()) out.push(versaoToArea(v, root));
  return out;
}

/**
 * Conservação de área (split/merge): a soma dos destinos deve bater com a origem
 * dentro de uma tolerância relativa OU absoluta (em ha).
 */
export function dentroDaTolerancia(esperado: number, obtido: number, relPct = 0.05, absHa = 0.5): boolean {
  const dif = Math.abs(esperado - obtido);
  return dif <= absHa || (esperado > 0 && dif <= esperado * relPct);
}

// ── Realocação de rebanho (409 REBANHO_PENDENTE) ──────────────────────────────

export interface RebanhoCategoria { categoriaId: string; categoriaNome?: string; quantidade: number; pesoKgCabeca: string; }
export interface RebanhoPendenteLocal { localId: string; name: string; total: number; porCategoria: RebanhoCategoria[]; }
export interface RebanhoPendente { code: 'REBANHO_PENDENTE'; locais: RebanhoPendenteLocal[]; }

/** Extrai o payload REBANHO_PENDENTE de um erro de API (ou null). */
export function parseRebanhoPendente(err: any): RebanhoPendente | null {
  const p = err?.payload ?? err ?? null;
  if (p && p.code === 'REBANHO_PENDENTE' && Array.isArray(p.locais)) {
    return { code: 'REBANHO_PENDENTE', locais: p.locais };
  }
  return null;
}

/**
 * Valida a realocação: cada local de origem pendente precisa de um destino.
 * escolhas: origemLocalId → destinoRef. Retorna ok=false com os faltantes.
 */
export function mergeRealocacao(
  pendentes: RebanhoPendenteLocal[],
  escolhas: Record<string, string>,
): { ok: true; realocacao: Record<string, string> } | { ok: false; faltando: string[] } {
  const faltando = pendentes.filter((l) => !escolhas[l.localId]).map((l) => l.localId);
  if (faltando.length > 0) return { ok: false, faltando };
  return { ok: true, realocacao: escolhas };
}
