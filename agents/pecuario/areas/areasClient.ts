/* ===== Cadastro de Áreas — cliente DB (Neon via /api) =====
 * Substitui a antiga "SEAM" de localStorage: o mapa agora lê/grava a MESMA
 * hierarquia da aba Locais (farm_retiros/farm_setores/farm_locais) + o perímetro
 * da fazenda (farms.perimeter_geometry). Persistência é por linha, sobre ids
 * reais — nunca "apaga tudo e reinsere" (há FKs de movimentos em farm_locais.id).
 *
 * Mapeamento Area ⇄ banco:
 *   - Area.id     = uuid real da linha; a raiz "fazenda" usa id sintético faz:<farmId>
 *   - Area.parent = id da área-pai (setor ?? retiro ?? raiz-fazenda)
 *   - Area.coords = geometry (anel [lat,lng][]) · Area.fonte = geometry_source
 *   - Area.tipo   = farm_locais.tipo (só locais)
 *   - ha (m²→ha) é gravado no campo numérico area/total_area, mantendo a lista em sincronia.
 */
import { cleanRing, areaM2 } from './util';
import type { Area, Nivel, Uso, Fonte } from './types';
import { getAuthHeaders } from '../../../lib/session';

const API = '/api/farm-locations';
const FARMS_API = '/api/farms';

export const FAZ_PREFIX = 'faz:';
export const fazRootId = (farmId: string) => FAZ_PREFIX + farmId;
export const isFazRoot = (id: string) => id.startsWith(FAZ_PREFIX);

interface LevelsDTO { retiro: boolean; setor: boolean; local: boolean; configured?: boolean; usarMapa?: boolean }
interface PerimeterDTO { geometry: unknown; source: string | null }
interface BundleDTO {
  retiros: Array<{ id: string; name: string; totalArea: string | null; isDefault?: boolean; dataInicial: string | null; geometry: unknown; geometrySource: string | null }>;
  setores: Array<{ id: string; retiroId: string | null; name: string; area: string | null; isDefault?: boolean; dataInicial: string | null; geometry: unknown; geometrySource: string | null }>;
  locais: Array<{ id: string; retiroId: string | null; setorId: string | null; name: string; area: string | null; isDefault?: boolean; dataInicial: string | null; geometry: unknown; geometrySource: string | null; tipo: string | null; uso?: string | null }>;
  levels: LevelsDTO;
  perimeter: PerimeterDTO | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  // Auth por Bearer token (sessionStorage) — o app não usa cookie de sessão.
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...authHeaders, ...(init?.headers as Record<string, string> | undefined) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return (json.data ?? json) as T;
}
const post = <T>(api: string, body: unknown) =>
  req<T>(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = <T>(api: string, body: unknown) =>
  req<T>(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const toCoords = (g: unknown): [number, number][] => (Array.isArray(g) ? cleanRing(g) : []);

/** m² → string de hectares (ponto decimal) ou null se polígono inválido. */
function haString(coords: [number, number][]): string | null {
  const m2 = areaM2(coords);
  if (!m2) return null;
  return String(Math.round((m2 / 10000) * 100) / 100);
}

/** Dados de escrita de uma área (FKs já resolvidas pelo chamador). */
export interface AreaWrite {
  nivel: Nivel;
  nome: string;
  coords: [number, number][];
  fonte: Fonte;
  /** texto livre: enum legado OU nome de tipo do catálogo. */
  tipo?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
  /** data inicial do cadastro (ISO 'YYYY-MM-DD') — única por tela. */
  dataInicial?: string | null;
}

// ── Carrega a hierarquia da fazenda como Area[] (raiz fazenda + filhas) ────────
export async function loadAreas(farmId: string, farmName: string): Promise<Area[]> {
  const b = await req<BundleDTO>(`${API}?bundle=${encodeURIComponent(farmId)}`);
  const root = fazRootId(farmId);
  const areas: Area[] = [{
    id: root,
    nivel: 'fazenda',
    nome: farmName || 'Fazenda',
    parent: null,
    tipo: null,
    coords: toCoords(b.perimeter?.geometry),
    fonte: (b.perimeter?.source as Fonte) || 'desenho',
    dataInicial: null,
    visivel: true,
  }];
  // Registros padrão (is_default) são âncoras ocultas: não entram no mapa.
  for (const r of b.retiros) {
    if (r.isDefault) continue;
    areas.push({ id: r.id, nivel: 'retiro', nome: r.name, parent: root, tipo: null,
      coords: toCoords(r.geometry), fonte: (r.geometrySource as Fonte) || 'desenho', dataInicial: r.dataInicial ?? null, visivel: true });
  }
  for (const s of b.setores) {
    if (s.isDefault) continue;
    areas.push({ id: s.id, nivel: 'setor', nome: s.name, parent: s.retiroId || root, tipo: null,
      coords: toCoords(s.geometry), fonte: (s.geometrySource as Fonte) || 'desenho', dataInicial: s.dataInicial ?? null, visivel: true });
  }
  for (const l of b.locais) {
    if (l.isDefault) continue;
    areas.push({ id: l.id, nivel: 'local', nome: l.name, parent: l.setorId || l.retiroId || root,
      tipo: l.tipo || null, uso: (l.uso as Uso) || null,
      coords: toCoords(l.geometry), fonte: (l.geometrySource as Fonte) || 'desenho', dataInicial: l.dataInicial ?? null, visivel: true });
  }
  return areas;
}

export async function getLevels(farmId: string): Promise<LevelsDTO> {
  return req<LevelsDTO>(`${API}?levels=${encodeURIComponent(farmId)}`);
}

export async function setLevels(
  farmId: string,
  levels: LevelsDTO,
  configured?: boolean,
): Promise<void> {
  await post(API, { type: 'levels', farmId, ...levels, ...(configured !== undefined ? { configured } : {}) });
}

// ── Cria uma área (POST no nível certo) → devolve a Area já com id real ────────
export async function createArea(farmId: string, w: AreaWrite): Promise<Area> {
  const root = fazRootId(farmId);
  const ha = haString(w.coords);
  const di = w.dataInicial ?? null;
  if (w.nivel === 'fazenda') {
    await saveFarmPerimeter(farmId, w.coords, w.fonte);
    return { id: root, nivel: 'fazenda', nome: w.nome, parent: null, tipo: null, coords: w.coords, fonte: w.fonte, dataInicial: null, visivel: true };
  }
  if (w.nivel === 'retiro') {
    const row = await post<{ id: string; name: string }>(API, {
      farmId, name: w.nome, totalArea: ha, dataInicial: di, geometry: w.coords, geometrySource: w.fonte,
    });
    return { id: row.id, nivel: 'retiro', nome: row.name, parent: root, tipo: null, coords: w.coords, fonte: w.fonte, dataInicial: di, visivel: true };
  }
  if (w.nivel === 'setor') {
    const row = await post<{ id: string; name: string }>(API, {
      type: 'setor', farmId, retiroId: w.retiroId ?? null, name: w.nome, area: ha, dataInicial: di, geometry: w.coords, geometrySource: w.fonte,
    });
    return { id: row.id, nivel: 'setor', nome: row.name, parent: w.retiroId || root, tipo: null, coords: w.coords, fonte: w.fonte, dataInicial: di, visivel: true };
  }
  const row = await post<{ id: string; name: string }>(API, {
    type: 'local', farmId, retiroId: w.retiroId ?? null, setorId: w.setorId ?? null,
    name: w.nome, area: ha, dataInicial: di, geometry: w.coords, geometrySource: w.fonte, tipo: w.tipo ?? null,
  });
  return { id: row.id, nivel: 'local', nome: row.name, parent: w.setorId || w.retiroId || root,
    tipo: w.tipo ?? null, coords: w.coords, fonte: w.fonte, dataInicial: di, visivel: true };
}

// ── Atualiza só a geometria (edição de forma / import por card) + recalcula o ha ─
// Aceita qualquer objeto com {id, nivel, fonte?} — a Area completa satisfaz o tipo,
// e a aba Locais pode chamar passando um alvo leve sem montar uma Area inteira.
export async function updateAreaGeometry(
  farmId: string,
  area: { id: string; nivel: Nivel; fonte?: Fonte },
  coords: [number, number][],
): Promise<void> {
  const ha = haString(coords);
  if (area.nivel === 'fazenda') { await saveFarmPerimeter(farmId, coords, area.fonte ?? 'kml'); return; }
  if (area.nivel === 'retiro') await patch(API, { id: area.id, totalArea: ha, geometry: coords });
  else if (area.nivel === 'setor') await patch(API, { type: 'setor', id: area.id, area: ha, geometry: coords });
  else await patch(API, { type: 'local', id: area.id, area: ha, geometry: coords });
}

// ── Atualiza nome / tipo / vínculo (parent) de uma área existente ─────────────
export async function updateAreaProps(
  area: Area,
  w: { nome: string; tipo?: string | null; retiroId?: string | null; setorId?: string | null; dataInicial?: string | null },
): Promise<void> {
  const di = w.dataInicial ?? null;
  if (area.nivel === 'retiro') await patch(API, { id: area.id, name: w.nome, dataInicial: di });
  else if (area.nivel === 'setor') await patch(API, { type: 'setor', id: area.id, name: w.nome, retiroId: w.retiroId ?? null, dataInicial: di });
  else if (area.nivel === 'local') await patch(API, { type: 'local', id: area.id, name: w.nome, tipo: w.tipo ?? null, retiroId: w.retiroId ?? null, setorId: w.setorId ?? null, dataInicial: di });
  // fazenda: o nome é editado em "Dados Gerais", não aqui.
}

export async function deleteArea(area: Area): Promise<void> {
  if (area.nivel === 'fazenda') return; // a fazenda não é excluída pelo mapa
  const param = area.nivel === 'retiro' ? 'retiroId' : area.nivel === 'setor' ? 'setorId' : 'localId';
  await req(`${API}?${param}=${encodeURIComponent(area.id)}`, { method: 'DELETE' });
}

export async function saveFarmPerimeter(farmId: string, coords: [number, number][], fonte: Fonte): Promise<void> {
  await patch(FARMS_API, {
    id: farmId,
    perimeterGeometry: coords.length >= 3 ? coords : null,
    perimeterSource: coords.length >= 3 ? fonte : null,
  });
}

export async function countLocalDependents(localId: string): Promise<{ mapaRebanho: number; mapao: number; total: number }> {
  return req(`${API}?localDependents=${encodeURIComponent(localId)}`);
}
