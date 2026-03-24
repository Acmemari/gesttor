import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, FolderOpen, Package, Layers, CheckSquare } from 'lucide-react';
import {
  createProject,
  deleteProject,
  fetchProjects,
  type ProjectPayload,
  type ProjectRow,
  updateProject,
} from '../lib/projects';
import { createDelivery, deleteDelivery, fetchDeliveriesByProject, updateDelivery, type DeliveryRow } from '../lib/deliveries';
import {
  fetchInitiativesByDelivery,
  ensureDefaultMilestone,
  deleteInitiative,
  type InitiativeWithProgress,
} from '../lib/initiatives';
import { createTask, deleteTask, updateTask } from '../lib/tasks';
import { fetchPeople, peopleFilteredForResponsavel, peopleFilteredForLiderInterno, type Person } from '../lib/people';
import { arrayMove } from '@dnd-kit/sortable';
import { sanitizeText } from '../lib/inputSanitizer';
import * as projectsApi from '../lib/api/projectsClient';
import * as deliveriesApi from '../lib/api/deliveriesClient';
import * as initiativesApi from '../lib/api/initiativesClient';
import * as milestonesApi from '../lib/api/milestonesClient';
import * as tasksApi from '../lib/api/tasksClient';
import HierarchyColumn, { type HierarchyColumnItem } from './HierarchyColumn';
import {
  ProjectModal,
  DeliveryModal,
  ActivityModal,
  TaskModal,
  INITIAL_PROGRAM_FORM,
  INITIAL_DELIVERY_FORM,
  INITIAL_ACTIVITY_FORM,
  INITIAL_TASK_FORM,
  getCurrentIsoDate,
  type KanbanStatus,
  type ProgramFormState,
  type DeliveryFormState,
  type ActivityFormState,
  type TaskFormState,
} from './eap';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ProjectWorkbenchProps {
  effectiveUserId: string;
  selectedOrganizationId?: string | null;
  selectedFarmId?: string | null;
  /** Quando true, desabilita criação/edição/exclusão (modo visualização para cliente). */
  readonly?: boolean;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface WorkbenchTask {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  responsible_person_id: string | null;
  activity_date: string | null;
  duration_days: number | null;
  completed: boolean;
  sort_order: number;
  kanban_status: KanbanStatus;
  kanban_order: number;
}

type ModalEntity = 'program' | 'delivery' | 'activity' | 'task';
type ModalMode = 'create' | 'edit';

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

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatDateBR(raw: string | null): string {
  if (!raw) return '—';
  try {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? raw : DATE_FMT.format(d);
  } catch {
    return raw;
  }
}

function swapSortOrderLocally<T extends { id: string; sort_order: number }>(
  rows: T[],
  firstId: string,
  secondId: string,
): T[] {
  const first = rows.find(row => row.id === firstId);
  const second = rows.find(row => row.id === secondId);
  if (!first || !second) return rows;

  return rows
    .map(row => {
      if (row.id === first.id) return { ...row, sort_order: second.sort_order };
      if (row.id === second.id) return { ...row, sort_order: first.sort_order };
      return row;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Workbench Principal ────────────────────────────────────────────────────

const ProjectWorkbench: React.FC<ProjectWorkbenchProps> = ({
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

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeWithProgress[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<WorkbenchTask[]>([]);

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const activeProjectType = useMemo(
    () => projects.find(p => p.id === selectedProgramId)?.program_type ?? 'assessoria',
    [projects, selectedProgramId],
  );
  const peopleForResponsavel = useMemo(
    () => activeProjectType === 'fazenda' ? people : peopleFilteredForResponsavel(people),
    [people, activeProjectType],
  );
  const peopleForLiderInterno = useMemo(
    () => activeProjectType === 'fazenda' ? people : peopleFilteredForLiderInterno(people),
    [people, activeProjectType],
  );
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const [modalEntity, setModalEntity] = useState<ModalEntity | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [programForm, setProgramForm] = useState<ProgramFormState>(INITIAL_PROGRAM_FORM);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryFormState>(INITIAL_DELIVERY_FORM);
  const [activityForm, setActivityForm] = useState<ActivityFormState>(INITIAL_ACTIVITY_FORM);
  const [taskForm, setTaskForm] = useState<TaskFormState>(INITIAL_TASK_FORM);

  const filters = useMemo(
    () =>
      selectedOrganizationId
        ? { organizationId: selectedOrganizationId, farmId: selectedFarmId ?? undefined, clientMode: readonly }
        : undefined,
    [selectedOrganizationId, selectedFarmId, readonly],
  );

  // ── Cascade data loading ───────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoadingProjects(true);
    setErrorMessage(null);
    try {
      const p = await fetchProjects(effectiveUserId, filters);
      if (!mountedRef.current) return;
      setProjects(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar projetos.';
      if (mountedRef.current) setErrorMessage(msg);
      toast(msg, 'error');
    } finally {
      if (mountedRef.current) setLoadingProjects(false);
    }
  }, [effectiveUserId, filters, toast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadDeliveriesForProject = useCallback(
    async (projectId: string) => {
      if (!mountedRef.current) return;
      setLoadingDeliveries(true);
      try {
        const d = await fetchDeliveriesByProject(projectId);
        if (mountedRef.current) setDeliveries(d);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao carregar entregas.', 'error');
        if (mountedRef.current) setDeliveries([]);
      } finally {
        if (mountedRef.current) setLoadingDeliveries(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (selectedProgramId) {
      loadDeliveriesForProject(selectedProgramId);
    } else {
      setDeliveries([]);
    }
  }, [selectedProgramId, loadDeliveriesForProject]);

  const loadActivitiesForDelivery = useCallback(
    async (deliveryId: string) => {
      if (!mountedRef.current) return;
      setLoadingActivities(true);
      try {
        const i = await fetchInitiativesByDelivery(deliveryId);
        if (mountedRef.current) setInitiatives(i);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao carregar atividades.', 'error');
        if (mountedRef.current) setInitiatives([]);
      } finally {
        if (mountedRef.current) setLoadingActivities(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (selectedDeliveryId) {
      loadActivitiesForDelivery(selectedDeliveryId);
    } else {
      setInitiatives([]);
    }
  }, [selectedDeliveryId, loadActivitiesForDelivery]);

  useEffect(() => {
    let active = true;
    fetchPeople(effectiveUserId, selectedFarmId ? { farmId: selectedFarmId, sharedScope: true } : undefined)
      .then(rows => {
        if (active && mountedRef.current) setPeople(rows);
      })
      .catch(err => {
        if (active && mountedRef.current) setPeople([]);
        toast(err instanceof Error ? err.message : 'Erro ao carregar pessoas.', 'error');
      });
    return () => {
      active = false;
    };
  }, [effectiveUserId, selectedFarmId, toast]);

  const extractTasksFromInitiative = useCallback((initiativeId: string): WorkbenchTask[] => {
    const initiative = initiatives.find(i => i.id === initiativeId);
    if (!initiative?.milestones) return [];
    return initiative.milestones
      .flatMap(m => (m.tasks || []).map(t => ({ ...t, milestone_id: m.id } as WorkbenchTask)))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [initiatives]);

  const refreshTasks = useCallback(async () => {
    if (!selectedActivityId) {
      setTasks([]);
      return;
    }
    // Extract tasks from already-loaded initiative milestones (no extra query)
    const extracted = extractTasksFromInitiative(selectedActivityId);
    if (extracted.length > 0) {
      setTasks(extracted);
      return;
    }
    // Fallback: if milestones were loaded without tasks, reload from API
    setLoadingTasks(true);
    try {
      const { fetchTasksByInitiative } = await import('../lib/initiatives');
      const rows = await fetchTasksByInitiative(selectedActivityId);
      if (mountedRef.current) setTasks(rows as WorkbenchTask[]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar tarefas.', 'error');
    } finally {
      if (mountedRef.current) setLoadingTasks(false);
    }
  }, [selectedActivityId, extractTasksFromInitiative, toast]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  // ── Derived state ─────────────────────────────────────────────────────

  const selectedDeliveryActivities = useMemo(() => {
    if (!selectedDeliveryId) return [] as InitiativeWithProgress[];
    return initiatives
      .filter(i => i.delivery_id === selectedDeliveryId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [initiatives, selectedDeliveryId]);

  // ── Auto-select first items (cascade default) ──────────────────────────

  useEffect(() => {
    if (projects.length === 0) return;
    if (selectedProgramId && projects.some(p => p.id === selectedProgramId)) return;
    setSelectedProgramId(projects[0].id);
  }, [projects, selectedProgramId]);

  useEffect(() => {
    if (deliveries.length === 0) return;
    if (selectedDeliveryId && deliveries.some(d => d.id === selectedDeliveryId)) return;
    setSelectedDeliveryId(deliveries[0].id);
  }, [deliveries, selectedDeliveryId]);

  useEffect(() => {
    if (selectedDeliveryActivities.length === 0) return;
    if (selectedActivityId && selectedDeliveryActivities.some(a => a.id === selectedActivityId)) return;
    setSelectedActivityId(selectedDeliveryActivities[0].id);
  }, [selectedDeliveryActivities, selectedActivityId]);

  // ── Column items (memoized) ───────────────────────────────────────────

  const programItems = useMemo<HierarchyColumnItem[]>(
    () =>
      projects.map(p => ({
        id: p.id,
        title: p.name,
      })),
    [projects],
  );

  const deliveryItems = useMemo<HierarchyColumnItem[]>(
    () =>
      deliveries.map(d => ({
        id: d.id,
        title: d.name,
      })),
    [deliveries],
  );

  const activityItems = useMemo<HierarchyColumnItem[]>(
    () =>
      selectedDeliveryActivities.map(a => ({
        id: a.id,
        title: a.name,
        subtitle: `${a.progress ?? 0}% concluído · Peso: ${a.percent ?? 0}%`,
      })),
    [selectedDeliveryActivities],
  );

  const taskItems = useMemo<HierarchyColumnItem[]>(
    () =>
      tasks.map(t => ({
        id: t.id,
        title: t.title,
        subtitle: t.kanban_status,
      })),
    [tasks],
  );

  // ── Modal helpers ─────────────────────────────────────────────────────

  const closeModal = useCallback(() => {
    setModalEntity(null);
    setEditingId(null);
  }, []);

  const openCreateModal = useCallback((entity: ModalEntity) => {
    setModalEntity(entity);
    setModalMode('create');
    setEditingId(null);
    setProgramForm(INITIAL_PROGRAM_FORM);
    setDeliveryForm(INITIAL_DELIVERY_FORM);
    setActivityForm(INITIAL_ACTIVITY_FORM);
    setTaskForm({ ...INITIAL_TASK_FORM, activity_date: getCurrentIsoDate() });
  }, []);

  const openEditProgram = useCallback(
    (id: string) => {
      const t = projects.find(p => p.id === id);
      if (!t) return;
      setModalEntity('program');
      setModalMode('edit');
      setEditingId(id);
      setProgramForm({
        name: t.name || '',
        description: t.description || '',
        start_date: t.start_date || '',
        end_date: t.end_date || '',
        transformations_achievements: t.transformations_achievements || '',
        success_evidence: t.success_evidence.length ? [...t.success_evidence] : [''],
        stakeholder_matrix: t.stakeholder_matrix.length ? [...t.stakeholder_matrix] : [{ name: '', activity: '' }],
        program_type: (t.program_type as 'assessoria' | 'fazenda') ?? 'assessoria',
      });
    },
    [projects],
  );

  const openEditDelivery = useCallback(
    (id: string) => {
      const t = deliveries.find(d => d.id === id);
      if (!t) return;
      setModalEntity('delivery');
      setModalMode('edit');
      setEditingId(id);
      setDeliveryForm({
        name: t.name || '',
        description: t.description || '',
        transformations_achievements: t.transformations_achievements || '',
        start_date: t.start_date || '',
        end_date: t.end_date || t.due_date || '',
      });
    },
    [deliveries],
  );

  const openEditActivity = useCallback(
    async (id: string) => {
      const t = selectedDeliveryActivities.find(a => a.id === id);
      if (!t) return;
      setModalEntity('activity');
      setModalMode('edit');
      setEditingId(id);
      const leaderPerson = people.find(p => {
        const n = (p.preferred_name || p.full_name || '').trim();
        return n === (t.leader || '').trim();
      });
      const internalLeaderPerson = people.find(p => {
        const n = (p.preferred_name || p.full_name || '').trim();
        return n === (t.internal_leader || '').trim();
      });
      let participantIds: string[] = [];
      try {
        const result = await initiativesApi.listParticipants(id);
        participantIds = result.ok ? (result.data ?? []) : [];
      } catch {
        participantIds = [];
      }
      setActivityForm({
        name: t.name || '',
        description: t.description || '',
        start_date: t.start_date || '',
        end_date: t.end_date || '',
        status: t.status || 'Não Iniciado',
        leader_id: leaderPerson?.id ?? '',
        internal_leader_id: internalLeaderPerson?.id ?? '',
        participant_ids: participantIds,
        percent: String(t.percent ?? 0),
      });
    },
    [selectedDeliveryActivities, people],
  );

  const openEditTask = useCallback(
    (id: string) => {
      const t = tasks.find(tk => tk.id === id);
      if (!t) return;
      const activityDate = t.activity_date || t.due_date || getCurrentIsoDate();
      const durationDays = Math.max(1, t.duration_days || 1);
      setModalEntity('task');
      setModalMode('edit');
      setEditingId(id);
      setTaskForm({
        title: t.title || '',
        description: t.description || '',
        responsible_person_id: t.responsible_person_id || '',
        activity_date: activityDate,
        duration_days: String(durationDays),
        completed: t.completed,
        kanban_status: t.kanban_status || 'A Fazer',
      });
    },
    [tasks],
  );

  // ── CRUD: Program ─────────────────────────────────────────────────────

  const saveProgram = useCallback(async () => {
    if (saving) return;
    const name = programForm.name.trim();
    if (!name) {
      toast('Nome do projeto é obrigatório.', 'warning');
      return;
    }
    if (programForm.start_date && programForm.end_date && programForm.end_date < programForm.start_date) {
      toast('Data final anterior à data inicial.', 'warning');
      return;
    }

    const payload: ProjectPayload = {
      name,
      description: programForm.description.trim() || null,
      organization_id: selectedOrganizationId || null,
      start_date: programForm.start_date || null,
      end_date: programForm.end_date || null,
      transformations_achievements: programForm.transformations_achievements.trim() || null,
      success_evidence: programForm.success_evidence.map(s => s.trim()).filter(Boolean),
      stakeholder_matrix: programForm.stakeholder_matrix
        .map(r => ({ name: r.name.trim(), activity: r.activity.trim() }))
        .filter(r => r.name || r.activity),
      program_type: programForm.program_type,
    };

    setSaving(true);
    try {
      const saved = editingId ? await updateProject(editingId, payload) : await createProject(effectiveUserId, payload);
      await loadProjects();
      setSelectedProgramId(saved.id);
      toast(editingId ? 'Projeto atualizado.' : 'Projeto criado.', 'success');
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar projeto.', 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, programForm, selectedOrganizationId, editingId, effectiveUserId, loadProjects, toast, closeModal]);

  const deleteProgramById = useCallback(
    async (id: string) => {
      const t = projects.find(p => p.id === id);
      if (!t || !window.confirm(`Excluir "${t.name}"?`)) return;
      setDeleting(id);
      try {
        await deleteProject(id);
        if (selectedProgramId === id) {
          setSelectedProgramId(null);
          setSelectedDeliveryId(null);
          setSelectedActivityId(null);
          setTasks([]);
        }
        await loadProjects();
        toast('Projeto removido.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir projeto.', 'error');
      } finally {
        setDeleting(null);
      }
    },
    [projects, selectedProgramId, loadProjects, toast],
  );

  // ── CRUD: Delivery ────────────────────────────────────────────────────

  const saveDelivery = useCallback(async () => {
    if (saving) return;
    if (!selectedProgramId) {
      toast('Selecione um projeto.', 'warning');
      return;
    }
    const name = deliveryForm.name.trim();
    if (!name) {
      toast('Nome da entrega é obrigatório.', 'warning');
      return;
    }
    if (deliveryForm.start_date && deliveryForm.end_date && deliveryForm.end_date < deliveryForm.start_date) {
      toast('Data final da entrega não pode ser anterior à data inicial.', 'warning');
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
      // Compatibilidade com consumidores legados que ainda leem due_date.
      due_date: deliveryForm.end_date || null,
      organization_id: selectedOrganizationId || null,
      project_id: selectedProgramId,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateDelivery(editingId, payload);
      } else {
        await createDelivery(effectiveUserId, payload);
      }
      await loadDeliveriesForProject(selectedProgramId);
      toast(editingId ? 'Entrega atualizada.' : 'Entrega criada.', 'success');
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar entrega.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    selectedProgramId,
    deliveryForm,
    selectedOrganizationId,
    editingId,
    effectiveUserId,
    deliveries.length,
    loadDeliveriesForProject,
    toast,
    closeModal,
  ]);

  const deleteDeliveryById = useCallback(
    async (id: string) => {
      const t = deliveries.find(d => d.id === id);
      if (!t || !window.confirm(`Excluir "${t.name}"?`)) return;
      setDeleting(id);
      try {
        await deleteDelivery(id);
        if (selectedDeliveryId === id) {
          setSelectedDeliveryId(null);
          setSelectedActivityId(null);
          setTasks([]);
        }
        if (selectedProgramId) await loadDeliveriesForProject(selectedProgramId);
        toast('Entrega removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir entrega.', 'error');
      } finally {
        setDeleting(null);
      }
    },
    [deliveries, selectedDeliveryId, selectedProgramId, loadDeliveriesForProject, toast],
  );

  // ── CRUD: Activity (Initiative) ──────────────────────────────────────

  const saveActivity = useCallback(async () => {
    if (saving) return;
    if (!selectedDeliveryId) {
      toast('Selecione uma entrega.', 'warning');
      return;
    }
    const name = activityForm.name.trim();
    if (!name) {
      toast('Nome é obrigatório.', 'warning');
      return;
    }
    if (!activityForm.start_date) {
      toast('Data inicial é obrigatória.', 'warning');
      return;
    }
    if (!activityForm.end_date) {
      toast('Data final é obrigatória.', 'warning');
      return;
    }
    if (!activityForm.leader_id) {
      toast('Responsável é obrigatório.', 'warning');
      return;
    }
    if (!activityForm.internal_leader_id) {
      toast('Lider Interno é obrigatório.', 'warning');
      return;
    }
    const percentVal = Math.round(Math.min(100, Math.max(0, Number(activityForm.percent) || 0)));

    // Validate: sum of all activity percents for this delivery must be <= 100
    const othersSum = selectedDeliveryActivities
      .filter(a => a.id !== editingId)
      .reduce((sum, a) => sum + (a.percent ?? 0), 0);
    if (othersSum + percentVal > 100) {
      toast(
        `A soma dos pesos ultrapassa 100% (atual: ${othersSum}% + ${percentVal}% = ${othersSum + percentVal}%). Revise os percentuais das atividades.`,
        'error',
      );
      return;
    }

    setSaving(true);
    try {
      const leaderPerson = people.find(p => p.id === activityForm.leader_id);
      const leaderName = leaderPerson
        ? leaderPerson.preferred_name?.trim() || leaderPerson.full_name
        : activityForm.leader_id || null;
      const internalLeaderPerson = people.find(p => p.id === activityForm.internal_leader_id);
      const internalLeaderName = internalLeaderPerson
        ? internalLeaderPerson.preferred_name?.trim() || internalLeaderPerson.full_name
        : null;

      if (editingId) {
        const upd = await initiativesApi.updateInitiative(editingId, {
          name: sanitizeText(name),
          description: activityForm.description.trim() ? sanitizeText(activityForm.description.trim()) : null,
          start_date: activityForm.start_date || null,
          end_date: activityForm.end_date || null,
          status: activityForm.status || 'Não Iniciado',
          leader: leaderName,
          internal_leader: internalLeaderName,
          weight: String(percentVal),
        });
        if (!upd.ok) throw new Error(upd.error);
        const pResult = await initiativesApi.replaceParticipants(editingId, activityForm.participant_ids.filter(Boolean));
        if (!pResult.ok) throw new Error(pResult.error);
      } else {
        const cResult = await initiativesApi.createInitiative({
          delivery_id: selectedDeliveryId!,
          name: sanitizeText(name),
          description: activityForm.description.trim() ? sanitizeText(activityForm.description.trim()) : null,
          start_date: activityForm.start_date || null,
          end_date: activityForm.end_date || null,
          status: activityForm.status || 'Não Iniciado',
          leader: leaderName,
          internal_leader: internalLeaderName,
          organization_id: selectedOrganizationId || null,
          farm_id: selectedFarmId || null,
          weight: String(percentVal),
        });
        if (!cResult.ok) throw new Error(cResult.error);
        const newId = cResult.data?.id;
        if (newId && activityForm.participant_ids.filter(Boolean).length > 0) {
          await initiativesApi.replaceParticipants(newId, activityForm.participant_ids.filter(Boolean));
        }
      }
      await loadActivitiesForDelivery(selectedDeliveryId!);
      toast(editingId ? 'Macro atividade atualizada.' : 'Macro atividade criada.', 'success');
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar macro atividade.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    selectedDeliveryId,
    activityForm,
    editingId,
    effectiveUserId,
    selectedOrganizationId,
    selectedFarmId,
    people,
    selectedDeliveryActivities.length,
    loadActivitiesForDelivery,
    toast,
    closeModal,
  ]);

  const deleteActivityById = useCallback(
    async (id: string) => {
      const t = selectedDeliveryActivities.find(a => a.id === id);
      if (!t || !window.confirm(`Excluir "${t.name}"?`)) return;
      setDeleting(id);
      try {
        await deleteInitiative(id);
        if (selectedActivityId === id) {
          setSelectedActivityId(null);
          setTasks([]);
        }
        if (selectedDeliveryId) await loadActivitiesForDelivery(selectedDeliveryId);
        toast('Macro atividade removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir macro atividade.', 'error');
      } finally {
        setDeleting(null);
      }
    },
    [selectedDeliveryActivities, selectedActivityId, selectedDeliveryId, loadActivitiesForDelivery, toast],
  );

  // ── CRUD: Task ────────────────────────────────────────────────────────

  const saveTask = useCallback(async () => {
    if (saving) return;
    if (!selectedActivityId) {
      toast('Selecione uma macro atividade.', 'warning');
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
    const durationDays = Math.max(1, Number.parseInt(taskForm.duration_days || '1', 10) || 1);
    const dueDate = addDaysIso(activityDate, durationDays - 1) || null;

    setSaving(true);
    try {
      if (editingId) {
        await updateTask(editingId, {
          title: sanitizeText(title),
          description: taskForm.description.trim() ? sanitizeText(taskForm.description.trim()) : null,
          responsible_person_id: taskForm.responsible_person_id,
          activity_date: activityDate,
          duration_days: durationDays,
          due_date: dueDate,
          completed: taskForm.completed,
          kanban_status: taskForm.kanban_status as import('../lib/tasks').KanbanStatus,
        });
      } else {
        const milestoneId = await ensureDefaultMilestone(selectedActivityId);
        const order = tasks.length;
        await createTask({
          milestone_id: milestoneId,
          title: sanitizeText(title),
          description: taskForm.description.trim() ? sanitizeText(taskForm.description.trim()) : null,
          responsible_person_id: taskForm.responsible_person_id,
          activity_date: activityDate,
          duration_days: durationDays,
          due_date: dueDate,
          sort_order: order,
          kanban_status: taskForm.kanban_status as import('../lib/tasks').KanbanStatus,
          kanban_order: order,
        });
      }
      // Reload activities (which include tasks via milestones) — refreshTasks runs reactively via useEffect
      if (selectedDeliveryId) await loadActivitiesForDelivery(selectedDeliveryId);
      toast(editingId ? 'Tarefa atualizada.' : 'Tarefa criada.', 'success');
      closeModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar tarefa.', 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, selectedActivityId, taskForm, editingId, tasks.length, selectedDeliveryId, loadActivitiesForDelivery, toast, closeModal]);

  const deleteTaskById = useCallback(
    async (id: string) => {
      const t = tasks.find(tk => tk.id === id);
      if (!t || !window.confirm(`Excluir "${t.title}"?`)) return;
      setDeleting(id);
      try {
        await deleteTask(id);
        // Reload activities (tasks are embedded) — refreshTasks runs reactively
        if (selectedDeliveryId) await loadActivitiesForDelivery(selectedDeliveryId);
        toast('Tarefa removida.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao excluir tarefa.', 'error');
      } finally {
        setDeleting(null);
      }
    },
    [tasks, selectedDeliveryId, loadActivitiesForDelivery, toast],
  );

  // ── Selection handlers ────────────────────────────────────────────────

  const selectProgram = useCallback((id: string) => {
    setSelectedProgramId(id);
    setSelectedDeliveryId(null);
    setSelectedActivityId(null);
    setTasks([]);
  }, []);

  const selectDelivery = useCallback((id: string) => {
    setSelectedDeliveryId(id);
    setSelectedActivityId(null);
    setTasks([]);
  }, []);

  const selectActivity = useCallback((id: string) => {
    setSelectedActivityId(id);
  }, []);

  const noopSelect = useCallback(() => { }, []);

  const updateSortOrderForTable = useCallback(
    async (
      table: 'projects' | 'deliveries' | 'initiatives' | 'initiative_milestones' | 'initiative_tasks',
      id: string,
      sort_order: number,
    ) => {
      const unwrap = <T,>(r: { ok: true; data: T } | { ok: false; error: string }) => {
        if (!r.ok) throw new Error((r as { ok: false; error: string }).error);
      };
      if (table === 'projects') unwrap(await projectsApi.updateProject(id, { sort_order }));
      else if (table === 'deliveries') unwrap(await deliveriesApi.updateDelivery(id, { sort_order }));
      else if (table === 'initiatives') unwrap(await initiativesApi.updateInitiative(id, { sort_order }));
      else if (table === 'initiative_milestones') unwrap(await milestonesApi.updateMilestone(id, { sort_order }));
      else if (table === 'initiative_tasks') unwrap(await tasksApi.updateTask(id, { sort_order }));
    },
    [],
  );

  const swapSortOrder = useCallback(
    async (
      table: 'projects' | 'deliveries' | 'initiatives' | 'initiative_milestones' | 'initiative_tasks',
      first: { id: string; sort_order: number },
      second: { id: string; sort_order: number },
    ) => {
      await Promise.all([
        updateSortOrderForTable(table, first.id, second.sort_order),
        updateSortOrderForTable(table, second.id, first.sort_order),
      ]);
    },
    [updateSortOrderForTable],
  );

  const moveProgram = useCallback(
    async (id: string, direction: -1 | 1) => {
      const currentIndex = projects.findIndex(project => project.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= projects.length) return;

      const current = projects[currentIndex];
      const target = projects[targetIndex];
      if (!current || !target) return;

      setProjects(prev => swapSortOrderLocally(prev, current.id, target.id));
      try {
        await swapSortOrder('projects', current, target);
      } catch (err) {
        await loadProjects();
        toast(err instanceof Error ? err.message : 'Erro ao reordenar projetos.', 'error');
      }
    },
    [projects, swapSortOrder, loadProjects, toast],
  );

  const moveDelivery = useCallback(
    async (id: string, direction: -1 | 1) => {
      const currentIndex = deliveries.findIndex(delivery => delivery.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= deliveries.length) return;

      const current = deliveries[currentIndex];
      const target = deliveries[targetIndex];
      if (!current || !target) return;

      setDeliveries(prev => swapSortOrderLocally(prev, current.id, target.id));
      try {
        await swapSortOrder('deliveries', current, target);
      } catch (err) {
        if (selectedProgramId) await loadDeliveriesForProject(selectedProgramId);
        toast(err instanceof Error ? err.message : 'Erro ao reordenar entregas.', 'error');
      }
    },
    [deliveries, swapSortOrder, selectedProgramId, loadDeliveriesForProject, toast],
  );

  const moveActivity = useCallback(
    async (id: string, direction: -1 | 1) => {
      const currentIndex = selectedDeliveryActivities.findIndex(activity => activity.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selectedDeliveryActivities.length) return;

      const current = selectedDeliveryActivities[currentIndex];
      const target = selectedDeliveryActivities[targetIndex];
      if (!current || !target) return;

      const currentSortOrder = current.sort_order ?? currentIndex;
      const targetSortOrder = target.sort_order ?? targetIndex;

      setInitiatives(prev =>
        prev.map(init => {
          if (init.id === current.id) return { ...init, sort_order: targetSortOrder };
          if (init.id === target.id) return { ...init, sort_order: currentSortOrder };
          return init;
        }),
      );

      try {
        await swapSortOrder(
          'initiatives',
          { id: current.id, sort_order: currentSortOrder },
          { id: target.id, sort_order: targetSortOrder },
        );
      } catch (err) {
        if (selectedDeliveryId) await loadActivitiesForDelivery(selectedDeliveryId);
        toast(err instanceof Error ? err.message : 'Erro ao reordenar atividades.', 'error');
      }
    },
    [selectedDeliveryActivities, swapSortOrder, selectedDeliveryId, loadActivitiesForDelivery, toast],
  );

  const moveTask = useCallback(
    async (id: string, direction: -1 | 1) => {
      const currentIndex = tasks.findIndex(task => task.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= tasks.length) return;

      const current = tasks[currentIndex];
      const target = tasks[targetIndex];
      if (!current || !target) return;

      setTasks(prev => swapSortOrderLocally(prev, current.id, target.id));
      try {
        await swapSortOrder('initiative_tasks', current, target);
      } catch (err) {
        await refreshTasks();
        toast(err instanceof Error ? err.message : 'Erro ao reordenar tarefas.', 'error');
      }
    },
    [tasks, swapSortOrder, refreshTasks, toast],
  );

  const batchUpdateSortOrder = useCallback(
    async (
      table: 'projects' | 'deliveries' | 'initiatives' | 'initiative_milestones' | 'initiative_tasks',
      updates: { id: string; sort_order: number }[],
    ) => {
      await Promise.all(updates.map(({ id, sort_order }) => updateSortOrderForTable(table, id, sort_order)));
    },
    [updateSortOrderForTable],
  );

  const reorderPrograms = useCallback(
    async (activeId: string, overIndex: number) => {
      const oldIndex = projects.findIndex(p => p.id === activeId);
      if (oldIndex < 0 || oldIndex === overIndex) return;
      const reordered = arrayMove(projects, oldIndex, overIndex).map((p: ProjectRow, i) => ({
        ...p,
        sort_order: i,
      }));
      setProjects(reordered);
      try {
        await batchUpdateSortOrder(
          'projects',
          reordered.map(p => ({ id: p.id, sort_order: p.sort_order })),
        );
      } catch (err) {
        await loadProjects();
        toast(err instanceof Error ? err.message : 'Erro ao reordenar projetos.', 'error');
      }
    },
    [projects, batchUpdateSortOrder, loadProjects, toast],
  );

  const reorderDeliveries = useCallback(
    async (activeId: string, overIndex: number) => {
      const oldIndex = deliveries.findIndex(d => d.id === activeId);
      if (oldIndex < 0 || oldIndex === overIndex) return;
      const reordered = arrayMove(deliveries, oldIndex, overIndex).map((d: DeliveryRow, i) => ({
        ...d,
        sort_order: i,
      }));
      setDeliveries(reordered);
      try {
        await batchUpdateSortOrder(
          'deliveries',
          reordered.map(d => ({ id: d.id, sort_order: d.sort_order })),
        );
      } catch (err) {
        if (selectedProgramId) await loadDeliveriesForProject(selectedProgramId);
        toast(err instanceof Error ? err.message : 'Erro ao reordenar entregas.', 'error');
      }
    },
    [deliveries, batchUpdateSortOrder, selectedProgramId, loadDeliveriesForProject, toast],
  );

  const reorderActivities = useCallback(
    async (activeId: string, overIndex: number) => {
      const oldIndex = selectedDeliveryActivities.findIndex(a => a.id === activeId);
      if (oldIndex < 0 || oldIndex === overIndex) return;
      const reordered = arrayMove(selectedDeliveryActivities, oldIndex, overIndex).map(
        (a: InitiativeWithProgress, i) => ({
          ...a,
          sort_order: i,
        }),
      );
      setInitiatives(prev =>
        prev.map(init => {
          const updated = reordered.find(r => r.id === init.id);
          return updated ? { ...init, sort_order: updated.sort_order } : init;
        }),
      );
      try {
        await batchUpdateSortOrder(
          'initiatives',
          reordered.map(a => ({ id: a.id, sort_order: a.sort_order ?? 0 })),
        );
      } catch (err) {
        if (selectedDeliveryId) await loadActivitiesForDelivery(selectedDeliveryId);
        toast(err instanceof Error ? err.message : 'Erro ao reordenar atividades.', 'error');
      }
    },
    [selectedDeliveryActivities, batchUpdateSortOrder, selectedDeliveryId, loadActivitiesForDelivery, toast],
  );

  const reorderTasks = useCallback(
    async (activeId: string, overIndex: number) => {
      const oldIndex = tasks.findIndex(t => t.id === activeId);
      if (oldIndex < 0 || oldIndex === overIndex) return;
      const reordered = arrayMove(tasks, oldIndex, overIndex).map((t: WorkbenchTask, i) => ({
        ...t,
        sort_order: i,
      }));
      setTasks(reordered);
      try {
        await batchUpdateSortOrder(
          'initiative_tasks',
          reordered.map(t => ({ id: t.id, sort_order: t.sort_order })),
        );
      } catch (err) {
        await refreshTasks();
        toast(err instanceof Error ? err.message : 'Erro ao reordenar tarefas.', 'error');
      }
    },
    [tasks, batchUpdateSortOrder, refreshTasks, toast],
  );

  // ── Render ────────────────────────────────────────────────────────────

  if (loadingProjects && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-ai-accent" />
      </div>
    );
  }

  if (errorMessage && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={loadProjects}
          className="inline-flex items-center gap-2 rounded-md border border-ai-border px-4 py-2 text-sm text-ai-text hover:bg-ai-surface transition-colors"
        >
          <RefreshCw size={14} />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readonly ? (
        <p className="text-sm text-ai-subtext">
          Visualização do Projeto da fazenda selecionada.
        </p>
      ) : (
        <p className="text-sm text-ai-subtext">
          Cadastre o <strong>Projeto</strong>, depois a <strong>Entrega</strong>, em seguida as{' '}
          <strong>Atividades</strong> e por fim as <strong>Tarefas</strong>.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <HierarchyColumn
          title="Projetos"
          icon={<FolderOpen size={12} className="text-indigo-500" />}
          emptyLabel="Nenhum projeto cadastrado."
          items={programItems}
          selectedId={selectedProgramId}
          accentClassName="bg-indigo-100 text-indigo-900"
          addLabel="Novo"
          loading={loadingProjects}
          onAdd={readonly ? undefined : () => openCreateModal('program')}
          onSelect={selectProgram}
          onEdit={readonly ? undefined : openEditProgram}
          onDelete={readonly ? undefined : deleteProgramById}
          onMoveUp={readonly ? undefined : id => moveProgram(id, -1)}
          onMoveDown={readonly ? undefined : id => moveProgram(id, 1)}
          onReorder={readonly ? undefined : reorderPrograms}
        />

        <HierarchyColumn
          title="Entregas"
          icon={<Package size={12} className="text-blue-500" />}
          emptyLabel={selectedProgramId ? 'Nenhuma entrega.' : 'Selecione um projeto.'}
          items={deliveryItems}
          selectedId={selectedDeliveryId}
          accentClassName="bg-blue-100 text-blue-900"
          addLabel="Nova"
          addDisabled={!selectedProgramId}
          loading={loadingDeliveries}
          onAdd={readonly ? undefined : () => openCreateModal('delivery')}
          onSelect={selectDelivery}
          onEdit={readonly ? undefined : openEditDelivery}
          onDelete={readonly ? undefined : deleteDeliveryById}
          onMoveUp={readonly ? undefined : id => moveDelivery(id, -1)}
          onMoveDown={readonly ? undefined : id => moveDelivery(id, 1)}
          onReorder={readonly ? undefined : reorderDeliveries}
        />

        <HierarchyColumn
          title="Atividades"
          icon={<Layers size={12} className="text-emerald-500" />}
          emptyLabel={selectedDeliveryId ? 'Nenhuma atividade.' : 'Selecione uma entrega.'}
          items={activityItems}
          selectedId={selectedActivityId}
          accentClassName="bg-emerald-100 text-emerald-900"
          addLabel="Nova"
          addDisabled={!selectedDeliveryId}
          loading={loadingActivities}
          onAdd={readonly ? undefined : () => openCreateModal('activity')}
          onSelect={selectActivity}
          onEdit={readonly ? undefined : openEditActivity}
          onDelete={readonly ? undefined : deleteActivityById}
          onMoveUp={readonly ? undefined : id => moveActivity(id, -1)}
          onMoveDown={readonly ? undefined : id => moveActivity(id, 1)}
          onReorder={readonly ? undefined : reorderActivities}
        />

        <HierarchyColumn
          title="Tarefas"
          icon={<CheckSquare size={12} className="text-amber-500" />}
          emptyLabel={selectedActivityId ? 'Nenhuma tarefa.' : 'Selecione uma macro atividade.'}
          items={taskItems}
          selectedId={null}
          accentClassName="bg-amber-100 text-amber-900"
          addLabel="Nova"
          addDisabled={!selectedActivityId}
          loading={loadingTasks}
          onAdd={readonly ? undefined : () => openCreateModal('task')}
          onSelect={noopSelect}
          onEdit={readonly ? undefined : openEditTask}
          onDelete={readonly ? undefined : deleteTaskById}
          onMoveUp={readonly ? undefined : id => moveTask(id, -1)}
          onMoveDown={readonly ? undefined : id => moveTask(id, 1)}
          onReorder={readonly ? undefined : reorderTasks}
        />
      </div>

      {modalEntity === 'program' && (
        <ProjectModal
          form={programForm}
          onChange={setProgramForm}
          onSave={saveProgram}
          onClose={closeModal}
          saving={saving}
          mode={modalMode}
          people={people}
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
          peopleForResponsavel={peopleForResponsavel}
          peopleForLiderInterno={peopleForLiderInterno}
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

export default ProjectWorkbench;
