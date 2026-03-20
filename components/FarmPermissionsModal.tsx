import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Users,
  Plus,
  Trash2,
  ChevronRight,
  Home,
  FileText,
  Building2,
  FolderTree,
  LayoutList,
  Package,
  ListChecks,
  SquareCheck,
  LayoutDashboard,
  Columns,
  Paperclip,
  FolderOpen,
  Calculator,
  EyeOff,
  Eye,
  Pencil,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import {
  PERMISSION_KEYS,
  DEFAULT_PERMISSIONS,
  PERMISSION_CATEGORY_LABELS,
  type PermissionLevel,
  type PermissionKeyDef,
} from '../lib/permissions/permissionKeys';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  FileText,
  Trash2,
  Building2,
  Users,
  FolderTree,
  LayoutList,
  Package,
  ListChecks,
  SquareCheck,
  LayoutDashboard,
  Columns,
  Paperclip,
  FolderOpen,
  Calculator,
};

interface AnalystOption {
  id: string;
  name: string;
  email: string;
}

function PermissionSummary({ editedPermissions }: { editedPermissions: Record<string, PermissionLevel> }) {
  const hidden = PERMISSION_KEYS.filter(pk => editedPermissions[pk.key] === 'hidden').length;
  const view = PERMISSION_KEYS.filter(pk => editedPermissions[pk.key] === 'view').length;
  const edit = PERMISSION_KEYS.filter(pk => editedPermissions[pk.key] === 'edit').length;
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
        title="Não aparecerá no sistema"
      >
        <EyeOff size={12} />
        {hidden} ocultos
      </span>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
        title="Somente visualização"
      >
        <Eye size={12} />
        {view} somente ver
      </span>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
        title="Ver e editar"
      >
        <Pencil size={12} />
        {edit} editar
      </span>
    </div>
  );
}

const PermissionCategorySection: React.FC<{
  category: string;
  label: string;
  items: PermissionKeyDef[];
  editedPermissions: Record<string, PermissionLevel>;
  setPermissionFor: (key: string, level: PermissionLevel) => void;
  iconMap: Record<string, LucideIcon>;
}> = ({ category, label, items, editedPermissions, setPermissionFor, iconMap }) => {
  return (
    <section>
      <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide mb-2 pb-1 border-b border-ai-border">
        {label}
      </h4>
      <ul className="space-y-2">
        {items.map(pk => {
          const Icon = iconMap[pk.icon] ?? FileText;
          const current = editedPermissions[pk.key] ?? 'view';
          return (
            <li
              key={pk.key}
              className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 px-3 rounded-lg bg-ai-surface2/50 hover:bg-ai-surface2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-ai-subtext shrink-0" />
                  <span className="text-sm font-medium text-ai-text">{pk.label}</span>
                </div>
                <p className="text-xs text-ai-subtext mt-0.5 ml-6">{pk.location}</p>
              </div>
              <div className="flex shrink-0 gap-1 ml-6 sm:ml-0">
                <button
                  type="button"
                  onClick={() => setPermissionFor(pk.key, 'hidden')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    current === 'hidden'
                      ? 'bg-red-200 text-red-800 border border-red-300'
                      : 'bg-white text-ai-subtext border border-ai-border hover:bg-red-50 hover:text-red-700'
                  }`}
                  title="Não aparecerá"
                >
                  <EyeOff size={12} />
                  Oculto
                </button>
                <button
                  type="button"
                  onClick={() => setPermissionFor(pk.key, 'view')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    current === 'view'
                      ? 'bg-amber-200 text-amber-800 border border-amber-300'
                      : 'bg-white text-ai-subtext border border-ai-border hover:bg-amber-50 hover:text-amber-700'
                  }`}
                  title="Apenas visualizar"
                >
                  <Eye size={12} />
                  Ver
                </button>
                <button
                  type="button"
                  onClick={() => setPermissionFor(pk.key, 'edit')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    current === 'edit'
                      ? 'bg-green-200 text-green-800 border border-green-300'
                      : 'bg-white text-ai-subtext border border-ai-border hover:bg-green-50 hover:text-green-700'
                  }`}
                  title="Ver e editar"
                >
                  <Pencil size={12} />
                  Editar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

interface AnalystWithAccess {
  id: string;
  analyst_id: string;
  organization_id: string;
  is_responsible: boolean;
  permissions: Record<string, string>;
  analyst_name: string | null;
  analyst_email: string | null;
}

interface FarmPermissionsModalProps {
  open: boolean;
  onClose: () => void;
  farmId: string;
  farmName: string;
  orgId: string;
  isCurrentUserResponsible: boolean;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function FarmPermissionsModal({
  open,
  onClose,
  farmName,
  orgId,
  isCurrentUserResponsible,
  onToast,
}: FarmPermissionsModalProps) {
  const [analystsToAdd, setAnalystsToAdd] = useState<AnalystOption[]>([]);
  const [selectedAnalystToAdd, setSelectedAnalystToAdd] = useState('');
  const [analystsWithAccess, setAnalystsWithAccess] = useState<AnalystWithAccess[]>([]);
  const [selectedAnalystId, setSelectedAnalystId] = useState<string | null>(null);
  const [editedPermissions, setEditedPermissions] = useState<Record<string, PermissionLevel>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAnalystsToAdd = useCallback(async (signal?: AbortSignal) => {
    if (!orgId) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/organizations?action=available-analysts&organizationId=${encodeURIComponent(orgId)}`, { headers, signal });
    const json = await res.json() as { ok: boolean; data?: AnalystOption[] };
    setAnalystsToAdd(json.data ?? []);
  }, [orgId]);

  const loadAnalystsWithAccess = useCallback(async (signal?: AbortSignal) => {
    if (!orgId) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/organizations?action=analysts&organizationId=${encodeURIComponent(orgId)}`, { headers, signal });
    const json = await res.json() as { ok: boolean; data?: AnalystWithAccess[] };
    setAnalystsWithAccess(json.data ?? []);
  }, [orgId]);

  useEffect(() => {
    if (!open || !orgId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setLoadError(null);
    Promise.all([loadAnalystsToAdd(controller.signal), loadAnalystsWithAccess(controller.signal)])
      .catch(err => {
        const isAbort = (err as Error).name === 'AbortError';
        console.error('[FarmPermissionsModal] load error:', err);
        setLoadError(isAbort
          ? 'Tempo limite excedido. Verifique a conexão com o banco de dados.'
          : 'Não foi possível carregar os analistas. Tente novamente.');
      })
      .finally(() => { clearTimeout(timeout); setLoading(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, orgId, loadAnalystsToAdd, loadAnalystsWithAccess]);

  useEffect(() => {
    if (selectedAnalystId) {
      const row = analystsWithAccess.find(a => a.analyst_id === selectedAnalystId);
      const perms = (row?.permissions || {}) as Record<string, string>;
      const merged = { ...DEFAULT_PERMISSIONS };
      for (const [k, v] of Object.entries(perms)) {
        if (v === 'hidden' || v === 'view' || v === 'edit') merged[k] = v as PermissionLevel;
      }
      setEditedPermissions(merged);
    } else {
      setEditedPermissions({});
    }
  }, [selectedAnalystId, analystsWithAccess]);

  const handleAddAnalyst = async () => {
    if (!selectedAnalystToAdd || !isCurrentUserResponsible || !orgId) return;
    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'add-analyst', organizationId: orgId, analystId: selectedAnalystToAdd, permissions: DEFAULT_PERMISSIONS }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao adicionar analista');
      onToast?.('Analista adicionado com sucesso.', 'success');
      setSelectedAnalystToAdd('');
      await Promise.all([loadAnalystsToAdd(), loadAnalystsWithAccess()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar analista';
      onToast?.(msg, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAnalyst = async (analystLinkId: string, analystId: string) => {
    const row = analystsWithAccess.find(a => a.analyst_id === analystId);
    if (!row || row.is_responsible || !isCurrentUserResponsible) return;
    if (!window.confirm('Remover este analista da organização?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/organizations?action=remove-analyst&id=${encodeURIComponent(analystLinkId)}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao remover analista');
      onToast?.('Analista removido da organização.', 'success');
      if (selectedAnalystId === analystId) setSelectedAnalystId(null);
      await Promise.all([loadAnalystsToAdd(), loadAnalystsWithAccess()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover analista';
      onToast?.(msg, 'error');
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedAnalystId || !isCurrentUserResponsible) return;
    setSaving(true);
    try {
      const row = analystsWithAccess.find(a => a.analyst_id === selectedAnalystId);
      if (!row) return;
      const headers = await getAuthHeaders();
      const res = await fetch('/api/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'update-analyst-permissions', id: row.id, permissions: editedPermissions }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar permissões');
      onToast?.('Permissões atualizadas.', 'success');
      await loadAnalystsWithAccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar permissões';
      onToast?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const setPermissionFor = (key: string, level: PermissionLevel) => {
    setEditedPermissions(prev => ({ ...prev, [key]: level }));
  };

  if (!open) return null;

  const availableToAdd = analystsToAdd.filter(a => !analystsWithAccess.some(r => r.analyst_id === a.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-ai-border">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-ai-accent" />
            <h2 className="text-lg font-semibold text-ai-text">Analistas da organização — {farmName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ai-subtext hover:text-ai-text hover:bg-ai-surface2 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <p className="text-sm text-ai-subtext">Carregando...</p>
          ) : loadError ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>
          ) : (
            <>
              {isCurrentUserResponsible && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ai-text">Adicionar analista à organização</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedAnalystToAdd}
                      onChange={e => setSelectedAnalystToAdd(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-ai-border rounded-lg bg-white"
                    >
                      <option value="">Selecione um analista</option>
                      {availableToAdd.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.email})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddAnalyst}
                      disabled={!selectedAnalystToAdd || adding}
                      className="px-3 py-2 bg-ai-accent text-white rounded-lg text-sm font-medium hover:bg-ai-accentHover disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={16} />
                      Adicionar
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">Analistas com acesso à organização</label>
                <ul className="space-y-2">
                  {analystsWithAccess.map(row => (
                    <li
                      key={row.id}
                      className={`flex items-center justify-between p-2 rounded-lg border ${
                        selectedAnalystId === row.analyst_id
                          ? 'border-ai-accent bg-ai-accent/5'
                          : 'border-ai-border hover:bg-ai-surface2'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAnalystId(selectedAnalystId === row.analyst_id ? null : row.analyst_id)
                        }
                        className="flex-1 flex items-center justify-between text-left"
                      >
                        <span className="text-sm font-medium text-ai-text">
                          {row.analyst_name || row.analyst_email || row.analyst_id}
                          {row.is_responsible && <span className="ml-2 text-xs text-ai-subtext">(responsável)</span>}
                        </span>
                        <ChevronRight
                          size={16}
                          className={`text-ai-subtext transition-transform ${
                            selectedAnalystId === row.analyst_id ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                      {!row.is_responsible && isCurrentUserResponsible && (
                        <button
                          onClick={() => handleRemoveAnalyst(row.id, row.analyst_id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {selectedAnalystId && (
                <div className="border border-ai-border rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-ai-text">Permissões por tela</h3>
                  <PermissionSummary editedPermissions={editedPermissions} />
                  <div className="space-y-4">
                    {(['cadastros', 'gerenciamento', 'documentos', 'assistentes'] as const).map(cat => {
                      const items = PERMISSION_KEYS.filter(pk => pk.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <PermissionCategorySection
                          key={cat}
                          category={cat}
                          label={PERMISSION_CATEGORY_LABELS[cat]}
                          items={items}
                          editedPermissions={editedPermissions}
                          setPermissionFor={setPermissionFor}
                          iconMap={ICON_MAP}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-ai-subtext">Entidades sem definição explícita usam valor padrão.</p>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSavePermissions}
                      disabled={saving}
                      className="px-4 py-2 bg-ai-accent text-white rounded-lg text-sm font-medium hover:bg-ai-accentHover disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar permissões'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
