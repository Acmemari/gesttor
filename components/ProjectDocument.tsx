import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Plus, Trash2, FolderOpen, Package, Layers, CheckSquare } from 'lucide-react';
import { loadFullEAPTree, type WBSNode } from '../lib/eapTree';
import { createProject, updateProject, deleteProject, type ProjectPayload, type ProjectRow } from '../lib/projects';
import { createDelivery, deleteDelivery, updateDelivery } from '../lib/deliveries';
import { createTask, deleteTask, updateTask, ensureDefaultMilestone, deleteInitiative, type InitiativeTaskRow, type KanbanStatus } from '../lib/initiatives';
import { fetchPeople, type Person } from '../lib/people';
import { sanitizeText } from '../lib/inputSanitizer';
import * as initiativesApi from '../lib/api/initiativesClient';
import * as deliveriesApi from '../lib/api/deliveriesClient';
import { InlineText, InlineTextarea, InlineDate, InlineSelect, InlineNumber } from './eap/InlineField';
import { getCurrentIsoDate } from './eap';

const DEBOUNCE_MS = 600;

function addDaysIso(iso: string, days: number): string {
  try {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const dt = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setDate(dt.getDate() + (Number.isFinite(days) ? days : 0));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

interface ProjectDocumentProps {
  effectiveUserId: string;
  selectedOrganizationId?: string | null;
  selectedFarmId?: string | null;
  /** Quando true, desabilita mutações (modo visualização para cliente). */
  readonly?: boolean;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const STATUS_OPTIONS = [
  { value: 'Não Iniciado', label: 'Não Iniciado' },
  { value: 'Em Andamento', label: 'Em Andamento' },
  { value: 'Suspenso', label: 'Suspenso' },
  { value: 'Concluído', label: 'Concluído' },
  { value: 'Atrasado', label: 'Atrasado' },
];

const KANBAN_OPTIONS: { value: KanbanStatus; label: string }[] = [
  { value: 'A Fazer', label: 'A Fazer' },
  { value: 'Andamento', label: 'Andamento' },
  { value: 'Pausado', label: 'Pausado' },
  { value: 'Concluído', label: 'Concluído' },
];

const ProjectDocument: React.FC<ProjectDocumentProps> = ({
  effectiveUserId,
  selectedOrganizationId,
  selectedFarmId,
  readonly = false,
  onToast,
}) => {
  const mountedRef = useRef(true);
  const toastRef = useRef(onToast);
  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toast = useCallback((msg: string, type: 'success' | 'error' | 'warning' | 'info') => {
    if (mountedRef.current) toastRef.current?.(msg, type);
  }, []);

  const [tree, setTree] = useState<WBSNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const treeRef = useRef<WBSNode[]>([]);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const loadTree = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const t = await loadFullEAPTree(effectiveUserId, {
        organizationId: selectedOrganizationId ?? undefined,
        farmId: selectedFarmId ?? undefined,
        clientMode: readonly,
      });
      if (!mountedRef.current) return;
      setTree(t);
      if (t.length > 0 && !selectedProgramId) {
        setSelectedProgramId(t[0].data.rawId);
      } else if (t.length > 0 && selectedProgramId && !t.some(n => n.data.rawId === selectedProgramId)) {
        setSelectedProgramId(t[0].data.rawId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar.';
      if (mountedRef.current) {
        setError(msg);
        toast(msg, 'error');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [effectiveUserId, selectedOrganizationId, selectedFarmId, readonly, selectedProgramId, toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    let active = true;
    fetchPeople(effectiveUserId, selectedFarmId ? { farmId: selectedFarmId, sharedScope: true } : undefined)
      .then(rows => {
        if (active && mountedRef.current) setPeople(rows);
      })
      .catch(() => {
        if (active && mountedRef.current) setPeople([]);
      });
    return () => {
      active = false;
    };
  }, [effectiveUserId, selectedFarmId]);

  const scheduleSave = useCallback(
    (key: string, fn: () => Promise<void>) => {
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);
      debounceRefs.current[key] = setTimeout(async () => {
        delete debounceRefs.current[key];
        if (!mountedRef.current) return;
        setSaving(true);
        try {
          await fn();
          if (mountedRef.current) await loadTree();
          if (mountedRef.current) toast('Salvo.', 'success');
        } catch (err) {
          if (mountedRef.current) toast(err instanceof Error ? err.message : 'Erro ao salvar.', 'error');
        } finally {
          if (mountedRef.current) setSaving(false);
        }
      }, DEBOUNCE_MS);
    },
    [loadTree, toast],
  );

  const selectedProgram = useMemo(() => tree.find(n => n.data.rawId === selectedProgramId), [tree, selectedProgramId]);

  const handleProgramChange = useCallback(
    (field: keyof ProjectPayload, value: string | string[] | { name: string; activity: string }[] | null) => {
      if (readonly) return;
      if (!selectedProgram?.data.project) return;
      const p = selectedProgram.data.project;
      const payload: ProjectPayload = {
        name: p.name,
        description: p.description ?? undefined,
        organization_id: selectedOrganizationId ?? undefined,
        start_date: p.start_date ?? undefined,
        end_date: p.end_date ?? undefined,
        transformations_achievements: p.transformations_achievements ?? undefined,
        success_evidence: p.success_evidence,
        stakeholder_matrix: p.stakeholder_matrix,
      };
      if (field === 'success_evidence' && Array.isArray(value)) {
        payload.success_evidence = value as string[];
      } else if (field === 'stakeholder_matrix' && Array.isArray(value)) {
        payload.stakeholder_matrix = value as { name: string; activity: string }[];
      } else if (typeof value === 'string') {
        (payload as unknown as Record<string, unknown>)[field] = value || null;
      }
      scheduleSave(`program-${p.id}`, async () => {
        await updateProject(p.id, payload);
      });
      setTree(prev =>
        prev.map(n => {
          if (n.data.rawId !== p.id) return n;
          const proj = n.data.project!;
          const updated = { ...proj };
          if (field === 'success_evidence' && Array.isArray(value)) updated.success_evidence = value as string[];
          else if (field === 'stakeholder_matrix' && Array.isArray(value))
            updated.stakeholder_matrix = value as { name: string; activity: string }[];
          else if (typeof value === 'string') (updated as Record<string, unknown>)[field] = value || null;
          return { ...n, data: { ...n.data, project: updated } };
        }),
      );
    },
    [readonly, selectedProgram, selectedOrganizationId, scheduleSave],
  );

  const handleDeliveryChange = useCallback(
    (deliveryId: string, field: string, value: string | null) => {
      if (readonly) return;
      scheduleSave(`delivery-${deliveryId}`, async () => {
        const payload: Record<string, unknown> = { [field]: value };
        if (field === 'end_date') payload.due_date = value;
        const r = await deliveriesApi.updateDelivery(deliveryId, payload);
        if (!r.ok) throw new Error(r.error);
      });
      setTree(prev =>
        prev.map(prog => ({
          ...prog,
          children: prog.children.map(d => {
            if (d.data.rawId !== deliveryId) return d;
            const del = d.data.delivery!;
            const updated = { ...del, [field]: value };
            if (field === 'end_date') (updated as Record<string, unknown>).due_date = value;
            return { ...d, data: { ...d.data, delivery: updated } };
          }),
        })),
      );
    },
    [readonly, scheduleSave],
  );

  const handleActivityChange = useCallback(
    (initiativeId: string, field: string, value: string | null) => {
      if (readonly) return;
      scheduleSave(`activity-${initiativeId}`, async () => {
        let leaderVal: string | null = value;
        if (field === 'leader_id' && value) {
          const person = people.find(p => p.id === value);
          leaderVal = person ? person.preferred_name?.trim() || person.full_name : value;
        }
        const payload: Record<string, unknown> = field === 'leader_id' ? { leader: leaderVal } : { [field]: value };
        const r = await initiativesApi.updateInitiative(initiativeId, payload as Parameters<typeof initiativesApi.updateInitiative>[1]);
        if (!r.ok) throw new Error(r.error);
      });
      setTree(prev =>
        prev.map(prog => ({
          ...prog,
          children: prog.children.map(del => ({
            ...del,
            children: del.children.map(act => {
              if (act.data.rawId !== initiativeId) return act;
              const init = act.data.initiative!;
              const updated = { ...init };
              if (field === 'leader_id') {
                const person = people.find(p => p.id === value);
                updated.leader = person ? person.preferred_name?.trim() || person.full_name : value;
              } else {
                (updated as Record<string, unknown>)[field] = value;
              }
              return { ...act, data: { ...act.data, initiative: updated } };
            }),
          })),
        })),
      );
    },
    [readonly, scheduleSave, people],
  );

  const findTaskInTree = useCallback((taskId: string): InitiativeTaskRow | null => {
    for (const prog of treeRef.current) {
      for (const del of prog.children) {
        for (const act of del.children) {
          for (const t of act.children) {
            if (t.data.rawId === taskId) return t.data.task ?? null;
          }
        }
      }
    }
    return null;
  }, []);

  const handleTaskChange = useCallback(
    (taskId: string, field: string, value: string | number | boolean | null) => {
      if (readonly) return;
      scheduleSave(`task-${taskId}`, async () => {
        const payload: Record<string, unknown> = { [field]: value };
        const task = findTaskInTree(taskId);
        if (field === 'activity_date' && typeof value === 'string' && task) {
          const dur = Math.max(1, task.duration_days ?? 1);
          payload.due_date = addDaysIso(value, dur - 1);
        }
        if (field === 'duration_days' && task) {
          const actDate = task.activity_date || task.due_date;
          if (actDate) payload.due_date = addDaysIso(actDate, Math.max(1, Number(value) || 1) - 1);
        }
        await updateTask(taskId, payload as Parameters<typeof updateTask>[1]);
      });
      setTree(prev =>
        prev.map(prog => ({
          ...prog,
          children: prog.children.map(del => ({
            ...del,
            children: del.children.map(act => ({
              ...act,
              children: act.children.map(t => {
                if (t.data.rawId !== taskId) return t;
                const task = t.data.task!;
                const updated = { ...task, [field]: value };
                if (field === 'activity_date' && typeof value === 'string') {
                  const dur = task.duration_days ?? 1;
                  (updated as Record<string, unknown>).due_date = addDaysIso(value, Math.max(1, dur) - 1);
                }
                if (field === 'duration_days') {
                  const actDate = task.activity_date || task.due_date;
                  if (actDate)
                    (updated as Record<string, unknown>).due_date = addDaysIso(
                      actDate,
                      Math.max(1, Number(value) || 1) - 1,
                    );
                }
                return { ...t, data: { ...t.data, task: updated } };
              }),
            })),
          })),
        })),
      );
    },
    [readonly, scheduleSave, findTaskInTree],
  );

  const addDelivery = useCallback(async () => {
    if (!selectedProgramId) {
      toast('Selecione um projeto.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createDelivery(effectiveUserId, {
        project_id: selectedProgramId,
        organization_id: selectedOrganizationId || null,
        name: 'Nova Entrega',
      });
      await loadTree();
      toast('Entrega adicionada.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao adicionar.', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedProgramId, selectedProgram, effectiveUserId, selectedOrganizationId, loadTree, toast]);

  const addActivity = useCallback(
    async (deliveryId: string) => {
      setSaving(true);
      try {
        const r = await initiativesApi.createInitiative({
          delivery_id: deliveryId,
          organization_id: selectedOrganizationId || null,
          farm_id: selectedFarmId || null,
          name: 'Nova Atividade',
          status: 'Não Iniciado',
        });
        if (!r.ok) throw new Error(r.error);
        await loadTree();
        toast('Atividade adicionada.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao adicionar.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [effectiveUserId, selectedOrganizationId, selectedFarmId, loadTree, toast],
  );

  const addTask = useCallback(
    async (initiativeId: string) => {
      setSaving(true);
      try {
        const milestoneId = await ensureDefaultMilestone(initiativeId);
        await createTask({
          milestone_id: milestoneId,
          title: 'Nova Tarefa',
          kanban_status: 'A Fazer',
          sort_order: 0,
          kanban_order: 0,
        });
        await loadTree();
        toast('Tarefa adicionada.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao adicionar.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [loadTree, toast],
  );

  const deleteDeliveryById = useCallback(
    async (id: string) => {
      const d = tree.flatMap(p => p.children).find(c => c.data.rawId === id);
      if (!d || !window.confirm(`Excluir "${d.data.delivery?.name || 'Entrega'}"?`)) return;
      try {
        await deleteDelivery(id);
        await loadTree();
        toast('Entrega removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error');
      }
    },
    [tree, loadTree, toast],
  );

  const deleteActivityById = useCallback(
    async (id: string) => {
      const act = tree
        .flatMap(p => p.children)
        .flatMap(d => d.children)
        .find(c => c.data.rawId === id);
      if (!act || !window.confirm(`Excluir "${act.data.initiative?.name || 'Atividade'}"?`)) return;
      try {
        await deleteInitiative(id);
        await loadTree();
        toast('Atividade removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error');
      }
    },
    [tree, loadTree, toast],
  );

  const deleteTaskById = useCallback(
    async (id: string) => {
      const t = tree
        .flatMap(p => p.children)
        .flatMap(d => d.children)
        .flatMap(a => a.children)
        .find(c => c.data.rawId === id);
      if (!t || !window.confirm(`Excluir "${t.data.task?.title || 'Tarefa'}"?`)) return;
      try {
        await deleteTask(id);
        await loadTree();
        toast('Tarefa removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error');
      }
    },
    [tree, loadTree, toast],
  );

  const peopleOptions = useMemo(
    () => people.map(p => ({ value: p.id, label: p.preferred_name?.trim() || p.full_name })),
    [people],
  );

  const getLeaderIdFromName = useCallback(
    (name: string | null): string => {
      if (!name) return '';
      const p = people.find(x => (x.preferred_name?.trim() || x.full_name) === name || x.full_name === name);
      return p?.id ?? '';
    },
    [people],
  );

  if (loading && tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-ai-accent" />
      </div>
    );
  }

  if (error && tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={loadTree}
          className="inline-flex items-center gap-2 rounded-md border border-ai-border px-4 py-2 text-sm text-ai-text hover:bg-ai-surface transition-colors"
        >
          <RefreshCw size={14} />
          Tentar novamente
        </button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-ai-subtext">Nenhum projeto cadastrado.</p>
        {!readonly && <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await createProject(effectiveUserId, {
                name: 'Novo Projeto',
                organization_id: selectedOrganizationId || null,
              });
              await loadTree();
              toast('Projeto criado.', 'success');
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Erro ao criar.', 'error');
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-ai-accent px-4 py-2 text-sm text-white hover:bg-ai-accent/90 disabled:opacity-60"
        >
          <Plus size={14} />
          Criar primeiro projeto
        </button>}
      </div>
    );
  }

  const programs = tree;
  const currentProgram = selectedProgram?.data.project;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <select
          value={selectedProgramId ?? ''}
          onChange={e => setSelectedProgramId(e.target.value || null)}
          className="rounded-md border border-ai-border bg-ai-surface px-3 py-2 text-sm text-ai-text"
        >
          {programs.map(p => (
            <option key={p.data.rawId} value={p.data.rawId}>
              {p.data.project?.name || 'Projeto sem nome'}
            </option>
          ))}
        </select>
        {saving && (
          <span className="text-xs text-ai-subtext flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Salvando...
          </span>
        )}
      </div>

      <p className="text-sm text-ai-subtext">
        {readonly
          ? 'Visualização em modo somente leitura. Download e salvar PDF continuam disponíveis.'
          : 'Edite os campos diretamente no documento. As alterações são salvas automaticamente.'}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          {/* PROJETO */}
          {currentProgram && (
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-ai-text flex items-center gap-2">
                <FolderOpen size={18} className="text-indigo-500" />
                PROJETO
              </h2>
              <div className="space-y-3 pl-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ai-subtext shrink-0">Nome:</span>
                  <InlineText
                    value={currentProgram.name || ''}
                    onChange={v => handleProgramChange('name', v)}
                    placeholder="Nome do projeto"
                    disabled={readonly}
                    className="flex-1 min-w-[200px]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <span className="text-sm text-ai-subtext shrink-0">Início:</span>
                  <InlineDate
                    value={currentProgram.start_date || ''}
                    onChange={v => handleProgramChange('start_date', v)}
                    max={currentProgram.end_date || undefined}
                    disabled={readonly}
                  />
                  <span className="text-sm text-ai-subtext shrink-0 ml-4">Fim:</span>
                  <InlineDate
                    value={currentProgram.end_date || ''}
                    onChange={v => handleProgramChange('end_date', v)}
                    min={currentProgram.start_date || undefined}
                    disabled={readonly}
                  />
                </div>
                <div>
                  <div className="text-sm text-ai-subtext mb-1">Descrição geral:</div>
                  <InlineTextarea
                    value={currentProgram.description || ''}
                    onChange={v => handleProgramChange('description', v)}
                    placeholder="Descreva o projeto aqui..."
                    rows={3}
                    disabled={readonly}
                  />
                </div>
                <div>
                  <div className="text-sm text-ai-subtext mb-1">Transformações e conquistas esperadas:</div>
                  <InlineTextarea
                    value={currentProgram.transformations_achievements || ''}
                    onChange={v => handleProgramChange('transformations_achievements', v)}
                    placeholder="O que será transformado?"
                    rows={2}
                    disabled={readonly}
                  />
                </div>
                <div>
                  <div className="text-sm text-ai-subtext mb-2">Evidências de sucesso:</div>
                  <div className="space-y-2 pl-2">
                    {(currentProgram.success_evidence?.length ? currentProgram.success_evidence : ['']).map(
                      (item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <InlineText
                            value={item}
                            onChange={v => {
                              const arr = [...(currentProgram.success_evidence || [''])];
                              arr[idx] = v;
                              handleProgramChange('success_evidence', arr);
                            }}
                            placeholder={`Evidência ${idx + 1}`}
                            disabled={readonly}
                            className="flex-1"
                          />
                          {!readonly && <button
                            type="button"
                            onClick={() => {
                              const arr = (currentProgram.success_evidence || ['']).filter((_, i) => i !== idx);
                              handleProgramChange('success_evidence', arr.length ? arr : ['']);
                            }}
                            className="p-1 text-ai-subtext hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>}
                        </div>
                      ),
                    )}
                    {!readonly && <button
                      type="button"
                      onClick={() =>
                        handleProgramChange('success_evidence', [...(currentProgram.success_evidence || []), ''])
                      }
                      className="text-xs text-ai-accent hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} />
                      Adicionar evidência
                    </button>}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-ai-subtext mb-2">Matriz de stakeholders:</div>
                  <div className="space-y-2 pl-2">
                    {(currentProgram.stakeholder_matrix?.length
                      ? currentProgram.stakeholder_matrix
                      : [{ name: '', activity: '' }]
                    ).map((row, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <InlineText
                          value={row.name}
                          onChange={v => {
                            const arr = [...(currentProgram.stakeholder_matrix || [])];
                            arr[idx] = { ...arr[idx], name: v };
                            handleProgramChange('stakeholder_matrix', arr);
                          }}
                          placeholder="Nome / Cargo"
                          disabled={readonly}
                          className="w-40"
                        />
                        <InlineText
                          value={row.activity}
                          onChange={v => {
                            const arr = [...(currentProgram.stakeholder_matrix || [])];
                            arr[idx] = { ...arr[idx], activity: v };
                            handleProgramChange('stakeholder_matrix', arr);
                          }}
                          placeholder="Atividade / Responsabilidade"
                          disabled={readonly}
                          className="flex-1 min-w-[180px]"
                        />
                        {!readonly && <button
                          type="button"
                          onClick={() => {
                            const arr = (currentProgram.stakeholder_matrix || []).filter((_, i) => i !== idx);
                            handleProgramChange('stakeholder_matrix', arr.length ? arr : [{ name: '', activity: '' }]);
                          }}
                          className="p-1 text-ai-subtext hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>}
                      </div>
                    ))}
                    {!readonly && <button
                      type="button"
                      onClick={() =>
                        handleProgramChange('stakeholder_matrix', [
                          ...(currentProgram.stakeholder_matrix || []),
                          { name: '', activity: '' },
                        ])
                      }
                      className="text-xs text-ai-accent hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} />
                      Adicionar stakeholder
                    </button>}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ENTREGAS */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ai-text flex items-center gap-2">
                <Package size={18} className="text-blue-500" />
                ENTREGAS
              </h2>
              {!readonly && (
                <button
                  type="button"
                  onClick={addDelivery}
                  disabled={saving || !selectedProgramId}
                  className="inline-flex items-center gap-1 text-sm text-ai-accent hover:underline disabled:opacity-50"
                >
                  <Plus size={14} />
                  Adicionar Entrega
                </button>
              )}
            </div>

            {(selectedProgram?.children ?? []).map(delNode => {
              const del = delNode.data.delivery!;
              return (
                <div key={del.id} className="pl-6 border-l-2 border-blue-200 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ai-text">Entrega</h3>
                    {!readonly && (
                      <button
                        type="button"
                        onClick={() => deleteDeliveryById(del.id)}
                        className="p-1 text-ai-subtext hover:text-red-500"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ai-subtext shrink-0">Nome:</span>
                      <InlineText
                        value={del.name || ''}
                        onChange={v => handleDeliveryChange(del.id, 'name', v)}
                        placeholder="Nome da entrega"
                        disabled={readonly}
                        className="flex-1 min-w-[200px]"
                      />
                    </div>
                    <div>
                      <div className="text-sm text-ai-subtext mb-1">Descrição:</div>
                      <InlineTextarea
                        value={del.description || ''}
                        onChange={v => handleDeliveryChange(del.id, 'description', v)}
                        placeholder="Descrição da entrega..."
                        rows={2}
                        disabled={readonly}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <span className="text-sm text-ai-subtext shrink-0">Início:</span>
                      <InlineDate
                        value={del.start_date || ''}
                        onChange={v => handleDeliveryChange(del.id, 'start_date', v)}
                        max={del.end_date || del.due_date || undefined}
                        disabled={readonly}
                      />
                      <span className="text-sm text-ai-subtext shrink-0 ml-4">Fim:</span>
                      <InlineDate
                        value={del.end_date || del.due_date || ''}
                        onChange={v => handleDeliveryChange(del.id, 'end_date', v)}
                        min={del.start_date || undefined}
                        disabled={readonly}
                      />
                    </div>

                    {/* ATIVIDADES */}
                    <div className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-ai-text flex items-center gap-1">
                          <Layers size={14} className="text-emerald-500" />
                          Atividades
                        </span>
                        {!readonly && (
                          <button
                            type="button"
                            onClick={() => addActivity(del.id)}
                            disabled={saving}
                            className="text-xs text-ai-accent hover:underline flex items-center gap-1"
                          >
                            <Plus size={12} />
                            Nova Atividade
                          </button>
                        )}
                      </div>
                      <div className="pl-4 space-y-4 border-l-2 border-emerald-200">
                        {delNode.children.map(actNode => {
                          const act = actNode.data.initiative!;
                          return (
                            <div key={act.id} className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-ai-subtext">Atividade</span>
                                {!readonly && (
                                  <button
                                    type="button"
                                    onClick={() => deleteActivityById(act.id)}
                                    className="p-1 text-ai-subtext hover:text-red-500"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm text-ai-subtext shrink-0">Nome:</span>
                                  <InlineText
                                    value={act.name || ''}
                                    onChange={v => handleActivityChange(act.id, 'name', v)}
                                    placeholder="Nome da atividade"
                                    disabled={readonly}
                                    className="flex-1 min-w-[180px]"
                                  />
                                  <span className="text-sm text-ai-subtext shrink-0 ml-2">Líder:</span>
                                  <InlineSelect
                                    value={getLeaderIdFromName(act.leader)}
                                    onChange={v => handleActivityChange(act.id, 'leader_id', v)}
                                    options={peopleOptions}
                                    placeholder="Selecione"
                                    disabled={readonly}
                                    className="min-w-[140px]"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                  <span className="text-sm text-ai-subtext shrink-0">Início:</span>
                                  <InlineDate
                                    value={act.start_date || ''}
                                    onChange={v => handleActivityChange(act.id, 'start_date', v)}
                                    max={act.end_date || undefined}
                                    disabled={readonly}
                                  />
                                  <span className="text-sm text-ai-subtext shrink-0 ml-2">Fim:</span>
                                  <InlineDate
                                    value={act.end_date || ''}
                                    onChange={v => handleActivityChange(act.id, 'end_date', v)}
                                    min={act.start_date || undefined}
                                    disabled={readonly}
                                  />
                                  <span className="text-sm text-ai-subtext shrink-0 ml-2">Status:</span>
                                  <InlineSelect
                                    value={act.status || 'Não Iniciado'}
                                    onChange={v => handleActivityChange(act.id, 'status', v)}
                                    options={STATUS_OPTIONS}
                                    disabled={readonly}
                                  />
                                </div>

                                {/* TAREFAS */}
                                <div className="pt-3 pl-4 border-l-2 border-amber-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-ai-subtext flex items-center gap-1">
                                      <CheckSquare size={12} className="text-amber-500" />
                                      Tarefas
                                    </span>
                                    {!readonly && (
                                      <button
                                        type="button"
                                        onClick={() => addTask(act.id)}
                                        disabled={saving}
                                        className="text-xs text-ai-accent hover:underline flex items-center gap-1"
                                      >
                                        <Plus size={12} />
                                        Nova Tarefa
                                      </button>
                                    )}
                                  </div>
                                  <div className="space-y-3">
                                    {actNode.children.map(taskNode => {
                                      const task = taskNode.data.task!;
                                      return (
                                        <div key={task.id} className="space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-ai-subtext">Tarefa</span>
                                            {!readonly && (
                                              <button
                                                type="button"
                                                onClick={() => deleteTaskById(task.id)}
                                                className="p-1 text-ai-subtext hover:text-red-500"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                            <span className="text-sm text-ai-subtext shrink-0">Título:</span>
                                            <InlineText
                                              value={task.title || ''}
                                              onChange={v => handleTaskChange(task.id, 'title', v)}
                                              placeholder="Título da tarefa"
                                              disabled={readonly}
                                              className="flex-1 min-w-[160px]"
                                            />
                                            <span className="text-sm text-ai-subtext shrink-0 ml-2">Responsável:</span>
                                            <InlineSelect
                                              value={task.responsible_person_id || ''}
                                              onChange={v => handleTaskChange(task.id, 'responsible_person_id', v)}
                                              options={peopleOptions}
                                              placeholder="Selecione"
                                              disabled={readonly}
                                              className="min-w-[120px]"
                                            />
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                            <span className="text-sm text-ai-subtext shrink-0">Início:</span>
                                            <InlineDate
                                              value={task.activity_date || ''}
                                              onChange={v => handleTaskChange(task.id, 'activity_date', v)}
                                              disabled={readonly}
                                            />
                                            <span className="text-sm text-ai-subtext shrink-0 ml-2">
                                              Duração (dias):
                                            </span>
                                            <InlineNumber
                                              value={String(task.duration_days ?? 1)}
                                              onChange={v => handleTaskChange(task.id, 'duration_days', Number(v) || 1)}
                                              min={1}
                                              disabled={readonly}
                                            />
                                            <span className="text-sm text-ai-subtext shrink-0 ml-2">Status:</span>
                                            <InlineSelect
                                              value={task.kanban_status || 'A Fazer'}
                                              onChange={v =>
                                                handleTaskChange(task.id, 'kanban_status', v as KanbanStatus)
                                              }
                                              options={KANBAN_OPTIONS}
                                              disabled={readonly}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProjectDocument;
