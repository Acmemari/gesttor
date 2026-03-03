import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  ChevronRight,
  FolderOpen,
  X,
  Users,
  Flag,
  UserPlus,
  Loader2,
  ArrowLeft,
  Pencil,
  Trash2,
  CheckCircle,
  CheckSquare,
  Square,
  User,
  AlertTriangle,
  Calendar,
  Filter,
  BarChart3,
  List,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import {
  fetchInitiatives,
  createInitiative,
  updateInitiative,
  fetchInitiativeForEdit,
  fetchInitiativeDetail,
  toggleMilestoneCompleted,
  deleteInitiative,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskCompleted,
  type InitiativeWithProgress,
  type InitiativeMilestoneRow,
  type InitiativeTaskRow,
} from '../lib/initiatives';
import { fetchProjects, type ProjectRow } from '../lib/projects';
import { fetchPeople, type Person } from '../lib/people';
import { fetchDeliveries, type DeliveryRow } from '../lib/deliveries';
import { EvidenciaEntregaModal } from '../components/EvidenciaEntregaModal';
import DateInputBR from '../components/DateInputBR';
import ErrorBoundary from '../components/ErrorBoundary';

const InitiativesGantt = lazy(() => import('../components/InitiativesGantt'));
import type { ZoomLevel } from '../components/InitiativesGantt';

type PeriodPreset = 'next-month' | 'next-quarter' | 'next-year' | 'custom' | null;

const STATUS_OPTIONS = ['Não Iniciado', 'Em Andamento', 'Suspenso', 'Concluído', 'Atrasado'];

interface MilestoneRow {
  id: string;
  title: string;
  percent: number;
  dueDate: string;
  completed?: boolean;
}

interface TaskDraftRow {
  title: string;
  description: string;
  responsiblePersonId: string;
  activityDate: string;
  durationDays: string;
  dueDate: string;
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number): string {
  try {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const dt = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setDate(dt.getDate() + (Number.isFinite(days) ? days : 0));
    return toLocalIso(dt);
  } catch {
    return '';
  }
}

/** UUID compatível com navegadores antigos (fallback para crypto.randomUUID) */
function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface InitiativesActivitiesProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/**
 * Lista de Atividades (iniciativas/projetos).
 * - Analista vê suas próprias iniciativas (created_by = user.id)
 * - Admin vê as iniciativas do analista selecionado (created_by = selectedAnalyst.id)
 * - Filtros por cliente e fazenda via contexto global (header)
 */
const InitiativesActivities: React.FC<InitiativesActivitiesProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();

  // ─── Identidade efetiva ───────────────────────────────────────────
  const isAdmin = user?.role === 'admin';

  /** ID do analista cujas iniciativas são exibidas */
  const effectiveUserId = useMemo(
    () => (isAdmin && selectedAnalyst ? selectedAnalyst.id : user?.id),
    [isAdmin, selectedAnalyst, user?.id],
  );

  /** Admin sem analista selecionado = bloqueio parcial (não pode criar) */
  const adminMissingAnalyst = isAdmin && !selectedAnalyst;

  /** Precisamos de analista + cliente para criar nova iniciativa */
  const canCreate = !!effectiveUserId && !!selectedClient;

  // ─── State ────────────────────────────────────────────────────────
  const [initiatives, setInitiatives] = useState<InitiativeWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingInitiative, setEditingInitiative] = useState<InitiativeWithProgress | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [viewingInitiative, setViewingInitiative] = useState<Awaited<ReturnType<typeof fetchInitiativeDetail>> | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'geral' | 'time'>('geral');
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);
  const [deletingInitiativeId, setDeletingInitiativeId] = useState<string | null>(null);
  const [viewingEvidenceMilestone, setViewingEvidenceMilestone] = useState<{
    milestone: InitiativeMilestoneRow;
    initiativeName: string;
  } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [initiativeToDelete, setInitiativeToDelete] = useState<InitiativeWithProgress | null>(null);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraftRow>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState<TaskDraftRow>({
    title: '',
    description: '',
    responsiblePersonId: '',
    activityDate: '',
    durationDays: '1',
    dueDate: '',
  });
  const [savingTaskForMilestone, setSavingTaskForMilestone] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterLeader, setFilterLeader] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState<'status' | 'leader' | null>(null);
  const [viewMode, setViewMode] = useState<'lista' | 'gantt'>('lista');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [ganttZoom, setGanttZoom] = useState<ZoomLevel>('day');

  const calcPresetRange = useCallback((preset: PeriodPreset): { start: string; end: string } => {
    if (!preset || preset === 'custom') return { start: '', end: '' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getTime());

    if (preset === 'next-month') {
      const end = new Date(today.getTime());
      end.setMonth(end.getMonth() + 1);
      return { start: toLocalIso(start), end: toLocalIso(end) };
    }
    if (preset === 'next-quarter') {
      const end = new Date(today.getTime());
      end.setMonth(end.getMonth() + 3);
      return { start: toLocalIso(start), end: toLocalIso(end) };
    }
    if (preset === 'next-year') {
      const end = new Date(today.getTime());
      end.setFullYear(end.getFullYear() + 1);
      return { start: toLocalIso(start), end: toLocalIso(end) };
    }
    return { start: '', end: '' };
  }, []);

  const applyPreset = useCallback(
    (preset: 'next-month' | 'next-quarter' | 'next-year') => {
      setPeriodPreset(preset);
      const { start, end } = calcPresetRange(preset);
      setPeriodStart(start);
      setPeriodEnd(end);
      if (preset === 'next-month') setGanttZoom('day');
      else if (preset === 'next-quarter') setGanttZoom('week');
      else setGanttZoom('month');
    },
    [calcPresetRange],
  );

  const applyCustomRange = useCallback((start: string, end: string) => {
    setPeriodPreset('custom');
    setPeriodStart(start);
    setPeriodEnd(end);
    if (start && end) {
      const s = new Date(start + 'T00:00:00');
      const e = new Date(end + 'T00:00:00');
      const days = Math.ceil((e.getTime() - s.getTime()) / 86400000);
      if (days <= 31) setGanttZoom('day');
      else if (days <= 92) setGanttZoom('week');
      else setGanttZoom('month');
    }
  }, []);

  const clearPeriod = useCallback(() => {
    setPeriodPreset(null);
    setPeriodStart('');
    setPeriodEnd('');
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    tags: '',
    description: '',
    startDate: '',
    endDate: '',
    status: 'Não Iniciado',
    deliveryId: '',
    leaderId: '' as string,
    teamIds: [] as string[],
    milestones: [{ id: safeUUID(), title: '', percent: 0, dueDate: '' }] as MilestoneRow[],
  });

  // ─── Helpers Modal ────────────────────────────────────────────────
  const resetForm = () =>
    setFormData({
      name: '',
      tags: '',
      description: '',
      startDate: '',
      endDate: '',
      status: 'Não Iniciado',
      deliveryId: '',
      leaderId: '',
      teamIds: [],
      milestones: [{ id: safeUUID(), title: '', percent: 0, dueDate: '' }],
    });

  const openNewModal = () => {
    if (!canCreate) {
      onToast?.(
        isAdmin
          ? 'Selecione um Analista e um Cliente antes de criar uma iniciativa.'
          : 'Selecione um Cliente antes de criar uma iniciativa.',
        'warning',
      );
      return;
    }
    setEditingInitiative(null);
    resetForm();
    setShowNewModal(true);
  };

  const closeModal = () => {
    setShowNewModal(false);
    setEditingInitiative(null);
    setFormErrorMessage(null);
  };

  // ─── Gestão (detalhe) ────────────────────────────────────────────
  const openGestaoView = async (init: InitiativeWithProgress) => {
    setLoadingDetail(true);
    setViewingInitiative(null);
    try {
      const detail = await fetchInitiativeDetail(init.id);
      setViewingInitiative(detail);
      setActiveTab('geral');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar iniciativa', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeGestaoView = () => setViewingInitiative(null);

  const refreshViewingInitiative = useCallback(async () => {
    if (!viewingInitiative) return;
    const updated = await fetchInitiativeDetail(viewingInitiative.id);
    setViewingInitiative(updated);
  }, [viewingInitiative]);

  const openEditModalFromGestao = async () => {
    if (!viewingInitiative) return;
    await openEditModal(viewingInitiative);
    closeGestaoView();
  };

  const getTaskDraft = useCallback(
    (milestoneId: string): TaskDraftRow =>
      taskDrafts[milestoneId] || {
        title: '',
        description: '',
        responsiblePersonId: '',
        activityDate: toLocalIso(new Date()),
        durationDays: '1',
        dueDate: '',
      },
    [taskDrafts],
  );

  const updateTaskDraft = (milestoneId: string, field: keyof TaskDraftRow, value: string) => {
    setTaskDrafts(prev => ({
      ...prev,
      [milestoneId]: {
        ...(prev[milestoneId] || {
          title: '',
          description: '',
          responsiblePersonId: '',
          activityDate: toLocalIso(new Date()),
          durationDays: '1',
          dueDate: '',
        }),
        [field]: value,
      },
    }));
  };

  const handleCreateTask = async (milestone: InitiativeMilestoneRow) => {
    if (!viewingInitiative) return;
    const draft = getTaskDraft(milestone.id);
    if (!draft.title.trim()) {
      onToast?.('O título da tarefa é obrigatório.', 'warning');
      return;
    }
    if (!draft.responsiblePersonId.trim()) {
      onToast?.('Selecione um responsável para a tarefa.', 'warning');
      return;
    }

    const normalizedStart = draft.activityDate || toLocalIso(new Date());
    const normalizedDuration = Math.max(1, Number.parseInt(draft.durationDays || '1', 10) || 1);
    const computedDueDate = addDaysIso(normalizedStart, normalizedDuration - 1);

    setSavingTaskForMilestone(milestone.id);
    try {
      await createTask(milestone.id, {
        title: draft.title,
        description: draft.description || undefined,
        responsible_person_id: draft.responsiblePersonId,
        activity_date: normalizedStart,
        duration_days: normalizedDuration,
        due_date: computedDueDate || null,
        sort_order: (milestone.tasks || []).length,
      });
      setTaskDrafts(prev => ({
        ...prev,
        [milestone.id]: {
          title: '',
          description: '',
          responsiblePersonId: '',
          activityDate: toLocalIso(new Date()),
          durationDays: '1',
          dueDate: '',
        },
      }));
      await refreshViewingInitiative();
      await loadInitiatives();
      onToast?.('Tarefa criada com sucesso.', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao criar tarefa', 'error');
    } finally {
      setSavingTaskForMilestone(null);
    }
  };

  const startEditTask = (task: InitiativeTaskRow) => {
    setEditingTaskId(task.id);
    const fallbackDueDate = task.due_date || toLocalIso(new Date());
    setTaskEditDraft({
      title: task.title || '',
      description: task.description || '',
      responsiblePersonId: task.responsible_person_id || '',
      activityDate: task.activity_date || fallbackDueDate,
      durationDays: String(Math.max(1, task.duration_days || 1)),
      dueDate: task.due_date || fallbackDueDate,
    });
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setTaskEditDraft({
      title: '',
      description: '',
      responsiblePersonId: '',
      activityDate: '',
      durationDays: '1',
      dueDate: '',
    });
  };

  const handleUpdateTask = async (taskId: string) => {
    if (!taskEditDraft.title.trim()) {
      onToast?.('O título da tarefa é obrigatório.', 'warning');
      return;
    }
    if (!taskEditDraft.responsiblePersonId.trim()) {
      onToast?.('Selecione um responsável para a tarefa.', 'warning');
      return;
    }

    const normalizedStart = taskEditDraft.activityDate || toLocalIso(new Date());
    const normalizedDuration = Math.max(1, Number.parseInt(taskEditDraft.durationDays || '1', 10) || 1);
    const computedDueDate = addDaysIso(normalizedStart, normalizedDuration - 1);

    setUpdatingTaskId(taskId);
    try {
      await updateTask(taskId, {
        title: taskEditDraft.title,
        description: taskEditDraft.description || null,
        responsible_person_id: taskEditDraft.responsiblePersonId,
        activity_date: normalizedStart,
        duration_days: normalizedDuration,
        due_date: computedDueDate || null,
      });
      cancelEditTask();
      await refreshViewingInitiative();
      await loadInitiatives();
      onToast?.('Tarefa atualizada com sucesso.', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao atualizar tarefa', 'error');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    setUpdatingTaskId(taskId);
    try {
      await toggleTaskCompleted(taskId);
      await refreshViewingInitiative();
      await loadInitiatives();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao atualizar tarefa', 'error');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      await deleteTask(taskId);
      if (editingTaskId === taskId) cancelEditTask();
      await refreshViewingInitiative();
      await loadInitiatives();
      onToast?.('Tarefa removida.', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao remover tarefa', 'error');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const personDisplayName = (p: Person | null | undefined): string => p?.preferred_name?.trim() || p?.full_name || '—';

  const peopleById = useMemo(
    () =>
      people.reduce<Record<string, Person>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}),
    [people],
  );

  const openEditModal = async (init: InitiativeWithProgress) => {
    setEditingInitiative(init);
    setLoadingEdit(true);
    setShowNewModal(true);
    try {
      const [editData, peopleList] = await Promise.all([
        fetchInitiativeForEdit(init.id),
        effectiveUserId ? fetchPeople(effectiveUserId) : Promise.resolve([]),
      ]);
      const { initiative, team, milestones } = editData;
      const leaderId = peopleList.find(p => personDisplayName(p) === (initiative.leader || '').trim())?.id || '';
      const leaderNameTrim = (initiative.leader || '').trim();
      const teamIds = (team || [])
        .filter(n => n?.trim() && n.trim() !== leaderNameTrim)
        .map(name => peopleList.find(p => personDisplayName(p) === name.trim())?.id)
        .filter((id): id is string => !!id)
        .slice(0, 5);
      setFormData({
        name: initiative.name || '',
        tags: initiative.tags || '',
        description: initiative.description || '',
        startDate: initiative.start_date ? initiative.start_date.slice(0, 10) : '',
        endDate: initiative.end_date ? initiative.end_date.slice(0, 10) : '',
        status: (initiative.status as typeof formData.status) || 'Não Iniciado',
        deliveryId: initiative.delivery_id || '',
        leaderId,
        teamIds: teamIds.length > 0 ? teamIds : [],
        milestones:
          milestones.length > 0
            ? milestones.map(m => ({
                id: m.id,
                title: m.title,
                percent: m.percent,
                dueDate: m.due_date ? m.due_date.slice(0, 10) : '',
                completed: m.completed,
              }))
            : [{ id: safeUUID(), title: '', percent: 0, dueDate: '' }],
      });
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar iniciativa', 'error');
      closeModal();
    } finally {
      setLoadingEdit(false);
    }
  };

  // ─── Marcos ───────────────────────────────────────────────────────
  const handleToggleMilestone = async (milestoneId: string) => {
    setTogglingMilestone(milestoneId);
    try {
      await toggleMilestoneCompleted(milestoneId);
      // Recarregar detalhe e lista
      if (viewingInitiative) {
        const updated = await fetchInitiativeDetail(viewingInitiative.id);
        setViewingInitiative(updated);
      }
      await loadInitiatives();
      onToast?.('Atividade atualizada.', 'success');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao atualizar atividade', 'error');
    } finally {
      setTogglingMilestone(null);
    }
  };

  const addMilestone = () => {
    setFormData(prev => ({
      ...prev,
      milestones: [...prev.milestones, { id: safeUUID(), title: '', percent: 0, dueDate: '' }],
    }));
  };

  const updateMilestone = (id: string, field: 'title' | 'percent' | 'dueDate', value: string | number) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.map(m =>
        m.id === id ? { ...m, [field]: field === 'percent' ? Number(value) || 0 : String(value) } : m,
      ),
    }));
  };

  const removeMilestone = (id: string) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.filter(m => m.id !== id),
    }));
  };

  // ─── Time (máx. 5 pessoas do cadastro) ────────────────────────────
  const addTeamMember = () => {
    setFormData(prev => (prev.teamIds.length < 5 ? { ...prev, teamIds: [...prev.teamIds, ''] } : prev));
  };

  const updateTeamMember = (index: number, personId: string) => {
    setFormData(prev => {
      const next = [...prev.teamIds];
      next[index] = personId;
      return { ...prev, teamIds: next };
    });
  };

  const removeTeamMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      teamIds: prev.teamIds.filter((_, i) => i !== index),
    }));
  };

  // Ao mudar o líder, removê-lo do time se estiver como membro
  const handleLeaderChange = (leaderId: string) => {
    setFormData(prev => ({
      ...prev,
      leaderId,
      teamIds: prev.teamIds.filter(id => id !== leaderId),
    }));
  };

  const totalPercent = formData.milestones.reduce((s, m) => s + m.percent, 0);
  const isSaveDisabled =
    saving ||
    loadingEdit ||
    !canCreate ||
    !formData.name.trim() ||
    !formData.startDate?.trim() ||
    !formData.endDate?.trim() ||
    !formData.deliveryId?.trim() ||
    !formData.leaderId?.trim();

  // ─── Carregar lista ───────────────────────────────────────────────
  const loadInitiatives = useCallback(async () => {
    if (!effectiveUserId) {
      setInitiatives([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const filters: { clientId?: string; farmId?: string } = {};
      if (selectedClient?.id) filters.clientId = selectedClient.id;
      if (selectedFarm?.id) filters.farmId = selectedFarm.id;

      const list = await fetchInitiatives(effectiveUserId, Object.keys(filters).length > 0 ? filters : undefined);
      setInitiatives(list);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar iniciativas', 'error');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, selectedClient?.id, selectedFarm?.id, onToast]);

  useEffect(() => {
    loadInitiatives();
  }, [loadInitiatives]);

  // Carregar pessoas para líder e time (filtradas pela fazenda selecionada)
  useEffect(() => {
    if (!effectiveUserId) {
      setPeople([]);
      return;
    }
    const filters = selectedFarm?.id ? { farmId: selectedFarm.id } : undefined;
    fetchPeople(effectiveUserId, filters)
      .then(setPeople)
      .catch(err => {
        console.error('[InitiativesActivities] Erro ao carregar pessoas:', err);
        setPeople([]);
      });
  }, [effectiveUserId, selectedFarm?.id]);

  useEffect(() => {
    if (!effectiveUserId) {
      setProjects([]);
      return;
    }
    const filters = selectedClient?.id ? { clientId: selectedClient.id } : undefined;
    fetchProjects(effectiveUserId, filters)
      .then(setProjects)
      .catch(err => {
        console.error('[InitiativesActivities] Erro ao carregar programas:', err);
        setProjects([]);
      });
  }, [effectiveUserId, selectedClient?.id]);

  useEffect(() => {
    if (!effectiveUserId) {
      setDeliveries([]);
      return;
    }
    fetchDeliveries(effectiveUserId)
      .then(setDeliveries)
      .catch(err => {
        console.error('[InitiativesActivities] Erro ao carregar entregas:', err);
        setDeliveries([]);
      });
  }, [effectiveUserId]);

  const deliveriesById = useMemo(
    () =>
      deliveries.reduce<Record<string, string>>((acc, d) => {
        acc[d.id] = d.name;
        return acc;
      }, {}),
    [deliveries],
  );

  // ─── Filtros da lista ──────────────────────────────────────────
  const uniqueLeaders = useMemo(() => {
    const leaders = initiatives
      .map(i => i.leader)
      .filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
    return [...new Set(leaders)].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  }, [initiatives]);

  const uniqueTags = useMemo(() => {
    const tags = initiatives.flatMap(i => (i.tags || '').split(/\s+/)).filter(t => t.startsWith('#') && t.length > 1);
    return [...new Set(tags)].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  }, [initiatives]);

  const filteredInitiatives = useMemo(() => {
    return initiatives.filter(init => {
      if (filterStatus.length > 0 && !filterStatus.includes(init.status ?? 'Não Iniciado')) return false;
      if (filterLeader.length > 0 && !filterLeader.includes(init.leader ?? '')) return false;
      if (filterTag && !(init.tags || '').toLowerCase().includes(filterTag.toLowerCase())) return false;

      if (periodStart || periodEnd) {
        const start = init.start_date ?? '';
        const end = init.end_date ?? '';
        if (!start && !end) return false;
        if (periodEnd && start && start > periodEnd) return false;
        if (periodStart && end && end < periodStart) return false;
      }
      return true;
    });
  }, [initiatives, filterStatus, filterLeader, filterTag, periodStart, periodEnd]);

  const hasPeriodActive = !!(periodPreset || periodStart || periodEnd);

  const allowedZooms = useMemo((): ZoomLevel[] => {
    if (!periodStart || !periodEnd) return ['day', 'week', 'month', 'quarter'];
    const s = new Date(periodStart + 'T00:00:00');
    const e = new Date(periodEnd + 'T00:00:00');
    const days = Math.ceil((e.getTime() - s.getTime()) / 86400000);
    if (days <= 31) return ['day', 'week', 'month'];
    if (days <= 92) return ['day', 'week', 'month'];
    return ['day', 'week', 'month', 'quarter'];
  }, [periodStart, periodEnd]);

  const hasActiveFilters = filterStatus.length > 0 || filterLeader.length > 0 || !!filterTag || hasPeriodActive;

  const toggleFilterValue = useCallback(
    (current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
      setter(current.includes(value) ? current.filter(v => v !== value) : [...current, value]);
    },
    [],
  );

  // Limpar filtros de valores que não existem mais após recarregar dados
  useEffect(() => {
    if (filterLeader.length > 0) {
      const valid = filterLeader.filter(l => uniqueLeaders.includes(l));
      if (valid.length !== filterLeader.length) setFilterLeader(valid);
    }
  }, [uniqueLeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fechar detalhe/edição se mudar de analista/cliente/fazenda
  useEffect(() => {
    setViewingInitiative(null);
    closeModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, selectedClient?.id, selectedFarm?.id]);

  // Coerência zoom ↔ período: limitar zoom ao permitido quando allowedZooms restringe
  useEffect(() => {
    if (!allowedZooms.includes(ganttZoom)) {
      setGanttZoom(allowedZooms[0] ?? 'day');
    }
  }, [allowedZooms, ganttZoom]);

  // Fechar modal com ESC / fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openFilterDropdown) setOpenFilterDropdown(null);
        else if (showNewModal) closeModal();
        else if (viewingInitiative) closeGestaoView();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (openFilterDropdown && !(e.target as HTMLElement).closest('[data-filter-dropdown]')) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNewModal, viewingInitiative, openFilterDropdown]);

  // ─── Salvar ───────────────────────────────────────────────────────
  const handleSave = async () => {
    setFormErrorMessage(null);
    if (!user?.id) {
      setFormErrorMessage('Faça login para criar iniciativas.');
      onToast?.('Faça login para criar iniciativas.', 'warning');
      return;
    }

    // Validação front-end
    if (!formData.name.trim()) {
      setFormErrorMessage('Preencha os campos obrigatórios: Nome da Iniciativa.');
      onToast?.('O nome da iniciativa é obrigatório.', 'warning');
      return;
    }
    if (!formData.startDate?.trim()) {
      setFormErrorMessage('Preencha os campos obrigatórios: Data Início.');
      onToast?.('A data de início é obrigatória (dd/mm/aa).', 'warning');
      return;
    }
    if (!formData.endDate?.trim()) {
      setFormErrorMessage('Preencha os campos obrigatórios: Data Final.');
      onToast?.('A data final é obrigatória (dd/mm/aa).', 'warning');
      return;
    }
    if (!formData.deliveryId?.trim()) {
      setFormErrorMessage('Preencha os campos obrigatórios: Entrega.');
      onToast?.('A entrega é obrigatória.', 'warning');
      return;
    }
    if (!formData.leaderId?.trim()) {
      setFormErrorMessage('Preencha os campos obrigatórios: Responsável (Líder).');
      onToast?.('O responsável (líder) é obrigatório.', 'warning');
      return;
    }
    if (totalPercent > 100) {
      onToast?.(`A soma dos marcos (${totalPercent}%) excede 100%.`, 'warning');
      return;
    }
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      onToast?.('A data de início não pode ser posterior à data final.', 'warning');
      return;
    }
    // Validar due_date dos marcos dentro do intervalo
    for (const m of formData.milestones.filter(mil => mil.title?.trim() && mil.dueDate)) {
      if (formData.startDate && m.dueDate < formData.startDate) {
        onToast?.(`Data limite do marco "${m.title}" é anterior ao início da iniciativa.`, 'warning');
        return;
      }
      if (formData.endDate && m.dueDate > formData.endDate) {
        onToast?.(`Data limite do marco "${m.title}" é posterior ao fim da iniciativa.`, 'warning');
        return;
      }
    }

    const creatorId = effectiveUserId;
    if (!creatorId) {
      setFormErrorMessage('Selecione um analista antes de criar uma iniciativa.');
      onToast?.('Selecione um analista antes de criar uma iniciativa.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const leaderPerson = people.find(p => p.id === formData.leaderId);
      const leaderName = leaderPerson ? personDisplayName(leaderPerson) : undefined;
      if (!leaderName?.trim()) {
        setFormErrorMessage('Responsável inválido. Selecione novamente o líder.');
        onToast?.('Responsável inválido. Selecione novamente o líder.', 'warning');
        setSaving(false);
        return;
      }
      const teamNames = formData.teamIds
        .filter(id => id?.trim() && id !== formData.leaderId)
        .map(id => people.find(p => p.id === id))
        .filter((p): p is Person => !!p)
        .map(personDisplayName);
      const payload = {
        name: formData.name,
        tags: formData.tags || undefined,
        description: formData.description || undefined,
        start_date: formData.startDate || undefined,
        end_date: formData.endDate || undefined,
        status: formData.status,
        delivery_id: formData.deliveryId,
        leader: leaderName,
        client_id: selectedClient?.id ?? null,
        farm_id: selectedFarm?.id ?? null,
        team: teamNames,
        milestones: formData.milestones
          .filter(m => m.title?.trim())
          .map(m => ({
            title: m.title,
            percent: m.percent || 0,
            due_date: m.dueDate?.trim() || undefined,
            completed: m.completed,
          })),
      };

      if (editingInitiative) {
        await updateInitiative(editingInitiative.id, payload);
        onToast?.('Iniciativa atualizada com sucesso.', 'success');
      } else {
        await createInitiative(creatorId, payload);
        onToast?.('Iniciativa salva com sucesso.', 'success');
      }
      closeModal();
      await loadInitiatives();
    } catch (e) {
      setFormErrorMessage(
        e instanceof Error ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar a iniciativa.',
      );
      onToast?.(e instanceof Error ? e.message : 'Erro ao salvar iniciativa', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInitiative = (initiative: InitiativeWithProgress) => {
    setInitiativeToDelete(initiative);
  };

  const confirmDelete = async () => {
    if (!initiativeToDelete) return;

    const id = initiativeToDelete.id;
    setDeletingInitiativeId(id);
    setIsDeletingLoading(true);

    try {
      await deleteInitiative(id);
      if (viewingInitiative?.id === id) {
        setViewingInitiative(null);
      }
      onToast?.('Iniciativa excluída com sucesso.', 'success');
      setInitiativeToDelete(null);
      await loadInitiatives();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao excluir iniciativa', 'error');
    } finally {
      setDeletingInitiativeId(null);
      setIsDeletingLoading(false);
    }
  };

  // ─── Helpers de formatação ────────────────────────────────────────
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const getScheduleIndicator = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) {
      return {
        colorClass: 'bg-slate-400',
        label: 'Sem cronograma',
      };
    }

    // Parse em meia-noite local para evitar deslocamentos de timezone.
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        colorClass: 'bg-slate-400',
        label: 'Cronograma inválido',
      };
    }

    // Não iniciado: data atual antes do início do prazo.
    if (today < start) {
      return {
        colorClass: 'bg-blue-500',
        label: 'Não iniciado',
      };
    }

    // Data atual após o prazo.
    if (today > end) {
      return {
        colorClass: 'bg-red-500',
        label: 'Prazo vencido',
      };
    }

    const totalMs = end.getTime() - start.getTime();
    if (totalMs <= 0) {
      return {
        colorClass: 'bg-yellow-500',
        label: 'Faixa final do prazo',
      };
    }

    const elapsedRatio = (today.getTime() - start.getTime()) / totalMs;

    // Últimos 10% do prazo.
    if (elapsedRatio >= 0.9) {
      return {
        colorClass: 'bg-yellow-500',
        label: 'Últimos 10% do prazo',
      };
    }

    // Entre início e 90% do prazo.
    return {
      colorClass: 'bg-green-500',
      label: 'Dentro do prazo',
    };
  };

  const statusVariant = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('andamento')) return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200';
    if (s.includes('concluído') || s.includes('concluido'))
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
    if (s.includes('atrasado')) return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    if (s.includes('suspenso')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    return 'bg-ai-surface2 text-ai-subtext';
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // Loading detalhe
  if (loadingDetail) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center">
        <Loader2 size={40} className="animate-spin text-ai-accent" />
        <p className="text-sm text-ai-subtext mt-3">Carregando iniciativa...</p>
      </div>
    );
  }

  // ─── Tela de Gestão (detalhe) ────────────────────────────────────
  if (viewingInitiative) {
    const v = viewingInitiative;
    const deliveryName = v.delivery_id ? deliveriesById[v.delivery_id] : '';
    const tagsList = (v.tags || '')
      .split(/[#,]/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    const completedCount = (v.milestones || []).filter(m => m.completed).length;
    const totalMilestones = (v.milestones || []).length;

    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={closeGestaoView}
              className="inline-flex items-center gap-2 text-ai-subtext hover:text-ai-text text-sm"
            >
              <ArrowLeft size={18} />
              Voltar
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDeleteInitiative(v)}
                disabled={deletingInitiativeId === v.id}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium disabled:opacity-60"
              >
                {deletingInitiativeId === v.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Excluir
              </button>
              <button
                type="button"
                onClick={openEditModalFromGestao}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-ai-accent text-ai-accent hover:bg-ai-accent/10 text-sm font-medium"
              >
                <Pencil size={18} />
                Editar
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-ai-border">
            <button
              type="button"
              onClick={() => setActiveTab('geral')}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === 'geral'
                  ? 'text-ai-accent border-b-2 border-ai-accent'
                  : 'text-ai-subtext hover:text-ai-text'
              }`}
            >
              Geral & Atividades
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('time')}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === 'time'
                  ? 'text-ai-accent border-b-2 border-ai-accent'
                  : 'text-ai-subtext hover:text-ai-text'
              }`}
            >
              Time do Projeto
            </button>
          </div>

          {activeTab === 'geral' && (
            <>
              {/* Overview */}
              <div>
                <div className="flex flex-wrap items-start gap-3 mb-2">
                  <h2 className="text-xl font-bold text-ai-text">{v.name}</h2>
                  <span className="px-3 py-1 rounded-full bg-ai-surface2 text-ai-subtext text-xs font-medium">
                    {v.status ?? 'Não Iniciado'}
                  </span>
                </div>
                {v.leader && <p className="text-sm text-ai-subtext mb-2">LIDERANÇA: {v.leader}</p>}
                {tagsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tagsList.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-ai-surface2 text-ai-subtext text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {v.description && <p className="text-sm text-ai-text mb-4">{v.description}</p>}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-ai-subtext block text-xs uppercase tracking-wide">Início</span>
                    <span className="text-ai-text font-medium">{formatDate(v.start_date)}</span>
                  </div>
                  <div>
                    <span className="text-ai-subtext block text-xs uppercase tracking-wide">Final previsto</span>
                    <span className="text-ai-text font-medium">{formatDate(v.end_date)}</span>
                  </div>
                  <div>
                    <span className="text-ai-subtext block text-xs uppercase tracking-wide">Progresso</span>
                    <span className="text-ai-accent font-semibold">{v.progress ?? 0}%</span>
                  </div>
                </div>
                <div className="mt-3 text-sm">
                  <span className="text-ai-subtext mr-2">Entrega:</span>
                  <span className="text-ai-text font-medium">{deliveryName || 'Não vinculada'}</span>
                </div>
              </div>

              {/* Atividades e Tarefas */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Flag size={20} className="text-ai-subtext" />
                  <h3 className="text-lg font-semibold text-ai-text">Atividades e Tarefas</h3>
                  <span className="text-sm text-ai-subtext ml-2">
                    {completedCount} de {totalMilestones} concluídos
                  </span>
                </div>
                <div className="space-y-3">
                  {(v.milestones || []).map(m => (
                    <div
                      key={m.id}
                      className={`w-full p-4 rounded-lg border transition-colors ${
                        m.completed ? 'bg-ai-accent/5 border-ai-accent/30' : 'bg-ai-surface border-ai-border'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleMilestone(m.id);
                          }}
                          disabled={!!togglingMilestone}
                          className="shrink-0 flex items-center justify-center p-0 bg-transparent border-0 cursor-pointer"
                        >
                          {togglingMilestone === m.id ? (
                            <Loader2 size={24} className="animate-spin text-ai-accent" />
                          ) : m.completed ? (
                            <CheckCircle size={24} className="text-green-600" />
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-ai-border" />
                          )}
                        </button>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setViewingEvidenceMilestone({ milestone: m, initiativeName: v.name })}
                          onKeyDown={e =>
                            e.key === 'Enter' && setViewingEvidenceMilestone({ milestone: m, initiativeName: v.name })
                          }
                          role="button"
                          tabIndex={0}
                        >
                          <p className="font-medium text-ai-text">{m.title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-ai-subtext">
                            {m.due_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                Limite: {formatDate(m.due_date)}
                              </span>
                            )}
                            <span>Clique para detalhar evidências</span>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-ai-text shrink-0">{m.percent}%</span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-ai-border/70">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-ai-text">Tarefas da Atividade</h4>
                          <span className="text-xs text-ai-subtext">{(m.tasks || []).length} tarefa(s)</span>
                        </div>

                        <div className="space-y-2">
                          {(m.tasks || []).map(task => {
                            const isEditingTask = editingTaskId === task.id;
                            return (
                              <div key={task.id} className="rounded-md border border-ai-border bg-ai-bg/50 p-2">
                                {isEditingTask ? (
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={taskEditDraft.title}
                                      onChange={e => setTaskEditDraft(prev => ({ ...prev, title: e.target.value }))}
                                      className="w-full px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                                      placeholder="Título da tarefa"
                                    />
                                    <textarea
                                      value={taskEditDraft.description}
                                      onChange={e =>
                                        setTaskEditDraft(prev => ({ ...prev, description: e.target.value }))
                                      }
                                      className="w-full px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs resize-none"
                                      rows={2}
                                      placeholder="Descrição (opcional)"
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                      <select
                                        value={taskEditDraft.responsiblePersonId}
                                        onChange={e =>
                                          setTaskEditDraft(prev => ({ ...prev, responsiblePersonId: e.target.value }))
                                        }
                                        className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                                      >
                                        <option value="">Responsável...</option>
                                        {people.map(p => (
                                          <option key={p.id} value={p.id}>
                                            {personDisplayName(p)}
                                          </option>
                                        ))}
                                      </select>
                                      <DateInputBR
                                        value={taskEditDraft.activityDate}
                                        onChange={v => setTaskEditDraft(prev => ({ ...prev, activityDate: v }))}
                                        className="max-w-[180px]"
                                      />
                                      <input
                                        type="number"
                                        min={1}
                                        value={taskEditDraft.durationDays}
                                        onChange={e =>
                                          setTaskEditDraft(prev => ({ ...prev, durationDays: e.target.value }))
                                        }
                                        className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                                        placeholder="Duração (dias)"
                                      />
                                      <div className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs">
                                        Prazo:{' '}
                                        {formatDate(
                                          addDaysIso(
                                            taskEditDraft.activityDate || toLocalIso(new Date()),
                                            Math.max(1, Number.parseInt(taskEditDraft.durationDays || '1', 10) || 1) -
                                              1,
                                          ),
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={cancelEditTask}
                                        className="px-2 py-1 text-xs rounded border border-ai-border text-ai-subtext"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateTask(task.id)}
                                        disabled={updatingTaskId === task.id}
                                        className="px-2 py-1 text-xs rounded bg-ai-accent text-white disabled:opacity-50"
                                      >
                                        {updatingTaskId === task.id ? 'Salvando...' : 'Salvar'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTask(task.id)}
                                      disabled={updatingTaskId === task.id}
                                      className="mt-0.5 p-0.5 rounded hover:bg-ai-surface2"
                                      title={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
                                    >
                                      {updatingTaskId === task.id ? (
                                        <Loader2 size={14} className="animate-spin text-ai-accent" />
                                      ) : task.completed ? (
                                        <CheckSquare size={14} className="text-green-600" />
                                      ) : (
                                        <Square size={14} className="text-ai-subtext" />
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`text-xs font-medium ${task.completed ? 'line-through text-ai-subtext' : 'text-ai-text'}`}
                                      >
                                        {task.title}
                                      </p>
                                      {(task.description ||
                                        task.due_date ||
                                        task.activity_date ||
                                        task.responsible_person_id ||
                                        typeof task.duration_days === 'number') && (
                                        <div className="text-[11px] text-ai-subtext mt-0.5">
                                          {task.description && (
                                            <p className="whitespace-pre-wrap">{task.description}</p>
                                          )}
                                          <p>
                                            Resp.:{' '}
                                            {task.responsible_person_id
                                              ? personDisplayName(peopleById[task.responsible_person_id])
                                              : '—'}
                                          </p>
                                          {task.activity_date && <p>Início: {formatDate(task.activity_date)}</p>}
                                          {typeof task.duration_days === 'number' && (
                                            <p>Duração: {task.duration_days} dia(s)</p>
                                          )}
                                          {task.due_date && <p>Prazo: {formatDate(task.due_date)}</p>}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => startEditTask(task)}
                                        className="p-1 rounded text-ai-subtext hover:text-ai-text hover:bg-ai-surface2"
                                        title="Editar tarefa"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTask(task.id)}
                                        disabled={deletingTaskId === task.id}
                                        className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-50"
                                        title="Excluir tarefa"
                                      >
                                        {deletingTaskId === task.id ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <Trash2 size={12} />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-2 rounded-md border border-dashed border-ai-border p-2 bg-ai-bg/40">
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                            <input
                              type="text"
                              value={getTaskDraft(m.id).title}
                              onChange={e => updateTaskDraft(m.id, 'title', e.target.value)}
                              className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                              placeholder="Nova tarefa (obrigatório)"
                            />
                            <select
                              value={getTaskDraft(m.id).responsiblePersonId}
                              onChange={e => updateTaskDraft(m.id, 'responsiblePersonId', e.target.value)}
                              className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                            >
                              <option value="">Responsável...</option>
                              {people.map(p => (
                                <option key={p.id} value={p.id}>
                                  {personDisplayName(p)}
                                </option>
                              ))}
                            </select>
                            <DateInputBR
                              value={getTaskDraft(m.id).activityDate}
                              onChange={v => updateTaskDraft(m.id, 'activityDate', v)}
                              className="max-w-[180px]"
                            />
                            <input
                              type="number"
                              min={1}
                              value={getTaskDraft(m.id).durationDays}
                              onChange={e => updateTaskDraft(m.id, 'durationDays', e.target.value)}
                              className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs"
                              placeholder="Duração (dias)"
                            />
                            <div className="px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs">
                              Prazo:{' '}
                              {formatDate(
                                addDaysIso(
                                  getTaskDraft(m.id).activityDate || toLocalIso(new Date()),
                                  Math.max(1, Number.parseInt(getTaskDraft(m.id).durationDays || '1', 10) || 1) - 1,
                                ),
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCreateTask(m)}
                              disabled={savingTaskForMilestone === m.id}
                              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-ai-accent text-white text-xs disabled:opacity-50"
                            >
                              {savingTaskForMilestone === m.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Plus size={12} />
                              )}
                              Adicionar tarefa
                            </button>
                          </div>
                          <textarea
                            value={getTaskDraft(m.id).description}
                            onChange={e => updateTaskDraft(m.id, 'description', e.target.value)}
                            className="mt-2 w-full px-2 py-1.5 border border-ai-border rounded bg-ai-surface text-ai-text text-xs resize-none"
                            rows={2}
                            placeholder="Descrição da tarefa (opcional)"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'time' && (
            <div>
              <h3 className="text-lg font-semibold text-ai-text mb-4">Time da Iniciativa</h3>
              {(v.team || []).length === 0 ? (
                <p className="text-sm text-ai-subtext">Nenhum membro cadastrado.</p>
              ) : (
                <ul className="space-y-2">
                  {(v.team || []).map((member, i) => (
                    <li key={i} className="flex items-center gap-2 py-2 border-b border-ai-border last:border-0">
                      <Users size={18} className="text-ai-subtext shrink-0" />
                      <span className="text-ai-text font-medium">{member.name || '—'}</span>
                      {member.role && (
                        <span className="text-xs text-ai-subtext bg-ai-surface2 px-2 py-0.5 rounded">
                          {member.role}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Modal Evidência de Entrega */}
        {viewingEvidenceMilestone && (
          <EvidenciaEntregaModal
            milestone={
              viewingInitiative?.milestones?.find(m => m.id === viewingEvidenceMilestone.milestone.id) ??
              viewingEvidenceMilestone.milestone
            }
            initiativeName={viewingEvidenceMilestone.initiativeName}
            onClose={() => setViewingEvidenceMilestone(null)}
            onSaved={async () => {
              if (viewingInitiative) {
                const updated = await fetchInitiativeDetail(viewingInitiative.id);
                setViewingInitiative(updated);
              }
              loadInitiatives();
            }}
            onToast={onToast}
          />
        )}
      </div>
    );
  }

  // ─── Tela principal (lista) ──────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white dark:bg-ai-bg">
      <div className="p-4 md:p-6 w-full space-y-6">
        {/* Header + Filtros na mesma linha */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 shrink-0 flex items-center gap-3 flex-wrap">
              <div>
                <nav className="text-xs text-ai-subtext uppercase tracking-widest mb-0.5">
                  INICIATIVAS &gt; ATIVIDADES
                </nav>
                <h1 className="text-xl font-bold text-ai-text tracking-tight whitespace-nowrap">
                  Atividades em Foco
                </h1>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['M', 'T', 'A'] as const).map((letter, i) => {
                  const presets = ['next-month', 'next-quarter', 'next-year'] as const;
                  const labels = ['Dia atual + 1 mês', 'Dia atual + 1 trimestre', 'Dia atual + 1 ano'];
                  const active = periodPreset === presets[i];
                  return (
                    <button
                      key={letter}
                      type="button"
                      title={labels[i]}
                      onClick={() => applyPreset(presets[i])}
                      className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-bold transition-colors ${
                        active
                          ? 'bg-ai-accent/20 text-ai-accent border border-ai-accent/40'
                          : 'bg-ai-surface border border-ai-border text-ai-subtext hover:text-ai-text hover:border-ai-subtext'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
                <div className="h-5 w-px bg-ai-border" aria-hidden />
                <label className="sr-only" htmlFor="period-start">
                  Data inicial do período
                </label>
                <input
                  id="period-start"
                  type="date"
                  value={periodStart}
                  onChange={e => applyCustomRange(e.target.value, periodEnd)}
                  className="h-7 px-2 text-xs border border-ai-border rounded-md bg-ai-surface text-ai-text focus:outline-none focus:ring-1 focus:ring-ai-accent"
                />
                <span className="text-xs text-ai-subtext">–</span>
                <label className="sr-only" htmlFor="period-end">
                  Data final do período
                </label>
                <input
                  id="period-end"
                  type="date"
                  value={periodEnd}
                  onChange={e => applyCustomRange(periodStart, e.target.value)}
                  className="h-7 px-2 text-xs border border-ai-border rounded-md bg-ai-surface text-ai-text focus:outline-none focus:ring-1 focus:ring-ai-accent"
                />
                {hasPeriodActive && (
                  <button
                    type="button"
                    onClick={clearPeriod}
                    title="Limpar período"
                    aria-label="Limpar período"
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-ai-border bg-ai-surface text-ai-subtext hover:text-red-600 hover:border-red-200"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            {initiatives.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="inline-flex items-center rounded-md border border-ai-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode('lista')}
                    className={`px-2 py-1 text-xs inline-flex items-center gap-1 ${viewMode === 'lista' ? 'bg-ai-accent/10 text-ai-accent' : 'bg-ai-surface text-ai-subtext'}`}
                  >
                    <List size={12} /> Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('gantt')}
                    className={`px-2 py-1 text-xs inline-flex items-center gap-1 border-l border-ai-border ${viewMode === 'gantt' ? 'bg-ai-accent/10 text-ai-accent' : 'bg-ai-surface text-ai-subtext'}`}
                  >
                    <BarChart3 size={12} /> Gantt
                  </button>
                </div>
                <Filter size={12} className="text-ai-subtext shrink-0" />

                {/* Status — multi-select */}
                <div className="relative" data-filter-dropdown>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openFilterDropdown === 'status'}
                    aria-label={`Filtrar por status${filterStatus.length > 0 ? ` — ${filterStatus.length} selecionado(s)` : ''}`}
                    onClick={() => setOpenFilterDropdown(openFilterDropdown === 'status' ? null : 'status')}
                    className={`px-2 py-1 text-xs border rounded-md flex items-center gap-1 ${filterStatus.length > 0 ? 'border-ai-accent bg-ai-accent/10 text-ai-accent' : 'border-ai-border bg-ai-surface text-ai-text'}`}
                  >
                    Status{filterStatus.length > 0 && ` (${filterStatus.length})`}
                    <ChevronRight
                      size={10}
                      className={`transition-transform ${openFilterDropdown === 'status' ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {openFilterDropdown === 'status' && (
                    <div
                      role="listbox"
                      aria-label="Opções de status"
                      className="absolute top-full left-0 mt-1 z-50 bg-white border border-ai-border rounded-lg shadow-lg py-1 min-w-[160px]"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <label
                          key={s}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-ai-text hover:bg-ai-surface cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={filterStatus.includes(s)}
                            onChange={() => toggleFilterValue(filterStatus, setFilterStatus, s)}
                            className="rounded border-ai-border text-ai-accent w-3 h-3"
                          />
                          {s}
                        </label>
                      ))}
                      {filterStatus.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterStatus([])}
                          className="w-full text-left px-3 py-1.5 text-[10px] text-red-500 hover:bg-red-50 border-t border-ai-border mt-1"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Líder — multi-select */}
                <div className="relative" data-filter-dropdown>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openFilterDropdown === 'leader'}
                    aria-label={`Filtrar por líder${filterLeader.length > 0 ? ` — ${filterLeader.length} selecionado(s)` : ''}`}
                    onClick={() => setOpenFilterDropdown(openFilterDropdown === 'leader' ? null : 'leader')}
                    className={`px-2 py-1 text-xs border rounded-md flex items-center gap-1 ${filterLeader.length > 0 ? 'border-ai-accent bg-ai-accent/10 text-ai-accent' : 'border-ai-border bg-ai-surface text-ai-text'}`}
                  >
                    Líder{filterLeader.length > 0 && ` (${filterLeader.length})`}
                    <ChevronRight
                      size={10}
                      className={`transition-transform ${openFilterDropdown === 'leader' ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {openFilterDropdown === 'leader' && (
                    <div
                      role="listbox"
                      aria-label="Opções de líder"
                      className="absolute top-full left-0 mt-1 z-50 bg-white border border-ai-border rounded-lg shadow-lg py-1 min-w-[180px]"
                    >
                      {uniqueLeaders.length === 0 ? (
                        <p className="px-3 py-1.5 text-xs text-ai-subtext italic">Nenhum líder</p>
                      ) : (
                        uniqueLeaders.map(l => (
                          <label
                            key={l}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-ai-text hover:bg-ai-surface cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={filterLeader.includes(l)}
                              onChange={() => toggleFilterValue(filterLeader, setFilterLeader, l)}
                              className="rounded border-ai-border text-ai-accent w-3 h-3"
                            />
                            {l}
                          </label>
                        ))
                      )}
                      {filterLeader.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterLeader([])}
                          className="w-full text-left px-3 py-1.5 text-[10px] text-red-500 hover:bg-red-50 border-t border-ai-border mt-1"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Hashtag — single select */}
                <select
                  value={filterTag}
                  onChange={e => setFilterTag(e.target.value)}
                  className={`px-2 py-1 text-xs border rounded-md ${filterTag ? 'border-ai-accent bg-ai-accent/10 text-ai-accent' : 'border-ai-border bg-ai-surface text-ai-text'}`}
                >
                  <option value="">Hashtag</option>
                  {uniqueTags.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStatus([]);
                      setFilterLeader([]);
                      setFilterTag('');
                      setOpenFilterDropdown(null);
                      clearPeriod();
                    }}
                    className="px-1.5 py-1 text-[10px] text-red-500 hover:text-red-700"
                    title="Limpar todos os filtros"
                  >
                    <X size={14} />
                  </button>
                )}
                <span className="text-[10px] text-ai-subtext">
                  {filteredInitiatives.length}/{initiatives.length}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={openNewModal}
              disabled={!canCreate}
              title={
                !canCreate
                  ? isAdmin
                    ? 'Selecione um Analista e Cliente no cabeçalho'
                    : 'Selecione um Cliente no cabeçalho'
                  : undefined
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-ai-text text-white text-xs font-semibold hover:opacity-90 transition-opacity shrink-0 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} strokeWidth={2.5} />
              Nova Atividade
            </button>
          </div>
        </div>

        {/* Aviso: admin sem analista selecionado */}
        {adminMissingAnalyst && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Selecione um <strong>Analista</strong> no cabeçalho para visualizar e gerenciar iniciativas.
            </p>
          </div>
        )}

        {/* Aviso: sem cliente selecionado (mas com analista) */}
        {!adminMissingAnalyst && effectiveUserId && !selectedClient && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <AlertTriangle size={20} className="text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Exibindo todas as iniciativas do analista. Selecione um <strong>Cliente</strong> para filtrar.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={36} className="animate-spin text-ai-accent" />
          </div>
        ) : !effectiveUserId ? null : filteredInitiatives.length === 0 && !hasActiveFilters ? (
          <div className="bg-ai-surface/50 border border-ai-border rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[280px]">
            <FolderOpen size={56} className="text-ai-subtext/40 mb-4" />
            <h2 className="text-lg font-semibold text-ai-text mb-2">Nenhuma iniciativa ainda</h2>
            <p className="text-ai-subtext max-w-sm mb-6">
              {canCreate
                ? 'Crie sua primeira iniciativa para acompanhar marcos, entregas e progresso.'
                : isAdmin
                  ? 'Selecione um Analista e um Cliente no cabeçalho para criar uma iniciativa.'
                  : 'Selecione um Cliente no cabeçalho para criar uma iniciativa.'}
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={openNewModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ai-text text-white text-sm font-semibold hover:opacity-90"
              >
                <Plus size={20} />
                Nova Atividade
              </button>
            )}
          </div>
        ) : filteredInitiatives.length === 0 && hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Filter size={36} className="text-ai-subtext/40 mb-3" />
            <p className="text-sm text-ai-subtext">Nenhuma atividade encontrada com os filtros selecionados.</p>
          </div>
        ) : viewMode === 'gantt' ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-ai-accent" />
              </div>
            }
          >
            <ErrorBoundary
              fallback={
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg border border-ai-border bg-ai-surface/50">
                  <BarChart3 size={40} className="text-ai-subtext/60 mb-3" />
                  <p className="text-sm font-medium text-ai-text mb-1">Visualização Gantt indisponível</p>
                  <p className="text-xs text-ai-subtext text-center max-w-sm mb-4">
                    Ocorreu um erro ao carregar o gráfico. Use a visualização em lista.
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('lista')}
                    className="px-4 py-2 rounded-md bg-ai-accent text-white text-sm font-medium hover:opacity-90"
                  >
                    Voltar para Lista
                  </button>
                </div>
              }
            >
              <InitiativesGantt
                projects={projects}
                deliveries={deliveries}
                initiatives={filteredInitiatives}
                ganttStart={periodStart || undefined}
                ganttEnd={periodEnd || undefined}
                zoomLevel={ganttZoom}
                onZoomChange={setGanttZoom}
                allowedZooms={allowedZooms}
              />
            </ErrorBoundary>
          </Suspense>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {filteredInitiatives.map(init => (
              <li
                key={init.id}
                role="button"
                tabIndex={0}
                onClick={() => openGestaoView(init)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openGestaoView(init);
                  }
                }}
                aria-label={`${init.name} — ${init.progress ?? 0}% — ${init.status ?? 'Não iniciado'}`}
                className="flex flex-col gap-1 py-1.5 px-2 bg-white border border-ai-border rounded-lg hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-ai-accent/40"
              >
                {/* Linha 1: Progresso + Título + Cronograma (alinhados) */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-base font-bold text-ai-text tabular-nums shrink-0"
                    title={`Andamento: ${init.progress ?? 0}%`}
                  >
                    {init.progress ?? 0}%
                  </span>
                  <h3 className="text-xs font-bold text-ai-text truncate flex-1 min-w-0" title={init.name}>
                    {init.name}
                  </h3>
                  <span
                    className="text-[9px] text-ai-subtext shrink-0 whitespace-nowrap"
                    title={`Cronograma: ${formatDate(init.start_date)} → ${formatDate(init.end_date)}`}
                  >
                    {formatDate(init.start_date)} → {formatDate(init.end_date)}
                  </span>
                </div>

                {/* Linha 2: Líder, status e ações */}
                <div className="flex flex-wrap items-center justify-between gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-ai-subtext">
                      <User size={10} className="shrink-0 text-ai-subtext" />
                      <span className="truncate">{init.leader ?? '—'}</span>
                    </span>
                    {(() => {
                      const indicator = getScheduleIndicator(init.start_date, init.end_date);
                      return (
                        <span className="inline-flex items-center text-[11px] text-ai-subtext" title={indicator.label}>
                          <span className={`w-1.5 h-1.5 rounded-full ${indicator.colorClass}`} />
                        </span>
                      );
                    })()}
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide shrink-0 ${statusVariant(init.status ?? '')}`}
                    >
                      {init.status ?? 'Não iniciado'}
                    </span>
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] bg-ai-surface2 text-ai-subtext shrink-0">
                      {init.delivery_id ? `Entrega: ${deliveriesById[init.delivery_id] || '—'}` : 'Sem entrega'}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteInitiative(init);
                      }}
                      disabled={deletingInitiativeId === init.id}
                      className="flex items-center justify-center w-6 h-6 rounded-full border border-red-200 text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-60"
                      title="Excluir iniciativa"
                    >
                      {deletingInitiativeId === init.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-ai-surface2 text-ai-subtext shrink-0">
                      <ChevronRight size={12} strokeWidth={2} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Modal Nova / Editar Iniciativa ─────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeModal}>
          <div
            className="bg-ai-bg border border-ai-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-ai-bg border-b border-ai-border px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-ai-text">
                {editingInitiative ? 'Editar Iniciativa' : 'Nova Atividade'}
              </h2>
              <button type="button" onClick={closeModal} className="p-1.5 text-ai-subtext hover:text-ai-text rounded">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {loadingEdit ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={28} className="animate-spin text-ai-accent" />
                </div>
              ) : (
                <>
                  {formErrorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {formErrorMessage}
                    </div>
                  )}
                  {/* Contexto: Analista / Cliente / Fazenda */}
                  <div className="rounded-lg bg-ai-surface/60 border border-ai-border p-3 text-xs text-ai-subtext space-y-1">
                    {isAdmin && selectedAnalyst && (
                      <p>
                        <strong>Analista:</strong> {selectedAnalyst.name}
                      </p>
                    )}
                    {selectedClient && (
                      <p>
                        <strong>Cliente:</strong> {selectedClient.name}
                      </p>
                    )}
                    {selectedFarm && (
                      <p>
                        <strong>Fazenda:</strong> {selectedFarm.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">
                      Nome da Iniciativa <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => {
                        setFormErrorMessage(null);
                        setFormData(p => ({ ...p, name: e.target.value }));
                      }}
                      placeholder="Ex: Reestruturação Organizacional"
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">Tags (#)</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))}
                      placeholder="#Financeiro, #Digital"
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">Descrição</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ai-text mb-1">
                        Data Início <span className="text-red-500">*</span>
                      </label>
                      <DateInputBR
                        value={formData.startDate}
                        onChange={v => {
                          setFormErrorMessage(null);
                          setFormData(p => ({ ...p, startDate: v }));
                        }}
                        placeholder="dd/mm/aaaa"
                        required
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ai-text mb-1">
                        Data Final <span className="text-red-500">*</span>
                      </label>
                      <DateInputBR
                        value={formData.endDate}
                        onChange={v => {
                          setFormErrorMessage(null);
                          setFormData(p => ({ ...p, endDate: v }));
                        }}
                        placeholder="dd/mm/aaaa"
                        required
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">
                      Entrega <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.deliveryId}
                      onChange={e => {
                        setFormErrorMessage(null);
                        setFormData(p => ({ ...p, deliveryId: e.target.value }));
                      }}
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                      required
                    >
                      <option value="">Selecione a entrega</option>
                      {deliveries.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-1">
                      Responsável (Líder) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.leaderId}
                      onChange={e => {
                        setFormErrorMessage(null);
                        handleLeaderChange(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                      required
                    >
                      <option value="">Selecione o responsável</option>
                      {people.map(p => (
                        <option key={p.id} value={p.id}>
                          {personDisplayName(p)}
                          {p.job_role ? ` — ${p.job_role}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-ai-subtext" />
                        <span className="text-sm font-medium text-ai-text">Time da Iniciativa</span>
                      </div>
                      <span className="text-xs text-ai-subtext">máx. 5 membros</span>
                    </div>
                    {formData.teamIds.map((personId, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <select
                          value={personId}
                          onChange={e => updateTeamMember(i, e.target.value)}
                          className="flex-1 px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                        >
                          <option value="">Selecione...</option>
                          {people
                            .filter(
                              p =>
                                p.id !== formData.leaderId && (!formData.teamIds.includes(p.id) || p.id === personId),
                            )
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {personDisplayName(p)}
                                {p.job_role ? ` — ${p.job_role}` : ''}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTeamMember(i)}
                          className="p-2 text-ai-subtext hover:text-red-500 shrink-0"
                          title="Remover"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {formData.teamIds.length < 5 && (
                      <button
                        type="button"
                        onClick={addTeamMember}
                        className="flex items-center gap-1.5 text-sm text-ai-accent hover:underline"
                      >
                        <UserPlus size={16} /> Adicionar membro
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Flag size={16} className="text-ai-subtext" />
                        <span className="text-sm font-medium text-ai-text">Atividades e % Representatividade</span>
                      </div>
                      <span
                        className={`text-xs ${totalPercent > 100 ? 'text-red-500 font-semibold' : 'text-ai-subtext'}`}
                      >
                        Total: {totalPercent}%
                      </span>
                    </div>
                    {formData.milestones.map(m => (
                      <div key={m.id} className="flex flex-wrap gap-2 mb-2 items-center">
                        <input
                          type="text"
                          value={m.title}
                          onChange={e => updateMilestone(m.id, 'title', e.target.value)}
                          placeholder="Título da atividade..."
                          className="flex-1 min-w-[140px] px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={m.percent || ''}
                          onChange={e => updateMilestone(m.id, 'percent', e.target.value)}
                          className="w-16 px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm text-right"
                        />
                        <span className="text-ai-subtext text-sm">%</span>
                        <div
                          className="flex items-center gap-1.5"
                          title="Data limite (entre início e fim da iniciativa) - dd/mm/aaaa"
                        >
                          <DateInputBR
                            value={m.dueDate}
                            onChange={v => updateMilestone(m.id, 'dueDate', v)}
                            placeholder="dd/mm/aaaa"
                            min={formData.startDate || undefined}
                            max={formData.endDate || undefined}
                            className="w-[140px]"
                          />
                        </div>
                        {formData.milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMilestone(m.id)}
                            className="p-2 text-ai-subtext hover:text-red-500"
                            title="Remover atividade"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addMilestone}
                      className="flex items-center gap-1.5 text-sm text-ai-accent hover:underline"
                    >
                      <Plus size={14} /> Adicionar marco
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="sticky bottom-0 bg-ai-bg border-t border-ai-border px-6 py-4 flex justify-end gap-3 z-10">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-md border border-ai-border text-ai-accent bg-transparent hover:bg-ai-surface2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaveDisabled}
                className="px-4 py-2 rounded-md bg-ai-accent text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingInitiative ? 'Atualizar' : 'Salvar Projeto'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Exclusão */}
      {initiativeToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !isDeletingLoading && setInitiativeToDelete(null)}
        >
          <div
            className="bg-white dark:bg-ai-bg border border-ai-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-red-600">
                <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold">Confirmar Exclusão</h3>
              </div>

              <div className="space-y-3">
                <p className="text-ai-text font-medium text-lg">
                  Deseja excluir a iniciativa <span className="text-ai-accent">"{initiativeToDelete.name}"</span>?
                </p>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                  <p className="text-red-700 dark:text-red-400 text-sm leading-relaxed">
                    <strong>AVISO IMPORTANTE:</strong> Esta ação é irreversível. Todos os marcos, evidências e
                    históricos vinculados a esta iniciativa serão permanentemente removidos.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-ai-surface/50 border-t border-ai-border">
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => setInitiativeToDelete(null)}
                className="px-4 py-2 rounded-lg border border-ai-border text-ai-subtext hover:text-ai-text hover:bg-ai-surface px-6 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={confirmDelete}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeletingLoading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Excluir Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InitiativesActivities;
