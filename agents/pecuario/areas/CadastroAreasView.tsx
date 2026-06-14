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
} from 'lucide-react';
import {
  NIVEIS,
  ORDEM,
  TIPOS_LOCAL,
  type Area,
  type Nivel,
  type TipoLocal,
} from './types';
import { areaM2, fmtArea, sugerirParent, cleanRing } from './util';
import {
  loadAreas as apiLoadAreas,
  createArea as apiCreateArea,
  updateAreaGeometry as apiUpdateGeometry,
  updateAreaProps as apiUpdateProps,
  deleteArea as apiDeleteArea,
  countLocalDependents,
  isFazRoot,
  fazRootId,
  type AreaWrite,
} from './areasClient';
import './cadastroAreas.css';

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
  /** Avisa o container que a hierarquia mudou (para recarregar a lista). */
  onMutated?: () => void;
  /** Incrementado pelo container quando a lista muda → o mapa recarrega. */
  reloadToken?: number;
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

const CadastroAreasView: React.FC<CadastroAreasViewProps> = ({
  farmId,
  farmName,
  readOnly = false,
  onToast,
  selId: selIdProp,
  onSelect,
  levels,
  onEnsureLevel,
  onMutated,
  reloadToken,
}) => {
  // ── Estado de domínio ───────────────────────────────────────────────────
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [internalSel, setInternalSel] = useState<string | null>(null);
  const selId = selIdProp !== undefined ? selIdProp : internalSel;
  const [active, setActive] = useState<Nivel>('local');
  const [basemap, setBasemap] = useState<'sat' | 'osm'>('sat');
  const [drawing, setDrawing] = useState(false);
  const [editingShape, setEditingShape] = useState(false);
  const [propsModal, setPropsModal] = useState<PropsDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDeps, setDeleteDeps] = useState<number | null>(null);
  // Níveis ocultos no mapa (controlado pela legenda clicável).
  const [hiddenLevels, setHiddenLevels] = useState<Set<Nivel>>(new Set());
  const toggleLevelVisibility = useCallback((nv: Nivel) => {
    setHiddenLevels((prev) => {
      const next = new Set(prev);
      next.has(nv) ? next.delete(nv) : next.add(nv);
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
  const baseSatRef = useRef<L.TileLayer | null>(null);
  const baseOSMRef = useRef<L.TileLayer | null>(null);
  const drawHandlerRef = useRef<{ enable: () => void; disable: () => void } | null>(null);
  const areasRef = useRef<Area[]>(areas);
  const activeRef = useRef<Nivel>(active);
  const pendingFitRef = useRef(false);

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
  useEffect(() => {
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
  }, [farmId, reloadToken]);

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
    const present = new Set(areas.map((a) => a.id));

    for (const [id, layer] of store) {
      if (!present.has(id)) {
        map.removeLayer(layer);
        store.delete(id);
      }
    }

    for (const a of areas) {
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
        layer.bindTooltip(a.nome, { permanent: true, direction: 'center', className, opacity: 1 });
        store.set(a.id, layer);
      } else {
        layer.setStyle(styleFor(a, a.id === selId));
        layer.setLatLngs(ring);
        if (layer.getTooltip()) layer.setTooltipContent(a.nome);
      }
      if (hiddenLevels.has(a.nivel)) {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        continue;
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (a.id === selId) layer.bringToFront();
    }
  }, [areas, selId, selectArea, hiddenLevels]);

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
    const layer = layersRef.current.get(id);
    if (layer && mapRef.current) {
      mapRef.current.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
    }
  }, [selectArea]);

  // ── Editar forma (vértices) ──────────────────────────────────────────────
  const toggleEditShape = useCallback(async () => {
    if (readOnly) return;
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
      const area = areasRef.current.find((a) => a.id === selId);
      setEditingShape(false);
      if (!area) return;
      try {
        setBusy(true);
        await apiUpdateGeometry(farmId, area, coords);
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
      editing.enable();
      setEditingShape(true);
      onToast?.('Arraste os vértices no mapa e clique em "Concluir forma".', 'info');
    }
  }, [selId, editingShape, onToast, readOnly, farmId, onMutated]);

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
          await apiUpdateProps(area, { nome, tipo, retiroId: fk.retiroId, setorId: fk.setorId });
          setAreas((prev) =>
            prev.map((a) =>
              a.id === d.editId ? { ...a, nome, parent: d.parent, tipo } : a,
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
    [onToast, farmId, levels, onEnsureLevel, onMutated, selectArea],
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
  const [tipo, setTipo] = useState<TipoLocal | null>(draft.tipo ?? 'Pasto');
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
