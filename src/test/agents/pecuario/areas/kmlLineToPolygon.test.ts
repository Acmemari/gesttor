import { describe, it, expect } from 'vitest';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import {
  corrigirLinhasFechadasKml,
} from '../../../../../agents/pecuario/areas/kmlLineToPolygon';

/**
 * Correção linha→polígono no upload de KMZ/KML (porte da skill
 * kmz-line-to-polygon). Testes puros sobre o DOM do KML (jsdom), sem Leaflet/DB.
 * Latitude ~-15 (MT) de propósito: pega flip [lat,lng]↔[lng,lat] na área.
 */

// Placemark com uma LineString a partir de tokens "lon,lat,alt".
function placemarkLine(nome: string, coords: [number, number][]): string {
  const toks = coords.map(([lng, lat]) => `${lng},${lat},0`).join(' ');
  return `<Placemark><name>${nome}</name><LineString><coordinates>${toks}</coordinates></LineString></Placemark>`;
}

function kmlDoc(...placemarks: string[]): Document {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join('')}</Document></kml>`;
  return new DOMParser().parseFromString(xml, 'text/xml');
}

// Quadrado fechado ~107m×111m (≈ 11.900 m²) em lat -15.
const square: [number, number][] = [
  [-52.0, -15.0], [-52.0, -15.001], [-52.001, -15.001], [-52.001, -15.0], [-52.0, -15.0],
];
// Quase fechado: último ponto ~7,8 m do primeiro (dentro da tolerância de 10 m).
const nearClosed: [number, number][] = [
  [-52.0, -15.0], [-52.0, -15.001], [-52.001, -15.001], [-52.001, -15.0], [-52.0, -15.00007],
];
// Aberto: último ponto ~22 m do primeiro (fora da tolerância).
const openGap: [number, number][] = [
  [-52.0, -15.0], [-52.0, -15.001], [-52.001, -15.001], [-52.001, -15.0], [-52.0, -15.0002],
];
// Minúsculo (~11 m² < 50): degenerado.
const tiny: [number, number][] = [
  [-52.0, -15.0], [-52.0, -15.00003], [-52.00003, -15.00003], [-52.00003, -15.0], [-52.0, -15.0],
];

function polygonCount(gj: GeoJSON.FeatureCollection): number {
  return gj.features.filter((f) => f.geometry?.type === 'Polygon').length;
}

describe('kmlLineToPolygon — correção de linhas fechadas', () => {
  it('converte quadrado fechado exato em polígono e mantém proveniência no GeoJSON', () => {
    const doc = kmlDoc(placemarkLine('Pasto 1', square));
    const { doc: corr, report } = corrigirLinhasFechadasKml(doc);

    expect(report.convertidas).toHaveLength(1);
    expect(report.convertidas[0].nome).toBe('Pasto 1');
    expect(report.convertidas[0].areaHa).toBeGreaterThan(1); // ~1,19 ha
    expect(report.convertidas[0].aplicada).toBe(true);

    // O DOM já tem <Polygon> no lugar da <LineString>.
    expect(corr.getElementsByTagName('Polygon').length).toBe(1);
    expect(corr.getElementsByTagName('LineString').length).toBe(0);

    // togeojson enxerga o Polygon (valida o namespace do createElementNS) + props.
    const gj = kmlToGeoJSON(corr) as GeoJSON.FeatureCollection;
    expect(polygonCount(gj)).toBe(1);
    expect(gj.features[0].properties?.__corrigido).toBe('1');
  });

  it('não muta o doc de entrada (pureza)', () => {
    const doc = kmlDoc(placemarkLine('Pasto 1', square));
    corrigirLinhasFechadasKml(doc);
    expect(doc.getElementsByTagName('Polygon').length).toBe(0);
    expect(doc.getElementsByTagName('LineString').length).toBe(1);
  });

  it('fecha o anel por snap quando o gap está dentro da tolerância', () => {
    const doc = kmlDoc(placemarkLine('Pasto quase', nearClosed));
    const { report } = corrigirLinhasFechadasKml(doc);
    expect(report.convertidas).toHaveLength(1);
    expect(report.convertidas[0].gapM).toBeGreaterThan(0);
    expect(report.convertidas[0].gapM).toBeLessThanOrEqual(10);
  });

  it('mantém como linha quando o gap excede a tolerância', () => {
    const doc = kmlDoc(placemarkLine('Trecho aberto', openGap));
    const { doc: corr, report } = corrigirLinhasFechadasKml(doc);
    expect(report.convertidas).toHaveLength(0);
    expect(report.mantidasAbertas).toHaveLength(1);
    expect(corr.getElementsByTagName('LineString').length).toBe(1);
  });

  it('ignora geometria degenerada (< 50 m²)', () => {
    const doc = kmlDoc(placemarkLine('Micro', tiny));
    const { report } = corrigirLinhasFechadasKml(doc);
    expect(report.convertidas).toHaveLength(0);
    expect(report.ignoradasGeom.some((i) => i.motivo === 'degenerada')).toBe(true);
  });

  it('não converte nome com cara de feição linear; converte quando forçado', () => {
    const doc = kmlDoc(placemarkLine('Cerca do fundo', square));
    const base = corrigirLinhasFechadasKml(doc);
    expect(base.report.convertidas).toHaveLength(0);
    expect(base.report.ignoradasNome).toHaveLength(1);
    expect(base.report.ignoradasNome[0].forcada).toBe(false);
    expect(base.doc.getElementsByTagName('Polygon').length).toBe(0);

    const id = base.report.ignoradasNome[0].id;
    const forced = corrigirLinhasFechadasKml(doc, { forceIds: new Set([id]) });
    expect(forced.report.ignoradasNome[0].forcada).toBe(true);
    expect(forced.doc.getElementsByTagName('Polygon').length).toBe(1);
  });

  it('desfaz (revert) uma conversão convertível, mantendo-a como linha', () => {
    const doc = kmlDoc(placemarkLine('Pasto 1', square));
    const base = corrigirLinhasFechadasKml(doc);
    const id = base.report.convertidas[0].id;

    const reverted = corrigirLinhasFechadasKml(doc, { revertIds: new Set([id]) });
    expect(reverted.report.convertidas[0].aplicada).toBe(false);
    expect(reverted.doc.getElementsByTagName('Polygon').length).toBe(0);
    expect(reverted.doc.getElementsByTagName('LineString').length).toBe(1);
  });

  it('ignora linha com menos de 3 pontos', () => {
    const doc = kmlDoc(placemarkLine('Reta', [[-52.0, -15.0], [-52.0, -15.001]]));
    const { report } = corrigirLinhasFechadasKml(doc);
    expect(report.ignoradasGeom.some((i) => i.motivo === 'poucos_pontos')).toBe(true);
  });

  it('idempotência: reprocessar o KML já corrigido não converte de novo', () => {
    const doc = kmlDoc(placemarkLine('Pasto 1', square));
    const { doc: corr } = corrigirLinhasFechadasKml(doc);
    const { report: r2 } = corrigirLinhasFechadasKml(corr);
    expect(r2.convertidas).toHaveLength(0);
    expect(r2.poligonosExistentes).toBe(1);
  });

  it('conta polígonos e pontos existentes sem alterá-los', () => {
    const doc = new DOMParser().parseFromString(
      `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Sede</name><Point><coordinates>-52.0,-15.0,0</coordinates></Point></Placemark>
        <Placemark><name>Área</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-52.0,-15.0,0 -52.0,-15.001,0 -52.001,-15.001,0 -52.0,-15.0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      </Document></kml>`,
      'text/xml',
    );
    const { report } = corrigirLinhasFechadasKml(doc);
    expect(report.pontos).toBe(1);
    expect(report.poligonosExistentes).toBe(1);
    expect(report.convertidas).toHaveLength(0);
  });
});
