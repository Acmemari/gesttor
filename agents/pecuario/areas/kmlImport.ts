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
  union as turfUnion,
} from '@turf/turf';
import { cleanRing, areaM2, centroid as ringCentroid, pointInPoly } from './util';
import { corrigirLinhasFechadasKml, type LineToPolyReport } from './kmlLineToPolygon';
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
  /** Relatório da correção automática linha→polígono aplicada ao importar. */
  correcaoReport: LineToPolyReport;
  /** .kmz já corrigido (linhas fechadas viram polígonos), fiel ao original
   *  (mesmos estilos/pastas/ícones). Guardado ao lado do original no B2. */
  correctedKmz: Blob;
}

// ── Leitura do arquivo (.kml ou .kmz) → DOM do KML (+ zip p/ re-empacotar) ─────
interface KmlDoc {
  doc: Document;
  /** zip do KMZ original (null se entrada for .kml puro) — p/ preservar extras. */
  zip: JSZip | null;
  /** nome do .kml dentro do zip (ou 'doc.kml' p/ entrada .kml). */
  kmlEntryName: string;
}

async function readKmlDoc(file: File): Promise<KmlDoc> {
  const buf = await file.arrayBuffer();
  if (/\.kmz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(buf);
    const name = Object.keys(zip.files).find((f) => /\.kml$/i.test(f) && !zip.files[f].dir);
    if (!name) throw new KmlImportError('KMZ sem KML: não encontrei um arquivo .kml dentro do KMZ.');
    const text = await zip.files[name].async('text');
    return { doc: new DOMParser().parseFromString(text, 'text/xml'), zip, kmlEntryName: name };
  }
  if (/\.kml$/i.test(file.name)) {
    const text = new TextDecoder().decode(buf);
    return { doc: new DOMParser().parseFromString(text, 'text/xml'), zip: null, kmlEntryName: 'doc.kml' };
  }
  throw new KmlImportError('Formato não suportado. Envie um arquivo .kml ou .kmz.');
}

// ── Re-empacota o KML corrigido preservando os demais entries do KMZ ───────────
async function buildCorrectedKmz(doc: Document, zip: JSZip | null, kmlEntryName: string): Promise<Blob> {
  const kmlText = new XMLSerializer().serializeToString(doc);
  const out = new JSZip();
  out.file(kmlEntryName, kmlText);
  if (zip) {
    for (const name of Object.keys(zip.files)) {
      if (name === kmlEntryName || zip.files[name].dir) continue;
      out.file(name, await zip.files[name].async('uint8array'));
    }
  }
  return out.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
}

// ── Núcleo: lê o arquivo, corrige linhas fechadas e devolve GeoJSON + .kmz ─────
// `overrides` (forceIds/revertIds) vêm das ações "converter mesmo assim"/"desfazer".
async function corrigirEConstruir(
  file: File,
  overrides: { forceIds?: Set<string>; revertIds?: Set<string> } = {},
): Promise<{ geojson: GeoJSON.FeatureCollection; correctedKmz: Blob; report: LineToPolyReport }> {
  const { doc, zip, kmlEntryName } = await readKmlDoc(file);
  const { doc: corr, report } = corrigirLinhasFechadasKml(doc, overrides);
  const geojson = kmlToGeoJSON(corr) as GeoJSON.FeatureCollection;
  if (!geojson || !Array.isArray(geojson.features)) {
    throw new KmlImportError('Arquivo inválido: não consegui ler as feições do KML.');
  }
  const correctedKmz = await buildCorrectedKmz(corr, zip, kmlEntryName);
  return { geojson, correctedKmz, report };
}

/** Recomputa a correção com novos overrides (usado pelas ações desfazer/forçar
 *  no modal de resumo): mesmo arquivo + override → GeoJSON e .kmz consistentes. */
export async function recorrigirKml(
  file: File,
  overrides: { forceIds?: Set<string>; revertIds?: Set<string> },
): Promise<{ geojson: GeoJSON.FeatureCollection; correctedKmz: Blob; report: LineToPolyReport }> {
  return corrigirEConstruir(file, overrides);
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

// ── Perímetro a partir de um GeoJSON já lido (mapa de referência importado) ────
/* Em vez de adivinhar o contorno por IA/satélite, derivamos o perímetro da própria
 * geometria que o usuário subiu (KML/KMZ → farm_maps). Numa fazenda subdividida, a
 * rede de divisas/cercas não tem UMA face = a fazenda inteira (cada piquete é uma
 * face); por isso UNIMOS todas as faces (turf.union) para obter o contorno EXTERNO
 * real, que segue concavidades. Fallbacks: maior face → cascata clássica/convex. */

/** Maior anel externo de um Polygon/MultiPolygon (em [lng,lat]). */
function largestOuterRing(
  feat: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): LngLat[] | null {
  const g = feat.geometry;
  if (g.type === 'Polygon') return g.coordinates[0] as LngLat[];
  if (g.type === 'MultiPolygon') {
    let best: LngLat[] | null = null;
    let bestA = -1;
    for (const poly of g.coordinates as number[][][][]) {
      const ring = poly[0] as LngLat[];
      const a = safeArea(ring);
      if (a > bestA) {
        bestA = a;
        best = ring;
      }
    }
    return best;
  }
  return null;
}

/** Contorno externo da rede de linhas/divisas: faces (polygonize) → união. */
function outerBoundaryFromLines(geojson: GeoJSON.FeatureCollection): [number, number][] | null {
  const lines = boundaryLines(geojson);
  if (lines.length < 1 || lines.length > PADDOCK_MAX_LINES) return null;
  let faces: GeoJSON.Feature<GeoJSON.Polygon>[];
  try {
    const edges = planarEdges(nodeNetwork(lines));
    if (edges.length < 3) return null;
    const fc = turfFeatureCollection(edges.map((e) => turfLineString(e)));
    faces = turfPolygonize(fc).features as GeoJSON.Feature<GeoJSON.Polygon>[];
  } catch {
    return null;
  }
  if (!faces.length) return null;
  if (faces.length === 1) return toSystemRing(faces[0].geometry.coordinates[0] as LngLat[]);
  // União de todas as faces → contorno externo (mantém as reentrâncias reais).
  try {
    const unioned = turfUnion(turfFeatureCollection(faces));
    const ring = unioned ? largestOuterRing(unioned) : null;
    if (ring && ring.length >= 3) return toSystemRing(ring);
  } catch {
    /* união falhou (geometria degenerada) — usa a maior face */
  }
  let best: LngLat[] | null = null;
  let bestA = -1;
  for (const f of faces) {
    const a = turfArea(f);
    if (a > bestA) {
      bestA = a;
      best = f.geometry.coordinates[0] as LngLat[];
    }
  }
  return best ? toSystemRing(best) : null;
}

/**
 * Reconstrói SÓ o perímetro (anel [lat,lng][]) a partir de um GeoJSON já lido —
 * ex.: o mapa de referência importado (farm_maps) ou o arquivo da sessão. Tenta a
 * união das faces da rede (contorno externo fiel) e, se não fechar, cai na cascata
 * clássica (maior polígono → maior face → convex hull).
 */
export function perimeterFromGeojson(
  geojson: GeoJSON.FeatureCollection,
): { ring: [number, number][] | null; fonte: PerimeterFonte | null } {
  if (!geojson || !Array.isArray(geojson.features)) return { ring: null, fonte: null };
  const ring = outerBoundaryFromLines(geojson);
  if (ring && ring.length >= 3) return { ring, fonte: 'linhas' };
  return reconstructPerimeter(geojson);
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

/** Forma mínima do catálogo "Tipos de Locais" usada pela heurística (evita acoplar ao client). */
interface CatalogoLeve {
  categorias: { id: string; nome: string }[];
  tipos: { id: string; categoriaId: string; nome: string }[];
  detalhes?: { tipoId: string; nome: string }[];
}

/** Normaliza para casamento: minúsculas, sem acento, espaços colapsados. */
export function normNome(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palpite de classificação (Categoria→Tipo→Detalhe) a partir do nome do placemark.
 * Casa o nome contra os tipos do catálogo (exato normalizado → substring) e, dentro
 * do tipo casado, contra os detalhes. Cai no enum legado (inferTipoLocal) como último
 * recurso, adotando a categoria se esse nome existir no catálogo. Conservador — é só
 * um padrão que o usuário confirma/troca na caixa.
 */
export function inferCatalogClassification(
  name: string,
  catalog: CatalogoLeve | null,
): { categoriaId: string | null; tipo: string | null; detalhe: string | null } {
  const n = normNome(name);
  if (!catalog || !catalog.tipos?.length || !n) {
    return { categoriaId: null, tipo: null, detalhe: null };
  }
  // 1) Tipo: exato normalizado tem prioridade; senão substring (nome contém o tipo).
  let hit = catalog.tipos.find((t) => normNome(t.nome) === n);
  if (!hit) {
    hit = catalog.tipos.find((t) => {
      const tn = normNome(t.nome);
      return tn.length >= 3 && n.includes(tn);
    });
  }
  if (hit) {
    const dets = (catalog.detalhes ?? []).filter((d) => d.tipoId === hit!.id);
    const dHit =
      dets.find((d) => normNome(d.nome) === n) ??
      dets.find((d) => {
        const dn = normNome(d.nome);
        return dn.length >= 3 && n.includes(dn);
      });
    return { categoriaId: hit.categoriaId, tipo: hit.nome, detalhe: dHit?.nome ?? null };
  }
  // 2) Fallback: enum legado. Se esse nome existir como tipo no catálogo, adota a categoria.
  const legacy = inferTipoLocal(name);
  if (legacy && legacy !== 'Outro') {
    const m = catalog.tipos.find((t) => normNome(t.nome) === normNome(legacy));
    if (m) return { categoriaId: m.categoriaId, tipo: m.nome, detalhe: null };
    return { categoriaId: null, tipo: legacy, detalhe: null };
  }
  return { categoriaId: null, tipo: null, detalhe: null };
}

/**
 * Função de desenho PADRÃO de um tipo de local, inferida pelo nome.
 * Define qual ferramenta o painel de Áreas oferece como primária:
 *   • 'line'  — infra linear: rede hidráulica/elétrica, cercas/divisas, estradas,
 *               carreadores/aceiros, pontes, adutoras/dutos.
 *   • 'point' — infra pontual: poços, caixas d'água, bebedouros, cochos, sede,
 *               casas, silos, antenas/torres, marcos/porteiras, nascentes etc.
 *   • 'area'  — padrão (pastagens, lavouras, florestas, reservas, açudes, pátios…).
 * As três ferramentas continuam disponíveis; isto só escolhe a sugerida.
 */
export function defaultGeomForTipo(tipoNome: string | null | undefined): 'area' | 'point' | 'line' {
  const n = normNome(tipoNome ?? '');
  if (!n) return 'area';
  if (/rede hidraulic|adutora|encanament|tubula|rede eletric|estrada|carreador|aceiro|\bcerca|divisa|\bponte|gasoduto|oleoduto|aqueduto/.test(n))
    return 'line';
  if (/\bpoco|artesian|cacimba|caixa d|bebedouro|\bcocho|comedouro|\bsede|\bcasa|escritorio|alojament|refeitori|sala de reuni|guarita|portaria|\bsilo|oficina|lavador|combustivel|antena|\btorre|internet|comunicacao|camera|\bcctv|fabrica|almoxarif|deposito|armazem|painel solar|energia solar|\bmarco|porteira|mata.?burro|nascente/.test(n))
    return 'point';
  return 'area';
}

/** Palavras vazias ignoradas no casamento por tokens. */
const STOP_TOKENS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'os', 'as', 'com', 'sem', 'para', 'no', 'na']);

/**
 * Sinônimos → tokens-âncora. Se o valor casa a regex, esses tokens são somados
 * aos tokens do valor antes de pontuar contra os nomes dos tipos do catálogo.
 * Ponte entre o vocabulário do arquivo do cliente e a taxonomia do sistema.
 */
const SINONIMOS_TOKENS: { re: RegExp; tokens: string[] }[] = [
  { re: /po[çc]o|cacimba|aguada|capta/, tokens: ['poco', 'artesiano', 'agua'] },
  { re: /bebedouro|dessedent/, tokens: ['bebedouro'] },
  { re: /caixa.?d|caixa.?agua|reservatori|cisterna/, tokens: ['caixa', 'reservatorio', 'agua'] },
  { re: /a[çc]ude|represa|barrag|barreir|lago|tanque|lagoa/, tokens: ['acude', 'represa', 'lago'] },
  { re: /brejo|banhad|varzea|alagad/, tokens: ['brejo', 'banhado', 'varzea'] },
  { re: /rede.?hidr|adutora|encanam/, tokens: ['rede', 'hidraulica'] },
  { re: /cocho|comedouro|suplement|sal\b|saleir/, tokens: ['cocho', 'suplementacao'] },
  { re: /curral|mangueir|brete|tronco|embarcad/, tokens: ['curral', 'manejo'] },
  { re: /piquet/, tokens: ['piquete'] },
  { re: /confinam|baia\b/, tokens: ['confinamento'] },
  { re: /pasto|pastag|invernad|retiro|mangueirao/, tokens: ['pastagem', 'pasto'] },
  { re: /talh[ãa]o/, tokens: ['talhao'] },
  { re: /lavoura|planti|safra|soja|milho|cultiv/, tokens: ['lavoura'] },
  { re: /capineir|cana\b/, tokens: ['capineira'] },
  { re: /silo\b|silagem/, tokens: ['silo'] },
  { re: /eucalip|reflorest|silvicult|pinus|teca/, tokens: ['eucalipto', 'reflorestamento'] },
  { re: /reserva.?legal|\brl\b/, tokens: ['reserva', 'legal'] },
  { re: /\bapp\b|preserv.?permanen/, tokens: ['app', 'preservacao'] },
  { re: /nascente|olho.?d.?agua|mina\b/, tokens: ['nascente'] },
  { re: /mata|floresta|capao|cerrad|vegeta/, tokens: ['mata', 'nativa', 'floresta'] },
  { re: /sede|matriz|escrit/, tokens: ['sede'] },
  { re: /\bcasa|moradi|resid/, tokens: ['casa'] },
  { re: /galp|barrac|deposit|armazem/, tokens: ['galpao'] },
  { re: /estrada|carreador|caminho|aceiro/, tokens: ['estrada'] },
  { re: /energi|rede.?eletr|trafo|transformad|painel.?solar/, tokens: ['energia'] },
  { re: /cerca|divis|arame|mourao/, tokens: ['cerca'] },
  { re: /porteir|colchet|teira/, tokens: ['porteira'] },
  { re: /marco|mata.?burro|estaca|ponto.?ref|referenc/, tokens: ['marco', 'referencia'] },
];

/** Tokens significativos de um texto (sem stopwords, ≥3 chars). */
function tokensDe(s: string): string[] {
  return normNome(s).split(' ').filter((w) => w.length >= 3 && !STOP_TOKENS.has(w));
}

/** Dois tokens "casam" se iguais ou um é prefixo do outro (cobre plural: poco↔pocos). */
function tokenMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));
}

/**
 * Sugestão de destino para o de-para (mais robusta que inferCatalogClassification):
 * 1) tenta o casamento direto (exato/substring) — confiável;
 * 2) senão, pontua por tokens (com expansão de sinônimos) contra os tipos do catálogo.
 * Retorna {categoriaId, tipo, detalhe} só quando há categoria do catálogo, ou null.
 */
export function suggestDestino(
  value: string,
  catalog: CatalogoLeve | null,
): { categoriaId: string; tipo: string; detalhe: string | null } | null {
  if (!catalog?.tipos?.length || !value?.trim()) return null;
  // 1) direto (exato/substring) — só aceita com categoria do catálogo.
  const direct = inferCatalogClassification(value, catalog);
  if (direct.categoriaId && direct.tipo) {
    return { categoriaId: direct.categoriaId, tipo: direct.tipo, detalhe: direct.detalhe };
  }
  // 2) tokens + sinônimos.
  const n = normNome(value);
  const valTokens = new Set(tokensDe(value));
  for (const s of SINONIMOS_TOKENS) if (s.re.test(n)) s.tokens.forEach((t) => valTokens.add(t));
  if (valTokens.size === 0) return null;

  let best: { id: string; categoriaId: string; nome: string } | null = null;
  let bestScore = 0;
  for (const t of catalog.tipos) {
    const tt = tokensDe(t.nome);
    let score = 0;
    for (const vt of valTokens) if (tt.some((x) => tokenMatch(vt, x))) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best && bestScore >= 1 ? { categoriaId: best.categoriaId, tipo: best.nome, detalhe: null } : null;
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

export function derivePaddocks(geojson: GeoJSON.FeatureCollection, perimeterM2: number): KmlPaddock[] {
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
  // Corrige linhas fechadas → polígonos ANTES da reconstrução de perímetro/piquetes:
  // se o contorno foi desenhado como linha, ele já vira Polygon e `reconstructPerimeter`
  // usa o ramo preferido (fonte:'polygon'); os piquetes convertidos seguem contribuindo
  // suas arestas p/ `derivePaddocks` via `boundaryLines`/`outerRingsOfPolygon`.
  const { geojson, correctedKmz, report } = await corrigirEConstruir(file, {});

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
    correcaoReport: report,
    correctedKmz,
  };
}
