import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, MapPin, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

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

interface FarmLocaisTabProps {
  farmId: string;
  farmName: string;
  pastureArea?: number | null;
  readOnly?: boolean;
}

const API_BASE = '/api/farm-locations';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

const FarmLocaisTab: React.FC<FarmLocaisTabProps> = ({ farmId, farmName, pastureArea, readOnly }) => {
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [selectedRetiroId, setSelectedRetiroId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noRetiro, setNoRetiro] = useState(false);

  // Inline editing states
  const [editingRetiroId, setEditingRetiroId] = useState<string | null>(null);
  const [editRetiroName, setEditRetiroName] = useState('');
  const [editRetiroArea, setEditRetiroArea] = useState('');
  const [newRetiroName, setNewRetiroName] = useState('');
  const [newRetiroArea, setNewRetiroArea] = useState('');
  const [addingRetiro, setAddingRetiro] = useState(false);

  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [editLocalName, setEditLocalName] = useState('');
  const [editLocalArea, setEditLocalArea] = useState('');
  const [newLocalName, setNewLocalName] = useState('');
  const [newLocalArea, setNewLocalArea] = useState('');
  const [addingLocal, setAddingLocal] = useState(false);

  const [saving, setSaving] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadRetiros = useCallback(async () => {
    try {
      const rows = await fetchJson<Retiro[]>(`${API_BASE}?farmId=${farmId}`);
      setRetiros(rows);
      // Check if there's a single default retiro
      if (rows.length === 1 && rows[0].is_default) {
        setNoRetiro(true);
      } else if (rows.length === 0) {
        setNoRetiro(false);
      }
      // Auto-select first retiro
      if (rows.length > 0 && !selectedRetiroId) {
        setSelectedRetiroId(rows[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar retiros:', err);
    }
  }, [farmId, selectedRetiroId]);

  const loadLocais = useCallback(async () => {
    if (!selectedRetiroId) {
      setLocais([]);
      return;
    }
    try {
      const rows = await fetchJson<Local[]>(`${API_BASE}?retiroId=${selectedRetiroId}`);
      setLocais(rows);
    } catch (err) {
      console.error('Erro ao carregar locais:', err);
    }
  }, [selectedRetiroId]);

  useEffect(() => {
    setLoading(true);
    loadRetiros().finally(() => setLoading(false));
  }, [loadRetiros]);

  useEffect(() => {
    loadLocais();
  }, [loadLocais]);

  // ── Toggle "sem retiro" ────────────────────────────────────────────────────
  const handleToggleNoRetiro = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      if (!noRetiro) {
        // Ativar "sem retiro": apagar retiros existentes e criar default
        for (const r of retiros) {
          await fetchJson(`${API_BASE}?retiroId=${r.id}`, { method: 'DELETE' });
        }
        const defaultRetiro = await fetchJson<Retiro>(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmId,
            name: farmName,
            totalArea: pastureArea != null ? String(pastureArea) : null,
            isDefault: true,
          }),
        });
        setRetiros([defaultRetiro]);
        setSelectedRetiroId(defaultRetiro.id);
        setNoRetiro(true);
      } else {
        // Desativar "sem retiro": apagar o default
        for (const r of retiros.filter(r => r.is_default)) {
          await fetchJson(`${API_BASE}?retiroId=${r.id}`, { method: 'DELETE' });
        }
        setRetiros(prev => prev.filter(r => !r.is_default));
        setSelectedRetiroId(null);
        setLocais([]);
        setNoRetiro(false);
      }
    } catch (err) {
      console.error('Erro ao alternar retiro padrão:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Retiro CRUD ────────────────────────────────────────────────────────────
  const handleAddRetiro = async () => {
    if (!newRetiroName.trim()) return;
    setSaving(true);
    try {
      const row = await fetchJson<Retiro>(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmId, name: newRetiroName.trim(), totalArea: newRetiroArea || null }),
      });
      setRetiros(prev => [...prev, row]);
      setSelectedRetiroId(row.id);
      setNewRetiroName('');
      setNewRetiroArea('');
      setAddingRetiro(false);
    } catch (err) {
      console.error('Erro ao criar retiro:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRetiro = async (id: string) => {
    setSaving(true);
    try {
      const row = await fetchJson<Retiro>(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editRetiroName, totalArea: editRetiroArea || null }),
      });
      setRetiros(prev => prev.map(r => (r.id === id ? row : r)));
      setEditingRetiroId(null);
    } catch (err) {
      console.error('Erro ao atualizar retiro:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRetiro = async (id: string) => {
    setSaving(true);
    try {
      await fetchJson(`${API_BASE}?retiroId=${id}`, { method: 'DELETE' });
      const updated = retiros.filter(r => r.id !== id);
      setRetiros(updated);
      if (selectedRetiroId === id) {
        setSelectedRetiroId(updated[0]?.id ?? null);
      }
    } catch (err) {
      console.error('Erro ao excluir retiro:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Local CRUD ─────────────────────────────────────────────────────────────
  const handleAddLocal = async () => {
    if (!newLocalName.trim() || !selectedRetiroId) return;
    setSaving(true);
    try {
      const row = await fetchJson<Local>(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'local', retiroId: selectedRetiroId, farmId, name: newLocalName.trim(), area: newLocalArea || null }),
      });
      setLocais(prev => [...prev, row]);
      setNewLocalName('');
      setNewLocalArea('');
      setAddingLocal(false);
    } catch (err) {
      console.error('Erro ao criar local:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLocal = async (id: string) => {
    setSaving(true);
    try {
      const row = await fetchJson<Local>(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'local', id, name: editLocalName, area: editLocalArea || null }),
      });
      setLocais(prev => prev.map(l => (l.id === id ? row : l)));
      setEditingLocalId(null);
    } catch (err) {
      console.error('Erro ao atualizar local:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocal = async (id: string) => {
    setSaving(true);
    try {
      await fetchJson(`${API_BASE}?localId=${id}`, { method: 'DELETE' });
      setLocais(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Erro ao excluir local:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-emerald-600" />
        <span className="ml-2 text-sm text-gray-500">Carregando locais...</span>
      </div>
    );
  }

  const selectedRetiro = retiros.find(r => r.id === selectedRetiroId);

  return (
    <div className="space-y-4">
      {/* Toggle "Sem retiro" */}
      <div
        onClick={readOnly ? undefined : handleToggleNoRetiro}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          readOnly ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-gray-50'
        } ${noRetiro ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}
      >
        {noRetiro ? (
          <ToggleRight size={24} className="text-emerald-600 shrink-0" />
        ) : (
          <ToggleLeft size={24} className="text-gray-400 shrink-0" />
        )}
        <div>
          <span className="text-sm font-medium text-gray-700">Esta fazenda não possui retiros</span>
          {noRetiro && (
            <p className="text-xs text-gray-500 mt-0.5">
              Um retiro padrão "{farmName}" foi criado com a área de pastagem ({pastureArea ?? 0} ha)
            </p>
          )}
        </div>
        {saving && <Loader2 size={14} className="animate-spin text-gray-400 ml-auto" />}
      </div>

      {/* Layout lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Coluna Esquerda: Retiros ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-1.5">
              <MapPin size={13} className="text-emerald-600" />
              Retiros
            </h3>
            {!noRetiro && !readOnly && (
              <button
                type="button"
                onClick={() => setAddingRetiro(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                <Plus size={12} />
                Adicionar
              </button>
            )}
          </div>

          {/* Inline add retiro */}
          {addingRetiro && !noRetiro && (
            <div className="flex gap-2 items-center rounded-lg border border-emerald-300 bg-emerald-50 p-2">
              <input
                autoFocus
                type="text"
                placeholder="Nome do retiro"
                value={newRetiroName}
                onChange={e => setNewRetiroName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRetiro(); if (e.key === 'Escape') setAddingRetiro(false); }}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              />
              <input
                type="text"
                placeholder="Área (ha)"
                value={newRetiroArea}
                onChange={e => setNewRetiroArea(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRetiro(); if (e.key === 'Escape') setAddingRetiro(false); }}
                className="w-24 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              />
              <button type="button" onClick={handleAddRetiro} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-700">
                <Check size={16} />
              </button>
              <button type="button" onClick={() => { setAddingRetiro(false); setNewRetiroName(''); setNewRetiroArea(''); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Retiro list */}
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {retiros.map(retiro => (
              <div
                key={retiro.id}
                onClick={() => { setSelectedRetiroId(retiro.id); setEditingRetiroId(null); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  retiro.id === selectedRetiroId
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:border-emerald-300'
                }`}
              >
                {editingRetiroId === retiro.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editRetiroName}
                      onChange={e => setEditRetiroName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateRetiro(retiro.id); if (e.key === 'Escape') setEditingRetiroId(null); }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                    />
                    <input
                      type="text"
                      value={editRetiroArea}
                      onChange={e => setEditRetiroArea(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateRetiro(retiro.id); if (e.key === 'Escape') setEditingRetiroId(null); }}
                      onClick={e => e.stopPropagation()}
                      placeholder="Área"
                      className="w-20 text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                    />
                    <button type="button" onClick={e => { e.stopPropagation(); handleUpdateRetiro(retiro.id); }} className="p-1 text-emerald-600 hover:text-emerald-700">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); setEditingRetiroId(null); }} className="p-1 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate block">{retiro.name}</span>
                      {retiro.total_area && (
                        <span className="text-xs text-gray-500">{retiro.total_area} ha</span>
                      )}
                    </div>
                    {!readOnly && !retiro.is_default && (
                      <>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingRetiroId(retiro.id);
                            setEditRetiroName(retiro.name);
                            setEditRetiroArea(retiro.total_area ?? '');
                          }}
                          className="shrink-0 p-1 text-gray-400 hover:text-emerald-600"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleDeleteRetiro(retiro.id); }}
                          className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            {retiros.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                Nenhum retiro cadastrado
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna Direita: Locais ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-600" />
              Locais
              {selectedRetiro && (
                <span className="normal-case tracking-normal font-medium text-emerald-600 ml-1">
                  — {selectedRetiro.name}
                </span>
              )}
            </h3>
            {selectedRetiroId && !readOnly && (
              <button
                type="button"
                onClick={() => setAddingLocal(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus size={12} />
                Adicionar
              </button>
            )}
          </div>

          {/* Inline add local */}
          {addingLocal && selectedRetiroId && (
            <div className="flex gap-2 items-center rounded-lg border border-blue-300 bg-blue-50 p-2">
              <input
                autoFocus
                type="text"
                placeholder="Nome do local"
                value={newLocalName}
                onChange={e => setNewLocalName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLocal(); if (e.key === 'Escape') setAddingLocal(false); }}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              />
              <input
                type="text"
                placeholder="Área (ha)"
                value={newLocalArea}
                onChange={e => setNewLocalArea(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLocal(); if (e.key === 'Escape') setAddingLocal(false); }}
                className="w-24 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              />
              <button type="button" onClick={handleAddLocal} disabled={saving} className="p-1 text-blue-600 hover:text-blue-700">
                <Check size={16} />
              </button>
              <button type="button" onClick={() => { setAddingLocal(false); setNewLocalName(''); setNewLocalArea(''); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Local list */}
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {locais.map(local => (
              <div
                key={local.id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                {editingLocalId === local.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editLocalName}
                      onChange={e => setEditLocalName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateLocal(local.id); if (e.key === 'Escape') setEditingLocalId(null); }}
                      className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                    />
                    <input
                      type="text"
                      value={editLocalArea}
                      onChange={e => setEditLocalArea(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateLocal(local.id); if (e.key === 'Escape') setEditingLocalId(null); }}
                      placeholder="Área"
                      className="w-20 text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                    />
                    <button type="button" onClick={() => handleUpdateLocal(local.id)} className="p-1 text-blue-600 hover:text-blue-700">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => setEditingLocalId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-800 truncate block">{local.name}</span>
                      {local.area && (
                        <span className="text-xs text-gray-500">{local.area} ha</span>
                      )}
                    </div>
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLocalId(local.id);
                            setEditLocalName(local.name);
                            setEditLocalArea(local.area ?? '');
                          }}
                          className="shrink-0 p-1 text-gray-400 hover:text-blue-600"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLocal(local.id)}
                          className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            {selectedRetiroId && locais.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                Nenhum local cadastrado neste retiro
              </div>
            )}
            {!selectedRetiroId && (
              <div className="text-center py-6 text-sm text-gray-400">
                Selecione um retiro para ver seus locais
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmLocaisTab;
