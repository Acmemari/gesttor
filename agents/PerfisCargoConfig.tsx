/**
 * Tela de configuração de Perfis e Cargos/Funções.
 * Acesso restrito a administradores.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Loader2, Edit2, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  listPerfis,
  listCargosFuncoes,
  createPerfil,
  updatePerfil,
  createCargoFuncao,
  updateCargoFuncao,
  type Perfil,
  type CargoFuncao,
} from '../lib/api/pessoasClient';

interface PerfisCargoConfigProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Sub-componente genérico de lista editável ────────────────────────────────

interface ConfigItem {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  sort_order: number;
}

interface EditableListProps<T extends ConfigItem> {
  title: string;
  items: T[];
  loading: boolean;
  hasDescricao?: boolean;
  onCreate: (nome: string, descricao?: string) => Promise<void>;
  onUpdate: (id: string, data: { nome?: string; descricao?: string | null; ativo?: boolean }) => Promise<void>;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

function EditableList<T extends ConfigItem>({
  title,
  items,
  loading,
  hasDescricao = false,
  onCreate,
  onUpdate,
  onToast,
}: EditableListProps<T>) {
  const [newNome, setNewNome] = useState('');
  const [newDescricao, setNewDescricao] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newNome.trim()) return;
    setAdding(true);
    try {
      await onCreate(newNome.trim(), newDescricao.trim() || undefined);
      setNewNome('');
      setNewDescricao('');
      setShowAdd(false);
      onToast?.('Item criado', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao criar', 'error');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: T) => {
    setEditingId(item.id);
    setEditNome(item.nome);
    setEditDescricao(item.descricao ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNome('');
    setEditDescricao('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editNome.trim()) return;
    setSaving(true);
    try {
      await onUpdate(id, {
        nome: editNome.trim(),
        ...(hasDescricao ? { descricao: editDescricao.trim() || null } : {}),
      });
      setEditingId(null);
      onToast?.('Item atualizado', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao atualizar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (item: T) => {
    try {
      await onUpdate(item.id, { ativo: !item.ativo });
      onToast?.(item.ativo ? 'Item desativado' : 'Item ativado', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <Plus size={14} />
          Novo
        </button>
      </div>

      {/* Formulário de criação */}
      {showAdd && (
        <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100 space-y-2">
          <input
            value={newNome}
            onChange={e => setNewNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Nome..."
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {hasDescricao && (
            <input
              value={newDescricao}
              onChange={e => setNewDescricao(e.target.value)}
              placeholder="Descrição (opcional)..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setNewNome(''); setNewDescricao(''); }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={adding || !newNome.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {adding ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Criar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin text-emerald-600" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">Nenhum item cadastrado.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map(item => (
            <li key={item.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${!item.ativo ? 'opacity-50' : ''}`}>
              {editingId === item.id ? (
                /* Modo edição */
                <div className="flex-1 flex flex-col gap-1.5">
                  <input
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') cancelEdit(); }}
                    autoFocus
                    className="border border-emerald-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {hasDescricao && (
                    <input
                      value={editDescricao}
                      onChange={e => setEditDescricao(e.target.value)}
                      placeholder="Descrição..."
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </div>
              ) : (
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{item.nome}</span>
                  {hasDescricao && item.descricao && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.descricao}</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {editingId === item.id ? (
                  <>
                    <button
                      onClick={() => handleSaveEdit(item.id)}
                      disabled={saving}
                      className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 transition-colors"
                      title="Salvar"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleAtivo(item)}
                      className={`p-1.5 rounded transition-colors ${item.ativo ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                      title={item.ativo ? 'Desativar' : 'Reativar'}
                    >
                      {item.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const PerfisCargoConfig: React.FC<PerfisCargoConfigProps> = ({ onToast }) => {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [cargos, setCargos] = useState<CargoFuncao[]>([]);
  const [loadingPerfis, setLoadingPerfis] = useState(true);
  const [loadingCargos, setLoadingCargos] = useState(true);

  const reloadPerfis = async () => {
    setLoadingPerfis(true);
    try { setPerfis(await listPerfis(true)); } finally { setLoadingPerfis(false); }
  };

  const reloadCargos = async () => {
    setLoadingCargos(true);
    try { setCargos(await listCargosFuncoes(true)); } finally { setLoadingCargos(false); }
  };

  useEffect(() => { reloadPerfis(); reloadCargos(); }, []);

  // ─── Handlers Perfis ──────────────────────────────────────────────────────
  const handleCreatePerfil = async (nome: string, descricao?: string) => {
    await createPerfil({ nome, descricao: descricao || null, sortOrder: perfis.length });
    await reloadPerfis();
  };

  const handleUpdatePerfil = async (id: string, data: { nome?: string; descricao?: string | null; ativo?: boolean }) => {
    await updatePerfil(id, data);
    await reloadPerfis();
  };

  // ─── Handlers Cargos ──────────────────────────────────────────────────────
  const handleCreateCargo = async (nome: string) => {
    await createCargoFuncao({ nome, sortOrder: cargos.length });
    await reloadCargos();
  };

  const handleUpdateCargo = async (id: string, data: { nome?: string; ativo?: boolean }) => {
    await updateCargoFuncao(id, data);
    await reloadCargos();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuração: Perfis e Cargos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie os perfis e cargos/funções disponíveis para associação com pessoas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EditableList
          title="Perfis"
          items={perfis}
          loading={loadingPerfis}
          hasDescricao
          onCreate={handleCreatePerfil}
          onUpdate={handleUpdatePerfil}
          onToast={onToast}
        />

        <EditableList
          title="Cargos / Funções"
          items={cargos}
          loading={loadingCargos}
          hasDescricao={false}
          onCreate={handleCreateCargo}
          onUpdate={handleUpdateCargo}
          onToast={onToast}
        />
      </div>
    </div>
  );
};

export default PerfisCargoConfig;
