import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Node,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Loader2, RefreshCw } from 'lucide-react';
import { loadFullEAPTree, wbsTreeToFlowData, type WBSNode, type WBSLevel } from '../lib/eapTree';
import { WBSNode as WBSNodeComponent, EAPNodeActionsContext } from './eap/WBSNode';
import {
  ProgramModal,
  DeliveryModal,
  ActivityModal,
  TaskModal,
  INITIAL_PROGRAM_FORM,
  INITIAL_DELIVERY_FORM,
  INITIAL_ACTIVITY_FORM,
  INITIAL_TASK_FORM,
  getCurrentIsoDate,
  type ProgramFormState,
  type DeliveryFormState,
  type ActivityFormState,
  type TaskFormState,
} from './eap';
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
  type ProjectPayload,
  type ProjectRow,
} from '../lib/projects';
import { createDelivery, deleteDelivery, fetchDeliveriesByProject, updateDelivery, type DeliveryRow } from '../lib/deliveries';
import { createInitiative, createTask, deleteInitiative, deleteTask, ensureDefaultMilestone, fetchInitiativesByDelivery, fetchTasksByInitiative, updateTask } from '../lib/initiatives';
import * as initiativesApi from '../lib/api/initiativesClient';
import { fetchPeople, type Person } from '../lib/people';
import { sanitizeText } from '../lib/inputSanitizer';

import '@xyflow/react/dist/style.css';

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '60',
};

const nodeTypes = { wbs: WBSNodeComponent } as const;

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDateBR(raw: string | null): string {
  if (!raw) return '—';
  try {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? raw : DATE_FMT.format(d);
  } catch {
    return raw;
  }
}

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

type ModalEntity = 'program' | 'delivery' | 'activity' | 'task';

interface EAPMindMapProps {
  effectiveUserId: string;
  selectedClientId?: string | null;
  selectedFarmId?: string | null;
  /** Quando true, desabilita mutações (modo visualização para cliente). */
  readonly?: boolean;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

function getRawIdFromNodeId(nodeId: string): string {
  const parts = nodeId.split('-');
  return parts.length >= 2 ? parts.slice(1).join('-') : nodeId;
}

const EAPMindMapInner: React.FC<EAPMindMapProps> = ({ effectiveUserId, selectedClientId, selectedFarmId, readonly = false, onToast }) => {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toast = useCallback(
    (msg: string, type: 'success' | 'error' | 'warning' | 'info') => {
      if (mountedRef.current) onToast?.(msg, type);
    },
    [onToast],
  );

  const [tree, setTree] = useState<WBSNode[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  const [modalEntity, setModalEntity] = useState<ModalEntity | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [parentNodeIdForCreate, setParentNodeIdForCreate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [programForm, setProgramForm] = useState<ProgramFormState>(INITIAL_PROGRAM_FORM);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryFormState>(INITIAL_DELIVERY_FORM);
  const [activityForm, setActivityForm] = useState<ActivityFormState>(INITIAL_ACTIVITY_FORM);
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    ...INITIAL_TASK_FORM,
    activity_date: getCurrentIsoDate(),
  });

  const { fitView } = useReactFlow();

  const loadTree = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const t = await loadFullEAPTree(effectiveUserId, {
        clientId: selectedClientId ?? undefined,
        farmId: selectedFarmId ?? undefined,
        clientMode: readonly,
      });
      if (!mountedRef.current) return;
      setTree(t);
      const { nodes: flowNodes, edges: flowEdges } = wbsTreeToFlowData(t);

      const graph = {
        id: 'root',
        layoutOptions: elkOptions,
        children: flowNodes.map(n => ({
          id: n.id,
          width: (n.width as number) || 220,
          height: (n.height as number) || 72,
        })),
        edges: flowEdges.map(e => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      };

      const layouted = await elk.layout(graph);
      const layoutedNodes: Node[] = flowNodes.map(n => {
        const layoutNode = layouted.children?.find(c => c.id === n.id);
        return {
          ...n,
          position: {
            x: layoutNode?.x ?? 0,
            y: layoutNode?.y ?? 0,
          },
        };
      });

      if (mountedRef.current) {
        setNodes(layoutedNodes);
        setEdges(flowEdges);
        setTimeout(() => fitView({ padding: 0.2 }), 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar EAP.';
      if (mountedRef.current) {
        setError(msg);
        toast(msg, 'error');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [effectiveUserId, selectedClientId, selectedFarmId, readonly, fitView, setNodes, setEdges, toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    let active = true;
    fetchPeople(effectiveUserId, selectedFarmId ? { farmId: selectedFarmId, sharedScope: true } : undefined)
      .then(rows => {
        if (active && mountedRef.current) setPeople(rows);
      })
      .catch(err => {
        if (active && mountedRef.current) {
          setPeople([]);
          toast(err instanceof Error ? err.message : 'Erro ao carregar pessoas.', 'error');
        }
      });
    return () => {
      active = false;
    };
  }, [effectiveUserId, selectedFarmId, toast]);

  const findNodeInTree = useCallback(
    (nodeId: string): WBSNode | null => {
      function walk(nodes: WBSNode[]): WBSNode | null {
        for (const n of nodes) {
          if (n.id === nodeId) return n;
          const found = walk(n.children);
          if (found) return found;
        }
        return null;
      }
      return walk(tree);
    },
    [tree],
  );

  const closeModal = useCallback(() => {
    setModalEntity(null);
    setEditingNodeId(null);
    setParentNodeIdForCreate(null);
  }, []);

  const openCreate = useCallback(
    (parentNodeId: string, parentLevel: WBSLevel) => {
      const parent = findNodeInTree(parentNodeId);
      if (!parent) return;

      if (parentLevel === 'program') {
        setModalEntity('program');
        setModalMode('create');
        setProgramForm(INITIAL_PROGRAM_FORM);
      } else if (parentLevel === 'delivery') {
        setModalEntity('delivery');
        setModalMode('create');
        setParentNodeIdForCreate(parentNodeId);
        setDeliveryForm(INITIAL_DELIVERY_FORM);
      } else if (parentLevel === 'activity') {
        setModalEntity('activity');
        setModalMode('create');
        setParentNodeIdForCreate(parentNodeId);
        setActivityForm(INITIAL_ACTIVITY_FORM);
      } else if (parentLevel === 'task') {
        setModalEntity('task');
        setModalMode('create');
        setParentNodeIdForCreate(parentNodeId);
        setTaskForm({ ...INITIAL_TASK_FORM, activity_date: getCurrentIsoDate() });
      }
    },
    [findNodeInTree],
  );

  const openEdit = useCallback(
    async (nodeId: string, level: WBSLevel) => {
      const node = findNodeInTree(nodeId);
      if (!node) return;

      setEditingNodeId(nodeId);

      if (level === 'program' && node.data.project) {
        const p = node.data.project;
        setModalEntity('program');
        setModalMode('edit');
        setProgramForm({
          name: p.name || '',
          description: p.description || '',
          start_date: p.start_date || '',
          end_date: p.end_date || '',
          transformations_achievements: p.transformations_achievements || '',
          success_evidence: p.success_evidence?.length ? [...p.success_evidence] : [''],
          stakeholder_matrix: p.stakeholder_matrix?.length ? [...p.stakeholder_matrix] : [{ name: '', activity: '' }],
        });
      } else if (level === 'delivery' && node.data.delivery) {
        const d = node.data.delivery;
        setModalEntity('delivery');
        setModalMode('edit');
        setDeliveryForm({
          name: d.name || '',
          description: d.description || '',
          transformations_achievements: d.transformations_achievements || '',
          start_date: d.start_date || '',
          end_date: d.end_date || d.due_date || '',
        });
      } else if (level === 'activity' && node.data.initiative) {
        const i = node.data.initiative;
        const leaderId =
          people.find(p => (p.preferred_name || p.full_name || '').trim() === (i.leader || '').trim())?.id || '';
        const internalLeaderId =
          people.find(p => (p.preferred_name || p.full_name || '').trim() === (i.internal_leader || '').trim())?.id ||
          '';
        let participantIds: string[] = [];
        try {
          const result = await initiativesApi.listParticipants(i.id);
          participantIds = result.ok ? result.data : [];
        } catch {
          participantIds = [];
        }
        setModalEntity('activity');
        setModalMode('edit');
        setActivityForm({
          name: i.name || '',
          description: i.description || '',
          start_date: i.start_date || '',
          end_date: i.end_date || '',
          status: i.status || 'Não Iniciado',
          leader_id: leaderId,
          internal_leader_id: internalLeaderId,
          participant_ids: participantIds,
        });
      } else if (level === 'task' && node.data.task) {
        const t = node.data.task;
        const activityDate = t.activity_date || t.due_date || getCurrentIsoDate();
        const durationDays = Math.max(1, t.duration_days || 1);
        setModalEntity('task');
        setModalMode('edit');
        setTaskForm({
          title: t.title || '',
          description: t.description || '',
          responsible_person_id: t.responsible_person_id || '',
          activity_date: activityDate,
          duration_days: String(durationDays),
          completed: t.completed ?? false,
          kanban_status: (t.kanban_status as TaskFormState['kanban_status']) || 'A Fazer',
        });
      }
    },
    [findNodeInTree, people],
  );

  const openDelete = useCallback(
    async (nodeId: string, level: WBSLevel) => {
      const node = findNodeInTree(nodeId);
      if (!node) return;

      const rawId = node.data.rawId;
      const label = node.data.label;
      if (!window.confirm(`Excluir "${label}"?`)) return;

      setSaving(true);
      try {
        if (level === 'program') {
          await deleteProject(rawId);
          toast('Programa removido.', 'success');
        } else if (level === 'delivery') {
          await deleteDelivery(rawId);
          toast('Entrega removida.', 'success');
        } else if (level === 'activity') {
          await deleteInitiative(rawId);
          toast('Atividade removida.', 'success');
        } else if (level === 'task') {
          await deleteTask(rawId);
          toast('Tarefa removida.', 'success');
        }
        await loadTree();
        closeModal();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [findNodeInTree, loadTree, toast, closeModal],
  );

  const nodeActions = useMemo(
    () => ({
      onAdd: readonly ? undefined : openCreate,
      onEdit: readonly ? undefined : openEdit,
      onDelete: readonly ? undefined : openDelete,
    }),
    [readonly, openCreate, openEdit, openDelete],
  );

  const saveProgram = useCallback(async () => {
    if (saving) return;
    const name = programForm.name.trim();
    if (!name) {
      toast('Nome do programa é obrigatório.', 'warning');
      return;
    }
    if (programForm.start_date && programForm.end_date && programForm.end_date < programForm.start_date) {
      toast('Data final anterior à data inicial.', 'warning');
      return;
    }

    const payload: ProjectPayload = {
      name,
      description: programForm.description.trim() || null,
      client_id: selectedClientId || null,
      start_date: programForm.start_date || null,
      end_date: programForm.end_date || null,
      transformations_achievements: programForm.transformations_achievements.trim() || null,
      success_evidence: programForm.success_evidence.map(s => s.trim()).filter(Boolean),
      stakeholder_matrix: programForm.stakeholder_matrix
        .map(r => ({ name: r.name.trim(), activity: r.activity.trim() }))
        .filter(r => r.name || r.activity),
    };

    setSaving(true);
    try {
      if (editingNodeId) {
        const rawId = getRawIdFromNodeId(editingNodeId);
        await updateProject(rawId, payload);
        toast('Programa atualizado.', 'success');
      } else {
        await createProject(effectiveUserId, payload);
        toast('Programa criado.', 'success');
      }
      await loadTree();
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar programa.', 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, programForm, selectedClientId, editingNodeId, effectiveUserId, loadTree, toast, closeModal]);

  const saveDelivery = useCallback(async () => {
    if (saving) return;
    const projectId = parentNodeIdForCreate
      ? getRawIdFromNodeId(parentNodeIdForCreate)
      : editingNodeId
        ? findNodeInTree(editingNodeId)?.data.parentId
        : null;
    if (!projectId) {
      toast('Selecione um programa.', 'warning');
      return;
    }
    const name = deliveryForm.name.trim();
    if (!name) {
      toast('Nome da entrega é obrigatório.', 'warning');
      return;
    }

    const payload = {
      name: sanitizeText(name),
      description: deliveryForm.description.trim() ? sanitizeText(deliveryForm.description.trim()) : null,
      transformations_achievements: deliveryForm.transformations_achievements.trim()
        ? sanitizeText(deliveryForm.transformations_achievements.trim())
        : null,
      start_date: deliveryForm.start_date || null,
      end_date: deliveryForm.end_date || null,
      due_date: deliveryForm.end_date || null,
      client_id: selectedClientId || null,
      project_id: projectId,
    };

    setSaving(true);
    try {
      if (editingNodeId) {
        const rawId = getRawIdFromNodeId(editingNodeId);
        await updateDelivery(rawId, payload);
        toast('Entrega atualizada.', 'success');
      } else {
        await createDelivery(effectiveUserId, payload);
        toast('Entrega criada.', 'success');
      }
      await loadTree();
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar entrega.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    deliveryForm,
    selectedClientId,
    editingNodeId,
    parentNodeIdForCreate,
    effectiveUserId,
    findNodeInTree,
    loadTree,
    toast,
    closeModal,
  ]);

  const saveActivity = useCallback(async () => {
    if (saving) return;
    const deliveryId = parentNodeIdForCreate
      ? getRawIdFromNodeId(parentNodeIdForCreate)
      : editingNodeId
        ? findNodeInTree(editingNodeId)?.data.parentId
        : null;
    if (!deliveryId) {
      toast('Selecione uma entrega.', 'warning');
      return;
    }
    const name = activityForm.name.trim();
    if (!name) {
      toast('Nome é obrigatório.', 'warning');
      return;
    }

    const leaderPerson = people.find(p => p.id === activityForm.leader_id);
    const leaderName = leaderPerson
      ? leaderPerson.preferred_name?.trim() || leaderPerson.full_name
      : activityForm.leader_id || null;
    const internalLeaderPerson = people.find(p => p.id === activityForm.internal_leader_id);
    const internalLeaderName = internalLeaderPerson
      ? internalLeaderPerson.preferred_name?.trim() || internalLeaderPerson.full_name
      : null;

    setSaving(true);
    try {
      if (editingNodeId) {
        const rawId = getRawIdFromNodeId(editingNodeId);
        const result = await initiativesApi.updateInitiative(rawId, {
          name: sanitizeText(name),
          description: activityForm.description.trim() ? sanitizeText(activityForm.description.trim()) : null,
          start_date: activityForm.start_date || null,
          end_date: activityForm.end_date || null,
          status: activityForm.status || 'Não Iniciado',
          leader: leaderName,
          internal_leader: internalLeaderName,
        });
        if (!result.ok) throw new Error(result.error);
        await initiativesApi.replaceParticipants(rawId, activityForm.participant_ids.filter(pid => !!pid));
        toast('Atividade atualizada.', 'success');
      } else {
        const row = await createInitiative(effectiveUserId, {
          delivery_id: deliveryId,
          name: sanitizeText(name),
          description: activityForm.description.trim() ? sanitizeText(activityForm.description.trim()) : null,
          start_date: activityForm.start_date || null,
          end_date: activityForm.end_date || null,
          status: activityForm.status || 'Não Iniciado',
          leader: leaderName ?? undefined,
          internal_leader: internalLeaderName ?? undefined,
          organization_id: selectedClientId || null,
          farm_id: selectedFarmId || null,
          team: [],
          milestones: [],
        });
        const validParticipants = activityForm.participant_ids.filter(pid => !!pid);
        if (validParticipants.length > 0) {
          await initiativesApi.replaceParticipants(row.id, validParticipants);
        }
        toast('Atividade criada.', 'success');
      }
      await loadTree();
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar atividade.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    activityForm,
    people,
    editingNodeId,
    parentNodeIdForCreate,
    effectiveUserId,
    selectedClientId,
    selectedFarmId,
    findNodeInTree,
    loadTree,
    toast,
    closeModal,
  ]);

  const saveTask = useCallback(async () => {
    if (saving) return;
    const initiativeId = parentNodeIdForCreate
      ? getRawIdFromNodeId(parentNodeIdForCreate)
      : editingNodeId
        ? findNodeInTree(editingNodeId)?.data.parentId
        : null;
    if (!initiativeId) {
      toast('Selecione uma atividade.', 'warning');
      return;
    }
    const title = taskForm.title.trim();
    if (!title) {
      toast('Título é obrigatório.', 'warning');
      return;
    }
    if (!taskForm.responsible_person_id.trim()) {
      toast('Responsável é obrigatório.', 'warning');
      return;
    }

    const activityDate = taskForm.activity_date || getCurrentIsoDate();
    const durationDays = Math.max(1, parseInt(taskForm.duration_days || '1', 10) || 1);
    const dueDate = addDaysIso(activityDate, durationDays - 1) || null;

    setSaving(true);
    try {
      if (editingNodeId) {
        const rawId = getRawIdFromNodeId(editingNodeId);
        await updateTask(rawId, {
          title: sanitizeText(title),
          description: taskForm.description.trim() ? sanitizeText(taskForm.description.trim()) : null,
          responsible_person_id: taskForm.responsible_person_id,
          activity_date: activityDate,
          duration_days: durationDays,
          due_date: dueDate,
          kanban_status: taskForm.completed ? 'Concluído' : taskForm.kanban_status,
        });
        toast('Tarefa atualizada.', 'success');
      } else {
        const milestoneId = await ensureDefaultMilestone(initiativeId);
        await createTask(milestoneId, {
          title: sanitizeText(title),
          description: taskForm.description.trim() ? sanitizeText(taskForm.description.trim()) : null,
          responsible_person_id: taskForm.responsible_person_id,
          activity_date: activityDate,
          duration_days: durationDays,
          due_date: dueDate,
          kanban_status: taskForm.completed ? 'Concluído' : taskForm.kanban_status,
          kanban_order: 0,
          sort_order: 0,
        });
        toast('Tarefa criada.', 'success');
      }
      await loadTree();
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar tarefa.', 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, taskForm, editingNodeId, parentNodeIdForCreate, findNodeInTree, loadTree, toast, closeModal]);

  if (loading && tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-ai-accent" />
      </div>
    );
  }

  if (error && tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={loadTree}
          className="inline-flex items-center gap-2 rounded-lg border border-ai-border px-4 py-2 text-sm text-ai-text hover:bg-ai-surface transition-colors"
        >
          <RefreshCw size={14} />
          Tentar novamente
        </button>
      </div>
    );
  }

  const emptyState = !loading && tree.length === 0;

  if (emptyState) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-96 gap-4 rounded-xl border border-ai-border bg-ai-bg">
          <p className="text-sm text-ai-subtext">Nenhum programa cadastrado.</p>
          {!readonly && (
            <button
              type="button"
              onClick={() => {
                setModalEntity('program');
                setModalMode('create');
                setProgramForm(INITIAL_PROGRAM_FORM);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-ai-accent px-4 py-2 text-sm font-medium text-white hover:bg-ai-accent/90 transition-colors"
            >
              Novo Programa
            </button>
          )}
        </div>
        {modalEntity === 'program' && (
          <ProgramModal
            form={programForm}
            onChange={setProgramForm}
            onSave={saveProgram}
            onClose={closeModal}
            saving={saving}
            mode={modalMode}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-[calc(100vh-12rem)] min-h-[400px] rounded-xl border border-ai-border bg-ai-bg">
      <EAPNodeActionsContext.Provider value={nodeActions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={n =>
              n.data?.level === 'program'
                ? '#6366f1'
                : n.data?.level === 'delivery'
                  ? '#3b82f6'
                  : n.data?.level === 'activity'
                    ? '#10b981'
                    : '#f59e0b'
            }
          />
          <Panel position="top-right" className="flex flex-col gap-2">
            {!readonly && (
              <button
                type="button"
                onClick={() => {
                  setModalEntity('program');
                  setModalMode('create');
                  setProgramForm(INITIAL_PROGRAM_FORM);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-ai-accent px-3 py-2 text-sm font-medium text-white hover:bg-ai-accent/90 transition-colors"
              >
                Novo Programa
              </button>
            )}
            <button
              type="button"
              onClick={loadTree}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-ai-border bg-ai-bg px-3 py-2 text-sm text-ai-text hover:bg-ai-surface disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </Panel>
        </ReactFlow>
      </EAPNodeActionsContext.Provider>

      {modalEntity === 'program' && (
        <ProgramModal
          form={programForm}
          onChange={setProgramForm}
          onSave={saveProgram}
          onClose={closeModal}
          saving={saving}
          mode={modalMode}
        />
      )}

      {modalEntity === 'delivery' && (
        <DeliveryModal
          form={deliveryForm}
          onChange={setDeliveryForm}
          onSave={saveDelivery}
          onClose={closeModal}
          saving={saving}
          mode={modalMode}
        />
      )}

      {modalEntity === 'activity' && (
        <ActivityModal
          form={activityForm}
          onChange={setActivityForm}
          onSave={saveActivity}
          onClose={closeModal}
          saving={saving}
          mode={modalMode}
          people={people}
        />
      )}

      {modalEntity === 'task' && (
        <TaskModal
          form={taskForm}
          onChange={setTaskForm}
          onSave={saveTask}
          onClose={closeModal}
          saving={saving}
          mode={modalMode}
          people={people}
        />
      )}
    </div>
  );
};

const EAPMindMapWithProvider: React.FC<EAPMindMapProps> = props => (
  <ReactFlowProvider>
    <EAPMindMapInner {...props} />
  </ReactFlowProvider>
);

export default EAPMindMapWithProvider;
