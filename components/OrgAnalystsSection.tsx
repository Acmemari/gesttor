import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  EyeOff,
  Eye,
  Pencil,
  ShieldCheck,
  FileText,
  Home,
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

const ALL_EDIT_PERMISSIONS: Record<string, PermissionLevel> = Object.fromEntries(
  PERMISSION_KEYS.map(pk => [pk.key, 'edit' as PermissionLevel]),
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OrgAnalystRow {
  id: string;
  analyst_id: string;
  organization_id: string;
  is_responsible: boolean;
  permissions: Record<string, string>;
  analyst_name: string | null;
  analyst_email: string | null;
}

interface AnalystOption {
  id: string;
  name: string;
  email: string;
}

interface OrgAnalystsSectionProps {
  orgId: string;
  canManage: boolean; // primary analyst or admin
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PermissionBadge({ permissions }: { permissions: Record<string, string> }) {
  const total = PERMISSION_KEYS.length;
  const edit = PERMISSION_KEYS.filter(pk => permissions[pk.key] === 'edit').length;
  const hidden = PERMISSION_KEYS.filter(pk => permissions[pk.key] === 'hidden').length;
  const view = total - edit - hidden;
  return (
    <div className="flex gap-1 flex-wrap">
      {edit > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
          <Pencil size={10} />
          {edit} editar
        </span>
      )}
      {view > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
          <Eye size={10} />
          {view} ver
        </span>
      )}
      {hidden > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
          <EyeOff size={10} />
          {hidden} oculto
        </span>
      )}
    </div>
  );
}

function PermissionRow({
  pk,
  current,
  onChange,
}: {
  pk: PermissionKeyDef;
  current: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
}) {
  const Icon = ICON_MAP[pk.icon] ?? FileText;
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 px-3 rounded-lg bg-ai-surface2/50 hover:bg-ai-surface2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-ai-subtext shrink-0" />
          <span className="text-xs font-medium text-ai-text">{pk.label}</span>
        </div>
        <p className="text-[10px] text-ai-subtext mt-0.5 ml-[22px]">{pk.location}</p>
      </div>
      <div className="flex shrink-0 gap-1 ml-[22px] sm:ml-0">
        {(['hidden', 'view', 'edit'] as PermissionLevel[]).map(level => {
          const active = current === level;
          const styles: Record<PermissionLevel, { base: string; active: string; hover: string; icon: React.ReactNode; label: string }> = {
            hidden: {
              base: 'bg-white text-ai-subtext border border-ai-border',
              active: 'bg-red-200 text-red-800 border border-red-300',
              hover: 'hover:bg-red-50 hover:text-red-700',
              icon: <EyeOff size={10} />,
              label: 'Oculto',
            },
            view: {
              base: 'bg-white text-ai-subtext border border-ai-border',
              active: 'bg-amber-200 text-amber-800 border border-amber-300',
              hover: 'hover:bg-amber-50 hover:text-amber-700',
              icon: <Eye size={10} />,
              label: 'Ver',
            },
            edit: {
              base: 'bg-white text-ai-subtext border border-ai-border',
              active: 'bg-green-200 text-green-800 border border-green-300',
              hover: 'hover:bg-green-50 hover:text-green-700',
              icon: <Pencil size={10} />,
              label: 'Editar',
            },
          };
          const s = styles[level];
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${active ? s.active : `${s.base} ${s.hover}`}`}
            >
              {s.icon}
              {s.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const OrgAnalystsSection: React.FC<OrgAnalystsSectionProps> = ({ orgId, canManage, onToast }) => {
  const [analysts, setAnalysts] = useState<OrgAnalystRow[]>([]);
  const [available, setAvailable] = useState<AnalystOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedPerms, setEditedPerms] = useState<Record<string, PermissionLevel>>({});
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [analystsRes, availableRes] = await Promise.all([
        fetch(`/api/organizations?action=analysts&organizationId=${encodeURIComponent(orgId)}`, { headers }),
        fetch(`/api/organizations?action=available-analysts&organizationId=${encodeURIComponent(orgId)}`, { headers }),
      ]);
      const [analystsJson, availableJson] = await Promise.all([
        analystsRes.json() as Promise<{ ok: boolean; data?: OrgAnalystRow[] }>,
        availableRes.json() as Promise<{ ok: boolean; data?: AnalystOption[] }>,
      ]);
      setAnalysts(analystsJson.data ?? []);
      setAvailable(availableJson.data ?? []);
    } catch (err) {
      console.error('[OrgAnalystsSection] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Sync permissions editor when expanding an analyst
  useEffect(() => {
    if (!expandedId) {
      setEditedPerms({});
      return;
    }
    const row = analysts.find(a => a.analyst_id === expandedId);
    const perms = row?.permissions ?? {};
    const merged = { ...DEFAULT_PERMISSIONS };
    for (const [k, v] of Object.entries(perms)) {
      if (v === 'hidden' || v === 'view' || v === 'edit') merged[k] = v as PermissionLevel;
    }
    setEditedPerms(merged);
  }, [expandedId, analysts]);

  const handleAdd = async () => {
    if (!selectedToAdd || !canManage) return;
    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'add-analyst', organizationId: orgId, analystId: selectedToAdd, permissions: ALL_EDIT_PERMISSIONS }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao adicionar analista');
      onToast?.('Analista adicionado com sucesso.', 'success');
      setSelectedToAdd('');
      await loadData();
    } catch (err: unknown) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao adicionar analista', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (row: OrgAnalystRow) => {
    if (!canManage || row.is_responsible) return;
    if (!window.confirm(`Remover ${row.analyst_name ?? row.analyst_email ?? 'este analista'} da organização?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/organizations?action=remove-analyst&id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao remover analista');
      onToast?.('Analista removido da organização.', 'success');
      if (expandedId === row.analyst_id) setExpandedId(null);
      await loadData();
    } catch (err: unknown) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao remover analista', 'error');
    }
  };

  const handleSavePerms = async () => {
    if (!expandedId || !canManage) return;
    const row = analysts.find(a => a.analyst_id === expandedId);
    if (!row) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'update-analyst-permissions', id: row.id, permissions: editedPerms }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar permissões');
      onToast?.('Permissões atualizadas.', 'success');
      await loadData();
      setExpandedId(null);
    } catch (err: unknown) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao salvar permissões', 'error');
    } finally {
      setSaving(false);
    }
  };

  const availableToAdd = available.filter(a => !analysts.some(r => r.analyst_id === a.id));

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Users size={16} className="text-ai-subtext" />
        <label className="block text-sm font-medium text-ai-text">Analistas Secundários</label>
      </div>
      <p className="text-xs text-ai-subtext mb-3">
        Analistas adicionais com acesso a esta organização e suas fazendas
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-ai-subtext">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs">Carregando...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Adicionar analista */}
          {canManage && (
            <div className="flex gap-2">
              <select
                value={selectedToAdd}
                onChange={e => setSelectedToAdd(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-ai-border rounded-md bg-ai-surface2 text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
              >
                <option value="">
                  {availableToAdd.length === 0 ? 'Nenhum analista disponível' : 'Selecione um analista para adicionar'}
                </option>
                {availableToAdd.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!selectedToAdd || adding || availableToAdd.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-ai-accent text-white rounded-md text-sm font-medium hover:bg-ai-accent/90 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Adicionar
              </button>
            </div>
          )}

          {/* Lista de analistas vinculados */}
          {analysts.length === 0 ? (
            <div className="border border-dashed border-ai-border rounded-md p-4 text-center">
              <Users size={24} className="text-ai-subtext mx-auto mb-1 opacity-50" />
              <p className="text-xs text-ai-subtext">Nenhum analista secundário vinculado</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {analysts.map(row => {
                const displayName = row.analyst_name ?? row.analyst_email ?? row.analyst_id;
                const isExpanded = expandedId === row.analyst_id;

                return (
                  <li key={row.id} className="rounded-lg border border-ai-border overflow-hidden">
                    {/* Cabeçalho do analista */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : row.analyst_id)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-ai-subtext shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="text-ai-subtext shrink-0" />
                        )}
                        <div className="w-7 h-7 rounded-full bg-ai-accent/15 text-ai-accent flex items-center justify-center text-xs font-bold shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-ai-text truncate">{displayName}</span>
                            {row.is_responsible && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">
                                <ShieldCheck size={10} />
                                responsável
                              </span>
                            )}
                          </div>
                          {row.analyst_name && row.analyst_email && (
                            <p className="text-[11px] text-ai-subtext truncate">{row.analyst_email}</p>
                          )}
                        </div>
                        <div className="hidden sm:block shrink-0">
                          <PermissionBadge permissions={row.permissions} />
                        </div>
                      </button>

                      {canManage && !row.is_responsible && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(row)}
                          className="p-1.5 text-ai-subtext hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
                          title="Remover da organização"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Painel de permissões expandido */}
                    {isExpanded && (
                      <div className="border-t border-ai-border bg-ai-surface/40 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ai-text">Permissões por tela</span>
                          <PermissionBadge permissions={editedPerms} />
                        </div>

                        {canManage ? (
                          <>
                            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                              {(Object.keys(PERMISSION_CATEGORY_LABELS) as (keyof typeof PERMISSION_CATEGORY_LABELS)[]).map(cat => {
                                const items = PERMISSION_KEYS.filter(pk => pk.category === cat);
                                if (items.length === 0) return null;
                                return (
                                  <section key={cat}>
                                    <h4 className="text-[10px] font-semibold text-ai-subtext uppercase tracking-wide mb-1.5 pb-1 border-b border-ai-border">
                                      {PERMISSION_CATEGORY_LABELS[cat]}
                                    </h4>
                                    <ul className="space-y-1">
                                      {items.map(pk => (
                                        <PermissionRow
                                          key={pk.key}
                                          pk={pk}
                                          current={(editedPerms[pk.key] ?? 'view') as PermissionLevel}
                                          onChange={level => setEditedPerms(prev => ({ ...prev, [pk.key]: level }))}
                                        />
                                      ))}
                                    </ul>
                                  </section>
                                );
                              })}
                            </div>
                            <div className="flex justify-end gap-2 pt-1 border-t border-ai-border">
                              <button
                                type="button"
                                onClick={() => setExpandedId(null)}
                                className="px-3 py-1.5 text-sm text-ai-subtext hover:text-ai-text border border-ai-border rounded-md transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSavePerms()}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 disabled:opacity-50 transition-colors"
                              >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                                {saving ? 'Salvando...' : 'Salvar permissões'}
                              </button>
                            </div>
                          </>
                        ) : (
                          // Leitura apenas (analista não é o principal)
                          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                            {(Object.keys(PERMISSION_CATEGORY_LABELS) as (keyof typeof PERMISSION_CATEGORY_LABELS)[]).map(cat => {
                              const items = PERMISSION_KEYS.filter(pk => pk.category === cat);
                              if (items.length === 0) return null;
                              return (
                                <section key={cat}>
                                  <h4 className="text-[10px] font-semibold text-ai-subtext uppercase tracking-wide mb-1">
                                    {PERMISSION_CATEGORY_LABELS[cat]}
                                  </h4>
                                  <ul className="space-y-0.5">
                                    {items.map(pk => {
                                      const level = (editedPerms[pk.key] ?? 'view') as PermissionLevel;
                                      const Icon = ICON_MAP[pk.icon] ?? FileText;
                                      return (
                                        <li key={pk.key} className="flex items-center gap-2 py-1 px-2 rounded">
                                          <Icon size={12} className="text-ai-subtext shrink-0" />
                                          <span className="text-xs text-ai-text flex-1">{pk.label}</span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                            level === 'edit' ? 'bg-green-100 text-green-800' :
                                            level === 'hidden' ? 'bg-red-100 text-red-800' :
                                            'bg-amber-100 text-amber-800'
                                          }`}>
                                            {level === 'edit' ? 'Editar' : level === 'hidden' ? 'Oculto' : 'Ver'}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </section>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default OrgAnalystsSection;
