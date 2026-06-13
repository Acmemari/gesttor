/* ===== Cadastro de Áreas — utilitários geográficos + persistência ===== */
import { area as turfArea, polygon as turfPolygon } from '@turf/turf';
import { NIVEIS, type Area, type Nivel } from './types';

/** Centro fictício no cerrado (MT) usado para gerar os dados-semente. */
export const FZ_CENTER: [number, number] = [-15.553, -52.104];

/* ---------- cálculos geográficos ---------- */

/** Área geodésica (m²) de um anel [lat,lng][]. Usa Turf (esférico). */
export function areaM2(coords: [number, number][]): number {
  if (!coords || coords.length < 3) return 0;
  // Turf espera [lng,lat] e o anel fechado (primeiro = último).
  const ring = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
  ring.push(ring[0]);
  try {
    return turfArea(turfPolygon([ring]));
  } catch {
    return 0;
  }
}

/** Mantém só vértices [lat,lng] geograficamente válidos. Descarta entradas
 *  não-finitas (NaN/Infinity), o ponto nulo (0,0) — que aparece quando um
 *  `NaN` vira `null` ao passar por JSON.stringify (KML mal-formado importado e
 *  persistido) — e coordenadas fora de faixa. Preserva a ordem dos vértices.
 *  Sem isto, um único vértice ruim faz o `fitBounds` enquadrar o mundo todo
 *  (ou o Leaflet lançar "Invalid LatLng"), quebrando o mapa ao recarregar. */
export function cleanRing(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const out: [number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lat = Number(c[0]);
    const lng = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;
    out.push([lat, lng]);
  }
  return out;
}

/** Formata m² → "1.234 ha" (pt-BR; casas decimais conforme o tamanho). */
export function fmtArea(m2: number): string {
  const ha = m2 / 10000;
  const dec = ha >= 100 ? 0 : ha >= 10 ? 1 : 2;
  return (
    ha.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ha'
  );
}

export function centroid(coords: [number, number][]): [number, number] {
  let la = 0;
  let ln = 0;
  coords.forEach((c) => {
    la += c[0];
    ln += c[1];
  });
  return [la / coords.length, ln / coords.length];
}

/** Ray casting — o ponto [lat,lng] está dentro do polígono? */
export function pointInPoly(pt: [number, number], coords: [number, number][]): boolean {
  let inside = false;
  const x = pt[1];
  const y = pt[0];
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][1];
    const yi = coords[i][0];
    const xj = coords[j][1];
    const yj = coords[j][0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Menor área de nível superior cujo interior contém o centroide do polígono. */
export function sugerirParent(
  areas: Area[],
  coords: [number, number][],
  nivel: Nivel,
): string | null {
  const ni = NIVEIS[nivel].idx;
  const ct = centroid(coords);
  const cand = areas
    .filter((a) => NIVEIS[a.nivel].idx < ni && pointInPoly(ct, a.coords))
    .sort((a, b) => NIVEIS[b.nivel].idx - NIVEIS[a.nivel].idx);
  return cand[0] ? cand[0].id : null;
}

/** Filhas diretas de uma área num nível. */
export function childrenOf(areas: Area[], nivel: Nivel, parentId: string | null): Area[] {
  return areas.filter((a) => a.nivel === nivel && a.parent === parentId);
}

/* ---------- persistência (localStorage por fazenda) ----------
 * SEAM DE INTEGRAÇÃO: quando a feature for promovida para o Neon, troque
 * load/save por chamadas a um repositório/cliente (ex.: lib/api/areasClient),
 * mantendo a mesma assinatura (farmId → Area[]). A UI não precisa mudar.
 */
const KEY_PREFIX = 'inttegra-fazenda-areas';

export function storageKey(farmId: string): string {
  return `${KEY_PREFIX}:${farmId}`;
}

export function loadAreas(farmId: string): Area[] | null {
  try {
    const raw = localStorage.getItem(storageKey(farmId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Saneia coordenadas persistidas: dados antigos podem ter vértices nulos
    // (NaN → null via JSON) que quebram o mapa ao recarregar.
    return (parsed as Area[]).map((a) => ({ ...a, coords: cleanRing(a.coords) }));
  } catch {
    return null;
  }
}

export function saveAreas(farmId: string, areas: Area[]): void {
  try {
    localStorage.setItem(storageKey(farmId), JSON.stringify(areas));
  } catch {
    /* quota/serialização — ignora silenciosamente nesta 1ª versão */
  }
}

/* ---------- dados-semente (polígonos aninhados, demo) ----------
 * Coordenadas geradas por código para garantir o encaixe geométrico:
 * retiros ⊂ fazenda, setores ⊂ retiro, locais ⊂ setor.
 */
function rect(latA: number, latB: number, lngA: number, lngB: number): [number, number][] {
  const [lat0, lng0] = FZ_CENTER;
  return [
    [lat0 + latA, lng0 + lngA],
    [lat0 + latA, lng0 + lngB],
    [lat0 + latB, lng0 + lngB],
    [lat0 + latB, lng0 + lngA],
  ];
}

function octo(h: number, w: number, c: number): [number, number][] {
  const [lat0, lng0] = FZ_CENTER;
  return [
    [lat0 + h - c, lng0 - w],
    [lat0 + h, lng0 - w + c],
    [lat0 + h, lng0 + w - c],
    [lat0 + h - c, lng0 + w],
    [lat0 - h + c, lng0 + w],
    [lat0 - h, lng0 + w - c],
    [lat0 - h, lng0 - w + c],
    [lat0 - h + c, lng0 - w],
  ];
}

/** Constrói o cadastro-semente. `fazendaNome` nomeia o perímetro raiz. */
export function buildSeed(fazendaNome: string): Area[] {
  const seed: Omit<Area, 'visivel'>[] = [
    // ---------- FAZENDA ----------
    {
      id: 'faz-1',
      nivel: 'fazenda',
      nome: fazendaNome || 'Fazenda',
      parent: null,
      tipo: null,
      coords: octo(0.04, 0.05, 0.012),
      fonte: 'kml',
    },
    // ---------- RETIROS ----------
    {
      id: 'ret-sede',
      nivel: 'retiro',
      nome: 'Retiro Sede',
      parent: 'faz-1',
      tipo: null,
      coords: rect(-0.036, 0.036, -0.046, -0.004),
      fonte: 'desenho',
    },
    {
      id: 'ret-brejo',
      nivel: 'retiro',
      nome: 'Retiro Brejo',
      parent: 'faz-1',
      tipo: null,
      coords: rect(-0.036, 0.036, 0.004, 0.046),
      fonte: 'desenho',
    },
    // ---------- SETORES ----------
    {
      id: 'set-cab',
      nivel: 'setor',
      nome: 'Setor Cabeceira',
      parent: 'ret-sede',
      tipo: null,
      coords: rect(0.004, 0.032, -0.042, -0.008),
      fonte: 'desenho',
    },
    {
      id: 'set-bax',
      nivel: 'setor',
      nome: 'Setor Baixão',
      parent: 'ret-sede',
      tipo: null,
      coords: rect(-0.032, -0.002, -0.042, -0.008),
      fonte: 'desenho',
    },
    {
      id: 'set-bno',
      nivel: 'setor',
      nome: 'Setor Brejo Norte',
      parent: 'ret-brejo',
      tipo: null,
      coords: rect(0.0, 0.032, 0.008, 0.042),
      fonte: 'desenho',
    },
    // ---------- LOCAIS ----------
    {
      id: 'loc-p1',
      nivel: 'local',
      nome: 'Pasto Cabeceira 1',
      parent: 'set-cab',
      tipo: 'Pasto',
      coords: rect(0.006, 0.018, -0.04, -0.026),
      fonte: 'desenho',
    },
    {
      id: 'loc-p2',
      nivel: 'local',
      nome: 'Pasto Cabeceira 2',
      parent: 'set-cab',
      tipo: 'Pasto',
      coords: rect(0.02, 0.03, -0.04, -0.012),
      fonte: 'desenho',
    },
    {
      id: 'loc-cur',
      nivel: 'local',
      nome: 'Curral de Manejo',
      parent: 'set-cab',
      tipo: 'Curral',
      coords: rect(0.006, 0.012, -0.022, -0.012),
      fonte: 'desenho',
    },
    {
      id: 'loc-p3',
      nivel: 'local',
      nome: 'Pasto Baixão',
      parent: 'set-bax',
      tipo: 'Pasto',
      coords: rect(-0.03, -0.006, -0.04, -0.012),
      fonte: 'desenho',
    },
    {
      id: 'loc-conf',
      nivel: 'local',
      nome: 'Confinamento',
      parent: 'set-bno',
      tipo: 'Confinamento',
      coords: rect(0.004, 0.014, 0.012, 0.024),
      fonte: 'desenho',
    },
    {
      id: 'loc-p4',
      nivel: 'local',
      nome: 'Pasto Brejo',
      parent: 'set-bno',
      tipo: 'Pasto',
      coords: rect(0.016, 0.03, 0.012, 0.04),
      fonte: 'desenho',
    },
  ];
  return seed.map((a) => ({ ...a, visivel: true }));
}
