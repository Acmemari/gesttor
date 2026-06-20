/* ===== Cadastro de Áreas — editor de vértices (mecanismo reutilizável) =====
 * Fábrica imperativa que transforma um L.Polygon num polígono editável: cada
 * vértice vira um marcador arrastável e, entre dois vértices, um ponto-médio
 * insere um vértice novo. Botão direito num vértice o remove (mínimo 3).
 *
 * É a MESMA mecânica usada na tela principal (CadastroAreasView), extraída para
 * cá para a tela mestra de cadastro reusar sem duplicar — e sem depender do
 * L.Edit do leaflet-draw, instável na combinação leaflet 1.9 + leaflet-draw 1.0.4.
 *
 * Mantém o estado (marcadores + anel) INTERNAMENTE; não usa refs do React nem
 * fala com toast/persistência. O chamador recebe o anel via callback `onChange`
 * (disparado em soltar/inserir/remover) ou lê `current()` ao concluir.
 */
import L from 'leaflet';

export const VERTEX_ICON = L.divIcon({ className: 'fz-edit-vertex', iconSize: [14, 14] });
export const MID_ICON = L.divIcon({ className: 'fz-edit-midpoint', iconSize: [11, 11] });
/** Acima desse nº de vértices, não criamos pontos-médios (polígonos densos de KML). */
const MAX_VERTICES_FOR_MIDPOINTS = 40;

/** Ponto médio entre dois vértices [lat,lng]. */
export const midOf = (a: [number, number], b: [number, number]): [number, number] => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

export interface VertexEditorOpts {
  /** anel atualizado (cópia) — disparado ao soltar um vértice / inserir / remover. */
  onChange?: (coords: [number, number][]) => void;
  /** aviso amigável (ex.: tentou remover abaixo de 3 vértices). */
  onWarn?: (msg: string) => void;
}

export interface VertexEditor {
  /** Entra em edição sobre `poly`, usando `ring` como ponto de partida. */
  begin: (poly: L.Polygon, ring: [number, number][], opts?: VertexEditorOpts) => void;
  /** Anel atual (cópia) — leia ao concluir. */
  current: () => [number, number][];
  /** Há uma edição em andamento? */
  active: () => boolean;
  /** O polígono em edição (para o efeito de sync ignorá-lo). */
  layer: () => L.Polygon | null;
  /** Remove os manipuladores e zera o estado (idempotente; seguro em teardown). */
  teardown: () => void;
}

export function createVertexEditor(map: L.Map): VertexEditor {
  let poly: L.Polygon | null = null;
  let coords: [number, number][] = [];
  let vertex: L.Marker[] = [];
  let mid: L.Marker[] = [];
  let onChange: VertexEditorOpts['onChange'];
  let onWarn: VertexEditorOpts['onWarn'];

  const emit = () => onChange?.(coords.map((c) => [c[0], c[1]] as [number, number]));
  const sync = () => poly?.setLatLngs(coords);

  const clearHandles = () => {
    vertex.forEach((m) => map.removeLayer(m));
    mid.forEach((m) => map.removeLayer(m));
    vertex = [];
    mid = [];
  };

  const rebuild = () => {
    clearHandles();
    if (!poly) return;

    // Um marcador arrastável por vértice.
    coords.forEach((c, i) => {
      const mk = L.marker(c, { draggable: true, icon: VERTEX_ICON, zIndexOffset: 1000, keyboard: false });
      mk.on('drag', () => {
        const ll = mk.getLatLng();
        coords[i] = [ll.lat, ll.lng];
        sync(); // a forma acompanha o vértice em tempo real
        // Reposiciona os pontos-médios vizinhos durante o arraste.
        const prev = (i - 1 + coords.length) % coords.length;
        if (mid[prev]) mid[prev].setLatLng(midOf(coords[prev], coords[i]));
        if (mid[i]) mid[i].setLatLng(midOf(coords[i], coords[(i + 1) % coords.length]));
      });
      mk.on('dragend', emit);
      mk.on('contextmenu', (e) => {
        L.DomEvent.stop(e);
        if (coords.length <= 3) {
          onWarn?.('A forma precisa de pelo menos 3 vértices.');
          return;
        }
        coords.splice(i, 1);
        sync();
        rebuild();
        emit();
      });
      mk.addTo(map);
      vertex.push(mk);
    });

    // Pontos-médios (inserir vértice) — só em formas pouco densas.
    if (coords.length <= MAX_VERTICES_FOR_MIDPOINTS) {
      coords.forEach((c, i) => {
        const next = (i + 1) % coords.length;
        const m = L.marker(midOf(c, coords[next]), { icon: MID_ICON, zIndexOffset: 900, keyboard: false });
        m.on('click', (e) => {
          L.DomEvent.stop(e);
          const at = m.getLatLng();
          coords.splice(i + 1, 0, [at.lat, at.lng]); // novo vértice no ponto-médio
          sync();
          rebuild();
          emit();
        });
        m.addTo(map);
        mid.push(m);
      });
    }
  };

  const teardown = () => {
    clearHandles();
    poly = null;
    coords = [];
    onChange = undefined;
    onWarn = undefined;
  };

  return {
    begin(p, ring, opts) {
      teardown();
      poly = p;
      coords = ring.map((c) => [c[0], c[1]] as [number, number]);
      onChange = opts?.onChange;
      onWarn = opts?.onWarn;
      rebuild();
    },
    current: () => coords.map((c) => [c[0], c[1]] as [number, number]),
    active: () => !!poly,
    layer: () => poly,
    teardown,
  };
}
