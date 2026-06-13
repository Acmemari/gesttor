import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import JSZip from 'jszip';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import {
  ArrowLeft,
  Save,
  Pencil,
  Upload,
  Crosshair,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Map as MapIcon,
  Info,
  X,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import {
  NIVEIS,
  ORDEM,
  TIPOS_LOCAL,
  type Area,
  type Nivel,
  type TipoLocal,
} from './types';
import {
  areaM2,
  fmtArea,
  sugerirParent,
  childrenOf,
  cleanRing,
  loadAreas,
  saveAreas,
  buildSeed,
  FZ_CENTER,
} from './util';
import './cadastroAreas.css';

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

// Largura das colunas do painel. A coluna expandida (`colW`) é redimensionável
// pelo usuário arrastando o divisor entre o mapa e o painel; a recolhida é um
// trilho fino fixo (`RAIL_W`). Limites garantem que sobre mapa e que a coluna
// continue legível.
const COL_W_DEFAULT = 139;
const RAIL_W = 34;
const MIN_COL_W = 104;
const MAX_COL_W = 380;
const MIN_MAP_W = 300;

interface CadastroAreasViewProps {
  onToast?: ToastFn;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

interface PropsDraft {
  editId: string | null;
  coords: [number, number][];
  nome: string;
  nivel: Nivel;
  tipo: TipoLocal | null;
  parent: string | null;
}

/** Estilo Leaflet de um polígono conforme nível/seleção. */
function styleFor(a: Area, selected: boolean): L.PathOptions {
  const n = NIVEIS[a.nivel];
  return {
    color: n.cor,
    weight: a.nivel === 'fazenda' ? 3.5 : selected ? 3.5 : 2,
    opacity: 1,
    fillColor: n.cor,
    fillOpacity: selected ? n.fill + 0.14 : n.fill,
    dashArray: a.nivel === 'fazenda' ? '7 5' : undefined,
  };
}

const CadastroAreasView: React.FC<CadastroAreasViewProps> = ({ onToast, onBack }) => {
  const { selectedFarm, farms } = useHierarchy();
  const farm = selectedFarm ?? farms[0] ?? null;
  const farmId = farm?.id ?? 'demo';
  const farmName = farm?.name ?? 'Fazenda';

  // ── Estado de domínio ───────────────────────────────────────────────────
  const [areas, setAreas] = useState<Area[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [active, setActive] = useState<Nivel>('local');
  const [col, setCol] = useState<{ fazenda: string | null; retiro: string | null; setor: string | null }>({
    fazenda: null,
    retiro: null,
    setor: null,
  });
  const [basemap, setBasemap] = useState<'sat' | 'osm'>('sat');
  const [drawing, setDrawing] = useState(false);
  const [editingShape, setEditingShape] = useState(false);
  const [propsModal, setPropsModal] = useState<PropsDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Colunas recolhidas no painel (UI only) — libera largura para o mapa.
  const [colRecolhida, setColRecolhida] = useState<Record<Nivel, boolean>>({
    fazenda: false,
    retiro: false,
    setor: false,
    local: false,
  });
  // Largura da coluna expandida — ajustada pelo divisor arrastável (mapa↔painel).
  const [colW, setColW] = useState(COL_W_DEFAULT);
  const [resizing, setResizing] = useState(false);

  // ── Refs (Leaflet imperativo + leitura de estado em callbacks) ──────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ right: number; width: number; expanded: number } | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.Polygon>>(new Map());
  const baseSatRef = useRef<L.TileLayer | null>(null);
  const baseOSMRef = useRef<L.TileLayer | null>(null);
  const drawHandlerRef = useRef<{ enable: () => void; disable: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const areasRef = useRef<Area[]>(areas);
  const activeRef = useRef<Nivel>(active);
  const importTargetRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const pendingFitRef = useRef(false);

  areasRef.current = areas;
  activeRef.current = active;

  const selectArea = useCallback((id: string) => setSelId(id), []);

  /** Define camada ativa + filtro cumulativo do mapa (visibilidade). */
  const applyLevel = useCallback((nivel: Nivel) => {
    setActive(nivel);
    const maxIdx = NIVEIS[nivel].idx;
    setAreas((prev) => prev.map((a) => ({ ...a, visivel: NIVEIS[a.nivel].idx <= maxIdx })));
  }, []);

  // ── Carrega áreas da fazenda (ou semente) ───────────────────────────────
  useEffect(() => {
    initializedRef.current = false;
    const loaded = loadAreas(farmId);
    const next = loaded && loaded.length ? loaded : buildSeed(farmName);
    setAreas(next);
    setSelId(null);
    setActive('local');
    setCol({ fazenda: null, retiro: null, setor: null });
    pendingFitRef.current = true;
    // libera persistência só após o 1º load
    requestAnimationFrame(() => {
      initializedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  // ── Persiste em localStorage a cada mudança (após o load inicial) ───────
  useEffect(() => {
    if (!initializedRef.current) return;
    saveAreas(farmId, areas);
  }, [areas, farmId]);

  // ── Inicializa o mapa (1x) + carrega leaflet-draw dinamicamente ─────────
  useEffect(() => {
    let cancelled = false;
    const store = layersRef.current;
    (async () => {
      // leaflet-draw é UMD e espera o global L antes de registrar L.Draw.
      (window as unknown as { L?: typeof L }).L = L;
      await import('leaflet-draw');
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        center: FZ_CENTER,
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

      // Mede o container ANTES do fit — senão o fit roda contra um mapa 0×0 e
      // os tiles não aparecem ao reabrir a tela.
      map.invalidateSize();
      if (pendingFitRef.current) fitToFazenda();
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      store.clear();
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

  const fitToFazenda = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // Só enquadra numa área com anel válido (>= 3 vértices finitos) — evita que
    // um polígono importado com coordenada ruim mande o mapa para (0,0).
    const list = areasRef.current;
    const faz =
      list.find((a) => a.nivel === 'fazenda' && cleanRing(a.coords).length >= 3) ??
      list.find((a) => cleanRing(a.coords).length >= 3);
    if (!faz) return;
    try {
      const b = L.latLngBounds(cleanRing(faz.coords));
      if (b.isValid()) {
        map.fitBounds(b, { padding: [50, 50] });
        pendingFitRef.current = false;
      }
    } catch {
      /* bounds inválidos — ignora para não quebrar o mapa */
    }
  }, []);

  // ── Sincroniza camadas Leaflet com o estado (areas/seleção) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const store = layersRef.current;
    const present = new Set(areas.map((a) => a.id));

    // remove o que sumiu
    for (const [id, layer] of store) {
      if (!present.has(id)) {
        map.removeLayer(layer);
        store.delete(id);
      }
    }

    for (const a of areas) {
      // Anel saneado — pula áreas degeneradas (sem vértices válidos) em vez de
      // deixar o Leaflet lançar e derrubar a tela inteira.
      const ring = cleanRing(a.coords);
      let layer = store.get(a.id);
      if (ring.length < 3) {
        if (layer) {
          map.removeLayer(layer);
          store.delete(a.id);
        }
        continue;
      }
      const className = 'fz-poly-label lvl-' + a.nivel;
      // recria se mudou de nível (cor do rótulo) ou se não existe
      if (layer && (layer as unknown as { _fzNivel?: Nivel })._fzNivel !== a.nivel) {
        map.removeLayer(layer);
        store.delete(a.id);
        layer = undefined;
      }
      if (!layer) {
        layer = L.polygon(ring, styleFor(a, a.id === selId));
        (layer as unknown as { _fzNivel?: Nivel })._fzNivel = a.nivel;
        layer.on('click', (e) => {
          L.DomEvent.stop(e);
          selectArea(a.id);
        });
        layer.bindTooltip(a.nome, {
          permanent: true,
          direction: 'center',
          className,
          opacity: 1,
        });
        store.set(a.id, layer);
      } else {
        layer.setStyle(styleFor(a, a.id === selId));
        layer.setLatLngs(ring);
        if (layer.getTooltip()) layer.setTooltipContent(a.nome);
      }

      if (a.visivel === false) {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      } else {
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (a.id === selId) layer.bringToFront();
      }
    }
  }, [areas, selId, selectArea]);

  // ── Painel: resolução das colunas drill-down (derivada, sem setState) ───
  const fazendas = useMemo(() => areas.filter((a) => a.nivel === 'fazenda'), [areas]);
  const colFazenda = areas.some((a) => a.id === col.fazenda) ? col.fazenda : (fazendas[0]?.id ?? null);
  const retiros = useMemo(() => childrenOf(areas, 'retiro', colFazenda), [areas, colFazenda]);
  const colRetiro = retiros.some((r) => r.id === col.retiro) ? col.retiro : (retiros[0]?.id ?? null);
  const setores = useMemo(() => childrenOf(areas, 'setor', colRetiro), [areas, colRetiro]);
  const colSetor = setores.some((s) => s.id === col.setor) ? col.setor : (setores[0]?.id ?? null);
  const locais = useMemo(() => childrenOf(areas, 'local', colSetor), [areas, colSetor]);

  const columns = [
    { nivel: 'fazenda' as Nivel, items: fazendas, sel: colFazenda, parentChosen: true },
    { nivel: 'retiro' as Nivel, items: retiros, sel: colRetiro, parentChosen: colFazenda != null },
    { nivel: 'setor' as Nivel, items: setores, sel: colSetor, parentChosen: colRetiro != null },
    { nivel: 'local' as Nivel, items: locais, sel: selId, parentChosen: colSetor != null },
  ];

  // Largura do painel = soma das colunas (expandida `colW` · recolhida `RAIL_W`).
  // Encolhe conforme colunas são recolhidas e cresce quando o usuário arrasta o
  // divisor para a esquerda (alarga `colW`), reduzindo o mapa.
  const recolhidasCount = ORDEM.reduce((s, nv) => s + (colRecolhida[nv] ? 1 : 0), 0);
  const todasRecolhidas = recolhidasCount === ORDEM.length;
  const panelWidth = (ORDEM.length - recolhidasCount) * colW + recolhidasCount * RAIL_W;

  // ── Ações do painel ─────────────────────────────────────────────────────
  const fzPick = useCallback(
    (a: Area) => {
      if (a.nivel === 'fazenda') setCol({ fazenda: a.id, retiro: null, setor: null });
      else if (a.nivel === 'retiro') setCol((c) => ({ ...c, retiro: a.id, setor: null }));
      else if (a.nivel === 'setor') setCol((c) => ({ ...c, setor: a.id }));
      applyLevel(a.nivel);
      selectArea(a.id);
    },
    [applyLevel, selectArea],
  );

  const focusArea = useCallback(
    (id: string) => {
      selectArea(id);
      const layer = layersRef.current.get(id);
      if (layer && mapRef.current) {
        mapRef.current.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
    },
    [selectArea],
  );

  const toggleArea = useCallback((id: string) => {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, visivel: a.visivel === false } : a)));
  }, []);

  const toggleLayer = useCallback((nivel: Nivel) => {
    setAreas((prev) => {
      const some = prev.some((a) => a.nivel === nivel && a.visivel !== false);
      return prev.map((a) => (a.nivel === nivel ? { ...a, visivel: !some } : a));
    });
  }, []);

  // Recolher/expandir uma coluna do painel (não afeta a visibilidade no mapa).
  const toggleColRecolhida = useCallback((nivel: Nivel) => {
    setColRecolhida((c) => ({ ...c, [nivel]: !c[nivel] }));
  }, []);

  const setTodasRecolhidas = useCallback((val: boolean) => {
    setColRecolhida({ fazenda: val, retiro: val, setor: val, local: val });
  }, []);

  // ── Divisor mapa ↔ painel (arrastar para a esquerda alarga as colunas) ────
  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const body = bodyRef.current;
      if (!body) return;
      const expanded = ORDEM.length - ORDEM.reduce((s, nv) => s + (colRecolhida[nv] ? 1 : 0), 0);
      if (expanded <= 0) return; // só dá para alargar colunas expandidas
      const rect = body.getBoundingClientRect();
      resizeRef.current = { right: rect.right, width: rect.width, expanded };
      setResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [colRecolhida],
  );

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    const collapsed = ORDEM.length - r.expanded;
    // Painel desejado = distância do cursor até a borda direita do corpo.
    const minPanel = r.expanded * MIN_COL_W + collapsed * RAIL_W;
    const maxPanel = Math.max(minPanel, r.width - MIN_MAP_W);
    const desired = Math.min(maxPanel, Math.max(minPanel, r.right - e.clientX));
    const next = (desired - collapsed * RAIL_W) / r.expanded;
    setColW(Math.max(MIN_COL_W, Math.min(MAX_COL_W, next)));
  }, []);

  const onResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    setResizing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ponteiro já liberado */
    }
  }, []);

  // ── Desenhar ─────────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
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
  }, [active]);

  // ── Editar forma (vértices) ──────────────────────────────────────────────
  const toggleEditShape = useCallback(() => {
    if (!selId) {
      onToast?.('Selecione uma área para ajustar a forma.', 'warning');
      return;
    }
    const layer = layersRef.current.get(selId);
    if (!layer) return;
    const editing = (layer as unknown as { editing?: { enable: () => void; disable: () => void } }).editing;
    if (!editing) return;
    if (editingShape) {
      editing.disable();
      const coords = (layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as [number, number]);
      setAreas((prev) => prev.map((a) => (a.id === selId ? { ...a, coords } : a)));
      setEditingShape(false);
      onToast?.('Forma atualizada.', 'success');
    } else {
      editing.enable();
      setEditingShape(true);
      onToast?.('Arraste os vértices no mapa e clique em "Concluir forma".', 'info');
    }
  }, [selId, editingShape, onToast]);

  // ── Importar KMZ / KML ───────────────────────────────────────────────────
  // Abre o seletor de arquivo. A importação é SEMPRE disparada pelo botão
  // "Importar" de uma fazenda (no painel): `fazendaId` é a fazenda-destino e
  // toda área importada nasce vinculada a ela.
  const startImport = useCallback((fazendaId: string) => {
    importTargetRef.current = fazendaId;
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (input: HTMLInputElement) => {
      const file = input.files?.[0];
      if (!file) return;
      input.value = '';
      try {
        let kmlText: string;
        if (/\.kmz$/i.test(file.name)) {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const name = Object.keys(zip.files).find((f) => /\.kml$/i.test(f));
          if (!name) {
            onToast?.('KMZ sem KML: não encontrei um arquivo .kml dentro do KMZ.', 'error');
            return;
          }
          kmlText = await zip.files[name].async('text');
        } else if (/\.kml$/i.test(file.name)) {
          kmlText = await file.text();
        } else {
          onToast?.('Formato não suportado. Envie um arquivo .kml ou .kmz.', 'error');
          return;
        }

        const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
        const geo = kmlToGeoJSON(xml) as GeoJSON.FeatureCollection;
        const polys: { nome: string | null; ring: number[][] }[] = [];
        geo.features.forEach((f) => {
          const g = f.geometry;
          if (!g) return;
          const nm = (f.properties && (f.properties.name as string)) || null;
          if (g.type === 'Polygon') {
            polys.push({ nome: nm, ring: g.coordinates[0] as number[][] });
          } else if (g.type === 'MultiPolygon') {
            (g.coordinates as number[][][][]).forEach((p, i) =>
              polys.push({ nome: nm ? (polys.length ? `${nm} ${i + 1}` : nm) : null, ring: p[0] }),
            );
          }
        });
        if (!polys.length) {
          onToast?.('Nenhum polígono: o arquivo não contém áreas para importar.', 'warning');
          return;
        }

        // A importação é SEMPRE disparada pelo botão "Importar" de uma fazenda,
        // então toda área importada nasce vinculada a essa fazenda — nunca como
        // uma nova Fazenda solta.
        const target = importTargetRef.current;
        importTargetRef.current = null;

        const fazendasExistentes = areasRef.current.filter((a) => a.nivel === 'fazenda');
        const fazendaAncora =
          target && fazendasExistentes.some((f) => f.id === target) ? target : null;
        if (!fazendaAncora) {
          onToast?.(
            'Use o botão "Importar KMZ/KML" dentro de uma fazenda (no painel à direita) — a importação é sempre vinculada a uma fazenda.',
            'warning',
          );
          return;
        }

        // Nível das áreas importadas = camada ativa, mas nunca "Fazenda":
        // importar gera subdivisões da fazenda (Retiro/Setor/Local), não outra
        // fazenda.
        const nivel: Nivel = activeRef.current === 'fazenda' ? 'retiro' : activeRef.current;

        const bounds = L.latLngBounds([]);
        const novos: Area[] = [];
        polys.forEach((p, i) => {
          // GeoJSON é [lng,lat] → [lat,lng]; cleanRing descarta vértices
          // inválidos (NaN/null/fora de faixa) que quebrariam o mapa depois.
          const coords = cleanRing(p.ring.map((c) => [c[1], c[0]]));
          if (
            coords.length > 1 &&
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]
          ) {
            coords.pop();
          }
          if (coords.length < 3) return; // polígono degenerado — ignora
          // Vínculo dentro da fazenda escolhida: Retiro pendura direto na
          // fazenda; níveis mais fundos buscam o melhor ancestral pela geometria
          // e, na falta de Retiro/Setor, caem na própria fazenda.
          const parent =
            nivel === 'retiro'
              ? fazendaAncora
              : sugerirParent([...areasRef.current, ...novos], coords, nivel) ?? fazendaAncora;
          const area: Area = {
            id: 'ar-' + Date.now() + '-' + i,
            nivel,
            nome: p.nome || `${NIVEIS[nivel].label} importado ${i + 1}`,
            parent,
            tipo: nivel === 'local' ? 'Pasto' : null,
            coords,
            fonte: 'kml',
            visivel: true,
          };
          novos.push(area);
          coords.forEach((c) => bounds.extend(c));
        });
        if (!novos.length) {
          onToast?.(
            'Nenhuma área válida no arquivo: os polígonos não têm coordenadas utilizáveis.',
            'warning',
          );
          return;
        }
        setAreas((prev) => [...prev, ...novos]);
        if (bounds.isValid()) mapRef.current?.fitBounds(bounds, { padding: [40, 40] });
        // Abre o drill-down já na fazenda-destino para mostrar o que entrou.
        setCol({ fazenda: fazendaAncora, retiro: null, setor: null });
        const fazNome = fazendasExistentes.find((f) => f.id === fazendaAncora)?.nome;
        onToast?.(
          `${novos.length} área(s) importada(s) na camada ${NIVEIS[nivel].plural}, vinculada(s) à fazenda ${fazNome ?? ''}.`,
          'success',
        );
      } catch (err) {
        console.error(err);
        onToast?.('Falha ao importar: verifique se é um KML/KMZ válido.', 'error');
      }
    },
    [onToast],
  );

  // ── Salvar propriedades (criar / editar) ─────────────────────────────────
  const savePropsDraft = useCallback(
    (d: PropsDraft) => {
      const nome = d.nome.trim();
      if (!nome) {
        onToast?.('Informe o nome da área.', 'error');
        return;
      }
      const tipo = d.nivel === 'local' ? d.tipo ?? 'Pasto' : null;
      if (d.editId) {
        setAreas((prev) =>
          prev.map((a) =>
            a.id === d.editId ? { ...a, nome, nivel: d.nivel, parent: d.parent, tipo } : a,
          ),
        );
        setSelId(d.editId);
        onToast?.(`Área atualizada · ${nome} (${NIVEIS[d.nivel].label}).`, 'success');
      } else {
        const id = 'ar-' + Date.now();
        const area: Area = {
          id,
          nivel: d.nivel,
          nome,
          parent: d.parent,
          tipo,
          coords: d.coords,
          fonte: 'desenho',
          visivel: true,
        };
        setAreas((prev) => [...prev, area]);
        setSelId(id);
        onToast?.(`Área adicionada · ${nome} (${NIVEIS[d.nivel].label}) · ${fmtArea(areaM2(d.coords))}.`, 'success');
      }
      setPropsModal(null);
    },
    [onToast],
  );

  const editProps = useCallback((a: Area) => {
    setPropsModal({
      editId: a.id,
      coords: a.coords,
      nome: a.nome,
      nivel: a.nivel,
      tipo: a.tipo,
      parent: a.parent,
    });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteId) return;
    const a = areas.find((x) => x.id === deleteId);
    setAreas((prev) =>
      prev.filter((x) => x.id !== deleteId).map((x) => (x.parent === deleteId ? { ...x, parent: null } : x)),
    );
    if (selId === deleteId) setSelId(null);
    setDeleteId(null);
    if (a) onToast?.(`Área excluída · ${a.nome} removida do cadastro.`, 'warning');
  }, [deleteId, areas, selId, onToast]);

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

  const handleSalvarCadastro = useCallback(() => {
    saveAreas(farmId, areas);
    onToast?.(`Cadastro salvo · perímetro e camadas de ${farmName} gravados.`, 'success');
  }, [farmId, areas, farmName, onToast]);

  // ── Render ──────────────────────────────────────────────────────────────
  const deleteArea = deleteId ? areas.find((a) => a.id === deleteId) ?? null : null;
  const deleteChildren = deleteId ? areas.filter((a) => a.parent === deleteId).length : 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm">
      {/* Cabeçalho */}
      <div className="flex flex-shrink-0 items-start gap-4 border-b border-gray-200 px-6 py-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-2 text-xl font-bold tracking-tight">
            <MapIcon size={21} className="text-emerald-600" />
            Cadastro de Áreas
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-gray-500">
            Desenhe o perímetro direto no mapa, ou importe um <b>KMZ/KML</b> dentro de cada fazenda,
            organizando a propriedade em camadas — <b>Fazenda › Retiros › Setores › Locais</b>. Cada nível
            pode ser controlado de forma independente.
          </p>
        </div>
        <div className="ml-auto flex flex-shrink-0 gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={handleSalvarCadastro}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Save size={16} /> Salvar cadastro
          </button>
        </div>
      </div>

      {/* Corpo: mapa + painel */}
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1"
        style={resizing ? { userSelect: 'none', cursor: 'col-resize' } : undefined}
      >
        {/* Mapa */}
        <div className="relative min-w-0 flex-1 bg-[#0b1f2a]">
          <div ref={containerRef} className="absolute inset-0" />

          {/* Toolbar (canto sup. esq.) */}
          <div className="absolute left-3 top-3 z-[600] flex flex-col items-start gap-2">
            {/* Seletor de camada */}
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Camada</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                {ORDEM.map((nv) => {
                  const n = NIVEIS[nv];
                  const isActive = active === nv;
                  const included = n.idx <= NIVEIS[active].idx && !isActive;
                  return (
                    <button
                      key={nv}
                      type="button"
                      onClick={() => {
                        applyLevel(nv);
                      }}
                      className={`flex items-center gap-1.5 border-r border-gray-200 px-2.5 py-1.5 text-[12.5px] font-semibold last:border-r-0 ${
                        isActive ? 'text-white' : included ? 'bg-slate-100 text-gray-700' : 'bg-white text-gray-500'
                      }`}
                      style={isActive ? { background: n.cor } : undefined}
                    >
                      <span className="h-2.5 w-2.5 rounded" style={{ background: n.cor }} />
                      {n.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
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
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold ${
                  editingShape
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {editingShape ? <Save size={15} /> : <Crosshair size={15} />}
                {editingShape ? 'Concluir forma' : 'Editar forma'}
              </button>
            </div>

            {/* Faixa de dica */}
            <div className="flex max-w-[340px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <Info size={14} className={`flex-shrink-0 ${drawing ? 'text-emerald-600' : 'text-blue-600'}`} />
              {drawing ? (
                <span className="text-emerald-800">
                  Clique no mapa para marcar os vértices da <b>{NIVEIS[active].label.toLowerCase()}</b>. Clique
                  no primeiro ponto para fechar.
                </span>
              ) : (
                <span className="text-slate-600">
                  A <b>camada</b> filtra o mapa — do perímetro até o nível escolhido. <b>Desenhe</b> no mapa
                  ou use <b>Importar KMZ/KML</b> dentro da fazenda (painel à direita).
                </span>
              )}
            </div>
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

          {/* Legenda (canto inf. esq.) */}
          <div className="absolute bottom-6 left-3 z-[600] flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
            {ORDEM.map((nv) => (
              <div key={nv} className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-700">
                <span
                  className="h-3 w-3 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
                  style={{ background: NIVEIS[nv].cor }}
                />
                {NIVEIS[nv].label}
              </div>
            ))}
          </div>
        </div>

        {/* Divisor arrastável — puxe para a esquerda p/ reduzir o mapa e
            ampliar as colunas (duplo-clique restaura a largura padrão). */}
        <div
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={() => setColW(COL_W_DEFAULT)}
          title="Arraste para a esquerda para ampliar as colunas e reduzir o mapa · duplo-clique restaura"
          className={`group relative z-[650] flex w-2.5 flex-shrink-0 cursor-col-resize touch-none items-center justify-center border-l ${
            resizing ? 'border-emerald-400 bg-emerald-100' : 'border-gray-200 bg-gray-100 hover:bg-emerald-50'
          }`}
        >
          <GripVertical
            size={14}
            className={resizing ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}
          />
        </div>

        {/* Painel "Camadas da propriedade" — 4 colunas drill-down */}
        <aside
          className={`flex flex-shrink-0 flex-col bg-white ${resizing ? '' : 'transition-[width] duration-200'}`}
          style={{ width: panelWidth }}
        >
          <div className="border-b border-gray-200 px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold">
                <Layers size={16} className="flex-shrink-0 text-gray-400" />
                <span className="truncate">Camadas da propriedade</span>
              </div>
              <button
                type="button"
                onClick={() => setTodasRecolhidas(!todasRecolhidas)}
                title={todasRecolhidas ? 'Mostrar todas as colunas' : 'Recolher todas as colunas'}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
              >
                {todasRecolhidas ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                {todasRecolhidas ? 'Mostrar' : 'Recolher'}
              </button>
            </div>
            <div className="mt-0.5 truncate text-xs text-gray-500">
              Clique para abrir o próximo nível · arraste o divisor à esquerda para alargar as colunas e
              reduzir o mapa.
            </div>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {columns.map((c) => (
              <PanelColumn
                key={c.nivel}
                nivel={c.nivel}
                items={c.items}
                selId={c.sel}
                parentChosen={c.parentChosen}
                recolhida={colRecolhida[c.nivel]}
                colW={colW}
                railW={RAIL_W}
                onPick={fzPick}
                onFocus={focusArea}
                onEdit={editProps}
                onDelete={(id) => setDeleteId(id)}
                onToggleArea={toggleArea}
                onToggleLayer={toggleLayer}
                onToggleRecolhida={toggleColRecolhida}
                onImport={startImport}
              />
            ))}
          </div>
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.kmz"
        className="hidden"
        onChange={(e) => handleFile(e.target)}
      />

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
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

/* ===== Coluna do painel drill-down ===== */
interface PanelColumnProps {
  nivel: Nivel;
  items: Area[];
  selId: string | null;
  parentChosen: boolean;
  recolhida: boolean;
  colW: number;
  railW: number;
  onPick: (a: Area) => void;
  onFocus: (id: string) => void;
  onEdit: (a: Area) => void;
  onDelete: (id: string) => void;
  onToggleArea: (id: string) => void;
  onToggleLayer: (nivel: Nivel) => void;
  onToggleRecolhida: (nivel: Nivel) => void;
  onImport: (fazendaId: string) => void;
}

const PanelColumn: React.FC<PanelColumnProps> = ({
  nivel,
  items,
  selId,
  parentChosen,
  recolhida,
  colW,
  railW,
  onPick,
  onFocus,
  onEdit,
  onDelete,
  onToggleArea,
  onToggleLayer,
  onToggleRecolhida,
  onImport,
}) => {
  const n = NIVEIS[nivel];
  const total = items.reduce((s, a) => s + areaM2(a.coords), 0);
  const algumVisivel = items.some((a) => a.visivel !== false);
  const drillable = nivel !== 'local';

  // Coluna recolhida: trilho vertical fino; clique em qualquer ponto expande.
  if (recolhida) {
    return (
      <button
        type="button"
        onClick={() => onToggleRecolhida(nivel)}
        title={`Expandir ${n.plural}`}
        style={{ width: railW }}
        className="group flex flex-shrink-0 flex-col items-center gap-2 border-r border-gray-200 bg-gray-50 py-2.5 last:border-r-0 hover:bg-gray-100"
      >
        <ChevronsRight size={14} className="flex-shrink-0 text-gray-400 group-hover:text-gray-600" />
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
          style={{ background: n.cor }}
        />
        <span
          className="text-[11px] font-bold uppercase tracking-wide text-gray-600"
          style={{ writingMode: 'vertical-rl' }}
        >
          {n.plural}
        </span>
        <span className="mt-auto text-[10.5px] font-semibold tabular-nums text-gray-400">
          {items.length}
        </span>
      </button>
    );
  }

  const empty = !parentChosen ? (
    <div className="px-2.5 py-2 text-[11.5px] italic text-gray-400">
      Selecione {nivel === 'retiro' ? 'uma fazenda' : `um ${NIVEIS[ORDEM[n.idx - 1]].label.toLowerCase()}`} à
      esquerda.
    </div>
  ) : (
    <div className="px-2.5 py-2 text-[11.5px] italic text-gray-400">
      Nenhum {n.label.toLowerCase()} aqui. Selecione esta camada e desenhe ou importe.
    </div>
  );

  return (
    <div
      style={{ width: colW }}
      className="flex flex-shrink-0 flex-col border-r border-gray-200 last:border-r-0"
    >
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-2">
        <span
          className="h-3 w-3 flex-shrink-0 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
          style={{ background: n.cor }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-700">{n.plural}</div>
          <div className="mt-px truncate text-[10.5px] tabular-nums text-gray-500">
            {items.length} · {fmtArea(total)}
          </div>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            title="Mostrar/ocultar camada no mapa"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLayer(nivel);
            }}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-white"
          >
            {algumVisivel ? <Eye size={15} /> : <EyeOff size={15} className="text-gray-300" />}
          </button>
        )}
        <button
          type="button"
          title="Recolher coluna"
          onClick={(e) => {
            e.stopPropagation();
            onToggleRecolhida(nivel);
          }}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-white hover:text-gray-700"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {items.length === 0
          ? empty
          : items.map((a) => (
              <AreaRow
                key={a.id}
                area={a}
                selected={a.id === selId}
                drillable={drillable}
                onPick={onPick}
                onFocus={onFocus}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleArea={onToggleArea}
                onImport={nivel === 'fazenda' ? onImport : undefined}
              />
            ))}
      </div>
    </div>
  );
};

interface AreaRowProps {
  area: Area;
  selected: boolean;
  drillable: boolean;
  onPick: (a: Area) => void;
  onFocus: (id: string) => void;
  onEdit: (a: Area) => void;
  onDelete: (id: string) => void;
  onToggleArea: (id: string) => void;
  /** Só nas fazendas: importa KMZ/KML diretamente para esta fazenda. */
  onImport?: (fazendaId: string) => void;
}

const AreaRow: React.FC<AreaRowProps> = ({
  area,
  selected,
  drillable,
  onPick,
  onFocus,
  onEdit,
  onDelete,
  onToggleArea,
  onImport,
}) => {
  const accent = NIVEIS[area.nivel].cor;
  const hidden = area.visivel === false;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPick(area)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(area);
        }
      }}
      title={area.nome}
      className={`group cursor-pointer rounded-lg border-l-[3px] px-1.5 py-1.5 ${
        selected ? 'bg-[#eaf1fb]' : 'border-l-transparent hover:bg-gray-50'
      } ${hidden ? 'opacity-50' : ''}`}
      style={selected ? { borderLeftColor: accent } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Mostrar/ocultar"
          onClick={(e) => {
            e.stopPropagation();
            onToggleArea(area.id);
          }}
          className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-white"
        >
          {hidden ? <EyeOff size={13} className="text-gray-300" /> : <Eye size={13} />}
        </button>
        <span
          className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${selected ? 'text-blue-900' : ''}`}
        >
          {area.nome}
        </span>
        {area.fonte === 'kml' && (
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" title="Importado de KML/KMZ" />
        )}
        {drillable && (
          <ChevronRight size={14} className={`flex-shrink-0 ${selected ? '' : 'text-gray-300'}`} style={selected ? { color: accent } : undefined} />
        )}
      </div>
      <div className="mt-px flex min-h-[20px] items-center justify-between gap-1.5 pl-[22px]">
        <span className="truncate text-[10.5px] font-semibold tabular-nums text-gray-500">
          {fmtArea(areaM2(area.coords))}
          {area.tipo ? ' · ' + area.tipo : ''}
        </span>
        <span className="flex flex-shrink-0 opacity-0 group-hover:opacity-100">
          <RowMini title="Centralizar" onClick={() => onFocus(area.id)}>
            <Crosshair size={14} />
          </RowMini>
          <RowMini title="Editar" onClick={() => onEdit(area)}>
            <Pencil size={14} />
          </RowMini>
          <RowMini title="Excluir" danger onClick={() => onDelete(area.id)}>
            <Trash2 size={14} />
          </RowMini>
        </span>
      </div>
      {onImport && (
        <button
          type="button"
          title="Importar KMZ/KML vinculado a esta fazenda"
          onClick={(e) => {
            e.stopPropagation();
            onImport(area.id);
          }}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-emerald-300 bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700 hover:bg-emerald-100"
        >
          <Upload size={12} /> Importar KMZ/KML
        </button>
      )}
    </div>
  );
};

const RowMini: React.FC<{
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, danger, onClick, children }) => (
  <button
    type="button"
    title={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`flex h-[23px] w-[23px] items-center justify-center rounded text-gray-400 hover:bg-white hover:shadow-[0_0_0_1px_#e5e7eb] ${
      danger ? 'hover:text-red-600' : 'hover:text-gray-800'
    }`}
  >
    {children}
  </button>
);

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
  const [tipo, setTipo] = useState<TipoLocal | null>(draft.tipo ?? 'Pasto');
  const [parent, setParent] = useState<string | null>(draft.parent);

  const editing = !!draft.editId;
  const m2 = areaM2(draft.coords);

  // Ao trocar de camada, recalcula a sugestão de vínculo.
  const onChangeNivel = (nv: Nivel) => {
    setNivel(nv);
    setParent(sugerirParent(editing ? areas.filter((a) => a.id !== draft.editId) : areas, draft.coords, nv));
  };

  // Opções de vínculo agrupadas por nível superior.
  const li = NIVEIS[nivel].idx;
  const groups = ORDEM.filter((nv) => NIVEIS[nv].idx < li)
    .map((nv) => ({
      nivel: nv,
      items: areas.filter((x) => x.nivel === nv && x.id !== draft.editId),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[560px] max-w-full overflow-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pb-2 pt-5">
          <div className="min-w-0">
            <h3 className="m-0 text-[17px] font-bold">{editing ? 'Editar área' : 'Nova área no mapa'}</h3>
            <div className="mt-0.5 text-[13px] text-gray-500">
              {editing
                ? draft.nome || 'Ajuste nome, camada e vínculo.'
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
                onChange={(e) => onChangeNivel(e.target.value as Nivel)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {ORDEM.map((nv) => (
                  <option key={nv} value={nv}>
                    {NIVEIS[nv].label}
                  </option>
                ))}
              </select>
            </div>

            {nivel === 'local' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12.5px] font-semibold text-gray-700">Tipo de local</label>
                <select
                  value={tipo ?? 'Pasto'}
                  onChange={(e) => setTipo(e.target.value as TipoLocal)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {TIPOS_LOCAL.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
  onClose: () => void;
  onConfirm: () => void;
}> = ({ area, childCount, onClose, onConfirm }) => (
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
