import React, { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, Boxes, Loader2, Plus, Trash2, MapPin, CalendarDays, Save, Pencil, AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { listAnimalCategories, type AnimalCategory } from '../../lib/api/animalCategoriesClient';
import {
  type MapaRebanhoHeader,
  type MapaRebanhoLancamento,
} from '../../lib/api/mapaRebanhoClient';
import * as partidaClient from '../../lib/api/mapaRebanhoClient';
import * as mapaoClient from '../../lib/api/mapaoClient';

type MapaMode = 'partida' | 'mapao';

interface EstoquePartidaProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
  /**
   * 'partida' (default) → Estoque de Partida: um único mapa por fazenda.
   * 'mapao'             → Mapa Rebanho - Mapão: vários mapas por fazenda (um por data).
   */
  mode?: MapaMode;
}

const MAPA_COPY: Record<MapaMode, {
  layerLabel: string;
  pageTitle: string;
  pageDesc: string;
  detailLabel: string;
  emptyHint: string;
}> = {
  partida: {
    layerLabel: 'CAMADA DE ESTOQUE',
    pageTitle: 'Estoque de Partida',
    pageDesc: 'Registre o inventário inicial do rebanho por fazenda e categoria animal. Cada mapa é uma fotografia do rebanho em uma data de referência, base para todas as movimentações e relatórios do módulo Pecuário.',
    detailLabel: 'DETALHE DO ESTOQUE',
    emptyHint: 'Crie o primeiro mapa utilizando o formulário acima.',
  },
  mapao: {
    layerLabel: 'MAPA PERIÓDICO',
    pageTitle: 'Mapa Rebanho - Mapão',
    pageDesc: 'Registre periodicamente o mapa do rebanho por fazenda e categoria animal. Cada lançamento é uma fotografia do rebanho em uma data, permitindo acompanhar a evolução do rebanho ao longo do tempo.',
    detailLabel: 'DETALHE DO MAPA',
    emptyHint: 'Crie o primeiro mapa utilizando o formulário acima. Você pode lançar um novo mapa a cada período.',
  },
};

interface Local {
  id: string;
  retiroId?: string;
  retiro_id?: string;
  farmId?: string;
  farm_id?: string;
  name: string;
  area: string | null;
  retiroName?: string;
}

const LOCAIS_API = '/api/farm-locations';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

function formatDateBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function cellKey(localId: string, categoriaId: string) {
  return `${localId}__${categoriaId}`;
}

const EstoquePartida: React.FC<EstoquePartidaProps> = ({ onToast, onBack, theme = 'light', mode = 'partida' }) => {
  const isDark = false; // Forçado claro conforme diretrizes visuais do Gesttor
  const { selectedOrganization, farms, loading: hierarchyLoading } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Modo (Estoque de Partida vs Mapão) ─────────────────────────────────────
  const api = useMemo(() => (mode === 'mapao' ? mapaoClient : partidaClient), [mode]);
  const copy = MAPA_COPY[mode];
  // Estoque de Partida é único por fazenda; o Mapão permite vários (um por data).
  const enforceUnico = mode === 'partida';

  // ── List view state ────────────────────────────────────────────────────────
  const [mapas, setMapas] = useState<MapaRebanhoHeader[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFarmId, setNewFarmId] = useState<string>('');
  const [newDate, setNewDate] = useState<string>(todayISO());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Editor state ──────────────────────────────────────────────────────────
  const [openMapaId, setOpenMapaId] = useState<string | null>(null);
  const [openMapa, setOpenMapa] = useState<MapaRebanhoHeader | null>(null);
  const [locais, setLocais] = useState<Local[]>([]);
  const [categorias, setCategorias] = useState<AnimalCategory[]>([]);
  const [lancamentos, setLancamentos] = useState<Record<string, { quantidade: number; pesoKgCabeca: number }>>({});
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [editingCell, setEditingCell] = useState<{ key: string; field: 'qtd' | 'peso' } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // ── Summary cards collapsed state ──────────────────────────────────────────

  // ── View mode: 'pasto' (Mapa de Pasto) or 'categoria' (Distribuição por Categoria)
  const [viewMode, setViewMode] = useState<'pasto' | 'categoria'>('pasto');

  // ── Category mode editing state ────────────────────────────────────────────
  const [catEditingCell, setCatEditingCell] = useState<{ catId: string; field: 'qtd' | 'peso' } | null>(null);
  const [catEditingValue, setCatEditingValue] = useState<string>('');  
  const catEditInputRef = useRef<HTMLInputElement | null>(null);

  // ── Keyboard navigation state ────────────────────────────────────────────
  const [focusedCell, setFocusedCell] = useState<{ key: string; field: 'qtd' | 'peso' } | null>(null);
  const [isNavigationMode, setIsNavigationMode] = useState(true);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // ── Load mapas list ───────────────────────────────────────────────────────
  const loadMapas = useCallback(async () => {
    if (!organizationId) {
      setMapas([]);
      return;
    }
    setLoadingList(true);
    try {
      const rows = await api.listMapasByOrg(organizationId);
      setMapas(rows);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao carregar mapas', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [organizationId, onToast, api]);

  useEffect(() => {
    void loadMapas();
  }, [loadMapas]);

  // ── Load editor data when a mapa is opened ────────────────────────────────
  const loadEditor = useCallback(async (mapa: MapaRebanhoHeader) => {
    setLoadingEditor(true);
    try {
      const [locaisRes, catsRes, lancRes] = await Promise.all([
        fetchJson<Local[]>(`${LOCAIS_API}?farmIdLocais=${encodeURIComponent(mapa.farmId)}`),
        listAnimalCategories(organizationId),
        api.listLancamentos(mapa.id),
      ]);
      setLocais(locaisRes);
      setCategorias(catsRes);
      const mapped: Record<string, { quantidade: number; pesoKgCabeca: number }> = {};
      for (const l of lancRes as MapaRebanhoLancamento[]) {
        mapped[cellKey(l.localId, l.categoriaId)] = {
          quantidade: l.quantidade ?? 0,
          pesoKgCabeca: parseFloat(l.pesoKgCabeca ?? '0') || 0,
        };
      }
      setLancamentos(mapped);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao carregar mapa', 'error');
    } finally {
      setLoadingEditor(false);
    }
  }, [organizationId, onToast, api]);

  const handleOpenMapa = useCallback((mapa: MapaRebanhoHeader) => {
    setOpenMapaId(mapa.id);
    setOpenMapa(mapa);
    void loadEditor(mapa);
  }, [loadEditor]);

  const handleCloseEditor = useCallback(() => {
    setOpenMapaId(null);
    setOpenMapa(null);
    setLocais([]);
    setCategorias([]);
    setLancamentos({});
    setEditingCell(null);
  }, []);

  // ── Default farm select for new mapa ──────────────────────────────────────
  useEffect(() => {
    if (!newFarmId && farms.length > 0) setNewFarmId(farms[0].id);
  }, [farms, newFarmId]);

  // ── Create mapa ───────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!organizationId) {
      onToast?.('Selecione uma organização', 'warning');
      return;
    }
    if (!newFarmId) {
      onToast?.('Selecione uma fazenda', 'warning');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      onToast?.('Data inválida', 'warning');
      return;
    }
    setCreating(true);
    try {
      const row = await api.createMapa({ organizationId, farmId: newFarmId, dataReferencia: newDate });
      onToast?.('Mapa criado', 'success');
      setMapas(prev => [row, ...prev]);
      handleOpenMapa(row);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao criar mapa', 'error');
    } finally {
      setCreating(false);
    }
  }, [organizationId, newFarmId, newDate, onToast, handleOpenMapa, api]);

  // ── Delete mapa ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteMapa(id);
      setMapas(prev => prev.filter(m => m.id !== id));
      if (openMapaId === id) handleCloseEditor();
      onToast?.('Mapa excluído', 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao excluir mapa', 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  }, [openMapaId, handleCloseEditor, onToast, api]);

  // ── Build flat cell list for keyboard navigation ────────────────────────
  const flatCells = useMemo(() => {
    const cells: { key: string; field: 'qtd' | 'peso'; row: number; col: number }[] = [];
    // Group locais by retiro inline (same logic as groupedLocais)
    const groups: Record<string, Local[]> = {};
    for (const loc of locais) {
      const rName = loc.retiroName || 'Sem Retiro';
      if (!groups[rName]) groups[rName] = [];
      groups[rName].push(loc);
    }
    const allLocais = Object.values(groups).flat();
    let rowIdx = 0;
    for (const loc of allLocais) {
      let colIdx = 0;
      for (const cat of categorias) {
        cells.push({ key: cellKey(loc.id, cat.id), field: 'qtd', row: rowIdx, col: colIdx });
        colIdx++;
        cells.push({ key: cellKey(loc.id, cat.id), field: 'peso', row: rowIdx, col: colIdx });
        colIdx++;
      }
      rowIdx++;
    }
    return cells;
  }, [locais, categorias]);

  // ── Cell editing ──────────────────────────────────────────────────────────
  const startEditCell = useCallback((key: string, field: 'qtd' | 'peso') => {
    if (!openMapa || openMapa.status === 'salvo') return;
    const current = lancamentos[key];
    const value = current
      ? field === 'qtd' ? String(current.quantidade) : String(current.pesoKgCabeca).replace('.', ',')
      : '';
    setEditingCell({ key, field });
    setEditingValue(value);
    setIsNavigationMode(false);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, [openMapa, lancamentos]);

  const commitEditCell = useCallback(async (nextEdit?: { key: string; field: 'qtd' | 'peso' } | null) => {
    if (!editingCell || !openMapa) return;
    const { key, field } = editingCell;
    const [localId, categoriaId] = key.split('__');
    const raw = editingValue.trim().replace(',', '.');
    let numeric = parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0) numeric = 0;
    if (field === 'qtd') numeric = Math.trunc(numeric);

    const existing = lancamentos[key] ?? { quantidade: 0, pesoKgCabeca: 0 };
    const payload = {
      quantidade: field === 'qtd' ? numeric : existing.quantidade,
      pesoKgCabeca: field === 'peso' ? numeric : existing.pesoKgCabeca,
    };

    // Optimistic local update
    setLancamentos(prev => ({ ...prev, [key]: payload }));
    setEditingCell(nextEdit ?? null);
    setEditingValue('');

    // If no next edit, return to navigation mode keeping focus on current cell
    if (!nextEdit) {
      setIsNavigationMode(true);
      setFocusedCell({ key, field });
      // Re-focus the table container so keyboard nav works
      setTimeout(() => tableContainerRef.current?.focus(), 0);
    }

    try {
      await api.upsertLancamento({
        mapaHeaderId: openMapa.id,
        localId,
        categoriaId,
        ...payload,
      });
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao salvar célula', 'error');
      // Reload to recover ground truth
      void loadEditor(openMapa);
    }
  }, [editingCell, editingValue, openMapa, lancamentos, onToast, loadEditor, api]);

  const cancelEditCell = useCallback(() => {
    const prev = editingCell;
    setEditingCell(null);
    setEditingValue('');
    setIsNavigationMode(true);
    if (prev) {
      setFocusedCell({ key: prev.key, field: prev.field });
    }
    setTimeout(() => tableContainerRef.current?.focus(), 0);
  }, [editingCell]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const findCellIndex = useCallback((key: string, field: 'qtd' | 'peso') => {
    return flatCells.findIndex(c => c.key === key && c.field === field);
  }, [flatCells]);

  const navigateTo = useCallback((rowDelta: number, colDelta: number) => {
    if (!focusedCell || flatCells.length === 0) return;
    const curIdx = findCellIndex(focusedCell.key, focusedCell.field);
    if (curIdx < 0) return;
    const cur = flatCells[curIdx];
    const targetRow = cur.row + rowDelta;
    const targetCol = cur.col + colDelta;
    const target = flatCells.find(c => c.row === targetRow && c.col === targetCol);
    if (target) {
      setFocusedCell({ key: target.key, field: target.field });
    }
  }, [focusedCell, flatCells, findCellIndex]);

  // ── Keyboard handler for editing mode (inside input) ──────────────────────
  const handleCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editingCell) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditCell();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Commit and return to navigation mode
      void commitEditCell(null);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      // Advance horizontally: peso -> next-local-qtd; qtd -> peso of same cell
      const { key, field } = editingCell;
      const [localId, categoriaId] = key.split('__');
      if (field === 'qtd') {
        void commitEditCell({ key, field: 'peso' });
        return;
      }
      // field === 'peso' → next category in same local, or next local first category
      const catIdx = categorias.findIndex(c => c.id === categoriaId);
      if (catIdx >= 0 && catIdx < categorias.length - 1) {
        const next = categorias[catIdx + 1];
        void commitEditCell({ key: cellKey(localId, next.id), field: 'qtd' });
      } else {
        const localIdx = locais.findIndex(l => l.id === localId);
        if (localIdx >= 0 && localIdx < locais.length - 1 && categorias[0]) {
          const next = locais[localIdx + 1];
          void commitEditCell({ key: cellKey(next.id, categorias[0].id), field: 'qtd' });
        } else {
          void commitEditCell(null);
        }
      }
      return;
    }
  }, [editingCell, categorias, locais, commitEditCell, cancelEditCell]);

  // ── Keyboard handler for navigation mode (on table container) ─────────────
  const handleTableKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isNavigationMode) return;
    const isLocked = openMapa?.status === 'salvo';

    // Initialize focus if not set
    if (!focusedCell && flatCells.length > 0) {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        e.preventDefault();
        setFocusedCell({ key: flatCells[0].key, field: flatCells[0].field });
        return;
      }
    }

    if (!focusedCell) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        navigateTo(1, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateTo(-1, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateTo(0, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateTo(0, -1);
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          navigateTo(0, -1);
        } else {
          navigateTo(0, 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (!isLocked) {
          startEditCell(focusedCell.key, focusedCell.field);
        }
        break;
      case 'Home':
        e.preventDefault();
        if (flatCells.length > 0) {
          const cur = flatCells[findCellIndex(focusedCell.key, focusedCell.field)];
          if (cur) {
            const first = flatCells.find(c => c.row === cur.row);
            if (first) setFocusedCell({ key: first.key, field: first.field });
          }
        }
        break;
      case 'End':
        e.preventDefault();
        if (flatCells.length > 0) {
          const cur = flatCells[findCellIndex(focusedCell.key, focusedCell.field)];
          if (cur) {
            const last = [...flatCells].reverse().find(c => c.row === cur.row);
            if (last) setFocusedCell({ key: last.key, field: last.field });
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setFocusedCell(null);
        break;
      default:
        // If user starts typing a number, jump into edit mode
        if (!isLocked && /^[0-9,.]$/.test(e.key)) {
          e.preventDefault();
          startEditCell(focusedCell.key, focusedCell.field);
          // Pre-fill with the typed character
          setEditingValue(e.key === ',' ? '0,' : e.key);
        }
        break;
    }
  }, [isNavigationMode, focusedCell, flatCells, navigateTo, startEditCell, findCellIndex, openMapa]);

  // ── Scroll focused cell into view ──────────────────────────────────────────
  useEffect(() => {
    if (!focusedCell || !isNavigationMode) return;
    const cellId = `cell-${focusedCell.key}-${focusedCell.field}`;
    const el = document.getElementById(cellId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [focusedCell, isNavigationMode]);

  // ── Toggle status (Salvar/Editar) ─────────────────────────────────────────
  const toggleStatus = useCallback(async () => {
    if (!openMapa) return;
    setSavingHeader(true);
    try {
      const nextStatus = openMapa.status === 'salvo' ? 'rascunho' : 'salvo';
      const row = await api.updateMapa(openMapa.id, { status: nextStatus });
      setOpenMapa(row);
      setMapas(prev => prev.map(m => (m.id === row.id ? row : m)));
      onToast?.(nextStatus === 'salvo' ? 'Mapa salvo' : 'Mapa em edição', 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao alterar status', 'error');
    } finally {
      setSavingHeader(false);
    }
  }, [openMapa, onToast, api]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let totalCab = 0;
    let totalPeso = 0; // qtd * peso médio
    for (const v of Object.values(lancamentos)) {
      totalCab += v.quantidade;
      totalPeso += v.quantidade * v.pesoKgCabeca;
    }
    const pesoMedio = totalCab > 0 ? totalPeso / totalCab : 0;
    return { totalCab, pesoMedio };
  }, [lancamentos]);

  const farmOfMapa = useMemo(() => {
    if (!openMapa) return null;
    return farms.find(f => f.id === openMapa.farmId) ?? null;
  }, [openMapa, farms]);

  const lotacaoFazenda = useMemo(() => {
    const area = farmOfMapa?.pastureArea ?? 0;
    if (!area || area <= 0) return 0;
    return totals.totalCab / Number(area);
  }, [farmOfMapa, totals.totalCab]);

  const farmHasMapa = useMemo(() => {
    return mapas.some(m => m.farmId === newFarmId);
  }, [mapas, newFarmId]);

  const totaisPorCategoria = useMemo(() => {
    const out: Record<string, { qtd: number; pesoTotal: number }> = {};
    for (const cat of categorias) {
      let qtd = 0;
      let peso = 0;
      for (const loc of locais) {
        const v = lancamentos[cellKey(loc.id, cat.id)];
        if (v) {
          qtd += v.quantidade;
          peso += v.quantidade * v.pesoKgCabeca;
        }
      }
      out[cat.id] = { qtd, pesoTotal: peso };
    }
    return out;
  }, [categorias, locais, lancamentos]);

  const groupedLocais = useMemo(() => {
    const groups: Record<string, Local[]> = {};
    for (const loc of locais) {
      const rName = loc.retiroName || 'Sem Retiro';
      if (!groups[rName]) groups[rName] = [];
      groups[rName].push(loc);
    }
    return groups;
  }, [locais]);

  // ── Area total for lotação ────────────────────────────────────────────────
  const areaTotal = useMemo(() => {
    let total = 0;
    for (const loc of locais) {
      total += parseFloat(loc.area ?? '0') || 0;
    }
    return total;
  }, [locais]);

  // ── Category mode: totals per category ────────────────────────────────────
  const catTotals = useMemo(() => {
    return categorias.map(cat => {
      const t = totaisPorCategoria[cat.id] ?? { qtd: 0, pesoTotal: 0 };
      const pesoMedio = t.qtd > 0 ? t.pesoTotal / t.qtd : 0;
      const lotacao = areaTotal > 0 && t.qtd > 0 ? t.qtd / areaTotal : 0;
      return {
        catId: cat.id,
        nome: cat.nome,
        qtd: t.qtd,
        pesoMedio,
        pesoTotal: t.pesoTotal,
        lotacao,
      };
    });
  }, [categorias, totaisPorCategoria, areaTotal]);

  // ── Category mode: editing ────────────────────────────────────────────────
  const startCatEdit = useCallback((catId: string, field: 'qtd' | 'peso') => {
    if (!openMapa || openMapa.status === 'salvo') return;
    const t = totaisPorCategoria[catId] ?? { qtd: 0, pesoTotal: 0 };
    const pesoMedio = t.qtd > 0 ? t.pesoTotal / t.qtd : 0;
    const value = field === 'qtd' ? (t.qtd ? String(t.qtd) : '') : (pesoMedio ? String(pesoMedio).replace('.', ',') : '');
    setCatEditingCell({ catId, field });
    setCatEditingValue(value);
    setTimeout(() => catEditInputRef.current?.select(), 0);
  }, [openMapa, totaisPorCategoria]);

  const commitCatEdit = useCallback(async () => {
    if (!catEditingCell || !openMapa || locais.length === 0) return;
    const { catId, field } = catEditingCell;
    const raw = catEditingValue.trim().replace(',', '.');
    let numeric = parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0) numeric = 0;
    if (field === 'qtd') numeric = Math.trunc(numeric);

    // Use first local as storage target for category-level entries
    const targetLocal = locais[0];
    const key = cellKey(targetLocal.id, catId);
    const existing = lancamentos[key] ?? { quantidade: 0, pesoKgCabeca: 0 };
    const payload = {
      quantidade: field === 'qtd' ? numeric : existing.quantidade,
      pesoKgCabeca: field === 'peso' ? numeric : existing.pesoKgCabeca,
    };

    // Optimistic update
    setLancamentos(prev => ({ ...prev, [key]: payload }));
    setCatEditingCell(null);
    setCatEditingValue('');

    try {
      await api.upsertLancamento({
        mapaHeaderId: openMapa.id,
        localId: targetLocal.id,
        categoriaId: catId,
        ...payload,
      });
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao salvar', 'error');
      void loadEditor(openMapa);
    }
  }, [catEditingCell, catEditingValue, openMapa, locais, lancamentos, onToast, loadEditor, api]);

  const cancelCatEdit = useCallback(() => {
    setCatEditingCell(null);
    setCatEditingValue('');
  }, []);

  const handleCatKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelCatEdit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void commitCatEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      void commitCatEdit();
    }
  }, [commitCatEdit, cancelCatEdit]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (hierarchyLoading.farms && farms.length === 0) {
    return (
      <div className="h-full flex items-center justify-center min-h-[400px]">
        <Loader2 className={`animate-spin ${isDark ? 'text-emerald-500' : 'text-gray-400'}`} size={28} />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className={`h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto w-full min-h-[450px]`}>
        <header className="space-y-4 mb-8">
          <div className="flex items-center gap-3">
            <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {copy.pageTitle}
            </h1>
          </div>
        </header>
        <div className={`flex flex-col items-center justify-center flex-1 text-center border border-dashed rounded-2xl p-12 shadow-md ${
          isDark
            ? 'bg-[#37404E] border-[#5E6D82]/30 text-gray-300'
            : 'bg-white border-gray-200 text-gray-500'
        }`}>
          <AlertTriangle size={28} className="mb-3 opacity-40 text-yellow-500" />
          <p className="text-sm font-semibold max-w-md">Selecione uma organização para começar.</p>
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  if (openMapa) {
    const isLocked = openMapa.status === 'salvo';
    return (
      <div className="h-full flex flex-col p-4 md:p-6 max-w-[1400px] mx-auto w-full animate-in fade-in duration-500" style={{ height: '100vh', maxHeight: '100vh' }}>
        <header className="mb-3 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleCloseEditor}
                className="flex items-center gap-1.5 text-xs font-bold transition-colors text-gray-500 hover:text-[#16A34A] shrink-0"
              >
                <ArrowLeft size={14} />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#22C55E] tracking-widest uppercase">
                    {copy.detailLabel}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider ${
                      isLocked
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {isLocked ? 'Salvo' : 'Rascunho'}
                  </span>
                </div>
                <h1 className="text-lg md:text-xl font-black tracking-tight text-[#0F172A] truncate">
                  {farmOfMapa?.name ?? 'Fazenda'} · {formatDateBR(openMapa.dataReferencia)}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleStatus}
                disabled={savingHeader}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 ${
                  isLocked
                    ? 'bg-white border border-[#16A34A] text-[#16A34A] hover:bg-[#E7F6EC]'
                    : 'bg-[#16A34A] text-white hover:bg-[#15803D] shadow-[0_1px_3px_rgba(16,24,40,0.08)]'
                } disabled:opacity-50`}
              >
                {savingHeader ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isLocked ? (
                  <Pencil size={14} />
                ) : (
                  <Save size={14} />
                )}
                {isLocked ? 'Editar' : 'Salvar mapa'}
              </button>
            </div>
          </div>

          {/* Summary cards - compact */}
          <div className="flex items-stretch gap-3 mt-3 overflow-x-auto">
              <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 py-2.5 flex items-center gap-3 min-w-fit">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">Cabeças</p>
                <p className="text-xl font-black text-[#0F172A]">{fmtNum(totals.totalCab)}</p>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 py-2.5 flex items-center gap-3 min-w-fit">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">Peso Médio</p>
                <p className="text-xl font-black text-[#0F172A]">{fmtNum(totals.pesoMedio, 1)} <span className="text-xs font-semibold text-gray-500">kg</span></p>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 py-2.5 flex items-center gap-3 min-w-fit">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">Lotação</p>
                <p className="text-xl font-black text-[#0F172A]">
                  {fmtNum(lotacaoFazenda, 2)} <span className="text-xs font-semibold text-gray-500">cab/ha</span>
                </p>
              </div>
          </div>

          {/* DISTRIBUIÇÃO segmented control */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mr-1">Distribuição</span>
            <div className="flex rounded-lg border border-[#E5E7EB] overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <button
                type="button"
                onClick={() => setViewMode('pasto')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
                  viewMode === 'pasto'
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'bg-white text-[#6B7280] hover:bg-[#F9FAFB]'
                }`}
              >
                <LayoutGrid size={13} />
                Mapa de Pasto
              </button>
              <button
                type="button"
                onClick={() => setViewMode('categoria')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold transition-all duration-200 border-l border-[#E5E7EB] ${
                  viewMode === 'categoria'
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'bg-white text-[#6B7280] hover:bg-[#F9FAFB]'
                }`}
              >
                <List size={13} />
                Distribuição por Categoria
              </button>
            </div>
          </div>
        </header>

        {loadingEditor ? (
          <div className="flex-1 flex items-center justify-center min-h-[120px]"><Loader2 className="animate-spin text-[#16A34A]" size={28} /></div>
        ) : locais.length === 0 ? (
          <div className="border border-dashed border-[#E5E7EB] bg-white rounded-xl p-8 text-center text-sm font-medium text-gray-500 shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            Esta fazenda ainda não tem locais cadastrados. Cadastre os locais em <span className="font-bold text-[#16A34A]">Cadastros Gerais &gt; Propriedades (aba Locais)</span> antes de preencher o mapa.
          </div>
        ) : categorias.length === 0 ? (
          <div className="border border-dashed border-[#E5E7EB] bg-white rounded-xl p-8 text-center text-sm font-medium text-gray-500 shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            Nenhuma categoria animal cadastrada. Cadastre categorias em <span className="font-bold text-[#16A34A]">Cadastros &gt; Categoria Animal</span>.
          </div>
        ) : viewMode === 'categoria' ? (
          /* ═══════ Distribuição por Categoria ═══════ */
          <div className="flex-1 min-h-0 border border-[#E5E7EB] bg-white rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)] flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="min-w-full text-xs" role="grid">
                <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] sticky top-0 z-20">
                  <tr className="text-[#6B7280] font-bold text-[11px] uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left min-w-[220px] border-b border-[#E5E7EB] bg-[#F9FAFB]">Categoria</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[100px] bg-[#F9FAFB]">Qtd</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[130px] bg-[#F9FAFB]">Peso Médio (kg)</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[140px] bg-[#F9FAFB]">Peso Total (kg)</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[130px] bg-[#F9FAFB]">Lotação (cab/ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {catTotals.map(ct => {
                    const editingQtd = catEditingCell?.catId === ct.catId && catEditingCell.field === 'qtd';
                    const editingPeso = catEditingCell?.catId === ct.catId && catEditingCell.field === 'peso';
                    return (
                      <tr key={ct.catId} className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]">
                        <td className="px-4 py-3 font-bold text-[#0F172A] border-r border-[#E5E7EB]">
                          <div className="flex items-center gap-2">
                            <List size={13} className="text-[#6B7280]" />
                            {ct.nome}
                          </div>
                        </td>
                        {/* QTD */}
                        <td
                          className={`px-4 py-3 text-right border-l font-medium border-[#E5E7EB] transition-all duration-150 ${isLocked ? 'cursor-default' : 'cursor-text'} ${
                            editingQtd
                              ? 'bg-[#DCFCE7] ring-2 ring-inset ring-[#16A34A] text-[#15803D] font-bold'
                              : 'hover:bg-[#F9FAFB]'
                          }`}
                          onClick={() => !isLocked && startCatEdit(ct.catId, 'qtd')}
                        >
                          {editingQtd ? (
                            <input
                              ref={catEditInputRef}
                              type="text"
                              inputMode="numeric"
                              value={catEditingValue}
                              onChange={e => setCatEditingValue(e.target.value)}
                              onKeyDown={handleCatKeyDown}
                              onBlur={() => void commitCatEdit()}
                              className="w-full bg-transparent text-right font-bold focus:outline-none focus:ring-0 border-0 p-0 text-[#15803D]"
                              autoFocus
                            />
                          ) : (
                            <span className={ct.qtd ? 'text-[#0F172A]' : 'text-[#9CA3AF]'}>
                              {ct.qtd ? fmtNum(ct.qtd) : '—'}
                            </span>
                          )}
                        </td>
                        {/* PESO MÉDIO */}
                        <td
                          className={`px-4 py-3 text-right border-l font-medium border-[#E5E7EB] transition-all duration-150 ${isLocked ? 'cursor-default' : 'cursor-text'} ${
                            editingPeso
                              ? 'bg-[#DCFCE7] ring-2 ring-inset ring-[#16A34A] text-[#15803D] font-bold'
                              : 'hover:bg-[#F9FAFB]'
                          }`}
                          onClick={() => !isLocked && startCatEdit(ct.catId, 'peso')}
                        >
                          {editingPeso ? (
                            <input
                              ref={catEditInputRef}
                              type="text"
                              inputMode="decimal"
                              value={catEditingValue}
                              onChange={e => setCatEditingValue(e.target.value)}
                              onKeyDown={handleCatKeyDown}
                              onBlur={() => void commitCatEdit()}
                              className="w-full bg-transparent text-right font-bold focus:outline-none focus:ring-0 border-0 p-0 text-[#15803D]"
                              autoFocus
                            />
                          ) : (
                            <span className={ct.pesoMedio ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}>
                              {ct.pesoMedio ? fmtNum(ct.pesoMedio, 1) : '—'}
                            </span>
                          )}
                        </td>
                        {/* PESO TOTAL (derived) */}
                        <td className="px-4 py-3 text-right border-l font-semibold border-[#E5E7EB] text-[#6B7280]">
                          {ct.pesoTotal ? fmtNum(ct.pesoTotal, 1) : '—'}
                        </td>
                        {/* LOTAÇÃO (derived) */}
                        <td className="px-4 py-3 text-right border-l font-semibold border-[#E5E7EB] text-[#6B7280]">
                          {ct.lotacao ? fmtNum(ct.lotacao, 2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 bg-[#F9FAFB] border-[#E5E7EB]">
                  <tr className="font-bold text-[#0F172A]">
                    <td className="px-4 py-3.5 border-r border-[#E5E7EB] bg-[#F9FAFB]">Total</td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB]">{totals.totalCab ? fmtNum(totals.totalCab) : '—'}</td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB] text-[#6B7280]">{totals.totalCab ? fmtNum(totals.pesoMedio, 1) : '—'}</td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB] text-[#6B7280]">
                      {totals.totalCab ? fmtNum(totals.totalCab * totals.pesoMedio, 1) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB] text-[#6B7280]">
                      {areaTotal > 0 && totals.totalCab ? fmtNum(totals.totalCab / areaTotal, 2) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          /* ═══════ Mapa de Pasto ═══════ */
          <div
            ref={tableContainerRef}
            tabIndex={0}
            onKeyDown={handleTableKeyDown}
            className="flex-1 min-h-0 border border-[#E5E7EB] bg-white rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:ring-offset-1 transition-shadow flex flex-col"
          >
            <div className="overflow-auto flex-1">
              <table className="min-w-full text-xs" role="grid">
                <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] sticky top-0 z-20">
                  <tr className="text-[#6B7280] font-bold text-[11px] uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left sticky left-0 z-30 min-w-[200px] border-b border-[#E5E7EB] bg-[#F9FAFB]">Local</th>
                    {categorias.map(cat => (
                      <th key={cat.id} colSpan={2} className="px-2 py-2 text-center border-l border-b border-[#E5E7EB] min-w-[140px] bg-[#F9FAFB]">
                        {cat.nome}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[90px] bg-[#F9FAFB]">Total</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[100px] bg-[#F9FAFB]">Peso Médio</th>
                    <th className="px-4 py-2.5 text-right border-l border-b border-[#E5E7EB] min-w-[100px] bg-[#F9FAFB]">Lotação</th>
                  </tr>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <th className="px-4 py-1.5 sticky left-0 z-30 border-b border-[#E5E7EB] bg-[#F9FAFB]"></th>
                    {categorias.map(cat => (
                      <React.Fragment key={cat.id}>
                        <th className="px-2 py-2 text-right text-[10px] font-bold border-l border-b border-[#E5E7EB] uppercase text-[#9CA3AF] tracking-wider">Qtd</th>
                        <th className="px-2 py-2 text-right text-[10px] font-bold border-b border-[#E5E7EB] uppercase text-[#9CA3AF] tracking-wider">Peso (kg)</th>
                      </React.Fragment>
                    ))}
                    <th colSpan={3} className="border-l border-b border-[#E5E7EB] bg-[#F9FAFB]"></th>
                  </tr>
                </thead>
                <tbody>
                  {locais.map(loc => {
                    let qtdLocal = 0;
                    let pesoLocal = 0;
                    for (const cat of categorias) {
                      const v = lancamentos[cellKey(loc.id, cat.id)];
                      if (v) { qtdLocal += v.quantidade; pesoLocal += v.quantidade * v.pesoKgCabeca; }
                    }
                    const pesoMedioLocal = qtdLocal > 0 ? pesoLocal / qtdLocal : 0;
                    const areaLocal = parseFloat(loc.area ?? '0') || 0;
                    const lotacaoLocal = areaLocal > 0 ? qtdLocal / areaLocal : 0;
                    return (
                      <tr key={loc.id} className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]" role="row">
                        <td className="px-4 py-3 font-bold sticky left-0 z-10 bg-white text-[#0F172A] border-r border-[#E5E7EB]">
                          <div className="flex items-center gap-2">
                            <MapPin size={13} className="text-[#16A34A]" />
                            {loc.name}
                          </div>
                        </td>
                        {categorias.map(cat => {
                          const key = cellKey(loc.id, cat.id);
                          const v = lancamentos[key];
                          const editingQtd = editingCell?.key === key && editingCell.field === 'qtd';
                          const editingPeso = editingCell?.key === key && editingCell.field === 'peso';
                          const focusedQtd = isNavigationMode && focusedCell?.key === key && focusedCell.field === 'qtd';
                          const focusedPeso = isNavigationMode && focusedCell?.key === key && focusedCell.field === 'peso';
                          return (
                            <React.Fragment key={cat.id}>
                              <td
                                id={`cell-${key}-qtd`}
                                role="gridcell"
                                className={`px-3 py-2 text-right border-l font-medium transition-all duration-150 border-[#E5E7EB] ${isLocked ? 'cursor-default' : 'cursor-text'} ${
                                  editingQtd
                                    ? 'bg-[#DCFCE7] ring-2 ring-inset ring-[#16A34A] text-[#15803D] font-bold'
                                    : focusedQtd
                                      ? 'bg-[#F0FDF4] ring-2 ring-inset ring-[#16A34A]/60 shadow-[inset_0_0_0_1px_rgba(22,163,74,0.3)]'
                                      : 'hover:bg-[#F9FAFB]'
                                }`}
                                onClick={() => {
                                  setFocusedCell({ key, field: 'qtd' });
                                  if (!isLocked) {
                                    startEditCell(key, 'qtd');
                                  }
                                }}
                              >
                                {editingQtd ? (
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onKeyDown={handleCellKeyDown}
                                    onBlur={() => void commitEditCell(null)}
                                    className="w-full bg-transparent text-right font-bold focus:outline-none focus:ring-0 border-0 p-0 text-[#15803D]"
                                    autoFocus
                                  />
                                ) : (
                                  <span className={`inline-block w-full ${v?.quantidade ? 'text-[#0F172A]' : 'text-[#9CA3AF]'}`}>
                                    {v?.quantidade ? fmtNum(v.quantidade) : '—'}
                                  </span>
                                )}
                              </td>
                              <td
                                id={`cell-${key}-peso`}
                                role="gridcell"
                                className={`px-3 py-2 text-right border-r transition-all duration-150 border-[#E5E7EB] ${isLocked ? 'cursor-default' : 'cursor-text'} ${
                                  editingPeso
                                    ? 'bg-[#DCFCE7] ring-2 ring-inset ring-[#16A34A] text-[#15803D] font-bold'
                                    : focusedPeso
                                      ? 'bg-[#F0FDF4] ring-2 ring-inset ring-[#16A34A]/60 shadow-[inset_0_0_0_1px_rgba(22,163,74,0.3)]'
                                      : 'hover:bg-[#F9FAFB]'
                                }`}
                                onClick={() => {
                                  setFocusedCell({ key, field: 'peso' });
                                  if (!isLocked) {
                                    startEditCell(key, 'peso');
                                  }
                                }}
                              >
                                {editingPeso ? (
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    inputMode="decimal"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onKeyDown={handleCellKeyDown}
                                    onBlur={() => void commitEditCell(null)}
                                    className="w-full bg-transparent text-right font-bold focus:outline-none focus:ring-0 border-0 p-0 text-[#15803D]"
                                    autoFocus
                                  />
                                ) : (
                                  <span className={`inline-block w-full ${v?.pesoKgCabeca ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>
                                    {v?.pesoKgCabeca ? fmtNum(v.pesoKgCabeca, 1) : '—'}
                                  </span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-bold border-l border-[#E5E7EB] text-[#0F172A]">{qtdLocal ? fmtNum(qtdLocal) : '—'}</td>
                        <td className="px-4 py-3 text-right border-l font-semibold border-[#E5E7EB] text-[#6B7280]">{qtdLocal ? fmtNum(pesoMedioLocal, 1) : '—'}</td>
                        <td className="px-4 py-3 text-right border-l font-semibold border-[#E5E7EB] text-[#6B7280]">{areaLocal > 0 && qtdLocal ? fmtNum(lotacaoLocal, 2) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 bg-[#F9FAFB] border-[#E5E7EB]">
                  <tr className="font-bold text-[#0F172A]">
                    <td className="px-4 py-3.5 sticky left-0 z-10 border-r bg-[#F9FAFB] border-[#E5E7EB]">Total</td>
                    {categorias.map(cat => {
                      const t = totaisPorCategoria[cat.id];
                      const pmCat = t.qtd > 0 ? t.pesoTotal / t.qtd : 0;
                      return (
                        <React.Fragment key={cat.id}>
                          <td className="px-3 py-2 text-right border-l border-[#E5E7EB]">
                            {t.qtd ? fmtNum(t.qtd) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right border-r border-[#E5E7EB] text-[#6B7280]">
                            {t.qtd ? fmtNum(pmCat, 1) : '—'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB]">{fmtNum(totals.totalCab)}</td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB] text-[#6B7280]">{totals.totalCab ? fmtNum(totals.pesoMedio, 1) : '—'}</td>
                    <td className="px-4 py-3.5 text-right border-l border-[#E5E7EB] text-[#6B7280]">{farmOfMapa?.pastureArea ? fmtNum(lotacaoFazenda, 2) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!isLocked && (
              <div className="px-3 py-2 border-t border-[#E5E7EB] bg-[#F9FAFB]/50 text-[#6B7280] text-[0.65rem] leading-snug font-semibold shrink-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#166534]">
                    ⌨️ Teclado
                  </span>
                  <span>
                    <kbd className="px-1 py-0.5 rounded border bg-white border-gray-200 shadow-sm text-[0.6rem]">←↑↓→</kbd> navegar
                  </span>
                  <span>·</span>
                  <span><kbd className="px-1 py-0.5 rounded border bg-white border-gray-200 shadow-sm text-[0.6rem]">Enter</kbd> editar</span>
                  <span>·</span>
                  <span><kbd className="px-1 py-0.5 rounded border bg-white border-gray-200 shadow-sm text-[0.6rem]">Tab</kbd> avançar</span>
                  <span>·</span>
                  <span><kbd className="px-1 py-0.5 rounded border bg-white border-gray-200 shadow-sm text-[0.6rem]">Esc</kbd> cancelar</span>
                  <span>·</span>
                  <span>número = editar direto</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
      <header className="space-y-3 mb-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold transition-colors text-gray-500 hover:text-[#16A34A]"
          >
            <ArrowLeft size={14} /> Voltar para Cadastros
          </button>
        )}
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold text-[#22C55E] tracking-widest uppercase">
            {copy.layerLabel}
          </span>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#0F172A]">
            {copy.pageTitle}
          </h1>
        </div>
        <p className="text-sm leading-relaxed max-w-2xl text-[#6B7280]">
          {copy.pageDesc}
        </p>
      </header>

      {/* Form de criação */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-8 shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
        <p className="text-[11px] font-bold uppercase tracking-wider mb-4 text-[#6B7280]">Novo Mapa</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] mb-1.5 font-bold uppercase tracking-wide text-[#6B7280]">Fazenda</label>
            <select
              value={newFarmId}
              onChange={e => setNewFarmId(e.target.value)}
              className="text-sm border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg px-3 py-2 min-w-[240px] focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all"
              disabled={farms.length === 0}
            >
              {farms.length === 0 && <option value="">Nenhuma fazenda</option>}
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {enforceUnico && farmHasMapa ? (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold flex-1 min-w-[280px] bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
              <AlertTriangle size={16} className="shrink-0 text-[#92400E]" />
              <span>Esta fazenda já possui um Estoque de Partida cadastrado. Edite ou exclua o existente na lista abaixo para fazer alterações.</span>
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                <label className="text-[10px] mb-1.5 font-bold uppercase tracking-wide text-[#6B7280]">Data de referência</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="text-sm border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg px-3 py-2 focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newFarmId}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 bg-[#16A34A] hover:bg-[#15803D] text-white shadow-[0_1px_3px_rgba(16,24,40,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Novo Mapa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lista de mapas */}
      {loadingList ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : mapas.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center border border-dashed rounded-2xl p-16 shadow-md bg-white border-gray-200 text-gray-500">
          <Boxes size={36} className="mb-4 opacity-40" />
          <p className="text-sm font-semibold">Nenhum mapa cadastrado.</p>
          <p className="text-xs mt-1 opacity-70">{copy.emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {mapas.map(m => {
            const farm = farms.find(f => f.id === m.farmId);
            const isLocked = m.status === 'salvo';
            return (
              <div
                key={m.id}
                onClick={() => handleOpenMapa(m)}
                className="group relative bg-white border border-[#E5E7EB] rounded-xl p-6 cursor-pointer shadow-[0_1px_3px_rgba(16,24,40,0.08)] hover:shadow-md transition-all duration-300 hover:border-[#16A34A]/50 animate-in fade-in duration-300"
              >
                <div className="flex items-start justify-between gap-2 mb-4">
                  <span
                    className={`inline-block px-3 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                      isLocked
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {isLocked ? 'Salvo' : 'Rascunho'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(m.id); }}
                    className="p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <h3 className="text-base font-black mb-1.5 text-[#0F172A]">{farm?.name ?? '—'}</h3>
                <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                  <CalendarDays size={12} className="text-[#16A34A]" /> {formatDateBR(m.dataReferencia)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-md w-full shadow-2xl transition-all duration-300 transform scale-100" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Excluir mapa?</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Esta ação remove o mapa e todos os lançamentos associados de forma definitiva. Não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border rounded-xl transition-all duration-300 ${
                  isDark ? 'text-gray-300 border-[#5E6D82]/50 hover:bg-[#1A212E]' : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteConfirmId)}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all duration-300 shadow-md shadow-red-900/10"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstoquePartida;
