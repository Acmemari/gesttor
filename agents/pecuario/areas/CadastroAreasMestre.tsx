/* ===== Cadastro de Áreas — tela mestra =====
 * Evolução do antigo modal "Importar do Google Earth": agora é a tela mestra de
 * cadastro da hierarquia geográfica (Fazenda › Retiro › Setor › Local).
 *
 *  - Importar um KML/KMZ é OPCIONAL: reconstruímos o contorno + os piquetes
 *    internos + os pontos (reusa kmlImport) e cada um vira uma LINHA na lista.
 *  - Cada linha tem um seletor de NÍVEL (Fazenda/Retiro/Setor/Local): é assim que
 *    se marca "contorno do retiro" e "contorno do setor", não só da fazenda.
 *  - O mapa é EDITÁVEL na própria tela: desenhar polígonos novos (leaflet-draw) e
 *    arrastar/inserir/remover vértices (createVertexEditor) antes de salvar.
 *  - Ao confirmar, o container grava a hierarquia inteira em ordem de dependência
 *    e resolve os vínculos pai/filho por contenção espacial.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  Globe,
  X,
  Loader2,
  AlertTriangle,
  Check,
  Pencil,
  Crosshair,
  Save,
  Trash2,
  Layers,
  Maximize2,
  Minimize2,
  MapPin,
  Eye,
  EyeOff,
  Square,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { areaM2, cleanRing, fmtArea } from './util';
import { NIVEIS, ORDEM, TIPOS_LOCAL, type Area, type Fonte, type Nivel } from './types';
import { importarKmlGoogleEarth, KmlImportError, type KmlImportResult } from './kmlImport';
import { createVertexEditor, type VertexEditor } from './mapEditing';
import {
  listTiposLocal,
  type TipoLocalCategoria,
  type TipoLocalItem,
} from '../../../lib/api/tiposLocalClient';
import { TipoIcon } from '../../tiposLocalIcons';
import { buildCatalogIndex, pointDivIcon, pointLatLng, type CatalogIndex } from './mapPoints';
import DateInputBR from '../../../components/DateInputBR';
import './cadastroAreas.css';

/** Data local de hoje em ISO 'YYYY-MM-DD' (sem deslocamento de fuso). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

/** Origem de uma área-rascunho (controla o `fonte` na persistência). */
type DraftSource = 'perimeter' | 'paddock' | 'point' | 'drawn';

/** Uma área em rascunho na tela (antes de gravar). */
interface DraftArea {
  id: string;
  nome: string;
  nivel: Nivel;
  /** anel [lat,lng][] (área, ≥3) OU 1 coordenada [[lat,lng]] (ponto). */
  coords: [number, number][];
  /** texto livre: enum legado OU nome de tipo do catálogo. */
  tipo: string | null;
  /** categoria do catálogo (só p/ locais criados via barra de categorias). */
  categoriaId: string | null;
  /** área (polígono) ou ponto (marcador). */
  geomKind: 'area' | 'point';
  source: DraftSource;
  /** entra no cadastro ao confirmar? */
  keep: boolean;
  /** override do pai (id de outra área-rascunho OU de uma área existente). */
  parentId: string | null;
  /** área em m² (cacheada — recalculada só ao editar a forma; 0 p/ ponto). */
  areaM2: number;
}

/** Item enviado ao container para persistir. */
export interface MestreItemOut {
  id: string;
  nome: string;
  nivel: Nivel;
  coords: [number, number][];
  tipo: string | null;
  parentId: string | null;
  fonte: Fonte;
  geomKind: 'area' | 'point';
}

export interface MestreSavePayload {
  items: MestreItemOut[];
  /** salvar o KML cru como camada de referência (farm_maps)? */
  saveOverlay: boolean;
  file: File | null;
  geojson: GeoJSON.FeatureCollection | null;
  /** data de referência escolhida ao salvar (ISO 'YYYY-MM-DD') — carimba os registros. */
  dataReferencia: string;
}

/** Resultado da persistência: ids dos rascunhos efetivamente gravados (idempotência). */
export interface MestreSaveResult {
  savedIds: string[];
}

interface Props {
  /** Áreas já cadastradas (para resolver pais por contenção e oferecer override). */
  existingAreas: Area[];
  /** Organização atual (para carregar o catálogo "Tipos de Locais"). */
  organizationId: string;
  /** A fazenda já tem contorno gravado? (aviso de sobrescrita). */
  hasPerimeter: boolean;
  busy?: boolean;
  /** Níveis ativos da fazenda (controla os toggles Ativo/Inativo dos cards). */
  levels?: { retiro: boolean; setor: boolean; local: boolean };
  /** Liga/desliga um nível da fazenda (persiste); ausência esconde os toggles. */
  onToggleLevel?: (nivel: 'retiro' | 'setor' | 'local') => void | Promise<void>;
  onClose: () => void;
  onConfirm: (payload: MestreSavePayload) => Promise<MestreSaveResult | void> | void;
  onToast?: ToastFn;
  /**
   * Quando definido, esta tela é usada como tela inicial (não modal transitório)
   * e o rodapé ganha abas: "Cadastro de áreas" (ativa) e "Colunas". Selecionar
   * "Colunas" chama isto para o container exibir as colunas das áreas cadastradas.
   */
  onShowColumns?: () => void;
  /**
   * Renderiza embutida (preenche o container pai, sem `fixed`/backdrop) em vez de
   * modal flutuante. Esconde o chrome de modal (X, tela cheia, abas do rodapé,
   * Cancelar) — a navegação fica a cargo das abas do container.
   */
  embedded?: boolean;
}

const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const FALLBACK_CENTER: [number, number] = [-15.553, -52.104];

/** Remoção blindada (o Leaflet estoura ao remover um path ainda não renderizado). */
function safeRemoveLayer(map: L.Map | null, layer: L.Layer) {
  try {
    map?.removeLayer(layer);
  } catch {
    /* path ainda não renderizado — ignora */
  }
}

const uuid = () => crypto.randomUUID();

function defaultNome(nivel: Nivel): string {
  if (nivel === 'fazenda') return 'Contorno da fazenda';
  return `Novo ${NIVEIS[nivel].label}`;
}

/** Estilo Leaflet de uma área-rascunho conforme nível/seleção/manter. */
function draftStyle(it: DraftArea, selected: boolean): L.PathOptions {
  if (!it.keep) {
    return { color: '#94a3b8', weight: 1.5, opacity: 0.9, dashArray: '4 4', fillColor: '#94a3b8', fillOpacity: 0.05 };
  }
  const n = NIVEIS[it.nivel];
  return {
    color: n.cor,
    weight: it.nivel === 'fazenda' ? 3.5 : selected ? 3.5 : 2,
    opacity: 1,
    fillColor: n.cor,
    fillOpacity: selected ? n.fill + 0.14 : n.fill,
    dashArray: it.nivel === 'fazenda' ? '7 5' : undefined,
  };
}

/** Geometria válida p/ persistir: ponto = 1 coordenada; área = anel ≥3. */
function validGeom(coords: [number, number][], geomKind: 'area' | 'point'): boolean {
  const n = cleanRing(coords).length;
  return geomKind === 'point' ? n === 1 : n >= 3;
}

/** Monta as áreas-rascunho a partir do resultado da importação KML. */
function buildItems(r: KmlImportResult): DraftArea[] {
  const out: DraftArea[] = [];
  if (r.perimeter && r.perimeter.length >= 3) {
    const coords = cleanRing(r.perimeter);
    if (coords.length >= 3)
      out.push({ id: uuid(), nome: 'Contorno da fazenda', nivel: 'fazenda', coords, tipo: null, categoriaId: null, geomKind: 'area', source: 'perimeter', keep: true, parentId: null, areaM2: areaM2(coords) });
  }
  r.paddocks.forEach((p) => {
    const coords = cleanRing(p.coords);
    if (coords.length >= 3)
      out.push({ id: uuid(), nome: p.nome, nivel: 'local', coords, tipo: 'Pasto', categoriaId: null, geomKind: 'area', source: 'paddock', keep: p.suggested, parentId: null, areaM2: p.areaM2 || areaM2(coords) });
  });
  r.points.forEach((p) => {
    const coords = cleanRing(p.coords);
    if (coords.length >= 3)
      out.push({ id: uuid(), nome: p.nome, nivel: 'local', coords, tipo: p.tipo, categoriaId: null, geomKind: 'area', source: 'point', keep: true, parentId: null, areaM2: areaM2(coords) });
  });
  return out;
}

/** Modal rápido: ao clicar num polígono, atribui Nome + Tipo de local (catálogo). */
const AtribuirTipoModal: React.FC<{
  item: DraftArea;
  catalog: { categorias: TipoLocalCategoria[]; tipos: TipoLocalItem[] } | null;
  onClose: () => void;
  onSave: (nome: string, tipo: string | null, categoriaId: string | null) => void;
}> = ({ item, catalog, onClose, onSave }) => {
  const [nome, setNome] = useState(item.nome);
  const [tipo, setTipo] = useState<string>(item.tipo ?? '');
  const tiposPorCat = useMemo(() => {
    const m = new Map<string, TipoLocalItem[]>();
    (catalog?.tipos ?? []).forEach((t) => {
      const arr = m.get(t.categoriaId);
      if (arr) arr.push(t);
      else m.set(t.categoriaId, [t]);
    });
    return m;
  }, [catalog]);
  const known = useMemo(() => new Set((catalog?.tipos ?? []).map((t) => t.nome)), [catalog]);

  const save = () => {
    const t = tipo || null;
    const cat = t ? catalog?.tipos.find((x) => x.nome === t)?.categoriaId ?? null : null;
    onSave(nome.trim() || item.nome, t, cat);
  };

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-[420px] max-w-full rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[16px] font-bold text-gray-900">Atribuir tipo ao local</h3>
            <div className="mt-0.5 text-[12.5px] text-gray-500">
              Defina o nome e o tipo de local desta área ({fmtArea(item.areaM2)}).
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
              placeholder="Ex.: Pasto Cabeceira 1"
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">Tipo de local</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">— sem tipo —</option>
              {tipo && !known.has(tipo) && <option value={tipo}>{tipo} (atual)</option>}
              {(catalog?.categorias ?? []).map((cat) => {
                const ts = tiposPorCat.get(cat.id) ?? [];
                if (!ts.length) return null;
                return (
                  <optgroup key={cat.id} label={cat.nome}>
                    {ts.map((t) => (
                      <option key={t.id} value={t.nome}>
                        {t.nome}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {!catalog?.tipos.length && (
              <span className="text-[11px] text-gray-400">Cadastre tipos em "Tipos de Locais" para classificar.</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={16} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

const CadastroAreasMestre: React.FC<Props> = ({
  existingAreas,
  organizationId,
  hasPerimeter,
  busy = false,
  levels,
  onToggleLevel,
  onClose,
  onConfirm,
  onToast,
  onShowColumns,
  embedded = false,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftArea[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [saveOverlay, setSaveOverlay] = useState(false);
  const [drawNivel, setDrawNivel] = useState<Nivel>('local');
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  /** tela cheia (ocupa toda a janela). */
  const [fullscreen, setFullscreen] = useState(false);
  /** diálogo "Data de referência" ao salvar (pergunta a data e grava com ela). */
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [dataRef, setDataRef] = useState<string>(todayIso());
  /** níveis ocultos no mapa (legenda/visualizador clicável). */
  const [hiddenLevels, setHiddenLevels] = useState<Set<Nivel>>(new Set());
  const toggleLevelVisibility = useCallback((nv: Nivel) => {
    setHiddenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(nv)) next.delete(nv);
      else next.add(nv);
      return next;
    });
  }, []);
  /** O nível está ativo na fazenda? (sem `levels`, considera tudo ativo.) */
  const levelActive = useCallback(
    (nv: Nivel): boolean => (nv === 'fazenda' ? true : !levels ? true : !!levels[nv as 'retiro' | 'setor' | 'local']),
    [levels],
  );

  // ── Catálogo "Tipos de Locais" (categorias + tipos da organização) ────────
  const [catalog, setCatalog] = useState<{ categorias: TipoLocalCategoria[]; tipos: TipoLocalItem[] } | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  /** categoria ativa no header: 'perimetro' (estrutura/import) ou um categoriaId. */
  const [activeCat, setActiveCat] = useState<'perimetro' | string>('perimetro');
  /** tipo expandido (mostra a lista de feições) no painel de categoria. */
  const [expandedTipo, setExpandedTipo] = useState<string | null>(null);
  /** ponto pendente: ao clicar no mapa, cria um Local-ponto deste tipo. */
  const [pointMode, setPointMode] = useState<{ tipo: string; categoriaId: string } | null>(null);
  /** id do item cujo Nome+Tipo está sendo atribuído (modal ao clicar no polígono). */
  const [assignId, setAssignId] = useState<string | null>(null);
  /** categorias/tipos ocultos no visualizador (além dos níveis). */
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [hiddenTipos, setHiddenTipos] = useState<Set<string>>(new Set());

  const catalogIndex = useMemo<CatalogIndex>(() => buildCatalogIndex(catalog), [catalog]);
  const tiposByCat = useMemo(() => {
    const m = new Map<string, TipoLocalItem[]>();
    (catalog?.tipos ?? []).forEach((t) => {
      const arr = m.get(t.categoriaId);
      if (arr) arr.push(t);
      else m.set(t.categoriaId, [t]);
    });
    return m;
  }, [catalog]);

  const toggleCatVisibility = useCallback((key: string) => {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleTipoVisibility = useCallback((key: string) => {
    setHiddenTipos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.Polygon>>(new Map());
  const overlayLayerRef = useRef<L.Layer | null>(null);
  const drawHandlerRef = useRef<{ enable: () => void; disable: () => void } | null>(null);
  const editorRef = useRef<VertexEditor | null>(null);
  const pendingFitRef = useRef(false);
  /** marcadores dos Locais-ponto (separado das camadas de polígono). */
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  /** camada read-only das áreas JÁ cadastradas (referência no mapa). */
  const existingLayerRef = useRef<L.LayerGroup | null>(null);
  const existingFittedRef = useRef(false);

  // Espelhos para callbacks imperativos do Leaflet.
  const itemsRef = useRef<DraftArea[]>(items);
  const selIdRef = useRef<string | null>(selId);
  const drawNivelRef = useRef<Nivel>(drawNivel);
  const editingRef = useRef(false);
  /** contexto da próxima feição desenhada (área): nível + tipo/categoria. */
  const drawContextRef = useRef<{ nivel: Nivel; tipo: string | null; categoriaId: string | null }>({ nivel: 'local', tipo: null, categoriaId: null });
  /** modo "inserir ponto" ativo (clique no mapa cria o ponto). */
  const pointModeRef = useRef<{ tipo: string; categoriaId: string } | null>(null);
  itemsRef.current = items;
  selIdRef.current = selId;
  drawNivelRef.current = drawNivel;
  editingRef.current = editing;
  pointModeRef.current = pointMode;

  const selectItem = useCallback((id: string | null) => {
    if (editingRef.current) return; // seleção travada durante a edição de forma
    setSelId(id);
  }, []);

  // ── Importa um arquivo KML/KMZ → áreas-rascunho ──────────────────────────
  const onPick = useCallback(async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setParsing(true);
    try {
      const r = await importarKmlGoogleEarth(f);
      setGeojson(r.geojson);
      const built = buildItems(r);
      setItems(built);
      setSelId(built.find((i) => i.nivel !== 'fazenda')?.id ?? built[0]?.id ?? null);
      setSaveOverlay(true);
      pendingFitRef.current = true;
    } catch (err) {
      setError(
        err instanceof KmlImportError
          ? err.message
          : 'Falha ao ler o arquivo. Verifique se é um KML/KMZ válido do Google Earth.',
      );
    } finally {
      setParsing(false);
    }
  }, []);

  // ── Carrega o catálogo "Tipos de Locais" da organização ──────────────────
  useEffect(() => {
    if (!organizationId) return;
    const ac = new AbortController();
    setCatLoading(true);
    listTiposLocal(organizationId, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setCatalog(d);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        console.error('Falha ao carregar Tipos de Locais', e);
        onToast?.('Não foi possível carregar os Tipos de Locais. Use só os Perímetros.', 'warning');
      })
      .finally(() => {
        if (!ac.signal.aborted) setCatLoading(false);
      });
    return () => ac.abort();
  }, [organizationId, onToast]);

  // ── Inicializa o mapa (1x) + carrega leaflet-draw ────────────────────────
  useEffect(() => {
    let cancelled = false;
    const store = layersRef.current; // instância estável (só mutada) — segura no cleanup
    (async () => {
      (window as unknown as { L?: typeof L }).L = L;
      await import('leaflet-draw');
      if (cancelled || !mapElRef.current || mapRef.current) return;

      const map = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: false,
        center: FALLBACK_CENTER,
        zoom: 5,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer(SAT_TILES, { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setMapReady(true);

      map.on('draw:created', (e: { layer: L.Polygon }) => {
        const coords = cleanRing((e.layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as [number, number]));
        drawHandlerRef.current = null;
        setDrawing(false);
        if (coords.length < 3) return;
        const ctx = drawContextRef.current;
        const id = uuid();
        setItems((prev) => [
          ...prev,
          {
            id,
            nome: ctx.tipo ?? defaultNome(ctx.nivel),
            nivel: ctx.nivel,
            coords,
            tipo: ctx.nivel === 'local' ? ctx.tipo ?? 'Pasto' : null,
            categoriaId: ctx.categoriaId,
            geomKind: 'area',
            source: 'drawn',
            keep: true,
            parentId: null,
            areaM2: areaM2(coords),
          },
        ]);
        setSelId(id);
      });
      map.on('draw:drawstop', () => {
        if (drawHandlerRef.current) {
          drawHandlerRef.current = null;
          setDrawing(false);
        }
      });

      // Clique no mapa no modo "inserir ponto" → cria um Local-ponto do tipo.
      map.on('click', (e: L.LeafletMouseEvent) => {
        const pm = pointModeRef.current;
        if (!pm) return;
        const { lat, lng } = e.latlng;
        const id = uuid();
        setItems((prev) => [
          ...prev,
          {
            id,
            nome: pm.tipo,
            nivel: 'local',
            coords: [[lat, lng]],
            tipo: pm.tipo,
            categoriaId: pm.categoriaId,
            geomKind: 'point',
            source: 'drawn',
            keep: true,
            parentId: null,
            areaM2: 0,
          },
        ]);
        setSelId(id);
        // Mantém o modo ativo para inserir vários pontos seguidos.
      });

      setTimeout(() => map.invalidateSize(), 60);
    })();

    const markerStore = markersRef.current;
    return () => {
      cancelled = true;
      const map = mapRef.current;
      editorRef.current?.teardown();
      if (map) {
        store.forEach((l) => safeRemoveLayer(map, l));
        store.clear();
        markerStore.forEach((m) => safeRemoveLayer(map, m));
        markerStore.clear();
        if (overlayLayerRef.current) safeRemoveLayer(map, overlayLayerRef.current);
        try {
          map.remove();
        } catch {
          /* path ainda não renderizado — ignora */
        }
      }
      mapRef.current = null;
    };
  }, []);

  // ── Camada de referência (KML cru) abaixo das áreas-rascunho ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overlayLayerRef.current) {
      safeRemoveLayer(map, overlayLayerRef.current);
      overlayLayerRef.current = null;
    }
    if (!geojson) return;
    try {
      const gj = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
        style: () => ({ color: '#f59e0b', weight: 1.5, opacity: 0.75, fillColor: '#f59e0b', fillOpacity: 0.05 }),
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#f59e0b', fillOpacity: 0.9 }),
      });
      gj.addTo(map);
      gj.bringToBack();
      overlayLayerRef.current = gj;
    } catch {
      /* geojson inválido — ignora */
    }
  }, [geojson, mapReady]);

  // ── Sincroniza áreas-rascunho ⇄ camadas Leaflet (polígonos + marcadores) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const polyStore = layersRef.current;
    const markStore = markersRef.current;
    const present = new Set(items.map((i) => i.id));
    for (const [id, layer] of polyStore) {
      if (!present.has(id)) {
        safeRemoveLayer(map, layer);
        polyStore.delete(id);
      }
    }
    for (const [id, mk] of markStore) {
      if (!present.has(id)) {
        safeRemoveLayer(map, mk);
        markStore.delete(id);
      }
    }

    // Oculto se o nível, a categoria OU o tipo estiverem desligados no visualizador.
    const hiddenOf = (it: DraftArea) =>
      hiddenLevels.has(it.nivel) ||
      (it.categoriaId != null && hiddenCats.has(it.categoriaId)) ||
      (it.tipo != null && hiddenTipos.has(it.tipo));

    for (const it of items) {
      const ring = cleanRing(it.coords);
      const hidden = hiddenOf(it);

      // ── Ponto (1 coordenada) → marcador com o ícone do tipo ──
      if (it.geomKind === 'point' || ring.length === 1) {
        const stalePoly = polyStore.get(it.id);
        if (stalePoly) {
          safeRemoveLayer(map, stalePoly);
          polyStore.delete(it.id);
        }
        const pt = pointLatLng(it.coords);
        let mk = markStore.get(it.id);
        if (!pt) {
          if (mk) {
            safeRemoveLayer(map, mk);
            markStore.delete(it.id);
          }
          continue;
        }
        const r = catalogIndex.resolve(it.tipo);
        const icon = pointDivIcon(r?.icone ?? null, r?.cor ?? NIVEIS.local.cor);
        if (!mk) {
          mk = L.marker(pt, { icon, draggable: true });
          mk.on('click', (e) => {
            if (pointModeRef.current) return; // deixa o clique inserir um ponto novo
            L.DomEvent.stop(e);
            selectItem(it.id);
          });
          mk.on('dragend', () => {
            const ll = mk!.getLatLng();
            setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, coords: [[ll.lat, ll.lng]] } : x)));
          });
          markStore.set(it.id, mk);
        } else {
          mk.setLatLng(pt);
          mk.setIcon(icon);
        }
        if (hidden) {
          if (map.hasLayer(mk)) safeRemoveLayer(map, mk);
          continue;
        }
        if (!map.hasLayer(mk)) mk.addTo(map);
        mk.setZIndexOffset(it.id === selId ? 1000 : 0);
        continue;
      }

      // ── Área (polígono ≥3) ──
      let layer = polyStore.get(it.id);
      if (ring.length < 3) {
        if (layer) {
          safeRemoveLayer(map, layer);
          polyStore.delete(it.id);
        }
        continue;
      }
      let style = draftStyle(it, it.id === selId);
      if (it.keep && it.categoriaId) {
        const r = catalogIndex.resolve(it.tipo);
        if (r) style = { ...style, color: r.cor, fillColor: r.cor };
      }
      if (!layer) {
        layer = L.polygon(ring, style);
        layer.on('click', (e) => {
          if (pointModeRef.current) return;
          L.DomEvent.stop(e);
          selectItem(it.id);
          // "Atribuir tipo de local" só faz sentido em Locais (não em contornos).
          const cur = itemsRef.current.find((x) => x.id === it.id);
          if (!editingRef.current && cur?.nivel === 'local') setAssignId(it.id);
        });
        polyStore.set(it.id, layer);
      } else {
        layer.setStyle(style);
        // Não sobrescreve a geometria do polígono enquanto seus vértices são editados.
        if (!(editingRef.current && editorRef.current?.layer() === layer)) layer.setLatLngs(ring);
      }
      if (hidden) {
        if (map.hasLayer(layer)) safeRemoveLayer(map, layer);
        continue;
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (it.id === selId) layer.bringToFront();
    }
  }, [items, selId, selectItem, hiddenLevels, hiddenCats, hiddenTipos, catalogIndex]);

  // ── Áreas JÁ cadastradas: camada de referência read-only no mapa ──────────
  // Sem isto, a tela mestra (embutida em tela cheia) mostraria o mapa vazio mesmo
  // havendo perímetro/retiros/setores/locais salvos — parecendo que "não persiste".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!existingLayerRef.current) existingLayerRef.current = L.layerGroup().addTo(map);
    const grp = existingLayerRef.current;
    grp.clearLayers();
    for (const a of existingAreas) {
      if (hiddenLevels.has(a.nivel)) continue;
      const ring = cleanRing(a.coords);
      if (ring.length < 3) continue;
      const resolved = a.tipo ? catalogIndex.resolve(a.tipo) : null;
      const cor = resolved?.cor ?? NIVEIS[a.nivel].cor;
      const poly = L.polygon(ring, {
        color: cor,
        weight: a.nivel === 'fazenda' ? 3 : 1.5,
        opacity: 0.85,
        fillColor: cor,
        fillOpacity: a.nivel === 'fazenda' ? 0.04 : 0.1,
        dashArray: a.nivel === 'fazenda' ? '6 4' : undefined,
        interactive: false, // não captura cliques → não atrapalha desenhar
      });
      poly.bindTooltip(`${a.nome} · já cadastrado`, { sticky: true });
      grp.addLayer(poly);
      poly.bringToBack(); // fica atrás dos rascunhos (que são adicionados depois)
    }
  }, [existingAreas, hiddenLevels, catalogIndex, mapReady]);

  // ── Enquadra nas áreas já cadastradas ao abrir (quando não há rascunhos) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || existingFittedRef.current || items.length > 0) return;
    const rings = existingAreas.map((a) => cleanRing(a.coords)).filter((r) => r.length >= 3);
    if (!rings.length) return;
    try {
      let b = L.latLngBounds(rings[0]);
      rings.forEach((r) => (b = b.extend(L.latLngBounds(r))));
      if (b.isValid()) {
        map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
        existingFittedRef.current = true;
      }
    } catch {
      /* bounds inválidos — ignora */
    }
  }, [existingAreas, mapReady, items.length]);

  // ── Enquadra nas áreas assim que importa / desenha a 1ª ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingFitRef.current) return;
    const rings = items.map((i) => cleanRing(i.coords)).filter((r) => r.length >= 3);
    if (!rings.length) return;
    try {
      let b = L.latLngBounds(rings[0]);
      rings.forEach((r) => (b = b.extend(L.latLngBounds(r))));
      if (b.isValid()) {
        map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
        pendingFitRef.current = false;
      }
    } catch {
      /* bounds inválidos — ignora */
    }
  }, [items, mapReady]);

  // ── Recalcula o tamanho do mapa ao alternar tela cheia ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timers = [0, 80, 260].map((d) => window.setTimeout(() => map.invalidateSize(), d));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [fullscreen]);

  // ── Desenhar (leaflet-draw) ──────────────────────────────────────────────
  /** Começa a desenhar um polígono já fixado num contexto (nível + tipo/categoria). */
  const beginDraw = useCallback(
    (nivel: Nivel, tipo: string | null = null, categoriaId: string | null = null) => {
      const map = mapRef.current;
      if (!map || editingRef.current) return;
      setPointMode(null); // sai do modo "inserir ponto"
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
      drawContextRef.current = { nivel, tipo, categoriaId };
      drawNivelRef.current = nivel;
      setDrawNivel(nivel);
      const n = NIVEIS[nivel];
      const cor = categoriaId ? catalogIndex.resolve(tipo)?.cor ?? n.cor : n.cor;
      const DrawNS = (L as unknown as { Draw: { Polygon: new (m: L.Map, o: unknown) => { enable: () => void; disable: () => void } } }).Draw;
      const handler = new DrawNS.Polygon(map, {
        allowIntersection: false,
        showArea: false,
        shapeOptions: { color: cor, weight: 3, fillColor: cor, fillOpacity: n.fill, dashArray: nivel === 'fazenda' ? '7 5' : undefined },
      });
      handler.enable();
      drawHandlerRef.current = handler;
      setDrawing(true);
    },
    [catalogIndex],
  );

  /** Liga/desliga o modo "inserir ponto" para um tipo do catálogo. */
  const togglePointMode = useCallback(
    (categoriaId: string, tipo: string) => {
      if (editingRef.current) {
        onToast?.('Conclua a edição de forma antes de inserir pontos.', 'warning');
        return;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        setDrawing(false);
      }
      setPointMode((cur) => (cur && cur.tipo === tipo && cur.categoriaId === categoriaId ? null : { categoriaId, tipo }));
    },
    [onToast],
  );

  /** Botão "Desenhar" da barra do mapa: liga/desliga no nível atual. */
  const toggleDraw = useCallback(() => {
    if (drawHandlerRef.current) {
      drawHandlerRef.current.disable();
      drawHandlerRef.current = null;
      setDrawing(false);
      return;
    }
    beginDraw(drawNivelRef.current);
  }, [beginDraw]);

  // ── Editar forma (vértices) ──────────────────────────────────────────────
  const beginEdit = useCallback(
    (id: string) => {
      const map = mapRef.current;
      if (!map) return;
      const layer = layersRef.current.get(id);
      if (!layer) return;
      const ring = cleanRing((layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as [number, number]));
      if (ring.length < 3) {
        onToast?.('Esta área não tem uma forma editável.', 'warning');
        return;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        setDrawing(false);
      }
      if (!editorRef.current) editorRef.current = createVertexEditor(map);
      editorRef.current.begin(layer, ring, { onWarn: (m) => onToast?.(m, 'warning') });
      selIdRef.current = id;
      setSelId(id);
      setEditing(true);
      layer.bringToFront();
      onToast?.('Arraste os vértices. Clique no ponto azul-claro para inserir e botão direito para remover. Depois clique em "Concluir forma".', 'info');
    },
    [onToast],
  );

  const endEdit = useCallback(() => {
    const coords = cleanRing(editorRef.current?.current() ?? []);
    editorRef.current?.teardown();
    setEditing(false);
    const id = selIdRef.current;
    if (id && coords.length >= 3) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, coords, areaM2: areaM2(coords) } : i)));
    } else if (coords.length < 3) {
      onToast?.('A forma precisa de pelo menos 3 vértices — edição descartada.', 'warning');
    }
  }, [onToast]);

  const toggleEdit = useCallback(() => {
    if (editing) {
      endEdit();
      return;
    }
    const id = selIdRef.current;
    if (!id) {
      onToast?.('Selecione uma área para ajustar a forma.', 'warning');
      return;
    }
    beginEdit(id);
  }, [editing, beginEdit, endEdit, onToast]);

  // ── Edição da lista (nível / nome / manter / tipo / pai) ──────────────────
  const patchItem = useCallback((id: string, patch: Partial<DraftArea>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelId((cur) => (cur === id ? null : cur));
  }, []);

  /** Seleciona e centraliza o mapa na área (polígono) ou no ponto (marcador). */
  const focusItem = useCallback(
    (id: string) => {
      selectItem(id);
      const map = mapRef.current;
      if (!map) return;
      const poly = layersRef.current.get(id);
      const mk = markersRef.current.get(id);
      if (poly) {
        try {
          map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 16 });
        } catch {
          /* bounds inválidos — ignora */
        }
      } else if (mk) {
        map.setView(mk.getLatLng(), Math.max(map.getZoom(), 16));
      }
    },
    [selectItem],
  );

  // ── Confirmar ────────────────────────────────────────────────────────────
  const keptItems = useMemo(() => items.filter((i) => i.keep && validGeom(i.coords, i.geomKind)), [items]);
  const keptByLevel = useMemo(() => {
    const c: Record<Nivel, number> = { fazenda: 0, retiro: 0, setor: 0, local: 0 };
    keptItems.forEach((i) => (c[i.nivel] += 1));
    return c;
  }, [keptItems]);

  /** Categorias/tipos com feições no mapa (para o visualizador). */
  const presentLegend = useMemo(() => {
    const catMap = new Map<
      string,
      { nome: string; cor: string; tipos: Map<string, { cor: string; icone: string | null }> }
    >();
    for (const it of items) {
      if (!it.categoriaId || !it.tipo) continue;
      const cat = catalog?.categorias.find((c) => c.id === it.categoriaId);
      let entry = catMap.get(it.categoriaId);
      if (!entry) {
        entry = { nome: cat?.nome ?? 'Outros', cor: cat?.cor ?? '#6b7280', tipos: new Map() };
        catMap.set(it.categoriaId, entry);
      }
      if (!entry.tipos.has(it.tipo)) {
        const r = catalogIndex.resolve(it.tipo);
        entry.tipos.set(it.tipo, { cor: r?.cor ?? entry.cor, icone: r?.icone ?? null });
      }
    }
    return [...catMap.entries()];
  }, [items, catalog, catalogIndex]);

  const canConfirm = !parsing && !busy && !editing && !drawing && (keptItems.length > 0 || (saveOverlay && !!geojson));

  const submit = useCallback(async (dataReferencia: string) => {
    if (!canConfirm) return;
    const out: MestreItemOut[] = keptItems.map((i) => ({
      id: i.id,
      nome: (i.nome || '').trim() || defaultNome(i.nivel),
      nivel: i.nivel,
      coords: cleanRing(i.coords),
      tipo: i.nivel === 'local' ? i.tipo ?? 'Pasto' : null,
      parentId: i.parentId,
      fonte: i.source === 'drawn' ? 'desenho' : 'kml',
      geomKind: i.geomKind,
    }));
    try {
      const res = await onConfirm({ items: out, saveOverlay, file, geojson, dataReferencia });
      if (res && Array.isArray(res.savedIds)) {
        const saved = new Set(res.savedIds);
        const remaining = itemsRef.current.filter((i) => !saved.has(i.id));
        if (remaining.filter((i) => i.keep && validGeom(i.coords, i.geomKind)).length === 0) onClose();
        else setItems(remaining);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Falha ao salvar o cadastro de áreas:', err);
      onToast?.('Não foi possível concluir o cadastro.', 'error');
    }
  }, [canConfirm, keptItems, saveOverlay, file, geojson, onConfirm, onClose, onToast]);

  return (
    <>
    <div
      className={
        embedded
          ? fullscreen
            ? 'fixed inset-0 z-[2000] flex' // tela cheia: cobre o viewport inteiro
            : 'absolute inset-0 z-[800] flex' // embutida: preenche a área de conteúdo
          : `fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] backdrop-blur-[2px] ${
              fullscreen ? 'p-0' : 'p-4'
            }`
      }
      onClick={embedded ? undefined : onClose}
    >
      <div
        className={`flex flex-col overflow-hidden bg-white ${
          embedded
            ? 'h-full w-full max-h-none max-w-none rounded-none'
            : fullscreen
              ? 'h-full w-full max-h-none max-w-none rounded-none shadow-2xl'
              : 'max-h-[94vh] w-[1240px] max-w-[96vw] rounded-2xl shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-6 pb-3 pt-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Layers size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[17px] font-bold text-gray-900">Cadastro de Áreas</h3>
            <div className="mt-0.5 text-[13px] text-gray-500">
              Reproduza no mapa tudo da fazenda: escolha uma <b>categoria</b> acima e <b>desenhe áreas</b> ou{' '}
              <b>insira pontos</b> de cada tipo. <b>Perímetros</b> cuida dos contornos e da importação.
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Restaurar tamanho' : 'Tela cheia'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de categorias (header) — Perímetro + categorias do catálogo */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-4 py-2">
          {(
            [
              { id: 'perimetro', nome: 'Perímetros', cor: NIVEIS.fazenda.cor, icone: null },
              ...(catalog?.categorias ?? []),
            ] as Array<{ id: string; nome: string; cor: string | null; icone: string | null }>
          ).map((c) => {
            const on = activeCat === c.id;
            const cor = c.cor ?? '#6b7280';
            const hidden = c.id === 'perimetro' ? ORDEM.every((nv) => hiddenLevels.has(nv)) : hiddenCats.has(c.id);
            return (
              <div
                key={c.id}
                className={`flex shrink-0 items-center rounded-lg border transition-colors ${
                  on ? 'text-white' : 'bg-white text-gray-600'
                }`}
                style={on ? { background: cor, borderColor: cor } : { borderColor: '#e5e7eb' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveCat(c.id);
                    setExpandedTipo(null);
                    setPointMode(null);
                  }}
                  className={`py-1.5 pl-2.5 pr-1 text-[12.5px] font-semibold ${on ? '' : 'hover:text-gray-900'}`}
                >
                  {c.nome}
                </button>
                <button
                  type="button"
                  title={hidden ? `Mostrar ${c.nome} no mapa` : `Ocultar ${c.nome} no mapa`}
                  onClick={() => {
                    if (c.id === 'perimetro') {
                      setHiddenLevels((prev) => (ORDEM.every((nv) => prev.has(nv)) ? new Set<Nivel>() : new Set<Nivel>(ORDEM)));
                    } else {
                      toggleCatVisibility(c.id);
                    }
                  }}
                  className={`flex h-7 w-6 items-center justify-center rounded-r-lg ${
                    on ? 'hover:bg-white/20' : 'text-gray-400 hover:bg-gray-50'
                  } ${hidden ? 'opacity-50' : ''}`}
                >
                  {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            );
          })}
          {catLoading && !catalog && <Loader2 size={15} className="shrink-0 animate-spin text-gray-300" />}
        </div>

        {/* Corpo — dois painéis */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(360px,440px)_1fr]">
          {/* Painel esquerdo — dirigido pela categoria ativa do header */}
          <div className="flex min-h-0 flex-col gap-3 overflow-auto border-r border-gray-100 px-5 py-4">
            {activeCat === 'perimetro' ? (
              <>
            {/* Seletor de arquivo */}
            <input
              ref={inputRef}
              type="file"
              accept=".kml,.kmz"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:border-emerald-400 hover:bg-emerald-50/40 disabled:opacity-60"
            >
              {parsing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
              {parsing ? 'Lendo arquivo…' : file ? `Trocar arquivo · ${file.name}` : 'Importar do Google Earth (.kml/.kmz)'}
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                <AlertTriangle size={15} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Perímetros: contornos de Fazenda, Retiro e Setor ── */}
              <div className="flex flex-col gap-2.5">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-[12px] text-emerald-800">
                  Marque o <b>contorno da fazenda</b> e, se a fazenda usar, os de <b>retiro</b> e <b>setor</b>. O botão{' '}
                  <b>Ativo/Inativo</b> define quais níveis a fazenda usa; <b>Marcar no mapa</b> desenha o contorno.
                </div>
                {(['fazenda', 'retiro', 'setor', 'local'] as Nivel[]).map((nv) => {
                  const info = NIVEIS[nv];
                  const list = items.filter((i) => i.nivel === nv);
                  const isFaz = nv === 'fazenda';
                  const isLocal = nv === 'local';
                  const active = levelActive(nv);
                  const titulo = isFaz ? 'Perímetro da Fazenda' : isLocal ? 'Locais' : `Perímetros de ${info.plural}`;
                  return (
                    <div
                      key={nv}
                      className={`rounded-lg border border-gray-200 bg-white p-2.5 ${!isFaz && !active ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: info.cor }} />
                        <span className="text-[13px] font-bold text-gray-800">{titulo}</span>
                        {!isFaz &&
                          (onToggleLevel ? (
                            <button
                              type="button"
                              onClick={() => onToggleLevel(nv as 'retiro' | 'setor' | 'local')}
                              title={active ? `Desativar o nível ${info.label} na fazenda` : `Ativar o nível ${info.label} na fazenda`}
                              className="flex items-center gap-1.5"
                            >
                              <span
                                className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
                                style={{ background: active ? info.cor : '#d1d5db' }}
                              >
                                <span
                                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                                    active ? 'translate-x-3.5' : 'translate-x-0.5'
                                  }`}
                                />
                              </span>
                              <span className={`text-[11px] font-semibold ${active ? 'text-gray-600' : 'text-gray-400'}`}>
                                {active ? 'Ativo' : 'Inativo'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-400">opcional</span>
                          ))}
                        <button
                          type="button"
                          onClick={() => beginDraw(nv)}
                          disabled={editing || drawing || (isFaz && list.length > 0) || (!isFaz && !active)}
                          title={
                            !isFaz && !active
                              ? 'Ative o nível para marcar'
                              : isFaz && list.length > 0
                                ? 'Já existe um contorno — use “Editar forma”'
                                : 'Desenhar no mapa'
                          }
                          className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil size={13} /> {list.length ? (isFaz ? 'Marcado' : 'Marcar outro') : 'Marcar no mapa'}
                        </button>
                      </div>

                      {isLocal ? (
                        <div className="mt-1.5 pl-5 text-[12px] text-gray-500">
                          {list.length ? `${list.length} local(is) nesta tela.` : 'Nenhum local marcado.'}
                        </div>
                      ) : list.length === 0 ? (
                        <div className="mt-1.5 pl-5 text-[12px] text-gray-500">
                          {isFaz ? 'Ainda sem contorno da fazenda.' : `Nenhum ${info.label.toLowerCase()} marcado.`}
                        </div>
                      ) : (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {list.map((it) => (
                            <div
                              key={it.id}
                              onClick={() => focusItem(it.id)}
                              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 ${
                                it.id === selId ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 accent-emerald-600"
                                checked={it.keep}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => patchItem(it.id, { keep: e.target.checked })}
                              />
                              <input
                                type="text"
                                value={it.nome}
                                disabled={!it.keep}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => patchItem(it.id, { nome: e.target.value })}
                                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-semibold text-gray-800 hover:border-gray-200 focus:border-emerald-300 focus:bg-white focus:outline-none disabled:text-gray-400"
                              />
                              <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{fmtArea(it.areaM2)}</span>
                              <button
                                type="button"
                                title="Editar forma (vértices)"
                                disabled={editing}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  beginEdit(it.id);
                                }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                              >
                                <Crosshair size={13} />
                              </button>
                              <button
                                type="button"
                                title="Remover"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeItem(it.id);
                                }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {isFaz && list.length > 0 && hasPerimeter && (
                        <div className="mt-1 pl-5 text-[11px] font-semibold text-amber-600">
                          Vai substituir o contorno atual.
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>

            {/* Camada de referência */}
            {geojson && (
              <label className="mt-1 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                  checked={saveOverlay}
                  onChange={(e) => setSaveOverlay(e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-bold text-gray-800">Guardar o mapa importado</span>
                  <span className="mt-0.5 block text-[12px] text-gray-600">
                    As linhas e pontos do arquivo ficam como camada de referência no mapa (igual ao Google Earth),
                    além das áreas que você cadastrar.
                  </span>
                </span>
              </label>
            )}
              </>
            ) : (
              /* ── Painel de categoria: tipos com Desenhar área / Inserir ponto ── */
              (() => {
                const cat = catalog?.categorias.find((c) => c.id === activeCat);
                const tipos = tiposByCat.get(activeCat) ?? [];
                if (!cat) return <div className="text-[12.5px] text-gray-500">Categoria não encontrada.</div>;
                const catCor = cat.cor ?? '#6b7280';
                return (
                  <div className="flex flex-col gap-2">
                    <div
                      className="rounded-lg border px-3 py-2 text-[12px] text-gray-700"
                      style={{ borderColor: `${catCor}40`, background: `${catCor}0f` }}
                    >
                      Desenhe a <b>área</b> ou insira um <b>ponto</b> para cada tipo de <b>{cat.nome}</b> que existe na
                      fazenda. Os pontos viram marcadores com o ícone do tipo.
                    </div>
                    {tipos.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center text-[12px] text-gray-500">
                        Nenhum tipo nesta categoria. Cadastre tipos em <b>Tipos de Locais</b>.
                      </div>
                    ) : (
                      tipos.map((t) => {
                        const cor = t.cor || cat.cor || '#6b7280';
                        const feats = items.filter((i) => i.categoriaId === activeCat && i.tipo === t.nome);
                        const expanded = expandedTipo === t.id;
                        const inPoint = !!pointMode && pointMode.tipo === t.nome && pointMode.categoriaId === activeCat;
                        return (
                          <div key={t.id} className="rounded-lg border border-gray-200 bg-white">
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <span
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                                style={{ background: `${cor}1a`, color: cor }}
                              >
                                <TipoIcon name={t.icone} size={15} fallback={<span className="h-2 w-2 rounded-full" style={{ background: cor }} />} />
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedTipo(expanded ? null : t.id)}
                                className="flex min-w-0 flex-1 items-center gap-1 text-left"
                              >
                                <span className="truncate text-[12.5px] font-semibold text-gray-800">{t.nome}</span>
                                {feats.length > 0 && (
                                  <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10.5px] font-semibold text-gray-600">
                                    {feats.length}
                                  </span>
                                )}
                                {feats.length > 0 &&
                                  (expanded ? (
                                    <ChevronDown size={13} className="shrink-0 text-gray-400" />
                                  ) : (
                                    <ChevronRight size={13} className="shrink-0 text-gray-400" />
                                  ))}
                              </button>
                              <button
                                type="button"
                                title="Desenhar área"
                                disabled={editing}
                                onClick={() => beginDraw('local', t.nome, activeCat)}
                                className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Square size={13} /> Área
                              </button>
                              <button
                                type="button"
                                title="Inserir ponto (clique no mapa)"
                                onClick={() => togglePointMode(activeCat, t.nome)}
                                className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold ${
                                  inPoint ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <MapPin size={13} /> Ponto
                              </button>
                            </div>
                            {expanded && feats.length > 0 && (
                              <div className="flex flex-col gap-1 border-t border-gray-100 px-2.5 py-1.5">
                                {feats.map((it) => (
                                  <div
                                    key={it.id}
                                    onClick={() => focusItem(it.id)}
                                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 ${
                                      it.id === selId ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: cor }}>
                                      {it.geomKind === 'point' ? <MapPin size={12} /> : <Square size={11} />}
                                    </span>
                                    <input
                                      type="text"
                                      value={it.nome}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => patchItem(it.id, { nome: e.target.value })}
                                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-gray-800 hover:border-gray-200 focus:border-emerald-300 focus:bg-white focus:outline-none"
                                    />
                                    {it.geomKind === 'area' && (
                                      <span className="shrink-0 text-[10.5px] tabular-nums text-gray-500">{fmtArea(it.areaM2)}</span>
                                    )}
                                    {it.geomKind === 'area' && (
                                      <button
                                        type="button"
                                        title="Editar forma"
                                        disabled={editing}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          beginEdit(it.id);
                                        }}
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                                      >
                                        <Crosshair size={12} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      title="Remover"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeItem(it.id);
                                      }}
                                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })()
            )}
          </div>

          {/* Painel direito — mapa editável */}
          <div className="relative min-h-[420px] bg-[#0b1f2a]">
            <div ref={mapElRef} className="absolute inset-0" />

            {/* Ferramentas do mapa — o nível é definido pelos botões do painel
                (Marcar no mapa / Desenhar área), então não há seletor de nível aqui. */}
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <button
                type="button"
                onClick={toggleDraw}
                disabled={editing}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                  drawing ? 'border-blue-600 bg-blue-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {drawing ? <X size={15} /> : <Pencil size={15} />}
                {drawing ? 'Cancelar' : 'Desenhar'}
              </button>
              <button
                type="button"
                onClick={toggleEdit}
                disabled={!selId && !editing}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                  editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {editing ? <Save size={15} /> : <Crosshair size={15} />}
                {editing ? 'Concluir forma' : 'Editar forma'}
              </button>
            </div>

            {(drawing || editing) && (
              <div className="absolute left-3 top-16 z-[600] max-w-[320px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug text-gray-700 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
                {drawing
                  ? `Clique no mapa para marcar os vértices do(a) ${NIVEIS[drawNivel].label.toLowerCase()}. Clique no primeiro ponto para fechar.`
                  : 'Arraste os vértices · clique no ponto claro para inserir · botão direito remove.'}
              </div>
            )}

            {/* Modo "inserir ponto" */}
            {pointMode && (
              <div className="absolute left-3 top-16 z-[600] flex max-w-[340px] items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11.5px] text-blue-800 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
                <MapPin size={14} className="shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1">
                  Clique no mapa para inserir <b>{pointMode.tipo}</b>. Continue clicando para vários.
                </span>
                <button
                  type="button"
                  onClick={() => setPointMode(null)}
                  className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  Concluir
                </button>
              </div>
            )}

            {/* Visualizador da fazenda — legenda clicável (níveis + categorias + tipos) */}
            <div className="absolute bottom-3 left-3 z-[600] flex max-h-[68%] w-[206px] flex-col gap-0.5 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <div className="px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Estrutura</div>
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
                    <span className={`flex-1 truncate text-left ${hidden ? 'line-through' : ''}`}>{NIVEIS[nv].label}</span>
                    {hidden ? <EyeOff size={12} /> : <Eye size={12} className="text-gray-300" />}
                  </button>
                );
              })}

              {presentLegend.map(([catId, entry]) => {
                const catHidden = hiddenCats.has(catId);
                return (
                  <div key={catId} className="mt-1 border-t border-gray-100 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleCatVisibility(catId)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-colors hover:bg-gray-50 ${
                        catHidden ? 'text-gray-300' : 'text-gray-700'
                      }`}
                      title={catHidden ? `Mostrar ${entry.nome}` : `Ocultar ${entry.nome}`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded" style={{ background: catHidden ? '#d1d5db' : entry.cor }} />
                      <span className={`flex-1 truncate text-left ${catHidden ? 'line-through' : ''}`}>{entry.nome}</span>
                      {catHidden ? <EyeOff size={12} /> : <Eye size={12} className="text-gray-300" />}
                    </button>
                    {[...entry.tipos.entries()].map(([tipoNome, t]) => {
                      const tipoHidden = hiddenTipos.has(tipoNome);
                      const off = tipoHidden || catHidden;
                      return (
                        <button
                          key={tipoNome}
                          type="button"
                          onClick={() => toggleTipoVisibility(tipoNome)}
                          className={`flex w-full items-center gap-1.5 rounded-lg py-0.5 pl-5 pr-2 text-[11px] transition-colors hover:bg-gray-50 ${
                            off ? 'text-gray-300' : 'text-gray-600'
                          }`}
                          title={tipoHidden ? `Mostrar ${tipoNome}` : `Ocultar ${tipoNome}`}
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" style={{ color: off ? '#d1d5db' : t.cor }}>
                            <TipoIcon name={t.icone} size={12} fallback={<span className="h-1.5 w-1.5 rounded-full" style={{ background: off ? '#d1d5db' : t.cor }} />} />
                          </span>
                          <span className={`flex-1 truncate text-left ${tipoHidden ? 'line-through' : ''}`}>{tipoNome}</span>
                          {tipoHidden ? <EyeOff size={11} /> : <Eye size={11} className="text-gray-300" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2.5 border-t border-gray-100 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* Abas: esta tela (Cadastro de áreas) × colunas das áreas cadastradas.
                Embutida: as abas ficam no topo do container, então aqui escondemos. */}
            {!embedded && onShowColumns && (
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
                <span
                  className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-900 shadow-sm"
                  title="Cadastro de áreas no mapa (tela atual)"
                >
                  Cadastro de áreas
                </span>
                <button
                  type="button"
                  onClick={onShowColumns}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                  title="Ver as colunas das áreas cadastradas (Fazenda › Retiro › Setor › Local)"
                >
                  Colunas
                </button>
              </div>
            )}
            <div className="hidden min-w-0 truncate text-[12px] text-gray-500 sm:block">
              {keptItems.length > 0 ? (
                <span>
                  A cadastrar:{' '}
                  {ORDEM.filter((nv) => keptByLevel[nv] > 0)
                    .map((nv) => `${keptByLevel[nv]} ${keptByLevel[nv] === 1 ? NIVEIS[nv].label.toLowerCase() : NIVEIS[nv].plural.toLowerCase()}`)
                    .join(' · ')}
                </span>
              ) : (
                <span>Marque ao menos uma área (ou guarde só o mapa de referência).</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                {onShowColumns ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setDataRef(todayIso()); setDateDialogOpen(true); }}
              disabled={!canConfirm}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>

    {assignId &&
      (() => {
        const it = items.find((i) => i.id === assignId);
        if (!it) return null;
        return (
          <AtribuirTipoModal
            item={it}
            catalog={catalog}
            onClose={() => setAssignId(null)}
            onSave={(nome, tipo, categoriaId) => {
              patchItem(it.id, { nome, tipo, categoriaId });
              setAssignId(null);
            }}
          />
        );
      })()}

    {/* Diálogo "Data de referência" — perguntado ao Salvar; carimba os registros. */}
    {dateDialogOpen && (
      <div
        className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
        onClick={() => setDateDialogOpen(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Save size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[16px] font-bold text-gray-900">Data de referência</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Data que será carimbada nos registros cadastrados agora.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-[12px] font-semibold text-gray-600">Data</label>
            <DateInputBR value={dataRef} onChange={(v) => setDataRef(v || todayIso())} className="w-44" />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDateDialogOpen(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!dataRef || busy}
              onClick={() => { setDateDialogOpen(false); submit(dataRef); }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CadastroAreasMestre;
