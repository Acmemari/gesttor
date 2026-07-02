/* ===== Cadastro de Áreas — correção de linhas fechadas → polígonos (KML/KMZ) =====
 *
 * O Google Earth normalmente exporta as ÁREAS de uma fazenda (pastos, piquetes,
 * talhões) como LINHAS fechadas (`<LineString>`) em vez de `<Polygon>`. Sem
 * correção elas entram no sistema como traço (`geomKind:'line'`) — não viram
 * área, não têm hectares e não classificam direito no de-para.
 *
 * Este módulo é o porte em TypeScript da skill `.skills/kmz-line-to-polygon-*`:
 * percorre o DOM do KML, identifica `<LineString>` que formam contorno FECHADO
 * e as converte em `<Polygon>`, preservando nomes, descrições, estilos, pastas e
 * ExtendedData. Trabalhamos no NÍVEL DO XML (não no GeoJSON) para que o `.kmz`
 * corrigido saia FIEL ao arquivo do usuário — o `@tmcw/togeojson` descarta
 * estilo/pasta ao converter para GeoJSON.
 *
 * Regra de conversão (uma LineString vira Polygon só quando TODAS valem):
 *   1. 1º e último vértice idênticos ou dentro da tolerância de fechamento (10 m);
 *   2. ≥ 3 vértices distintos (dedup ~0,5 m) E área ≥ mínimo (50 m²);
 *   3. o nome não sugere feição linear (estrada, cerca, rede, córrego, …), a
 *      menos que o usuário force ("converter mesmo assim").
 */
import { distance as turfDistance, point as turfPoint } from '@turf/turf';
import { areaM2 } from './util';

export const KML_NS = 'http://www.opengis.net/kml/2.2';

/** Palavras que sugerem feição LINEAR — porte de LINEAR_NAME_KEYWORDS da skill.
 *  (mantém "rio " com espaço à direita de propósito, p/ não pegar "rio-preto"…) */
const LINEAR_NAME_KEYWORDS = [
  'estrada', 'rodovia', 'rua', 'caminho', 'trilha', 'rota', 'percurso',
  'cerca', 'aramado',
  'rede', 'linha de energia', 'energia', 'eletrica', 'elétrica',
  'adutora', 'encanamento', 'cano', 'tubulacao', 'tubulação', 'aqueduto',
  'corrego', 'córrego', 'rio ', 'riacho', 'vala', 'canal', 'sanga',
  'road', 'fence', 'trail', 'route', 'pipeline', 'powerline', 'creek', 'stream',
];

export type MotivoIgnorada = 'poucos_pontos' | 'degenerada' | 'nome_linear';

export interface ConvertidaEntry {
  id: string;
  nome: string;
  areaHa: number;
  gapM: number;
  /** false quando o usuário desfez a conversão (mantida como linha). */
  aplicada: boolean;
}
export interface IgnoradaNomeEntry {
  id: string;
  nome: string;
  areaHa: number;
  gapM: number;
  /** true quando o usuário forçou ("converter mesmo assim"). */
  forcada: boolean;
}
export interface MantidaAbertaEntry { id: string; nome: string; gapM: number; }
export interface IgnoradaGeomEntry { id: string; nome: string; motivo: MotivoIgnorada; detalhe: string; }

export interface LineToPolyReport {
  featuresAnalisadas: number;
  /** fechadas + nome OK: convertem por padrão (aplicada=false se desfeita). */
  convertidas: ConvertidaEntry[];
  /** fechadas porém nome sugere linha: só convertem se forçadas. */
  ignoradasNome: IgnoradaNomeEntry[];
  /** gap grande demais → não fecham; permanecem linha. */
  mantidasAbertas: MantidaAbertaEntry[];
  /** < 3 pontos ou geometria degenerada. */
  ignoradasGeom: IgnoradaGeomEntry[];
  poligonosExistentes: number;
  pontos: number;
  opts: Required<Pick<LineToPolyOptions, 'toleranceM' | 'minAreaM2' | 'distinctEpsM' | 'ignoreNames'>>;
}

export interface LineToPolyOptions {
  /** tolerância de fechamento entre 1º e último ponto (m). Default 10. */
  toleranceM?: number;
  /** área mínima p/ valer como polígono (m²). Default 50. */
  minAreaM2?: number;
  /** raio de dedup de vértices quase-coincidentes (m). Default 0,5. */
  distinctEpsM?: number;
  /** converte mesmo quando o nome sugere feição linear. Default false. */
  ignoreNames?: boolean;
  /** ids (lpId) forçados a converter, mesmo com nome linear. */
  forceIds?: Set<string>;
  /** ids (lpId) que o usuário desfez → mantêm como linha. */
  revertIds?: Set<string>;
}

export interface LineToPolyResult {
  /** clone do doc de entrada, já com as conversões aplicadas. */
  doc: Document;
  report: LineToPolyReport;
}

/* ───────────────────────── helpers de geometria ───────────────────────── */

/** Distância haversine (m) entre dois pontos [lng,lat]. Igual à do turf, porém
 *  sem alocar Features — usada no laço interno de dedup de vértices. */
function haversineM(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(a[0] - b[0]) * -1; // (b.lng - a.lng)
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "lon,lat[,alt] lon,lat[,alt] …" → tokens crus (preserva a precisão original). */
function coordTokens(text: string | null | undefined): string[] {
  return (text || '').trim().split(/\s+/).filter(Boolean);
}

/** token "lon,lat,alt" → [lng,lat] numérico (ou null se malformado). */
function tokenToLngLat(tok: string): [number, number] | null {
  const p = tok.split(',');
  if (p.length < 2) return null;
  const lng = Number(p[0]);
  const lat = Number(p[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

/** nº de vértices distintos (dedup por haversine ≤ eps); ignora fechamento. */
function distinctCount(coords: [number, number][], epsM: number): number {
  if (!coords.length) return 0;
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (haversineM(out[out.length - 1], coords[i]) > epsM) out.push(coords[i]);
  }
  if (out.length > 1 && haversineM(out[0], out[out.length - 1]) <= epsM) out.pop();
  return out.length;
}

function nameSuggestsLinear(name: string): boolean {
  const n = (name || '').toLowerCase();
  return LINEAR_NAME_KEYWORDS.some((kw) => n.includes(kw));
}

/** hash FNV-1a → base36 (chave estável p/ casar report ↔ DraftArea ↔ ações). */
function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** chave determinística da linha: nome + coordenadas cruas. */
function lpIdOf(nome: string, tokens: string[]): string {
  return hashStr(nome + '|' + tokens.join(' '));
}

/* ───────────────────────── travessia do DOM ───────────────────────── */

function localName(el: Element): string {
  return el.localName || el.nodeName.replace(/^.*:/, '');
}

/** primeiro filho DIRETO com o localName dado. */
function firstChild(el: Element, name: string): Element | null {
  for (let i = 0; i < el.children.length; i++) {
    if (localName(el.children[i]) === name) return el.children[i];
  }
  return null;
}

/** texto do primeiro descendente com o localName dado (ex.: <name>, <coordinates>). */
function firstDescendantText(el: Element, name: string): string {
  const found = el.getElementsByTagName('*');
  for (let i = 0; i < found.length; i++) {
    if (localName(found[i]) === name) return found[i].textContent || '';
  }
  return '';
}

/** LineStrings dentro do Placemark (geometria direta ou em MultiGeometry). */
function lineStringsIn(placemark: Element): Element[] {
  const all = placemark.getElementsByTagName('*');
  const out: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    if (localName(all[i]) === 'LineString') out.push(all[i]);
  }
  return out;
}

function hasGeom(placemark: Element, name: string): boolean {
  const all = placemark.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (localName(all[i]) === name) return true;
  return false;
}

/** Constrói o <Polygon> equivalente, preservando extrude/tessellate/altitudeMode
 *  do LineString e fechando o anel (último = primeiro token quando necessário). */
function buildPolygon(doc: Document, lineEl: Element, tokens: string[]): Element {
  const poly = doc.createElementNS(KML_NS, 'Polygon');
  for (const tag of ['extrude', 'tessellate', 'altitudeMode']) {
    const src = firstChild(lineEl, tag);
    if (src) {
      const el = doc.createElementNS(KML_NS, tag);
      el.textContent = src.textContent;
      poly.appendChild(el);
    }
  }
  const outer = doc.createElementNS(KML_NS, 'outerBoundaryIs');
  const ring = doc.createElementNS(KML_NS, 'LinearRing');
  const coordEl = doc.createElementNS(KML_NS, 'coordinates');
  const ringTokens = tokens.slice();
  if (ringTokens.length && ringTokens[0] !== ringTokens[ringTokens.length - 1]) {
    ringTokens[ringTokens.length - 1] = ringTokens[0]; // fecha o anel
  }
  coordEl.textContent = ringTokens.join(' ');
  ring.appendChild(coordEl);
  outer.appendChild(ring);
  poly.appendChild(outer);
  return poly;
}

/** grava proveniência da correção como ExtendedData/Data (togeojson → properties). */
function stampProvenance(doc: Document, placemark: Element, lpId: string, gapM: number): void {
  let ext = firstChild(placemark, 'ExtendedData');
  if (!ext) {
    ext = doc.createElementNS(KML_NS, 'ExtendedData');
    placemark.appendChild(ext);
  }
  const setData = (name: string, value: string) => {
    const data = doc.createElementNS(KML_NS, 'Data');
    data.setAttribute('name', name);
    const val = doc.createElementNS(KML_NS, 'value');
    val.textContent = value;
    data.appendChild(val);
    ext!.appendChild(data);
  };
  setData('__corrigido', '1');
  setData('__gapM', String(Math.round(gapM * 10) / 10));
  setData('__lpId', lpId);
}

/* ───────────────────────── função principal ───────────────────────── */

/**
 * Percorre o DOM do KML e converte linhas fechadas em polígonos, conforme as
 * regras da skill. NÃO muta o `doc` de entrada (opera sobre um clone) — essencial
 * para recomputar de forma determinística a partir do original nas ações de
 * desfazer/forçar.
 */
export function corrigirLinhasFechadasKml(
  input: Document,
  opts: LineToPolyOptions = {},
): LineToPolyResult {
  const toleranceM = opts.toleranceM ?? 10;
  const minAreaM2 = opts.minAreaM2 ?? 50;
  const distinctEpsM = opts.distinctEpsM ?? 0.5;
  const ignoreNames = opts.ignoreNames ?? false;
  const forceIds = opts.forceIds ?? new Set<string>();
  const revertIds = opts.revertIds ?? new Set<string>();

  const doc = input.cloneNode(true) as Document;

  const report: LineToPolyReport = {
    featuresAnalisadas: 0,
    convertidas: [],
    ignoradasNome: [],
    mantidasAbertas: [],
    ignoradasGeom: [],
    poligonosExistentes: 0,
    pontos: 0,
    opts: { toleranceM, minAreaM2, distinctEpsM, ignoreNames },
  };

  const placemarks = doc.getElementsByTagName('*');
  const marks: Element[] = [];
  for (let i = 0; i < placemarks.length; i++) {
    if (localName(placemarks[i]) === 'Placemark') marks.push(placemarks[i]);
  }

  for (const pm of marks) {
    report.featuresAnalisadas += 1;
    const nome = (firstDescendantText(pm, 'name') || '(sem nome)').trim();
    const lines = lineStringsIn(pm);

    if (!lines.length) {
      if (hasGeom(pm, 'Polygon')) report.poligonosExistentes += 1;
      else if (hasGeom(pm, 'Point')) report.pontos += 1;
      continue;
    }

    for (const lineEl of lines) {
      const coordEl = (() => {
        const found = lineEl.getElementsByTagName('*');
        for (let i = 0; i < found.length; i++) if (localName(found[i]) === 'coordinates') return found[i];
        return null;
      })();
      const tokens = coordTokens(coordEl?.textContent);
      const coords = tokens.map(tokenToLngLat).filter((c): c is [number, number] => c !== null);
      const lpId = lpIdOf(nome, tokens);

      if (coords.length < 3) {
        report.ignoradasGeom.push({ id: lpId, nome, motivo: 'poucos_pontos', detalhe: `${coords.length} ponto(s)` });
        continue;
      }

      const gapM = turfDistance(turfPoint(coords[0]), turfPoint(coords[coords.length - 1]), { units: 'meters' });
      if (gapM > toleranceM) {
        report.mantidasAbertas.push({ id: lpId, nome, gapM: round1(gapM) });
        continue;
      }

      const nDist = distinctCount(coords, distinctEpsM);
      // areaM2 espera [lat,lng] e fecha o anel internamente.
      const area = areaM2(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
      if (nDist < 3 || area < minAreaM2) {
        report.ignoradasGeom.push({
          id: lpId, nome, motivo: 'degenerada',
          detalhe: `${nDist} vértices distintos, ~${Math.round(area)} m²`,
        });
        continue;
      }

      const linear = !ignoreNames && nameSuggestsLinear(nome);
      const forcada = forceIds.has(lpId);
      const revertida = revertIds.has(lpId);

      // decide se converte de fato: nome OK e não desfeita, OU nome linear porém forçada.
      const converte = linear ? forcada : !revertida;

      if (converte) {
        const poly = buildPolygon(doc, lineEl, tokens);
        lineEl.parentNode?.replaceChild(poly, lineEl);
        stampProvenance(doc, pm, lpId, gapM);
      }

      const entry = { id: lpId, nome, areaHa: round2(area / 10000), gapM: round2(gapM) };
      if (linear) report.ignoradasNome.push({ ...entry, forcada });
      else report.convertidas.push({ ...entry, aplicada: !revertida });
    }
  }

  return { doc, report };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
