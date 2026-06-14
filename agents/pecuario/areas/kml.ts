/* ===== Cadastro de Áreas — leitura de KML/KMZ =====
 * Extrai polígonos de um arquivo .kml ou .kmz e devolve cada anel como
 * [lat,lng][] já limpo (sem ponto de fechamento duplicado). Usado tanto pelo
 * mapa quanto pelo import por card na aba Locais — a geometria importada vira
 * o contorno do próprio registro (Fazenda/Retiro/Setor/Local).
 */
import JSZip from 'jszip';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { cleanRing } from './util';

/** Erro com mensagem amigável (já em pt-BR) para exibir num toast. */
export class KmlError extends Error {}

export interface KmlPolygon {
  /** name do Placemark, se houver. */
  nome: string | null;
  /** anel [lat,lng][] sem ponto de fechamento duplicado. */
  ring: [number, number][];
}

/** Lê um .kml/.kmz e devolve os polígonos como anéis [lat,lng][] válidos.
 *  Lança KmlError (mensagem pt-BR) quando o arquivo é inválido. */
export async function parseKmlPolygons(file: File): Promise<KmlPolygon[]> {
  let kmlText: string;
  if (/\.kmz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const name = Object.keys(zip.files).find((f) => /\.kml$/i.test(f));
    if (!name) throw new KmlError('KMZ sem KML: não encontrei um arquivo .kml dentro do KMZ.');
    kmlText = await zip.files[name].async('text');
  } else if (/\.kml$/i.test(file.name)) {
    kmlText = await file.text();
  } else {
    throw new KmlError('Formato não suportado. Envie um arquivo .kml ou .kmz.');
  }

  const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
  const geo = kmlToGeoJSON(xml) as GeoJSON.FeatureCollection;

  const raw: { nome: string | null; ring: number[][] }[] = [];
  geo.features.forEach((f) => {
    const g = f.geometry;
    if (!g) return;
    const nm = (f.properties && (f.properties.name as string)) || null;
    if (g.type === 'Polygon') {
      raw.push({ nome: nm, ring: g.coordinates[0] as number[][] });
    } else if (g.type === 'MultiPolygon') {
      (g.coordinates as number[][][][]).forEach((p, i) =>
        raw.push({ nome: nm ? (raw.length ? `${nm} ${i + 1}` : nm) : null, ring: p[0] }),
      );
    }
  });

  const polys: KmlPolygon[] = [];
  raw.forEach((p) => {
    // KML é [lng,lat]; o sistema guarda [lat,lng].
    const coords = cleanRing(p.ring.map((c) => [c[1], c[0]]));
    if (
      coords.length > 1 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1]
    ) {
      coords.pop();
    }
    if (coords.length < 3) return;
    polys.push({ nome: p.nome, ring: coords });
  });
  return polys;
}
