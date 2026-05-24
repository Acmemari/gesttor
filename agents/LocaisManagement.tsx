import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, MapPin, Loader2, ChevronRight } from 'lucide-react';
import { useHierarchy } from '../contexts/HierarchyContext';

interface Retiro {
  id: string;
  farm_id: string;
  name: string;
  total_area: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface Local {
  id: string;
  retiro_id: string;
  farm_id: string;
  name: string;
  area: string | null;
  created_at: string;
  updated_at: string;
}

interface LocaisManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const API_BASE = '/api/farm-locations';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

function formatHa(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '—';
  const formatted = num.toFixed(2);
  const parts = formatted.split('.');
  const integerWithSeparator = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integerWithSeparator},${parts[1] || '00'} ha`;
}

function parseAreaInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  if (isNaN(num) || num < 0) return null;
  return String(num);
}

const LocaisManagement: React.FC<LocaisManagementProps> = ({ onToast }) => {
  const { farms, loading: hierarchyLoading, selectedOrganization } = useHierarchy();

  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [loadingLocais, setLoadingLocais] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addingLocal, setAddingLocal] = useState(false);
  const [newLocalName, setNewLocalName] = useState('');
  const [newLocalArea, setNewLocalArea] = useState('');

  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [editLocalName, setEditLocalName] = useState('');
  const [editLocalArea, setEditLocalArea] = useState('');

  const selectedFarm = useMemo(
    () => farms.find(f => f.id === selectedFarmId) ?? null,
    [farms, selectedFarmId],
  );

  useEffect(() => {
    if (farms.length === 0) {
      setSelectedFarmId(null);
      return;
    }
    if (!selectedFarmId || !farms.some(f => f.id === selectedFarmId)) {
      setSelectedFarmId(farms[0].id);
    }
  }, [farms, selectedFarmId]);

  const loadFarmData = useCallback(async (farmId: string) => {
    setLoadingLocais(true);
    try {
      const [retirosRes, locaisRes] = await Promise.all([
        fetchJson<Retiro[]>(`${API_BASE}?farmId=${farmId}`),
        fetchJson<Local[]>(`${API_BASE}?farmIdLocais=${farmId}`),
      ]);
      setRetiros(retirosRes);
      setLocais(locaisRes);
    } catch (err: any) {
      console.error('Erro ao carregar locais:', err);
      onToast?.(err?.message || 'Erro ao carregar locais', 'error');
      setRetiros([]);
      setLocais([]);
    } finally {
      setLoadingLocais(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (!selectedFarmId) {
      setRetiros([]);
      setLocais([]);
      return;
    }
    void loadFarmData(selectedFarmId);
  }, [selectedFarmId, loadFarmData]);

  const ensureRetiroId = async (farmId: string, farmName: string): Promise<string> => {
    if (retiros.length > 0) {
      const defaultRetiro = retiros.find(r => r.is_default);
      return (defaultRetiro ?? retiros[0]).id;
    }
    const created = await fetchJson<Retiro>(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmId,
        name: farmName,
        totalArea: null,
        isDefault: true,
      }),
    });
    setRetiros(prev => [...prev, created]);
    return created.id;
  };

  const handleAddLocal = async () => {
    if (!selectedFarm || !newLocalName.trim()) return;
    const areaValue = parseAreaInput(newLocalArea);
    if (newLocalArea.trim() && areaValue === null) {
      onToast?.('Área inválida', 'error');
      return;
    }
    setSaving(true);
    try {
      const retiroId = await ensureRetiroId(selectedFarm.id, selectedFarm.name);
      const row = await fetchJson<Local>(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'local',
          retiroId,
          farmId: selectedFarm.id,
          name: newLocalName.trim(),
          area: areaValue,
        }),
      });
      setLocais(prev => [...prev, row]);
      setNewLocalName('');
      setNewLocalArea('');
      setAddingLocal(false);
      onToast?.('Local cadastrado com sucesso', 'success');
    } catch (err: any) {
      console.error('Erro ao criar local:', err);
      onToast?.(err?.message || 'Erro ao criar local', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLocal = async (id: string) => {
    const areaValue = parseAreaInput(editLocalArea);
    if (editLocalArea.trim() && areaValue === null) {
      onToast?.('Área inválida', 'error');
      return;
    }
    setSaving(true);
    try {
      const row = await fetchJson<Local>(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'local',
          id,
          name: editLocalName.trim(),
          area: areaValue,
        }),
      });
      setLocais(prev => prev.map(l => (l.id === id ? row : l)));
      setEditingLocalId(null);
      onToast?.('Local atualizado', 'success');
    } catch (err: any) {
      console.error('Erro ao atualizar local:', err);
      onToast?.(err?.message || 'Erro ao atualizar local', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocal = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este local?')) return;
    setSaving(true);
    try {
      await fetchJson(`${API_BASE}?localId=${id}`, { method: 'DELETE' });
      setLocais(prev => prev.filter(l => l.id !== id));
      onToast?.('Local excluído', 'success');
    } catch (err: any) {
      console.error('Erro ao excluir local:', err);
      onToast?.(err?.message || 'Erro ao excluir local', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalArea = useMemo(
    () =>
      locais.reduce((sum, l) => {
        if (!l.area) return sum;
        const num = parseFloat(String(l.area).replace(',', '.'));
        return sum + (isNaN(num) ? 0 : num);
      }, 0),
    [locais],
  );

  const farmPastureArea = (selectedFarm as any)?.pastureArea ?? (selectedFarm as any)?.totalArea ?? null;
  const farmsLoading = hierarchyLoading.farms;

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-6xl mx-auto w-full">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 text-gray-500">
              <MapPin size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Locais</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Cadastre os locais (piquetes, retiros, currais) vinculados a cada fazenda
              </p>
            </div>
          </div>
          {selectedFarm && (
            <button
              type="button"
              onClick={() => {
                setAddingLocal(true);
                setEditingLocalId(null);
              }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} />
              Novo Local
            </button>
          )}
        </div>

        {/* Body — two columns */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* Fazendas column */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mb-2 px-1">
              Fazendas
            </h3>
            {farmsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : farms.length === 0 ? (
              <div className="text-center py-8 px-2 text-xs text-gray-400">
                {selectedOrganization
                  ? 'Nenhuma fazenda cadastrada nesta organização.'
                  : 'Selecione uma organização para visualizar suas fazendas.'}
              </div>
            ) : (
              <div className="space-y-1">
                {farms.map(farm => {
                  const isSelected = farm.id === selectedFarmId;
                  const farmArea = (farm as any).pastureArea ?? (farm as any).totalArea ?? null;
                  return (
                    <button
                      key={farm.id}
                      type="button"
                      onClick={() => setSelectedFarmId(farm.id)}
                      className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-l-4 border-l-gray-900 border-gray-200 bg-gray-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{farm.name}</div>
                        {farmArea != null && (
                          <div className="text-[11px] text-gray-500 mt-0.5">{formatHa(farmArea)}</div>
                        )}
                      </div>
                      <ChevronRight size={14} className={isSelected ? 'text-gray-900' : 'text-gray-300'} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Locais column */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="min-w-0">
                <h3 className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
                  Locais
                </h3>
                {selectedFarm && (
                  <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                    {selectedFarm.name}
                  </div>
                )}
              </div>
              {selectedFarm && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingLocal(true);
                    setEditingLocalId(null);
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                >
                  <Plus size={12} />
                  Novo Local
                </button>
              )}
            </div>

            {!selectedFarm ? (
              <div className="text-center py-10 text-xs text-gray-400">
                Selecione uma fazenda para ver seus locais.
              </div>
            ) : loadingLocais ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_120px_72px] gap-2 px-3 py-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase border-b border-gray-100">
                  <div>Nome do Local</div>
                  <div className="text-right">Área (ha)</div>
                  <div className="text-right">Ações</div>
                </div>

                {/* Inline add row */}
                {addingLocal && (
                  <div className="grid grid-cols-[1fr_120px_72px] gap-2 items-center px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nome do local"
                      value={newLocalName}
                      onChange={e => setNewLocalName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleAddLocal();
                        if (e.key === 'Escape') {
                          setAddingLocal(false);
                          setNewLocalName('');
                          setNewLocalArea('');
                        }
                      }}
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-gray-900"
                    />
                    <input
                      type="text"
                      placeholder="0,00"
                      value={newLocalArea}
                      onChange={e => setNewLocalArea(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleAddLocal();
                        if (e.key === 'Escape') {
                          setAddingLocal(false);
                          setNewLocalName('');
                          setNewLocalArea('');
                        }
                      }}
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white text-right focus:outline-none focus:border-gray-900"
                    />
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void handleAddLocal()}
                        disabled={saving || !newLocalName.trim()}
                        className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                        title="Salvar"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingLocal(false);
                          setNewLocalName('');
                          setNewLocalArea('');
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Cancelar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Local rows */}
                {locais.length === 0 && !addingLocal ? (
                  <div className="text-center py-10 text-xs text-gray-400">
                    Nenhum local cadastrado para esta fazenda.
                  </div>
                ) : (
                  locais.map(local => {
                    const isEditing = editingLocalId === local.id;
                    return (
                      <div
                        key={local.id}
                        className="grid grid-cols-[1fr_120px_72px] gap-2 items-center px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
                      >
                        {isEditing ? (
                          <>
                            <input
                              autoFocus
                              type="text"
                              value={editLocalName}
                              onChange={e => setEditLocalName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void handleUpdateLocal(local.id);
                                if (e.key === 'Escape') setEditingLocalId(null);
                              }}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-gray-900"
                            />
                            <input
                              type="text"
                              value={editLocalArea}
                              onChange={e => setEditLocalArea(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void handleUpdateLocal(local.id);
                                if (e.key === 'Escape') setEditingLocalId(null);
                              }}
                              placeholder="0,00"
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white text-right focus:outline-none focus:border-gray-900"
                            />
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => void handleUpdateLocal(local.id)}
                                disabled={saving || !editLocalName.trim()}
                                className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                                title="Salvar"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLocalId(null)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title="Cancelar"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm text-gray-800 truncate">{local.name}</div>
                            <div className="text-sm text-gray-700 text-right tabular-nums">
                              {formatHa(local.area)}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLocalId(local.id);
                                  setEditLocalName(local.name);
                                  setEditLocalArea(local.area ?? '');
                                  setAddingLocal(false);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-900"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLocal(local.id)}
                                className="p-1 text-red-400 hover:text-red-600"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Total row */}
                {locais.length > 0 && (
                  <div className="grid grid-cols-[1fr_120px_72px] gap-2 items-center px-3 py-3 bg-gray-50/60">
                    <div className="text-sm font-bold text-gray-900">Total</div>
                    <div className="text-sm font-bold text-gray-900 text-right tabular-nums">
                      {formatHa(totalArea)}
                    </div>
                    <div />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocaisManagement;
