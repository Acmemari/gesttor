/* ===== Cadastro de Áreas — importação de KML/KMZ do Google Earth =====
 * O Google Earth normalmente exporta o desenho de uma fazenda como LINHAS (paths)
 * e PONTOS, não como polígonos. O importador antigo (parseKmlPolygons) só lia
 * Polygon/MultiPolygon, por isso esses arquivos caíam em "Nenhum polígono".
 *
 * Aqui fazemos o arquivo do Google Earth ser compatível com o sistema:
 *   - reconstruímos o PERÍMETRO da fazenda a partir das linhas (turf.polygonize;
 *     fallback convex hull) → anel [lat,lng][] pronto para virar o contorno;
 *   - convertemos cada PONTO num Local (marcador pequeno) com o tipo deduzido do
 *     nome (Reservatório/Captação → Aguada, Sede → Sede, …);
 *   - guardamos o GeoJSON cru para exibir o arquivo inteiro (contorno + divisas +
 *     pontos) como camada de referência no mapa, igual ao Google Earth.
 */
import JSZip from 'jszip';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import {
  area as turfArea,
  polygon as turfPolygon,
  lineString as turfLineString,
  point as turfPoint,
  featureCollection as turfFeatureCollection,
  polygonize as turfPolygonize,
  convex as turfConvex,
  buffer as turfBuffer,
  lineIntersect as turfLineIntersect,
  lineSplit as turfLineSplit,
  truncate as turfTruncate,
} from '@turf/turf';
import { cleanRing, areaM2, centroid as ringCentroid, pointInPoly } from './util';
import type { TipoLocal } from './types';

/** Erro com mensagem amigável (pt-BR) para exibir num toast. */
export class KmlImportError extends Error {}

type LngLat = [number, number];

/** Origem do perímetro reconstruído (para a mensagem do preview). */
export type PerimeterFonte = 'polygon' | 'linhas' | 'convex';

export interface KmlPoint {
  nome: string;
  tipo: TipoLocal;
  /** posição original [lat,lng] (para centrar/preview). */
  latlng: [number, number];
  /** anel pequeno [lat,lng][] que representa o ponto como Local no sistema. */
  coords: [number, number][];
}

/** Piquete interno reconstruído a partir da rede de cercas (divisas) do arquivo. */
export interface KmlPaddock {
  nome: string;
  /** anel do polígono [lat,lng][] (sem fechamento duplicado). */
  coords: [number, number][];
  areaM2: number;
  /** pré-selecionado na verificação (parece um piquete real, não o "fundo" da fazenda). */
  suggested: boolean;
}

export interface KmlImportResult {
  /** GeoJSON cru (todas as feições) para a camada de visualização. */
  geojson: GeoJSON.FeatureCollection;
  /** Perímetro reconstruído (anel [lat,lng][]) ou null se não houver. */
  perimeter: [number, number][] | null;
  /** Como o perímetro foi obtido. */
  perimeterFonte: PerimeterFonte | null;
  /** Área do perímetro em m². */
  perimeterM2: number;
  points: KmlPoint[];
  /** Piquetes internos reconstruídos da rede de divisas (candidatos a Local). */
  paddocks: KmlPaddock[];
  lineCount: number;
  polygonCount: number;
}

// ── Leitura do arquivo (.kml ou .kmz) → GeoJSON via togeojson ─────────────────
async function fileToGeojson(file: File): Promise<GeoJSON.FeatureCollection> {
  const buf = await file.arrayBuffer();
  let text: string;
  if (/\.kmz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(buf);
    const name = Object.keys(zip.files).find((f) => /\.kml$/i.test(f) && !zip.files[f].dir);
    if (!name) throw new KmlImportError('KMZ sem KML: não encontrei um arquivo .kml dentro do KMZ.');
    text = await zip.files[name].async('text');
  } else if (/\.kml$/i.test(file.name)) {
    text = new TextDecoder().decode(buf);
  } else {
    throw new KmlImportError('Formato não suportado. Envie um arquivo .kml ou .kmz.');
  }
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  return kmlToGeoJSON(xml) as GeoJSON.FeatureCollection;
}

// ── Helpers de geometria ──────────────────────────────────────────────────────
function outerRingsOfPolygon(g: GeoJSON.Geometry): LngLat[][] {
  if (g.type === 'Polygon') return [g.coordinates[0] as LngLat[]];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((p) => p[0] as LngLat[]);
  return [];
}

function lineStringsOf(g: GeoJSON.Geometry): LngLat[][] {
  if (g.type === 'LineString') return [g.coordinates as LngLat[]];
  if (g.type === 'MultiLineString') return (g.coordinates as number[][][]).map((l) => l as LngLat[]);
  return [];
}

/** Fecha o anel (primeiro = último) para o turf calcular área. */
function closeRing(r: LngLat[]): LngLat[] {
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) return [...r, r[0]];
  return r;
}

/** Anel GeoJSON [lng,lat] → anel do sistema [lat,lng] limpo, sem fechamento duplicado. */
function toSystemRing(ring: LngLat[]): [number, number][] {
  const flipped = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  const clean = cleanRing(flipped);
  if (
    clean.length > 1 &&
    clean[0][0] === clean[clean.length - 1][0] &&
    clean[0][1] === clean[clean.length - 1][1]
  ) {
    clean.pop();
  }
  return clean;
}

function safeArea(ring: LngLat[]): number {
  try {
    return turfArea(turfPolygon([closeRing(ring)]));
  } catch {
    return 0;
  }
}

// ── Reconstrução do perímetro ─────────────────────────────────────────────────
function reconstructPerimeter(
  geojson: GeoJSON.FeatureCollection,
): { ring: [number, number][] | null; fonte: PerimeterFonte | null } {
  const polygons: LngLat[][] = [];
  const lines: LngLat[][] = [];
  const allPts: LngLat[] = [];

  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    for (const r of outerRingsOfPolygon(g)) {
      polygons.push(r);
      allPts.push(...r);
    }
    for (const l of lineStringsOf(g)) {
      lines.push(l);
      allPts.push(...l);
    }
    if (g.type === 'Point') allPts.push(g.coordinates as LngLat);
    if (g.type === 'MultiPoint') allPts.push(...(g.coordinates as LngLat[]));
  }

  // 1) Se houver polígonos reais, usa o de maior área (comportamento clássico).
  if (polygons.length) {
    let best: LngLat[] | null = null;
    let bestA = -1;
    for (const r of polygons) {
      const a = safeArea(r);
      if (a > bestA) {
        bestA = a;
        best = r;
      }
    }
    if (best) return { ring: toSystemRing(best), fonte: 'polygon' };
  }

  // 2) Reconstrói a partir da rede de linhas (turf.polygonize) → maior face.
  if (lines.length) {
    try {
      const fc = turfFeatureCollection(
        lines.filter((l) => l.length >= 2).map((l) => turfLineString(l)),
      );
      const faces = turfPolygonize(fc).features;
      if (faces.length) {
        let bestRing: LngLat[] | null = null;
        let bestA = -1;
        for (const face of faces) {
          const a = turfArea(face);
          if (a > bestA) {
            bestA = a;
            bestRing = face.geometry.coordinates[0] as LngLat[];
          }
        }
        if (bestRing) return { ring: toSystemRing(bestRing), fonte: 'linhas' };
      }
    } catch {
      /* polygonize pode falhar com geometria degenerada — cai no fallback */
    }
  }

  // 3) Fallback: envoltória convexa (convex hull) de todos os vértices.
  if (allPts.length >= 3) {
    try {
      const hull = turfConvex(turfFeatureCollection(allPts.map((p) => turfPoint(p))));
      if (hull) {
        const ring = hull.geometry.coordinates[0] as LngLat[];
        return { ring: toSystemRing(ring), fonte: 'convex' };
      }
    } catch {
      /* hull indisponível */
    }
  }

  return { ring: null, fonte: null };
}

// ── Pontos → Locais ───────────────────────────────────────────────────────────
/** Deduz o tipo de Local pelo nome do ponto. */
export function inferTipoLocal(name: string): TipoLocal {
  const n = (name || '').toLowerCase();
  if (/reservat|aguada|capta|águ|\bagu|adutora|po[çc]o|tanque|barreir|represa|bebedouro|cacimba/.test(n))
    return 'Aguada';
  if (/sede|matriz|escrit|\bcasa|barrac|galp/.test(n)) return 'Sede';
  if (/reserva|app|apa\b|preserv/.test(n)) return 'Reserva';
  if (/curral|mangueir|brete|tronco/.test(n)) return 'Curral';
  return 'Outro';
}

/** Anel pequeno (~10 m) representando um ponto como Local (o sistema só guarda polígonos). */
function pointRing(lng: number, lat: number): [number, number][] {
  try {
    const circle = turfBuffer(turfPoint([lng, lat]), 0.01, { units: 'kilometers', steps: 8 });
    const ring = circle?.geometry?.coordinates?.[0] as LngLat[] | undefined;
    if (ring && ring.length >= 3) return toSystemRing(ring);
  } catch {
    /* usa o quadrado-fallback abaixo */
  }
  const d = 0.00009; // ~10 m
  return [
    [lat + d, lng - d],
    [lat + d, lng + d],
    [lat - d, lng + d],
    [lat - d, lng - d],
  ];
}

function extractPoints(geojson: GeoJSON.FeatureCollection): KmlPoint[] {
  const pts: KmlPoint[] = [];
  let n = 0;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    const coordsList: LngLat[] =
      g.type === 'Point'
        ? [g.coordinates as LngLat]
        : g.type === 'MultiPoint'
          ? (g.coordinates as LngLat[])
          : [];
    for (const [lng, lat] of coordsList) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const nome = ((f.properties && (f.properties.name as string)) || '').trim() || `Ponto ${n + 1}`;
      pts.push({ nome, tipo: inferTipoLocal(nome), latlng: [lat, lng], coords: pointRing(lng, lat) });
      n++;
    }
  }
  return pts;
}

// ── Divisas → Piquetes internos (reconstrução de faces) ───────────────────────
/* O Google Earth desenha os piquetes como CERCAS (linhas), não como polígonos.
 * Para sugerir os piquetes internos como Locais, montamos um grafo planar da rede
 * de cercas e extraímos as faces fechadas:
 *   1) "nodamos" as linhas — partimos cada uma nos cruzamentos com as outras;
 *   2) snap dos vértices a uma grade (~1 m) para os nós coincidirem exatamente;
 *   3) explodimos em arestas únicas e podamos as "pontas soltas" (degree-1), que
 *      travam o polygonize;
 *   4) polygonize → faces; deduplicamos e classificamos cada face como piquete
 *      sugerido (folha) ou "fundo" da fazenda (face que envolve outras). */
const PADDOCK_SNAP = 1e-5; // ~1.1 m nesta latitude
const PADDOCK_MIN_M2 = 200; // descarta slivers/ruído da rede de cercas
const PADDOCK_MAX_LINES = 400; // guarda contra arquivos enormes (evita travar o navegador)
const snapCoord = (v: number) => Math.round(v / PADDOCK_SNAP) * PADDOCK_SNAP;
const nodeKey = (p: LngLat) => `${snapCoord(p[0])},${snapCoord(p[1])}`;

/** Parte cada linha nos pontos onde cruza as demais (noding da rede). */
function nodeNetwork(lines: LngLat[][]): LngLat[][] {
  const segs = lines
    .filter((l) => l.length >= 2)
    .map((l) => turfTruncate(turfLineString(l), { precision: 7, coordinates: 2 }));
  const out: LngLat[][] = [];
  for (let i = 0; i < segs.length; i++) {
    const splitters: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      try {
        const pts = turfLineIntersect(segs[i], segs[j]);
        if (pts.features.length) splitters.push(...(pts.features as GeoJSON.Feature<GeoJSON.Point>[]));
      } catch {
        /* par degenerado — ignora */
      }
    }
    if (!splitters.length) {
      out.push(segs[i].geometry.coordinates as LngLat[]);
      continue;
    }
    let pieces = [segs[i]];
    for (const sp of splitters) {
      const next: typeof pieces = [];
      for (const piece of pieces) {
        try {
          const r = turfLineSplit(piece, sp).features;
          if (r.length) next.push(...(r as typeof pieces));
          else next.push(piece);
        } catch {
          next.push(piece);
        }
      }
      pieces = next;
    }
    for (const p of pieces) out.push(p.geometry.coordinates as LngLat[]);
  }
  return out;
}

/** Explode em arestas únicas (snap + dedup) e poda as pontas soltas (degree-1). */
function planarEdges(segs: LngLat[][]): LngLat[][] {
  const edges = new Map<string, [LngLat, LngLat]>();
  for (const c of segs) {
    for (let i = 1; i < c.length; i++) {
      const a: LngLat = [snapCoord(c[i - 1][0]), snapCoord(c[i - 1][1])];
      const b: LngLat = [snapCoord(c[i][0]), snapCoord(c[i][1])];
      const ka = nodeKey(a);
      const kb = nodeKey(b);
      if (ka === kb) continue; // aresta nula após o snap
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!edges.has(ek)) edges.set(ek, ka < kb ? [a, b] : [b, a]);
    }
  }
  // poda iterativa de pontas soltas (nós com grau 1 não fecham face)
  let changed = true;
  while (changed) {
    changed = false;
    const deg = new Map<string, number>();
    for (const [, [a, b]] of edges) {
      deg.set(nodeKey(a), (deg.get(nodeKey(a)) || 0) + 1);
      deg.set(nodeKey(b), (deg.get(nodeKey(b)) || 0) + 1);
    }
    for (const [ek, [a, b]] of [...edges]) {
      if (deg.get(nodeKey(a)) === 1 || deg.get(nodeKey(b)) === 1) {
        edges.delete(ek);
        changed = true;
      }
    }
  }
  return [...edges.values()].map(([a, b]) => [a, b]);
}

/** Coleta as linhas-fronteira (divisas + bordas de polígonos reais, se houver). */
function boundaryLines(geojson: GeoJSON.FeatureCollection): LngLat[][] {
  const lines: LngLat[][] = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    for (const l of lineStringsOf(g)) lines.push(l);
    for (const r of outerRingsOfPolygon(g)) lines.push(closeRing(r));
  }
  return lines;
}

function derivePaddocks(geojson: GeoJSON.FeatureCollection, perimeterM2: number): KmlPaddock[] {
  const lines = boundaryLines(geojson);
  if (lines.length < 2 || lines.length > PADDOCK_MAX_LINES) return [];

  let faces: GeoJSON.Feature<GeoJSON.Polygon>[];
  try {
    const edges = planarEdges(nodeNetwork(lines));
    if (edges.length < 3) return [];
    const fc = turfFeatureCollection(edges.map((e) => turfLineString(e)));
    faces = turfPolygonize(fc).features as GeoJSON.Feature<GeoJSON.Polygon>[];
  } catch {
    return [];
  }

  // anel [lat,lng] + área + centroide de cada face
  let cand = faces
    .map((f) => {
      const ring = toSystemRing(f.geometry.coordinates[0] as LngLat[]);
      return { ring, area: areaM2(ring), c: ringCentroid(ring) };
    })
    .filter((x) => x.ring.length >= 3 && x.area >= PADDOCK_MIN_M2);

  // dedup: faces repetidas (cercas em "parede dupla" geram a mesma face 2x)
  const seen = new Set<string>();
  cand = cand.filter((x) => {
    const k = `${x.c[0].toFixed(5)},${x.c[1].toFixed(5)}|${Math.round(x.area)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  cand.sort((a, b) => b.area - a.area);

  // referência p/ separar "fundo" (envolve outras) de piquete real (folha)
  const perim = perimeterM2 || (cand.length ? cand[0].area : 0);
  let n = 0;
  return cand.map((x) => {
    const enclosesOther = cand.some((o) => o !== x && o.area < x.area && pointInPoly(o.c, x.ring));
    const suggested = !enclosesOther && (!perim || x.area < 0.95 * perim);
    return { nome: `Piquete ${++n}`, coords: x.ring, areaM2: x.area, suggested };
  });
}

// ── Entrada principal ─────────────────────────────────────────────────────────
export async function importarKmlGoogleEarth(file: File): Promise<KmlImportResult> {
  const geojson = await fileToGeojson(file);
  if (!geojson || !Array.isArray(geojson.features)) {
    throw new KmlImportError('Arquivo inválido: não consegui ler as feições do KML.');
  }

  let polygonCount = 0;
  let lineCount = 0;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') polygonCount++;
    else if (g.type === 'LineString' || g.type === 'MultiLineString') lineCount++;
  }

  const { ring, fonte } = reconstructPerimeter(geojson);
  const perimeter = ring && ring.length >= 3 ? ring : null;
  const perimeterM2 = perimeter ? areaM2(perimeter) : 0;
  const points = extractPoints(geojson);
  const paddocks = derivePaddocks(geojson, perimeterM2);

  return {
    geojson,
    perimeter,
    perimeterFonte: perimeter ? fonte : null,
    perimeterM2,
    points,
    paddocks,
    lineCount,
    polygonCount,
  };
}
