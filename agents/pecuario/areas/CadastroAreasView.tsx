import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  Pencil,
  Crosshair,
  Trash2,
  Layers,
  Info,
  X,
  Save,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Globe,
} from 'lucide-react';
import {
  NIVEIS,
  ORDEM,
  TIPOS_LOCAL,
  USO_COR,
  type Area,
  type Nivel,
} from './types';
import { areaM2, fmtArea, sugerirParent, cleanRing } from './util';
import {
  loadAreas as apiLoadAreas,
  createArea as apiCreateArea,
  updateAreaGeometry as apiUpdateGeometry,
  updateAreaProps as apiUpdateProps,
  deleteArea as apiDeleteArea,
  saveFarmPerimeter,
  countLocalDependents,
  isFazRoot,
  fazRootId,
  type AreaWrite,
} from './areasClient';
import { listFarmMaps, createFarmMap, deleteFarmMapApi, type FarmMapData } from '../../../lib/api/farmMapsClient';
import { redesenhar } from '../../../lib/api/areaMovimentosClient';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import CadastroAreasMestre, {
  type MestreSavePayload,
  type MestreSaveResult,
} from './CadastroAreasMestre';
import { listTiposLocal } from '../../../lib/api/tiposLocalClient';
import { buildCatalogIndex, isPointCoords, pointDivIcon, pointLatLng, type CatalogIndex } from './mapPoints';
import './cadastroAreas.css';

/** ha (string) a partir do anel [lat,lng][], ou null se inválido. */
function haFromCoords(coords: [number, number][]): string | null {
  const m2 = areaM2(coords);
  return m2 ? String(Math.round((m2 / 10000) * 100) / 100) : null;
}
const hojeISODia = () => new Date().toISOString().slice(0, 10);

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

interface CadastroAreasViewProps {
  /** Fazenda em edição (modo embutido na aba Locais). */
  farmId: string;
  farmName: string;
  readOnly?: boolean;
  onToast?: ToastFn;
  /** Seleção compartilhada com a lista da esquerda (controlada pelo container). */
  selId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Níveis ativos da fazenda (para auto-ativar ao desenhar um nível desligado). */
  levels?: { retiro: boolean; setor: boolean; local: boolean };
  onEnsureLevel?: (nivel: 'retiro' | 'setor' | 'local') => void;
  /** Liga/desliga um nível da fazenda (níveis ativos) — repassado à tela mestra. */
  onToggleLevel?: (nivel: 'retiro' | 'setor' | 'local') => void | Promise<void>;
  /** Data inicial única da tela (ISO 'YYYY-MM-DD') — carimbada ao criar/editar área. */
  dataInicial?: string | null;
  /** Avisa o container que a hierarquia mudou (para recarregar a lista). */
  onMutated?: () => void;
  /** Incrementado pelo container quando a lista muda → o mapa recarrega. */
  reloadToken?: number;
  /** Muda quando o layout em volta do mapa muda (ex.: recolher o painel) → invalidateSize. */
  resizeSignal?: number;
  /**
   * Foto histórica fornecida pelo container (slider da linha do tempo). Quando
   * presente, o mapa NÃO carrega do banco — renderiza estas áreas (modo passado).
   */
  asOfAreas?: Area[] | null;
  /** Colore os polígonos por `uso` (cor da terra) em vez de por nível. */
  colorByUso?: boolean;
  /**
   * Abertura controlada da tela mestra "Cadastro de Áreas". Quando definido, o
   * container (ex.: a aba Locais em modo mapa) decide se a tela está aberta —
   * permitindo usá-la como tela inicial e alternar via abas no rodapé. Ausente ⇒
   * estado interno (a tela só abre pelo botão "Cadastrar áreas").
   */
  mestreOpen?: boolean;
  /** Notifica o container quando a tela mestra abre/fecha (abrir = tela inicial). */
  onMestreOpenChange?: (open: boolean) => void;
  /** Mostra no rodapé da tela mestra a aba "Colunas" (volta às colunas das áreas). */
  mestreColumnsTab?: boolean;
  /** Renderiza a tela mestra embutida (preenche este container, sem flutuar). */
  mestreEmbedded?: boolean;
}

interface PropsDraft {
  editId: string | null;
  coords: [number, number][];
  nome: string;
  nivel: Nivel;
  /** texto livre: enum legado OU nome de tipo do catálogo. */
  tipo: string | null;
  parent: string | null;
}

/** Estilo Leaflet de um polígono conforme nível/seleção (ou por uso da terra). */
function styleFor(a: Area, selected: boolean, colorByUso = false): L.PathOptions {
  const n = NIVEIS[a.nivel];
  const cor = colorByUso && a.uso ? (USO_COR[a.uso] ?? n.cor) : n.cor;
  return {
    color: cor,
    weight: a.nivel === 'fazenda' ? 3.5 : selected ? 3.5 : 2,
    opacity: 1,
    fillColor: cor,
    fillOpacity: selected ? n.fill + 0.14 : n.fill,
    dashArray: a.nivel === 'fazenda' ? '7 5' : undefined,
  };
}

/** Resolve os FKs (retiroId/setorId) a partir da área-pai escolhida no painel. */
function resolveFk(
  areas: Area[],
  parentId: string | null,
  nivel: Nivel,
): { retiroId: string | null; setorId: string | null } {
  if (!parentId || isFazRoot(parentId)) return { retiroId: null, setorId: null };
  const p = areas.find((a) => a.id === parentId);
  if (!p) return { retiroId: null, setorId: null };
  if (nivel === 'setor') {
    return { retiroId: p.nivel === 'retiro' ? p.id : null, setorId: null };
  }
  if (nivel === 'local') {
    if (p.nivel === 'setor') {
      const gp = p.parent ? areas.find((a) => a.id === p.parent) : null;
      return { setorId: p.id, retiroId: gp && gp.nivel === 'retiro' ? gp.id : null };
    }
    if (p.nivel === 'retiro') return { retiroId: p.id, setorId: null };
  }
  return { retiroId: null, setorId: null };
}

const FZ_FALLBACK_CENTER: [number, number] = [-15.553, -52.104];

/** Ícones dos manipuladores de edição de forma (vértice arrastável e ponto-médio). */
const VERTEX_ICON = L.divIcon({ className: 'fz-edit-vertex', iconSize: [14, 14] });
const MID_ICON = L.divIcon({ className: 'fz-edit-midpoint', iconSize: [11, 11] });
/** Acima desse nº de vértices, não criamos pontos-médios (polígonos densos de KML). */
const MAX_VERTICES_FOR_MIDPOINTS = 40;

/** Ponto médio entre dois vértices [lat,lng]. */
const midOf = (a: [number, number], b: [number, number]): [number, number] => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

const CadastroAreasView: React.FC<CadastroAreasViewProps> = ({
  farmId,
  farmName,
  readOnly = false,
  onToast,
  selId: selIdProp,
  onSelect,
  levels,
  onEnsureLevel,
  onToggleLevel,
  dataInicial,
  onMutated,
  reloadToken,
  resizeSignal,
  asOfAreas,
  colorByUso = false,
  mestreOpen,
  onMestreOpenChange,
  mestreColumnsTab = false,
  mestreEmbedded = false,
}) => {
  // ── Estado de domínio ───────────────────────────────────────────────────
  const { selectedOrganization } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';
  // Catálogo "Tipos de Locais" — resolve cor/ícone dos Locais por tipo (e dos pontos).
  const [tiposCatalog, setTiposCatalog] = useState<Awaited<ReturnType<typeof listTiposLocal>> | null>(null);
  const catalogIndex = useMemo<CatalogIndex>(() => buildCatalogIndex(tiposCatalog), [tiposCatalog]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [internalSel, setInternalSel] = useState<string | null>(null);
  const selId = selIdProp !== undefined ? selIdProp : internalSel;
  const [active, setActive] = useState<Nivel>('local');
  const [basemap, setBasemap] = useState<'sat' | 'osm'>('sat');
  const [mapReady, setMapReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  // Tela mestra "Cadastro de Áreas" (importação Google Earth + camada de
  // referência). Aberta de forma CONTROLADA quando o container passa `mestreOpen`
  // (aba Locais em modo mapa, onde é a tela inicial e alterna por abas no rodapé);
  // senão, estado interno acionado pelo botão "Cadastrar áreas".
  const [internalMestreOpen, setInternalMestreOpen] = useState(false);
  const importOpen = mestreOpen !== undefined ? mestreOpen : internalMestreOpen;
  const setImportOpen = useCallback(
    (open: boolean) => {
      if (mestreOpen === undefined) setInternalMestreOpen(open);
      onMestreOpenChange?.(open);
    },
    [mestreOpen, onMestreOpenChange],
  );
  const [overlayMaps, setOverlayMaps] = useState<FarmMapData[]>([]);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayReload, setOverlayReload] = useState(0);
  const [localReload, setLocalReload] = useState(0);
  const [editingShape, setEditingShape] = useState(false);
  const [propsModal, setPropsModal] = useState<PropsDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDeps, setDeleteDeps] = useState<number | null>(null);
  // Níveis ocultos no mapa (controlado pela legenda clicável).
  const [hiddenLevels, setHiddenLevels] = useState<Set<Nivel>>(new Set());
  const toggleLevelVisibility = useCallback((nv: Nivel) => {
    setHiddenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(nv)) next.delete(nv);
      else next.add(nv);
      return next;
    });
  }, []);

  const selectArea = useCallback(
    (id: string | null) => {
      if (onSelect) onSelect(id);
      else setInternalSel(id);
    },
    [onSelect],
  );

  // ── Refs (Leaflet imperativo + leitura de estado em callbacks) ──────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.Polygon>>(new Map());
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const overlayLayersRef = useRef<L.Layer[]>([]);
  const baseSatRef = useRef<L.TileLayer | null>(null);
  const baseOSMRef = useRef<L.TileLayer | null>(null);
  const drawHandlerRef = useRef<{ enable: () => void; disable: () => void } | null>(null);
  const areasRef = useRef<Area[]>(areas);
  const activeRef = useRef<Nivel>(active);
  const pendingFitRef = useRef(false);
  // Edição de forma própria (vértices arrastáveis) — não depende do L.Edit do leaflet-draw,
  // que é instável na combinação leaflet 1.9 + leaflet-draw 1.0.4.
  const editVertexRef = useRef<L.Marker[]>([]);
  const editMidRef = useRef<L.Marker[]>([]);
  const editCoordsRef = useRef<[number, number][]>([]);
  const editLayerRef = useRef<L.Polygon | null>(null);
  const editAreaIdRef = useRef<string | null>(null);
  const editingShapeRef = useRef(false);
  editingShapeRef.current = editingShape;

  areasRef.current = areas;
  activeRef.current = active;

  const levelOf = (nivel: Nivel): boolean =>
    nivel === 'retiro' ? !!levels?.retiro : nivel === 'setor' ? !!levels?.setor : nivel === 'local' ? !!levels?.local : true;

  // Nível de desenho segue o item selecionado na lista (sem seletor de camada).
  useEffect(() => {
    if (!selId) return;
    const a = areasRef.current.find((x) => x.id === selId);
    if (a) setActive(a.nivel);
  }, [selId]);

  // ── Carrega áreas do banco (e recarrega quando a lista muda) ─────────────
  // Modo passado (slider): o container fornece a foto histórica em `asOfAreas` —
  // não carregamos do banco; renderizamos exatamente o que veio da reconstrução.
  useEffect(() => {
    if (asOfAreas) {
      setAreas(asOfAreas);
      pendingFitRef.current = true;
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiLoadAreas(farmId, farmName)
      .then((a) => {
        if (cancelled) return;
        setAreas(a);
        pendingFitRef.current = true;
      })
      .catch((err) => {
        console.error('Erro ao carregar áreas:', err);
        onToast?.('Não foi possível carregar as áreas desta fazenda.', 'error');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, reloadToken, localReload, asOfAreas]);

  // ── Inicializa o mapa (1x) + carrega leaflet-draw dinamicamente ─────────
  useEffect(() => {
    let cancelled = false;
    const store = layersRef.current;
    const markerStore = markersRef.current;
    (async () => {
      // leaflet-draw é UMD e espera o global L antes de registrar L.Draw.
      (window as unknown as { L?: typeof L }).L = L;
      await import('leaflet-draw');
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        center: FZ_FALLBACK_CENTER,
        zoom: 13,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imagery © Esri' },
      );
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      });
      sat.addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      baseSatRef.current = sat;
      baseOSMRef.current = osm;
      mapRef.current = map;
      setMapReady(true);

      map.on('draw:created', (e: { layer: L.Polygon }) => {
        const coords = (e.layer.getLatLngs()[0] as L.LatLng[]).map(
          (p) => [p.lat, p.lng] as [number, number],
        );
        drawHandlerRef.current = null;
        setDrawing(false);
        const nivel = activeRef.current;
        setPropsModal({
          editId: null,
          coords,
          nome: '',
          nivel,
          tipo: nivel === 'local' ? 'Pasto' : null,
          parent: sugerirParent(areasRef.current, coords, nivel),
        });
      });
      map.on('draw:drawstop', () => {
        if (drawHandlerRef.current) {
          drawHandlerRef.current = null;
          setDrawing(false);
        }
      });

      map.invalidateSize();
      if (pendingFitRef.current) fitToFazenda();
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      store.clear();
      markerStore.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mantém o tamanho do mapa ao redimensionar o container ───────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Recalcula o tamanho quando o layout em volta muda (recolher painel) ──
  // O ResizeObserver pode não disparar em toggles de display; forçamos aqui.
  useEffect(() => {
    if (resizeSignal === undefined) return;
    const map = mapRef.current;
    if (!map) return;
    const timers = [0, 80, 320].map((d) => window.setTimeout(() => map.invalidateSize(), d));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [resizeSignal]);

  const fitToFazenda = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const list = areasRef.current;
    const faz =
      list.find((a) => a.nivel === 'fazenda' && cleanRing(a.coords).length >= 3) ??
      list.find((a) => cleanRing(a.coords).length >= 3);
    if (!faz) {
      pendingFitRef.current = false;
      return;
    }
    try {
      const b = L.latLngBounds(cleanRing(faz.coords));
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40] });
        pendingFitRef.current = false;
      }
    } catch {
      /* bounds inválidos — ignora para não quebrar o mapa */
    }
  }, []);

  // Enquadra na fazenda assim que as áreas carregam (após init do mapa).
  useEffect(() => {
    if (mapRef.current && pendingFitRef.current && areas.length) fitToFazenda();
  }, [areas, fitToFazenda]);

  // ── Sincroniza camadas Leaflet com o estado (areas/seleção) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const store = layersRef.current;
    const markStore = markersRef.current;
    const present = new Set(areas.map((a) => a.id));

    for (const [id, layer] of store) {
      if (!present.has(id)) {
        map.removeLayer(layer);
        store.delete(id);
      }
    }
    for (const [id, mk] of markStore) {
      if (!present.has(id)) {
        map.removeLayer(mk);
        markStore.delete(id);
      }
    }

    for (const a of areas) {
      const ring = cleanRing(a.coords);

      // ── Local-ponto (geometria de 1 coordenada) → marcador com o ícone do tipo ──
      if (isPointCoords(a.coords)) {
        const stalePoly = store.get(a.id);
        if (stalePoly) {
          map.removeLayer(stalePoly);
          store.delete(a.id);
        }
        const pt = pointLatLng(a.coords);
        let mk = markStore.get(a.id);
        if (!pt) {
          if (mk) {
            map.removeLayer(mk);
            markStore.delete(a.id);
          }
          continue;
        }
        const r = catalogIndex.resolve(a.tipo);
        const icon = pointDivIcon(r?.icone ?? null, r?.cor ?? NIVEIS.local.cor);
        if (!mk) {
          mk = L.marker(pt, { icon });
          mk.on('click', (e) => {
            L.DomEvent.stop(e);
            selectArea(a.id);
          });
          mk.bindTooltip(a.nome, { direction: 'top', opacity: 0.95 });
          markStore.set(a.id, mk);
        } else {
          mk.setLatLng(pt);
          mk.setIcon(icon);
          if (mk.getTooltip()) mk.setTooltipContent(a.nome);
        }
        if (hiddenLevels.has(a.nivel)) {
          if (map.hasLayer(mk)) map.removeLayer(mk);
          continue;
        }
        if (!map.hasLayer(mk)) mk.addTo(map);
        mk.setZIndexOffset(a.id === selId ? 1000 : 0);
        continue;
      }

      let layer = store.get(a.id);
      if (ring.length < 3) {
        if (layer) {
          map.removeLayer(layer);
          store.delete(a.id);
        }
        continue;
      }
      const className = 'fz-poly-label lvl-' + a.nivel;
      if (layer && (layer as unknown as { _fzNivel?: Nivel })._fzNivel !== a.nivel) {
        map.removeLayer(layer);
        store.delete(a.id);
        layer = undefined;
      }
      if (!layer) {
        layer = L.polygon(ring, styleFor(a, a.id === selId, colorByUso));
        (layer as unknown as { _fzNivel?: Nivel })._fzNivel = a.nivel;
        layer.on('click', (e) => {
          L.DomEvent.stop(e);
          selectArea(a.id);
        });
        layer.bindTooltip(a.nome, { permanent: true, direction: 'center', className, opacity: 1 });
        store.set(a.id, layer);
      } else {
        layer.setStyle(styleFor(a, a.id === selId, colorByUso));
        // Não sobrescreve a geometria do polígono enquanto o usuário edita os vértices.
        if (!(editingShapeRef.current && editLayerRef.current === layer)) layer.setLatLngs(ring);
        if (layer.getTooltip()) layer.setTooltipContent(a.nome);
      }
      if (hiddenLevels.has(a.nivel)) {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        continue;
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (a.id === selId) layer.bringToFront();
    }
  }, [areas, selId, selectArea, hiddenLevels, colorByUso, catalogIndex]);

  // ── Carrega o catálogo "Tipos de Locais" (cor/ícone dos Locais e pontos) ──
  useEffect(() => {
    if (!organizationId) return;
    const ac = new AbortController();
    listTiposLocal(organizationId, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setTiposCatalog(d);
      })
      .catch(() => {
        /* catálogo indisponível — degrada para cor por nível */
      });
    return () => ac.abort();
  }, [organizationId]);

  // ── Camada de referência (mapas importados do Google Earth) ──────────────
  useEffect(() => {
    let cancelled = false;
    listFarmMaps(farmId)
      .then((m) => !cancelled && setOverlayMaps(m))
      .catch(() => !cancelled && setOverlayMaps([]));
    return () => {
      cancelled = true;
    };
  }, [farmId, overlayReload]);

  // Renderiza o GeoJSON cru (linhas + pontos) abaixo das áreas estruturadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlayLayersRef.current.forEach((l) => map.removeLayer(l));
    overlayLayersRef.current = [];
    if (!overlayVisible) return;
    for (const m of overlayMaps) {
      if (!m.geojson) continue;
      try {
        const gj = L.geoJSON(m.geojson as GeoJSON.GeoJsonObject, {
          style: () => ({ color: '#f59e0b', weight: 2, opacity: 0.9, fillColor: '#f59e0b', fillOpacity: 0.07 }),
          pointToLayer: (_f, latlng) =>
            L.circleMarker(latlng, { radius: 5, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.95 }),
          onEachFeature: (f, lyr) => {
            const nm = f.properties && (f.properties.name as string);
            if (nm) lyr.bindPopup(String(nm)); // só ao clicar — não polui o mapa
          },
        });
        gj.addTo(map);
        gj.bringToBack();
        overlayLayersRef.current.push(gj);
      } catch {
        /* geojson inválido — ignora */
      }
    }
  }, [overlayMaps, overlayVisible, mapReady]);

  // ── Confirma o cadastro de áreas (tela mestra) ───────────────────────────
  // Grava a hierarquia inteira em ORDEM DE DEPENDÊNCIA (perímetro → retiros →
  // setores → locais), acumulando as áreas criadas (ids reais) para resolver o
  // pai de cada nível por contenção espacial (`sugerirParent`/`resolveFk`).
  const handleMestreSave = useCallback(
    async (payload: MestreSavePayload): Promise<MestreSaveResult> => {
      const { items, saveOverlay, file, geojson, dataReferencia } = payload;
      // Data escolhida no diálogo "Salvar" carimba os registros (fallback: prop/null).
      const dataGrava = dataReferencia ?? dataInicial ?? null;
      setBusy(true);
      const savedIds: string[] = [];
      const errs: string[] = []; // falhas por item — surfaçadas ao usuário (não engolir).
      try {
        // Habilita de uma vez os níveis presentes (em vez de dentro do loop).
        const needed = new Set(
          items.map((i) => i.nivel).filter((n) => n !== 'fazenda'),
        ) as Set<'retiro' | 'setor' | 'local'>;
        needed.forEach((nv) => {
          if (!levelOf(nv)) onEnsureLevel?.(nv);
        });

        // Pool para resolução de pai por contenção: áreas existentes + as criadas.
        const created: Area[] = [...areasRef.current];
        const draftToArea = new Map<string, Area>();
        let nFaz = 0, nRet = 0, nSet = 0, nLoc = 0;
        let orphanSetores = 0;

        const resolveParent = (it: MestreSavePayload['items'][number], nivel: Nivel): string | null => {
          if (it.parentId) {
            const fromDraft = draftToArea.get(it.parentId);
            if (fromDraft) return fromDraft.id;
            if (created.some((a) => a.id === it.parentId)) return it.parentId; // pai já existente
          }
          return sugerirParent(created, it.coords, nivel);
        };

        // 1) Fazenda (perímetro).
        for (const it of items.filter((i) => i.nivel === 'fazenda')) {
          try {
            await saveFarmPerimeter(farmId, it.coords, it.fonte);
            const rootId = fazRootId(farmId);
            const idx = created.findIndex((a) => a.id === rootId);
            const rootArea: Area =
              idx >= 0
                ? { ...created[idx], coords: it.coords }
                : { id: rootId, nivel: 'fazenda', nome: farmName, parent: null, tipo: null, coords: it.coords, fonte: it.fonte, visivel: true };
            if (idx >= 0) created[idx] = rootArea;
            else created.push(rootArea);
            draftToArea.set(it.id, rootArea);
            savedIds.push(it.id);
            nFaz++;
          } catch (e) {
            console.error('Falha ao salvar o contorno da fazenda', e);
            errs.push(`contorno da fazenda: ${(e as Error)?.message ?? e}`);
          }
        }

        // 2) Retiros (sempre filhos da raiz da fazenda).
        for (const it of items.filter((i) => i.nivel === 'retiro')) {
          try {
            const fk = resolveFk(created, resolveParent(it, 'retiro'), 'retiro');
            const area = await apiCreateArea(farmId, {
              nivel: 'retiro', nome: it.nome, coords: it.coords, fonte: it.fonte,
              retiroId: fk.retiroId, setorId: fk.setorId, dataInicial: dataGrava,
            });
            created.push(area);
            draftToArea.set(it.id, area);
            savedIds.push(it.id);
            nRet++;
          } catch (e) {
            console.error('Falha ao criar retiro', it.nome, e);
            errs.push(`retiro "${it.nome}": ${(e as Error)?.message ?? e}`);
          }
        }

        // 3) Setores (pai = retiro que o contém; sem retiro → solto na fazenda).
        for (const it of items.filter((i) => i.nivel === 'setor')) {
          try {
            const parentId = resolveParent(it, 'setor');
            if (!parentId || isFazRoot(parentId)) orphanSetores++;
            const fk = resolveFk(created, parentId, 'setor');
            const area = await apiCreateArea(farmId, {
              nivel: 'setor', nome: it.nome, coords: it.coords, fonte: it.fonte,
              retiroId: fk.retiroId, setorId: fk.setorId, dataInicial: dataGrava,
            });
            created.push(area);
            draftToArea.set(it.id, area);
            savedIds.push(it.id);
            nSet++;
          } catch (e) {
            console.error('Falha ao criar setor', it.nome, e);
            errs.push(`setor "${it.nome}": ${(e as Error)?.message ?? e}`);
          }
        }

        // 4) Locais (pai = setor ou retiro que o contém).
        for (const it of items.filter((i) => i.nivel === 'local')) {
          try {
            const fk = resolveFk(created, resolveParent(it, 'local'), 'local');
            const area = await apiCreateArea(farmId, {
              nivel: 'local', nome: it.nome, coords: it.coords, fonte: it.fonte,
              tipo: it.tipo ?? 'Pasto', retiroId: fk.retiroId, setorId: fk.setorId, dataInicial: dataGrava,
            });
            created.push(area);
            draftToArea.set(it.id, area);
            savedIds.push(it.id);
            nLoc++;
          } catch (e) {
            console.error('Falha ao criar local', it.nome, e);
            errs.push(`local "${it.nome}": ${(e as Error)?.message ?? e}`);
          }
        }

        // 5) Camada de referência (KML cru).
        if (saveOverlay && file && geojson) {
          const ext = file.name.toLowerCase().endsWith('.kml') ? 'kml' : 'kmz';
          try {
            await createFarmMap({
              farmId,
              fileName: `${crypto.randomUUID()}.${ext}`,
              originalName: file.name,
              fileType: ext,
              fileSize: file.size,
              storagePath: `farm-maps/${farmId}/${crypto.randomUUID()}.${ext}`,
              geojson,
            });
            setOverlayVisible(true);
            setOverlayReload((v) => v + 1);
          } catch (e) {
            console.error('Falha ao salvar a camada de referência:', e);
            onToast?.('Áreas cadastradas, mas a camada de referência não pôde ser salva.', 'warning');
          }
        }

        // 6) Atualiza o mapa principal + resumo.
        pendingFitRef.current = true;
        setLocalReload((v) => v + 1);
        onMutated?.();
        const partes = [
          nFaz ? 'contorno' : '',
          nRet ? `${nRet} retiro(s)` : '',
          nSet ? `${nSet} setor(es)` : '',
          nLoc ? `${nLoc} local(is)` : '',
        ]
          .filter(Boolean)
          .join(' + ');
        if (partes) {
          onToast?.(`Cadastrado: ${partes}.`, 'success');
          if (errs.length) onToast?.(`Alguns itens não foram salvos — ${errs[0]}`, 'warning');
        } else if (saveOverlay && !errs.length) {
          onToast?.('Mapa de referência salvo.', 'success');
        } else {
          // Nada foi gravado: NÃO silenciar — mostra o motivo real da falha.
          onToast?.(
            errs.length ? `Não foi possível salvar: ${errs[0]}` : 'Nada foi salvo. Verifique a conexão e tente novamente.',
            'error',
          );
        }
        if (orphanSetores)
          onToast?.(`${orphanSetores} setor(es) sem retiro foram vinculados direto à fazenda.`, 'warning');

        return { savedIds };
      } catch (err) {
        console.error('Falha no cadastro de áreas:', err);
        onToast?.('Não foi possível concluir o cadastro.', 'error');
        return { savedIds };
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farmId, farmName, levels, onEnsureLevel, dataInicial, onMutated, onToast],
  );

  // ── Excluir uma camada de referência importada (farm_maps) ───────────────
  const deleteOverlay = useCallback(
    async (m: FarmMapData) => {
      if (
        !window.confirm(
          `Excluir o mapa importado "${m.original_name}"?\nA camada de referência some do mapa. O contorno da fazenda e os Locais NÃO são afetados.`,
        )
      )
        return;
      try {
        setBusy(true);
        await deleteFarmMapApi(m.id);
        setOverlayReload((v) => v + 1);
        onToast?.('Mapa importado excluído.', 'success');
      } catch (e) {
        console.error('Falha ao excluir o mapa importado:', e);
        onToast?.('Não foi possível excluir o mapa importado.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [onToast],
  );

  // ── Excluir em lote os Locais criados pela importação (fonte = kml) ───────
  const deleteKmlLocais = useCallback(async () => {
    const alvos = areasRef.current.filter((a) => a.nivel === 'local' && a.fonte === 'kml');
    if (!alvos.length) return;
    if (
      !window.confirm(
        `Excluir ${alvos.length} Local(is) importado(s) do Google Earth?\nEsta ação não pode ser desfeita.`,
      )
    )
      return;
    try {
      setBusy(true);
      const ids = new Set(alvos.map((a) => a.id));
      for (const a of alvos) {
        try {
          await apiDeleteArea(a);
        } catch (e) {
          console.error('Falha ao excluir local importado', a.nome, e);
        }
      }
      setAreas((prev) =>
        prev.filter((x) => !ids.has(x.id)).map((x) => (x.parent && ids.has(x.parent) ? { ...x, parent: null } : x)),
      );
      if (selId && ids.has(selId)) selectArea(null);
      onMutated?.();
      onToast?.(`${alvos.length} local(is) importado(s) excluído(s).`, 'warning');
    } catch (e) {
      console.error('Falha ao excluir locais importados:', e);
      onToast?.('Não foi possível excluir os locais importados.', 'error');
    } finally {
      setBusy(false);
    }
  }, [selId, selectArea, onMutated, onToast]);

  // ── Desenhar ─────────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current;
    if (!map || readOnly) return;
    if (drawHandlerRef.current) {
      drawHandlerRef.current.disable();
      drawHandlerRef.current = null;
      setDrawing(false);
      return;
    }
    const n = NIVEIS[active];
    const DrawNS = (L as unknown as { Draw: { Polygon: new (m: L.Map, o: unknown) => { enable: () => void; disable: () => void } } }).Draw;
    const handler = new DrawNS.Polygon(map, {
      allowIntersection: false,
      showArea: false,
      shapeOptions: {
        color: n.cor,
        weight: 3,
        fillColor: n.cor,
        fillOpacity: n.fill,
        dashArray: active === 'fazenda' ? '7 5' : undefined,
      },
    });
    handler.enable();
    drawHandlerRef.current = handler;
    setDrawing(true);
  }, [active, readOnly]);

  const focusArea = useCallback((id: string) => {
    selectArea(id);
    const map = mapRef.current;
    if (!map) return;
    const layer = layersRef.current.get(id);
    const mk = markersRef.current.get(id);
    if (layer) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
    } else if (mk) {
      map.setView(mk.getLatLng(), Math.max(map.getZoom(), 16));
    }
  }, [selectArea]);

  // ── Editar forma (vértices arrastáveis — implementação própria) ───────────
  // Reconstrói os manipuladores (vértices + pontos-médios) a partir do anel atual.
  const rebuildEditHandles = useCallback(() => {
    const map = mapRef.current;
    const poly = editLayerRef.current;
    if (!map || !poly) return;

    // Limpa marcadores anteriores.
    editVertexRef.current.forEach((m) => map.removeLayer(m));
    editMidRef.current.forEach((m) => map.removeLayer(m));
    editVertexRef.current = [];
    editMidRef.current = [];

    const coords = editCoordsRef.current;
    const sync = () => poly.setLatLngs(coords);

    // Um marcador arrastável por vértice.
    coords.forEach((c, i) => {
      const mk = L.marker(c, { draggable: true, icon: VERTEX_ICON, zIndexOffset: 1000, keyboard: false });
      mk.on('drag', () => {
        const ll = mk.getLatLng();
        coords[i] = [ll.lat, ll.lng];
        sync(); // a forma acompanha o vértice em tempo real
        // Reposiciona os pontos-médios vizinhos durante o arraste.
        const prev = (i - 1 + coords.length) % coords.length;
        if (editMidRef.current[prev]) editMidRef.current[prev].setLatLng(midOf(coords[prev], coords[i]));
        if (editMidRef.current[i]) editMidRef.current[i].setLatLng(midOf(coords[i], coords[(i + 1) % coords.length]));
      });
      mk.on('contextmenu', (e) => {
        L.DomEvent.stop(e);
        if (coords.length <= 3) {
          onToast?.('A forma precisa de pelo menos 3 vértices.', 'warning');
          return;
        }
        coords.splice(i, 1);
        sync();
        rebuildEditHandles();
      });
      mk.addTo(map);
      editVertexRef.current.push(mk);
    });

    // Pontos-médios (inserir vértice) — só em formas pouco densas.
    if (coords.length <= MAX_VERTICES_FOR_MIDPOINTS) {
      coords.forEach((c, i) => {
        const next = (i + 1) % coords.length;
        const mid = L.marker(midOf(c, coords[next]), { icon: MID_ICON, zIndexOffset: 900, keyboard: false });
        mid.on('click', (e) => {
          L.DomEvent.stop(e);
          const at = mid.getLatLng();
          coords.splice(i + 1, 0, [at.lat, at.lng]); // novo vértice no ponto-médio
          sync();
          rebuildEditHandles();
        });
        mid.addTo(map);
        editMidRef.current.push(mid);
      });
    }
  }, [onToast]);

  const teardownEditHandles = useCallback(() => {
    const map = mapRef.current;
    editVertexRef.current.forEach((m) => map?.removeLayer(m));
    editMidRef.current.forEach((m) => map?.removeLayer(m));
    editVertexRef.current = [];
    editMidRef.current = [];
    editLayerRef.current = null;
    editCoordsRef.current = [];
    editAreaIdRef.current = null;
  }, []);

  const toggleEditShape = useCallback(async () => {
    if (readOnly) return;
    if (!selId) {
      onToast?.('Selecione uma área para ajustar a forma.', 'warning');
      return;
    }
    const layer = layersRef.current.get(selId);
    if (!layer) return;

    if (editingShape) {
      // Concluir: lê o anel editado, persiste e limpa os manipuladores.
      const coords = editCoordsRef.current.map((c) => [c[0], c[1]] as [number, number]);
      teardownEditHandles();
      setEditingShape(false);
      const area = areasRef.current.find((a) => a.id === selId);
      if (!area) return;
      try {
        setBusy(true);
        // Append-only: redesenho de um LOCAL passa pelo ledger (remodelar) e vira
        // nova versão na linha do tempo. Retiro/setor seguem o patch direto.
        if (area.nivel === 'local' && organizationId) {
          await redesenhar({
            organizationId, farmId, data: hojeISODia(), areaId: area.id,
            geometry: coords, geometrySource: 'desenho', area: haFromCoords(coords),
          });
        } else {
          await apiUpdateGeometry(farmId, area, coords);
        }
        setAreas((prev) => prev.map((a) => (a.id === selId ? { ...a, coords } : a)));
        onMutated?.();
        onToast?.('Forma atualizada.', 'success');
      } catch (err) {
        console.error(err);
        onToast?.('Não foi possível salvar a forma.', 'error');
      } finally {
        setBusy(false);
      }
    } else {
      // Entrar em edição: copia o anel atual e cria os vértices arrastáveis.
      const ring = cleanRing((layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng]));
      if (ring.length < 3) {
        onToast?.('Esta área não tem uma forma editável.', 'warning');
        return;
      }
      editLayerRef.current = layer;
      editAreaIdRef.current = selId;
      editCoordsRef.current = ring.map((c) => [c[0], c[1]] as [number, number]);
      setEditingShape(true);
      rebuildEditHandles();
      layer.bringToFront();
      onToast?.('Arraste os vértices. Clique no ponto azul-claro para inserir e botão direito para remover. Depois clique em "Concluir forma".', 'info');
    }
  }, [selId, editingShape, onToast, readOnly, farmId, onMutated, rebuildEditHandles, teardownEditHandles]);

  // Cancela a edição de forma (descarta) se o usuário selecionar outra área.
  useEffect(() => {
    if (editingShapeRef.current) {
      // Restaura a forma salva no polígono (descarta a edição em andamento).
      const prevId = editAreaIdRef.current;
      const poly = editLayerRef.current;
      const area = prevId ? areasRef.current.find((a) => a.id === prevId) : null;
      if (poly && area) {
        const ring = cleanRing(area.coords);
        if (ring.length >= 3) poly.setLatLngs(ring);
      }
      teardownEditHandles();
      setEditingShape(false);
    }
  }, [selId, teardownEditHandles]);

  // ── Salvar propriedades (criar / editar) ─────────────────────────────────
  const savePropsDraft = useCallback(
    async (d: PropsDraft) => {
      const nome = d.nome.trim();
      if (!nome) {
        onToast?.('Informe o nome da área.', 'error');
        return;
      }
      const tipo = d.nivel === 'local' ? d.tipo ?? 'Pasto' : null;
      const fk = resolveFk(areasRef.current, d.parent, d.nivel);
      try {
        setBusy(true);
        if (d.editId) {
          const area = areasRef.current.find((a) => a.id === d.editId);
          if (!area) return;
          await apiUpdateProps(area, { nome, tipo, retiroId: fk.retiroId, setorId: fk.setorId, dataInicial: dataInicial ?? null });
          setAreas((prev) =>
            prev.map((a) =>
              a.id === d.editId ? { ...a, nome, parent: d.parent, tipo, dataInicial: dataInicial ?? null } : a,
            ),
          );
          selectArea(d.editId);
          onMutated?.();
          onToast?.(`Área atualizada · ${nome} (${NIVEIS[d.nivel].label}).`, 'success');
        } else {
          if (d.nivel !== 'fazenda' && !levelOf(d.nivel)) onEnsureLevel?.(d.nivel as 'retiro' | 'setor' | 'local');
          const w: AreaWrite = {
            nivel: d.nivel,
            nome,
            coords: d.coords,
            fonte: 'desenho',
            tipo,
            retiroId: fk.retiroId,
            setorId: fk.setorId,
            dataInicial: dataInicial ?? null,
          };
          const area = await apiCreateArea(farmId, w);
          setAreas((prev) => {
            const exists = prev.some((a) => a.id === area.id);
            return exists ? prev.map((a) => (a.id === area.id ? area : a)) : [...prev, area];
          });
          selectArea(area.id);
          onMutated?.();
          onToast?.(`Área adicionada · ${nome} (${NIVEIS[d.nivel].label}) · ${fmtArea(areaM2(d.coords))}.`, 'success');
        }
        setPropsModal(null);
      } catch (err) {
        console.error(err);
        onToast?.('Não foi possível salvar a área.', 'error');
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onToast, farmId, levels, onEnsureLevel, onMutated, selectArea, dataInicial],
  );

  const editProps = useCallback((a: Area) => {
    setPropsModal({ editId: a.id, coords: a.coords, nome: a.nome, nivel: a.nivel, tipo: a.tipo, parent: a.parent });
  }, []);

  // Busca dependentes (movimentos) ao abrir o modal de exclusão de um local.
  useEffect(() => {
    setDeleteDeps(null);
    if (!deleteId) return;
    const a = areasRef.current.find((x) => x.id === deleteId);
    if (!a || a.nivel !== 'local') return;
    let cancelled = false;
    countLocalDependents(deleteId)
      .then((r) => !cancelled && setDeleteDeps(r.total))
      .catch(() => !cancelled && setDeleteDeps(null));
    return () => {
      cancelled = true;
    };
  }, [deleteId]);

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return;
    const a = areasRef.current.find((x) => x.id === deleteId);
    if (!a) {
      setDeleteId(null);
      return;
    }
    try {
      setBusy(true);
      await apiDeleteArea(a);
      setAreas((prev) =>
        prev.filter((x) => x.id !== deleteId).map((x) => (x.parent === deleteId ? { ...x, parent: null } : x)),
      );
      if (selId === deleteId) selectArea(null);
      onMutated?.();
      onToast?.(`Área excluída · ${a.nome} removida do cadastro.`, 'warning');
    } catch (err) {
      console.error(err);
      onToast?.('Não foi possível excluir a área.', 'error');
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  }, [deleteId, selId, selectArea, onMutated, onToast]);

  // ── Basemap ───────────────────────────────────────────────────────────────
  const setBasemapLayer = useCallback((which: 'sat' | 'osm') => {
    const map = mapRef.current;
    if (!map || !baseSatRef.current || !baseOSMRef.current) return;
    setBasemap(which);
    if (which === 'sat') {
      map.removeLayer(baseOSMRef.current);
      baseSatRef.current.addTo(map);
    } else {
      map.removeLayer(baseSatRef.current);
      baseOSMRef.current.addTo(map);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  const selectedArea = useMemo(() => (selId ? areas.find((a) => a.id === selId) ?? null : null), [selId, areas]);
  const kmlLocaisCount = useMemo(
    () => areas.filter((a) => a.nivel === 'local' && a.fonte === 'kml').length,
    [areas],
  );
  const deleteArea = deleteId ? areas.find((a) => a.id === deleteId) ?? null : null;
  const deleteChildren = deleteId ? areas.filter((a) => a.parent === deleteId).length : 0;

  return (
    <div className="relative h-full min-h-[460px] w-full overflow-hidden rounded-xl border border-gray-200 bg-[#0b1f2a]">
      <div ref={containerRef} className="absolute inset-0" />

      {loading && (
        <div className="absolute inset-0 z-[700] flex items-center justify-center bg-white/60">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      )}

      {/* Toolbar (canto sup. esq.) */}
      <div className="absolute left-3 top-3 z-[600] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        {/* Botões de ação */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
            <button
              type="button"
              onClick={startDraw}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold ${
                drawing
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {drawing ? <X size={15} /> : <Pencil size={15} />}
              {drawing ? 'Cancelar desenho' : 'Desenhar'}
            </button>
            <button
              type="button"
              onClick={toggleEditShape}
              disabled={busy}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                editingShape
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {editingShape ? <Save size={15} /> : <Crosshair size={15} />}
              {editingShape ? 'Concluir forma' : 'Editar forma'}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              disabled={busy}
              title="Cadastro de Áreas: importe um KML/KMZ ou desenhe, classifique por nível (Fazenda/Retiro/Setor/Local) e edite no mapa"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Globe size={15} /> Cadastrar áreas
            </button>
          </div>
        )}

        {/* Faixa de dica — apenas durante o desenho */}
        {drawing ? (
          <div className="flex max-w-[340px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug shadow-[0_2px_10px_rgba(16,24,40,.12)]">
            <Info size={14} className="flex-shrink-0 text-emerald-600" />
            <span className="text-emerald-800">
              Clique no mapa para marcar os vértices da <b>{NIVEIS[active].label.toLowerCase()}</b>. Clique no
              primeiro ponto para fechar.
            </span>
          </div>
        ) : null}
      </div>

      {/* Switch de basemap (canto sup. dir.) */}
      <div className="absolute right-3 top-3 z-[600] flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
        {(['sat', 'osm'] as const).map((bm) => (
          <button
            key={bm}
            type="button"
            onClick={() => setBasemapLayer(bm)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              basemap === bm ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {bm === 'sat' ? 'Satélite' : 'Mapa'}
          </button>
        ))}
      </div>

      {/* Painel da importação do Google Earth — mostrar/ocultar e EXCLUIR */}
      {(overlayMaps.length > 0 || kmlLocaisCount > 0) && (
        <div className="absolute right-3 top-14 z-[600] w-[212px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
          {overlayMaps.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-1 px-1.5 py-0.5">
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-gray-700">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: overlayVisible ? '#f59e0b' : '#d1d5db' }}
                  />
                  Mapa importado
                </span>
                <button
                  type="button"
                  onClick={() => setOverlayVisible((v) => !v)}
                  title={overlayVisible ? 'Ocultar no mapa' : 'Mostrar no mapa'}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50"
                >
                  {overlayVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
              <div className="max-h-[120px] overflow-auto">
                {overlayMaps.map((m) => (
                  <div key={m.id} className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-50">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-600" title={m.original_name}>
                      {m.original_name}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteOverlay(m)}
                      title="Excluir este mapa importado"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {kmlLocaisCount > 0 && !readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={deleteKmlLocais}
              title="Excluir os Locais criados a partir dos pontos do Google Earth"
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-2 py-1.5 text-[11.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} /> Excluir {kmlLocaisCount} local(is) importado(s)
            </button>
          )}
        </div>
      )}

      {/* Legenda clicável (canto inf. esq.) — mostra/oculta cada nível no mapa */}
      <div className="absolute bottom-6 left-3 z-[600] flex flex-col gap-0.5 rounded-xl border border-gray-200 bg-white px-1.5 py-1.5 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
        {ORDEM.map((nv) => {
          const hidden = hiddenLevels.has(nv);
          return (
            <button
              key={nv}
              type="button"
              onClick={() => toggleLevelVisibility(nv)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors hover:bg-gray-50 ${
                hidden ? 'text-gray-300' : 'text-gray-700'
              }`}
              title={hidden ? `Mostrar ${NIVEIS[nv].label}` : `Ocultar ${NIVEIS[nv].label}`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
                style={{ background: hidden ? '#d1d5db' : NIVEIS[nv].cor }}
              />
              <span className={hidden ? 'line-through' : ''}>{NIVEIS[nv].label}</span>
              {hidden ? <EyeOff size={12} className="ml-auto" /> : <Eye size={12} className="ml-auto text-gray-300" />}
            </button>
          );
        })}
      </div>

      {/* Barra da área selecionada (canto inf. centro) */}
      {selectedArea && (
        <div className="absolute bottom-6 left-1/2 z-[600] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
          <span className="h-2.5 w-2.5 rounded" style={{ background: NIVEIS[selectedArea.nivel].cor }} />
          <span className="max-w-[180px] truncate text-[12.5px] font-bold text-gray-800">{selectedArea.nome}</span>
          <span className="text-[11.5px] font-semibold tabular-nums text-gray-500">
            {fmtArea(areaM2(selectedArea.coords))}
          </span>
          <button
            type="button"
            title="Centralizar no mapa"
            onClick={() => focusArea(selectedArea.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
          >
            <Crosshair size={15} />
          </button>
          {!readOnly && selectedArea.nivel !== 'fazenda' && (
            <>
              <button
                type="button"
                title="Editar nome / vínculo"
                onClick={() => editProps(selectedArea)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                title="Excluir área"
                onClick={() => setDeleteId(selectedArea.id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      )}

      {propsModal && (
        <AreaPropsModal
          draft={propsModal}
          areas={areas}
          onClose={() => setPropsModal(null)}
          onSave={savePropsDraft}
        />
      )}

      {deleteArea && (
        <DeleteModal
          area={deleteArea}
          childCount={deleteChildren}
          dependents={deleteDeps}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}

      {importOpen && (
        <CadastroAreasMestre
          existingAreas={areas}
          organizationId={organizationId}
          hasPerimeter={areas.some((a) => a.nivel === 'fazenda' && cleanRing(a.coords).length >= 3)}
          busy={busy}
          levels={levels}
          onToggleLevel={onToggleLevel}
          onClose={() => setImportOpen(false)}
          onConfirm={handleMestreSave}
          onToast={onToast}
          onShowColumns={mestreColumnsTab && !mestreEmbedded ? () => setImportOpen(false) : undefined}
          embedded={mestreEmbedded}
        />
      )}
    </div>
  );
};

/* ===== Modal de propriedades (criar / editar área) ===== */
interface AreaPropsModalProps {
  draft: PropsDraft;
  areas: Area[];
  onClose: () => void;
  onSave: (d: PropsDraft) => void;
}

const AreaPropsModal: React.FC<AreaPropsModalProps> = ({ draft, areas, onClose, onSave }) => {
  const [nome, setNome] = useState(draft.nome);
  const [nivel, setNivel] = useState<Nivel>(draft.nivel);
  const [tipo, setTipo] = useState<string | null>(draft.tipo ?? 'Pasto');
  const [parent, setParent] = useState<string | null>(draft.parent);

  const editing = !!draft.editId;
  const m2 = areaM2(draft.coords);

  const onChangeNivel = (nv: Nivel) => {
    setNivel(nv);
    setParent(sugerirParent(editing ? areas.filter((a) => a.id !== draft.editId) : areas, draft.coords, nv));
  };

  const li = NIVEIS[nivel].idx;
  const groups = ORDEM.filter((nv) => NIVEIS[nv].idx < li)
    .map((nv) => ({ nivel: nv, items: areas.filter((x) => x.nivel === nv && x.id !== draft.editId) }))
    .filter((g) => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="max-h-[90vh] w-[560px] max-w-full overflow-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 pb-2 pt-5">
          <div className="min-w-0">
            <h3 className="m-0 text-[17px] font-bold">{editing ? 'Editar área' : 'Nova área no mapa'}</h3>
            <div className="mt-0.5 text-[13px] text-gray-500">
              {editing
                ? draft.nome || 'Ajuste nome e vínculo.'
                : 'Defina nome, camada e vínculo hierárquico do polígono desenhado.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-1">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] font-bold text-emerald-700">
            <Layers size={16} /> Área desenhada: {fmtArea(m2)}{' '}
            <small className="font-medium text-emerald-700/80">
              ({(m2 / 10000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} hectares)
            </small>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3.5">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-gray-700">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Pasto Cabeceira 1"
                autoFocus
                className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-gray-700">Camada</label>
              <select
                value={nivel}
                disabled={editing}
                onChange={(e) => onChangeNivel(e.target.value as Nivel)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500"
              >
                {ORDEM.map((nv) => (
                  <option key={nv} value={nv}>
                    {NIVEIS[nv].label}
                  </option>
                ))}
              </select>
              {editing && (
                <div className="text-[11px] text-gray-400">Para mudar de camada, exclua e desenhe de novo.</div>
              )}
            </div>

            {nivel === 'local' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12.5px] font-semibold text-gray-700">Tipo de local</label>
                <select
                  value={tipo ?? 'Pasto'}
                  onChange={(e) => setTipo(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {tipo && !(TIPOS_LOCAL as string[]).includes(tipo) && <option value={tipo}>{tipo}</option>}
                  {TIPOS_LOCAL.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {nivel !== 'fazenda' && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[12.5px] font-semibold text-gray-700">
                  Vínculo <span className="font-medium text-gray-400">(área de nível superior)</span>
                </label>
                <select
                  value={parent ?? ''}
                  onChange={(e) => setParent(e.target.value || null)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— sem vínculo —</option>
                  {groups.map((g) => (
                    <optgroup key={g.nivel} label={NIVEIS[g.nivel].plural}>
                      {g.items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="text-[11.5px] text-gray-400">
                  Sugerido automaticamente pela posição no mapa — ajuste se necessário.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 px-6 pb-5 pt-3.5">
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...draft, nome, nivel, tipo, parent })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Save size={16} /> {editing ? 'Salvar' : 'Adicionar ao mapa'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ===== Modal de exclusão ===== */
const DeleteModal: React.FC<{
  area: Area;
  childCount: number;
  dependents: number | null;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ area, childCount, dependents, onClose, onConfirm }) => (
  <div
    className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-6 backdrop-blur-[2px]"
    onClick={onClose}
  >
    <div className="w-[460px] max-w-full overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-3 px-6 pb-2 pt-5">
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-bold">Excluir área</h3>
          <div className="mt-0.5 text-[13px] text-gray-500">
            {area.nome} · {NIVEIS[area.nivel].label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 pb-1">
        <p className="m-0 text-[13.5px] text-gray-500">Esta área será removida do mapa e do cadastro.</p>
        {childCount > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span>
              <b>{childCount}</b> área(s) filha(s) ficarão sem vínculo (não serão excluídas).
            </span>
          </div>
        )}
        {dependents != null && dependents > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span>
              Este local tem <b>{dependents}</b> lançamento(s) de mapa de rebanho/mapão que serão <b>apagados</b> junto.
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-2.5 px-6 pb-5 pt-3.5">
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex items-center gap-2 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} /> Excluir
        </button>
      </div>
    </div>
  </div>
);

export default CadastroAreasView;
