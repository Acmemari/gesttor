/**
 * Gerador do "mapa canônico" da fazenda (KML/KMZ) — a representação oficial e
 * estruturada de TODAS as áreas do sistema, na forma que o Google Earth entende.
 *
 * Decisão de arquitetura (ver memória project_*): o mapa é a fonte canônica e o
 * banco (farm_locais/…) é o seu espelho. Por isso cada Placemark carrega o
 * `local_id` (UUID estável) em <ExtendedData>, permitindo que o arquivo
 * round-trip de volta para o banco preservando os vínculos do rebanho.
 *
 * Estrutura do arquivo:
 *   Document
 *     <Style> por tipo do catálogo (cor da linha/preenchimento)
 *     Folder "Perímetro / Retiros / Setores"  (estrutura geográfica)
 *     Folder por Categoria → Folder por Tipo → Placemarks dos Locais
 *     Folder "Não classificados"               (locais sem tipo)
 */
import JSZip from 'jszip';

export type CanonicalNivel = 'fazenda' | 'retiro' | 'setor' | 'local';

/** Uma área já materializada (com id estável) a ser escrita no mapa canônico. */
export interface CanonicalArea {
  /** UUID estável (local_id/retiro_id/…); vai em <ExtendedData> para o round-trip. */
  id: string;
  nome: string;
  nivel: CanonicalNivel;
  /** nome do tipo do catálogo (texto livre, casa por nome). */
  tipo?: string | null;
  /** 3º nível do catálogo (detalhe/subtipo). */
  detalhe?: string | null;
  /** uso atual da área (pasto/lavoura/…), quando houver. */
  uso?: string | null;
  /** 'area' = polígono (anel ≥3) · 'point' = marcador (1 coord) · 'line' = traço (≥2). */
  kind: 'area' | 'point' | 'line';
  /** anel/traço [lat,lng][] ou [[lat,lng]] (ponto). */
  coords: [number, number][];
}

/** Catálogo "Tipos de Locais" (subset necessário para Folders/Styles). */
export interface CanonicalCatalog {
  categorias: { id: string; nome: string; cor?: string | null }[];
  tipos: { id: string; nome: string; categoriaId: string; cor?: string | null }[];
}

/** Normaliza nome de tipo para casar com o catálogo (trim + minúsculas), igual ao
 *  buildCatalogIndex/importer — evita "Pasto " ou "pasto" caírem em não-classificados. */
const normTipo = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

/** Escapa texto para conteúdo/atributo XML. */
function xml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Converte cor #rrggbb (CSS) para o formato KML aabbggrr. */
function hexToKmlColor(hex: string | null | undefined, alpha = 'ff'): string {
  const h = (hex || '#16a34a').replace('#', '').trim();
  if (h.length !== 6) return `${alpha}4aa316`; // verde-padrão
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `${alpha}${b}${g}${r}`.toLowerCase();
}

/** Coordenadas KML "lng,lat,0 …" — fecha o anel de polígono; linha/ponto não fecham. */
function coordsToKml(area: CanonicalArea): string {
  const ring = area.coords.filter((c) => Array.isArray(c) && c.length === 2);
  if (area.kind === 'point' || ring.length === 1) {
    const pt = ring[0];
    return pt ? `${pt[1]},${pt[0]},0` : '';
  }
  const body = ring.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
  if (area.kind === 'line') return body; // traço não fecha
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first && last && (first[0] !== last[0] || first[1] !== last[1])
    ? `${body} ${first[1]},${first[0]},0`
    : body;
  return closed;
}

/** Cor/Style por nível estrutural (sem tipo do catálogo). */
const NIVEL_COR: Record<CanonicalNivel, string> = {
  fazenda: '#0f766e',
  retiro: '#7c3aed',
  setor: '#d97706',
  local: '#16a34a',
};

/** Geometria KML de uma área (Polygon ou Point). Decide ponto×polígono pelo anel
 *  LIMPO (mesma base de coordsToKml) e descarta polígono degenerado (<3 vértices). */
function geometryKml(area: CanonicalArea): string | null {
  const ring = area.coords.filter((c) => Array.isArray(c) && c.length === 2);
  const c = coordsToKml(area);
  if (!c) return null;
  if (area.kind === 'point' || ring.length === 1) {
    return `      <Point><coordinates>${c}</coordinates></Point>`;
  }
  if (area.kind === 'line') {
    return ring.length >= 2 ? `      <LineString><coordinates>${c}</coordinates></LineString>` : null;
  }
  if (ring.length < 3) return null;
  return `      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${c}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>`;
}

/** Placemark com styleUrl + ExtendedData (local_id e classificação). */
function placemarkKml(area: CanonicalArea, styleId: string, categoriaNome: string | null): string {
  const geom = geometryKml(area);
  if (!geom) return '';
  const data: string[] = [
    `        <Data name="local_id"><value>${xml(area.id)}</value></Data>`,
    `        <Data name="nivel"><value>${xml(area.nivel)}</value></Data>`,
  ];
  if (categoriaNome) data.push(`        <Data name="categoria"><value>${xml(categoriaNome)}</value></Data>`);
  if (area.tipo) data.push(`        <Data name="tipo"><value>${xml(area.tipo)}</value></Data>`);
  if (area.detalhe) data.push(`        <Data name="detalhe"><value>${xml(area.detalhe)}</value></Data>`);
  if (area.uso) data.push(`        <Data name="uso"><value>${xml(area.uso)}</value></Data>`);
  return `    <Placemark>
      <name>${xml(area.nome)}</name>
      <styleUrl>#${styleId}</styleUrl>
      <ExtendedData>
${data.join('\n')}
      </ExtendedData>
${geom}
    </Placemark>`;
}

/** <Style> de polígono+ponto a partir de uma cor base. */
function styleKml(id: string, cor: string): string {
  const line = hexToKmlColor(cor, 'ff');
  const fill = hexToKmlColor(cor, '4d'); // ~30% de opacidade
  return `    <Style id="${id}">
      <LineStyle><color>${line}</color><width>2</width></LineStyle>
      <PolyStyle><color>${fill}</color></PolyStyle>
      <IconStyle><color>${line}</color><scale>1.1</scale></IconStyle>
    </Style>`;
}

/** id de Style determinístico para um tipo do catálogo. */
const tipoStyleId = (tipoId: string) => `tipo-${tipoId}`;

/**
 * Monta a string KML do mapa canônico, agrupando por Categoria → Tipo e
 * embutindo o local_id de cada feição em ExtendedData.
 */
export function buildCanonicalKml(opts: {
  farmName: string;
  areas: CanonicalArea[];
  catalog: CanonicalCatalog | null;
}): string {
  const { farmName, areas, catalog } = opts;
  const categorias = catalog?.categorias ?? [];
  const tipos = catalog?.tipos ?? [];

  // Índices auxiliares (tipo casado por nome normalizado, como no resto do sistema).
  const tipoByNome = new Map(tipos.map((t) => [normTipo(t.nome), t] as const));
  const catById = new Map(categorias.map((c) => [c.id, c] as const));
  const tiposByCat = new Map<string, typeof tipos>();
  for (const t of tipos) {
    const arr = tiposByCat.get(t.categoriaId);
    if (arr) arr.push(t);
    else tiposByCat.set(t.categoriaId, [t]);
  }

  // ── Styles: um por tipo do catálogo + um por nível estrutural + default ──
  const styles: string[] = [];
  for (const t of tipos) styles.push(styleKml(tipoStyleId(t.id), t.cor || catById.get(t.categoriaId)?.cor || NIVEL_COR.local));
  (['fazenda', 'retiro', 'setor', 'local'] as CanonicalNivel[]).forEach((nv) => styles.push(styleKml(`nivel-${nv}`, NIVEL_COR[nv])));

  // ── Estrutura geográfica (perímetro, retiros, setores) ──
  const estrutura: string[] = [];
  const addNivelFolder = (nv: CanonicalNivel, titulo: string) => {
    const list = areas.filter((a) => a.nivel === nv);
    if (!list.length) return;
    const pms = list.map((a) => placemarkKml(a, `nivel-${nv}`, null)).filter(Boolean);
    if (!pms.length) return;
    estrutura.push(`  <Folder>
    <name>${xml(titulo)}</name>
${pms.join('\n')}
  </Folder>`);
  };
  addNivelFolder('fazenda', 'Perímetro da Fazenda');
  addNivelFolder('retiro', 'Retiros');
  addNivelFolder('setor', 'Setores');

  // ── Locais agrupados por Categoria → Tipo ──
  const locais = areas.filter((a) => a.nivel === 'local');
  const usados = new Set<string>(); // ids já escritos (cada local em UMA pasta só)
  const catFolders: string[] = [];
  for (const cat of categorias) {
    const tiposDaCat = tiposByCat.get(cat.id) ?? [];
    const tipoFolders: string[] = [];
    for (const t of tiposDaCat) {
      const doTipo = locais.filter((a) => !usados.has(a.id) && normTipo(a.tipo) === normTipo(t.nome));
      if (!doTipo.length) continue;
      const pms: string[] = [];
      for (const a of doTipo) {
        const pm = placemarkKml(a, tipoStyleId(t.id), cat.nome);
        if (pm) { usados.add(a.id); pms.push(pm); } // só marca usado se gerou placemark
      }
      if (!pms.length) continue;
      tipoFolders.push(`    <Folder>
      <name>${xml(t.nome)}</name>
${pms.join('\n')}
    </Folder>`);
    }
    if (tipoFolders.length) {
      catFolders.push(`  <Folder>
    <name>${xml(cat.nome)}</name>
${tipoFolders.join('\n')}
  </Folder>`);
    }
  }

  // ── Locais sem classificação no catálogo (tipo nulo OU tipo fora do catálogo) ──
  const naoClassif = locais.filter((a) => !usados.has(a.id));
  let naoClassifFolder = '';
  if (naoClassif.length) {
    const pms = naoClassif
      .map((a) => placemarkKml(a, a.tipo && tipoByNome.has(normTipo(a.tipo)) ? tipoStyleId(tipoByNome.get(normTipo(a.tipo))!.id) : 'nivel-local', null))
      .filter(Boolean);
    if (pms.length) {
      naoClassifFolder = `  <Folder>
    <name>Não classificados</name>
${pms.join('\n')}
  </Folder>`;
    }
  }

  const body = [...estrutura, ...catFolders, naoClassifFolder].filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(farmName)}</name>
${styles.join('\n')}
${body}
  </Document>
</kml>`;
}

/** GeoJSON canônico equivalente (para a coluna geojson de farm_maps). */
export function buildCanonicalGeojson(areas: CanonicalArea[], catalog: CanonicalCatalog | null): GeoJSON.FeatureCollection {
  const tipoByNome = new Map((catalog?.tipos ?? []).map((t) => [normTipo(t.nome), t] as const));
  const catById = new Map((catalog?.categorias ?? []).map((c) => [c.id, c] as const));
  const features: GeoJSON.Feature[] = [];
  for (const a of areas) {
    const ring = a.coords.filter((c) => Array.isArray(c) && c.length === 2);
    const isPt = a.kind === 'point' || ring.length === 1;
    const isLine = a.kind === 'line';
    if (isPt ? !ring[0] : isLine ? ring.length < 2 : ring.length < 3) continue;
    const t = a.tipo ? tipoByNome.get(normTipo(a.tipo)) : undefined;
    let geometry: GeoJSON.Geometry;
    if (isPt) {
      geometry = { type: 'Point', coordinates: [ring[0][1], ring[0][0]] };
    } else if (isLine) {
      geometry = { type: 'LineString', coordinates: ring.map(([lat, lng]) => [lng, lat]) };
    } else {
      // RFC 7946: o anel do polígono precisa ser fechado (1º == último ponto).
      const r = ring.map(([lat, lng]) => [lng, lat]);
      const f = r[0];
      const l = r[r.length - 1];
      if (f && l && (f[0] !== l[0] || f[1] !== l[1])) r.push(f);
      geometry = { type: 'Polygon', coordinates: [r] };
    }
    features.push({
      type: 'Feature',
      properties: {
        local_id: a.id,
        name: a.nome,
        nivel: a.nivel,
        categoria: t ? catById.get(t.categoriaId)?.nome ?? null : null,
        tipo: a.tipo ?? null,
        detalhe: a.detalhe ?? null,
        uso: a.uso ?? null,
      },
      geometry,
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Compacta o KML canônico em um KMZ (Blob) com JSZip. */
export async function buildCanonicalKmz(opts: {
  farmName: string;
  areas: CanonicalArea[];
  catalog: CanonicalCatalog | null;
}): Promise<{ blob: Blob; kml: string; geojson: GeoJSON.FeatureCollection }> {
  const kml = buildCanonicalKml(opts);
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
  return { blob, kml, geojson: buildCanonicalGeojson(opts.areas, opts.catalog) };
}
