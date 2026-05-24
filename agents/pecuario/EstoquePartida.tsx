import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Boxes, Loader2, Plus, Trash2, MapPin, CalendarDays, Save, Pencil, AlertTriangle } from 'lucide-react';
import { useHierarchy } from '../../contexts/HierarchyContext';
import { listAnimalCategories, type AnimalCategory } from '../../lib/api/animalCategoriesClient';
import {
  listMapasByOrg,
  createMapa,
  updateMapa,
  deleteMapa,
  listLancamentos,
  upsertLancamento,
  type MapaRebanhoHeader,
  type MapaRebanhoLancamento,
} from '../../lib/api/mapaRebanhoClient';

interface EstoquePartidaProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
}

interface Local {
  id: string;
  retiro_id: string;
  farm_id: string;
  name: string;
  area: string | null;
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

const EstoquePartida: React.FC<EstoquePartidaProps> = ({ onToast, onBack }) => {
  const { selectedOrganization, farms, loading: hierarchyLoading } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

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

  // ── Load mapas list ───────────────────────────────────────────────────────
  const loadMapas = useCallback(async () => {
    if (!organizationId) {
      setMapas([]);
      return;
    }
    setLoadingList(true);
    try {
      const rows = await listMapasByOrg(organizationId);
      setMapas(rows);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao carregar mapas', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [organizationId, onToast]);

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
        listLancamentos(mapa.id),
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
  }, [organizationId, onToast]);

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
      const row = await createMapa({ organizationId, farmId: newFarmId, dataReferencia: newDate });
      onToast?.('Mapa criado', 'success');
      setMapas(prev => [row, ...prev]);
      handleOpenMapa(row);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao criar mapa', 'error');
    } finally {
      setCreating(false);
    }
  }, [organizationId, newFarmId, newDate, onToast, handleOpenMapa]);

  // ── Delete mapa ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMapa(id);
      setMapas(prev => prev.filter(m => m.id !== id));
      if (openMapaId === id) handleCloseEditor();
      onToast?.('Mapa excluído', 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao excluir mapa', 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  }, [openMapaId, handleCloseEditor, onToast]);

  // ── Cell editing ──────────────────────────────────────────────────────────
  const startEditCell = useCallback((key: string, field: 'qtd' | 'peso') => {
    if (!openMapa || openMapa.status === 'salvo') return;
    const current = lancamentos[key];
    const value = current
      ? field === 'qtd' ? String(current.quantidade) : String(current.pesoKgCabeca).replace('.', ',')
      : '';
    setEditingCell({ key, field });
    setEditingValue(value);
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

    try {
      await upsertLancamento({
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
  }, [editingCell, editingValue, openMapa, lancamentos, onToast, loadEditor]);

  const cancelEditCell = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editingCell) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditCell();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
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
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const { key, field } = editingCell;
      const [localId, categoriaId] = key.split('__');
      const localIdx = locais.findIndex(l => l.id === localId);
      if (localIdx >= 0 && localIdx < locais.length - 1) {
        const next = locais[localIdx + 1];
        void commitEditCell({ key: cellKey(next.id, categoriaId), field });
      } else {
        void commitEditCell(null);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const { key, field } = editingCell;
      const [localId, categoriaId] = key.split('__');
      const localIdx = locais.findIndex(l => l.id === localId);
      if (localIdx > 0) {
        const next = locais[localIdx - 1];
        void commitEditCell({ key: cellKey(next.id, categoriaId), field });
      } else {
        void commitEditCell(null);
      }
      return;
    }
  }, [editingCell, locais, categorias, commitEditCell, cancelEditCell]);

  // ── Toggle status (Salvar/Editar) ─────────────────────────────────────────
  const toggleStatus = useCallback(async () => {
    if (!openMapa) return;
    setSavingHeader(true);
    try {
      const nextStatus = openMapa.status === 'salvo' ? 'rascunho' : 'salvo';
      const row = await updateMapa(openMapa.id, { status: nextStatus });
      setOpenMapa(row);
      setMapas(prev => prev.map(m => (m.id === row.id ? row : m)));
      onToast?.(nextStatus === 'salvo' ? 'Mapa salvo' : 'Mapa em edição', 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao alterar status', 'error');
    } finally {
      setSavingHeader(false);
    }
  }, [openMapa, onToast]);

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

  // ── Render ────────────────────────────────────────────────────────────────
  if (hierarchyLoading.farms && farms.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
        <header className="space-y-4 mb-8">
          <div className="flex items-center gap-3">
            <Boxes size={24} className="text-gray-500" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Estoque de Partida</h1>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl p-12 bg-white">
          <AlertTriangle size={28} className="mb-3 opacity-40" />
          <p className="text-sm max-w-md">Selecione uma organização para começar.</p>
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  if (openMapa) {
    const isLocked = openMapa.status === 'salvo';
    return (
      <div className="h-full flex flex-col p-6 md:p-10 max-w-[1400px] mx-auto w-full">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCloseEditor}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={14} /> Voltar para mapas
              </button>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                {farmOfMapa?.name ?? 'Fazenda'} · {formatDateBR(openMapa.dataReferencia)}
              </h1>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isLocked ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {isLocked ? 'Salvo' : 'Rascunho'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleStatus}
                disabled={savingHeader}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isLocked
                    ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                } disabled:opacity-50`}
              >
                {savingHeader ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isLocked ? (
                  <Pencil size={16} />
                ) : (
                  <Save size={16} />
                )}
                {isLocked ? 'Editar' : 'Salvar mapa'}
              </button>
            </div>
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wide text-gray-400 font-semibold">Total de Cabeças</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(totals.totalCab)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wide text-gray-400 font-semibold">Peso Médio</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(totals.pesoMedio, 1)} <span className="text-sm font-medium text-gray-500">kg</span></p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wide text-gray-400 font-semibold">Lotação Fazenda</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {fmtNum(lotacaoFazenda, 2)} <span className="text-sm font-medium text-gray-500">cab/ha</span>
              </p>
            </div>
          </div>
        </header>

        {loadingEditor ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" size={28} /></div>
        ) : locais.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
            Esta fazenda ainda não tem locais cadastrados. Cadastre os locais em <span className="font-semibold">Cadastros &gt; Locais</span> antes de preencher o mapa.
          </div>
        ) : categorias.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
            Nenhuma categoria animal cadastrada. Cadastre categorias em <span className="font-semibold">Cadastros &gt; Categoria Animal</span>.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[180px]">Local</th>
                    {categorias.map(cat => (
                      <th key={cat.id} colSpan={2} className="px-2 py-2 text-center font-semibold text-gray-700 border-l border-gray-200 min-w-[140px]">
                        {cat.nome}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 border-l border-gray-200 min-w-[80px]">Total</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 border-l border-gray-200 min-w-[90px]">Peso Médio</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 border-l border-gray-200 min-w-[90px]">Lotação</th>
                  </tr>
                  <tr className="bg-gray-50/50 border-b border-gray-200">
                    <th className="px-3 py-1.5 sticky left-0 bg-gray-50/50 z-10"></th>
                    {categorias.map(cat => (
                      <React.Fragment key={cat.id}>
                        <th className="px-2 py-1.5 text-right text-[0.6rem] font-medium text-gray-500 border-l border-gray-200">Qtd</th>
                        <th className="px-2 py-1.5 text-right text-[0.6rem] font-medium text-gray-500">Peso (kg)</th>
                      </React.Fragment>
                    ))}
                    <th colSpan={3} className="border-l border-gray-200"></th>
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
                      <tr key={loc.id} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white z-10">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-gray-400" />
                            {loc.name}
                          </div>
                        </td>
                        {categorias.map(cat => {
                          const key = cellKey(loc.id, cat.id);
                          const v = lancamentos[key];
                          const editingQtd = editingCell?.key === key && editingCell.field === 'qtd';
                          const editingPeso = editingCell?.key === key && editingCell.field === 'peso';
                          return (
                            <React.Fragment key={cat.id}>
                              <td
                                className={`px-2 py-1 text-right border-l border-gray-100 ${
                                  isLocked ? 'cursor-default' : 'cursor-text'
                                } ${editingQtd ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => startEditCell(key, 'qtd')}
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
                                    className="w-full bg-transparent text-right focus:outline-none text-gray-900"
                                  />
                                ) : (
                                  <span className={v?.quantidade ? 'text-gray-900' : 'text-gray-300'}>
                                    {v?.quantidade ? fmtNum(v.quantidade) : '—'}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`px-2 py-1 text-right ${
                                  isLocked ? 'cursor-default' : 'cursor-text'
                                } ${editingPeso ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => startEditCell(key, 'peso')}
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
                                    className="w-full bg-transparent text-right focus:outline-none text-gray-900"
                                  />
                                ) : (
                                  <span className={v?.pesoKgCabeca ? 'text-gray-600' : 'text-gray-300'}>
                                    {v?.pesoKgCabeca ? fmtNum(v.pesoKgCabeca, 1) : '—'}
                                  </span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-2 text-right text-gray-900 font-semibold border-l border-gray-100">{qtdLocal ? fmtNum(qtdLocal) : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">{qtdLocal ? fmtNum(pesoMedioLocal, 1) : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">{areaLocal > 0 && qtdLocal ? fmtNum(lotacaoLocal, 2) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-3 py-2 font-bold text-gray-900 sticky left-0 bg-gray-50 z-10">Total</td>
                    {categorias.map(cat => {
                      const t = totaisPorCategoria[cat.id];
                      const pmCat = t.qtd > 0 ? t.pesoTotal / t.qtd : 0;
                      return (
                        <React.Fragment key={cat.id}>
                          <td className="px-2 py-2 text-right font-bold text-gray-900 border-l border-gray-200">{t.qtd ? fmtNum(t.qtd) : '—'}</td>
                          <td className="px-2 py-2 text-right text-gray-700">{t.qtd ? fmtNum(pmCat, 1) : '—'}</td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold text-gray-900 border-l border-gray-200">{fmtNum(totals.totalCab)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-200">{totals.totalCab ? fmtNum(totals.pesoMedio, 1) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-200">{farmOfMapa?.pastureArea ? fmtNum(lotacaoFazenda, 2) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!isLocked && (
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 text-[0.65rem] text-gray-500">
                Clique em uma célula para editar. <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">Enter</kbd> confirma · <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">Tab</kbd> avança · <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">↓</kbd> próxima linha · <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">Esc</kbd> cancela. Salvamento automático por célula.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto w-full">
      <header className="space-y-4 mb-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={14} /> Voltar para Cadastros
          </button>
        )}
        <div className="flex items-center gap-3">
          <Boxes size={24} className="text-gray-500" />
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Estoque de Partida</h1>
        </div>
        <p className="text-sm text-gray-500 max-w-2xl">
          Registre o inventário inicial do rebanho por fazenda e categoria animal. Cada mapa é uma fotografia
          do rebanho em uma data de referência, base para todas as movimentações e relatórios do módulo Pecuário.
        </p>
      </header>

      {/* Form de criação */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Novo Mapa</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[0.65rem] text-gray-500 mb-1 font-medium">Fazenda</label>
            <select
              value={newFarmId}
              onChange={e => setNewFarmId(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 min-w-[220px] focus:outline-none focus:ring-1 focus:ring-gray-400"
              disabled={farms.length === 0}
            >
              {farms.length === 0 && <option value="">Nenhuma fazenda</option>}
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[0.65rem] text-gray-500 mb-1 font-medium">Data de referência</label>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newFarmId}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Novo Mapa
          </button>
        </div>
      </div>

      {/* Lista de mapas */}
      {loadingList ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : mapas.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl p-12 bg-white">
          <Boxes size={28} className="mb-3 opacity-40" />
          <p className="text-sm max-w-md">Nenhum mapa cadastrado. Crie o primeiro usando o formulário acima.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mapas.map(m => {
            const farm = farms.find(f => f.id === m.farmId);
            const isLocked = m.status === 'salvo';
            return (
              <div
                key={m.id}
                onClick={() => handleOpenMapa(m)}
                className="group relative bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-gray-800 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${
                      isLocked ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {isLocked ? 'Salvo' : 'Rascunho'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(m.id); }}
                    className="p-1 text-gray-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">{farm?.name ?? '—'}</h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CalendarDays size={12} /> {formatDateBR(m.dataReferencia)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir mapa?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Esta ação remove o mapa e todos os lançamentos associados. Não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteConfirmId)}
                className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
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
