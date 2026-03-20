/**
 * Gestão de Empresas de Assessoria.
 * Acesso restrito a administradores.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Loader2, Edit2, Check, X, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';

interface EmpAss {
  id: string;
  nome: string;
  analistas: { id: string; nome: string }[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

interface Analyst {
  id: string;
  name: string;
  email: string;
}

interface EmpAssManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
}

const INITIAL_FORM = { nome: '' };

const EmpAssManagement: React.FC<EmpAssManagementProps> = ({ onToast, onBack }) => {
  const [items, setItems] = useState<EmpAss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const [allAnalysts, setAllAnalysts] = useState<Analyst[]>([]);
  const [selectedAnalystIds, setSelectedAnalystIds] = useState<string[]>([]);
  const [loadingAnalysts, setLoadingAnalysts] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/emp-ass', { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar');
      setItems(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function fetchAnalysts(currentItems: EmpAss[], currentEditingId: string | null, preselect: string[]) {
    setLoadingAnalysts(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin?action=list-analysts', { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar analistas');
      const analysts: Analyst[] = json.data ?? json;
      setAllAnalysts(analysts);

      // Resolve preselected: match by id first, fallback by name (for legacy data)
      if (preselect.length > 0) {
        const resolvedIds = preselect
          .map(idOrName => analysts.find(a => a.id === idOrName || a.name === idOrName)?.id)
          .filter(Boolean) as string[];
        setSelectedAnalystIds(resolvedIds);
      }
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar analistas', 'error');
    } finally {
      setLoadingAnalysts(false);
    }
  }

  function openNew() {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setSelectedAnalystIds([]);
    setShowForm(true);
    void fetchAnalysts(items, null, []);
  }

  function openEdit(item: EmpAss) {
    setEditingId(item.id);
    setFormData({ nome: item.nome });
    setSelectedAnalystIds([]);
    setShowForm(true);
    // Pass existing analyst ids/names for preselection after fetch
    const existingKeys = item.analistas.map(a => a.id || a.nome);
    void fetchAnalysts(items, item.id, existingKeys);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setSelectedAnalystIds([]);
    setAllAnalysts([]);
  }

  function toggleAnalyst(id: string) {
    setSelectedAnalystIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // IDs taken by OTHER companies (not the one being edited)
  const takenAnalystIds = new Set(
    items
      .filter(i => i.id !== editingId)
      .flatMap(i => i.analistas.map(a => a.id))
      .filter(Boolean)
  );

  async function handleSave() {
    if (!formData.nome.trim()) {
      onToast?.('Nome da empresa é obrigatório', 'error');
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const analistas = selectedAnalystIds.map(id => {
        const u = allAnalysts.find(a => a.id === id)!;
        return { id: u.id, nome: u.name };
      });

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/emp-ass?id=${editingId}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: formData.nome, analistas }),
        });
      } else {
        res = await fetch('/api/emp-ass', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: formData.nome, analistas }),
        });
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar');
      onToast?.(editingId ? 'Empresa atualizada' : 'Empresa criada', 'success');
      closeForm();
      await load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/emp-ass?id=${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao desativar');
      onToast?.('Empresa desativada', 'success');
      await load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao desativar', 'error');
    }
  }

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <p className="text-[0.6rem] font-medium text-gray-400 uppercase tracking-wider">cadastro de</p>
          <h1 className="text-2xl font-bold text-gray-900">Empresas de Assessoria</h1>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Plus size={16} />
          Nova Empresa
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form inline */}
      {showForm && (
        <div className="mb-6 p-6 border border-gray-200 rounded-2xl bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {editingId ? 'Editar Empresa' : 'Nova Empresa de Assessoria'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nome da Empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.nome}
                onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Assessoria Rural Brasil"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Analistas Vinculados
              </label>
              <div className="border border-gray-300 rounded-lg bg-white overflow-hidden">
                {loadingAnalysts ? (
                  <div className="flex items-center justify-center py-6 text-gray-400">
                    <Loader2 size={16} className="animate-spin mr-2" />
                    <span className="text-xs">Carregando analistas…</span>
                  </div>
                ) : allAnalysts.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-gray-400 text-center">
                    Nenhum analista cadastrado no sistema
                  </p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {allAnalysts.map(analyst => {
                      const isTaken = takenAnalystIds.has(analyst.id);
                      const isSelected = selectedAnalystIds.includes(analyst.id);
                      return (
                        <li
                          key={analyst.id}
                          className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                            isTaken
                              ? 'opacity-50 cursor-not-allowed bg-gray-50'
                              : 'cursor-pointer hover:bg-gray-50'
                          }`}
                          onClick={() => !isTaken && !saving && toggleAnalyst(analyst.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isTaken || saving}
                            onChange={() => !isTaken && !saving && toggleAnalyst(analyst.id)}
                            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{analyst.name}</p>
                            <p className="text-xs text-gray-400 truncate">{analyst.email}</p>
                          </div>
                          {isTaken && (
                            <span className="flex-shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              já vinculado
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {selectedAnalystIds.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {selectedAnalystIds.length} analista{selectedAnalystIds.length !== 1 ? 's' : ''} selecionado{selectedAnalystIds.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <X size={14} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-gray-500 text-sm">Nenhuma empresa de assessoria cadastrada.</p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 text-sm text-gray-700 underline hover:no-underline"
          >
            Cadastrar primeira empresa
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.nome}</p>
                {item.analistas && item.analistas.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    Analistas: {item.analistas.map(a => a.nome).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  type="button"
                  title="Editar"
                  onClick={() => openEdit(item)}
                  className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  type="button"
                  title={item.ativo ? 'Desativar' : 'Ativo'}
                  onClick={() => handleDeactivate(item.id)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  {item.ativo ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmpAssManagement;
