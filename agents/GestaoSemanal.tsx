import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DateInputBR from '../components/DateInputBR';
import * as semanasApi from '../lib/api/semanasClient';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { listPessoasByFarm, checkPermsByEmail } from '../lib/api/pessoasClient';
import { listTasksByWeek, updateTask as updateProjectTask, type WeekTaskRow } from '../lib/api/tasksClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pessoa {
  id: string;
  nome: string;
}

interface Semana {
  id: string;
  numero: number;
  modo: 'ano' | 'safra';
  aberta: boolean;
  data_inicio: string;
  data_fim: string;
  farm_id: string | null; // TEXT in DB (farms.id is text)
}

interface Atividade {
  id: string;
  semana_id: string;
  titulo: string;
  descricao: string;
  pessoa_id: string | null;
  data_termino: string | null;
  tag: string;
  status: 'a fazer' | 'em andamento' | 'pausada' | 'concluída';
  parent_id: string | null;
  created_at: string;
}

interface HistoricoSemana {
  id: string;
  semana_numero: number;
  semana_id: string | null;
  total: number;
  concluidas: number;
  pendentes: number;
  closed_at: string;
}

interface Filters {
  titulo: string;
  descricao: string;
  pessoaId: string;
  dataTermino: string;
  tag: string;
  status: string;
}

interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

type TaskStatus = 'a fazer' | 'em andamento' | 'pausada' | 'concluída';

interface UnifiedTask {
  id: string;
  titulo: string;
  descricao: string;
  status: TaskStatus;
  pessoa_id: string | null;
  data_termino: string | null;
  origin: 'weekly' | 'project';
  semana_id?: string;
  tag?: string;
  created_at?: string;
  milestone_id?: string;
  initiative_name?: string;
  initiative_id?: string;
  activity_date?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '#planejamento':   { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  '#desenvolvimento':{ bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  '#revisão':        { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
  '#deploy':         { bg: '#FDF2F8', text: '#9D174D', border: '#FBCFE8' },
  '#reunião':        { bg: '#F0F9FF', text: '#075985', border: '#BAE6FD' },
  '#bug':            { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  '#docs':           { bg: '#FEFCE8', text: '#854D0E', border: '#FDE68A' },
};

const STATUS_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  'a fazer':      { text: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  'em andamento': { text: '#2563EB', bg: '#EFF6FF', border: '#3B82F6' },
  'pausada':      { text: '#D97706', bg: '#FFFBEB', border: '#F59E0B' },
  'concluída':    { text: '#059669', bg: '#ECFDF5', border: '#10B981' },
};
const STATUS_LIST = ['a fazer', 'em andamento', 'pausada', 'concluída'] as const;

const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const PT_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
const SORT_COLS = ['titulo', 'pessoa', 'dataTermino', 'status'] as const;
const FONT = "'DM Sans', sans-serif";
const INPUT_ST: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, color: '#1E293B', outline: 'none', width: '100%', fontFamily: FONT,
  background: '#FFF',
};
const FILTER_ST: React.CSSProperties = {
  width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid #E2E8F0',
  fontSize: 11, color: '#475569', outline: 'none', fontFamily: FONT, background: '#FFF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcWeekNumber(date: Date, modo: 'ano' | 'safra'): number {
  if (modo === 'ano') {
    // ISO week number (semana 1 = semana que contém a primeira quinta-feira do ano)
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
  const month = date.getMonth();
  const year = date.getFullYear();
  const safraStart = month >= 6 ? new Date(year, 6, 1) : new Date(year - 1, 6, 1);
  return Math.floor((date.getTime() - safraStart.getTime()) / (7 * 864e5)) + 1;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDatePtBr(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}

function formatWeekRange(start: string, end: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${s.getDate().toString().padStart(2, '0')} ${PT_MONTHS[s.getMonth()]} – ${e.getDate().toString().padStart(2, '0')} ${PT_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

function formatWeekRangeShort(start: string, end: string): string {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${PT_DAYS[s.getDay()]} ${s.getDate()}/${s.getMonth() + 1} a ${PT_DAYS[e.getDay()]} ${e.getDate()}/${e.getMonth() + 1}`;
}

/** Retorna "D/M a D/M" com domingo–sábado canônico da semana que contém a data */
function formatCanonicalWeekPeriod(ref: string | Date): string {
  let d: Date;
  if (ref instanceof Date) {
    d = new Date(ref);
  } else if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ref)) {
    const [y, m, day] = ref.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(ref);
  }
  if (isNaN(d.getTime())) return '';
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  const fmt = (dt: Date) => `${dt.getDate()}/${dt.getMonth() + 1}`;
  return `${fmt(sun)} a ${fmt(sat)}`;
}

function getSafraLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/** Drizzle retorna camelCase; normaliza para snake_case usado no frontend. */
function normalizeAtividade(row: Record<string, unknown>): Atividade {
  return {
    id: String(row.id ?? ''),
    semana_id: String(row.semana_id ?? row.semanaId ?? ''),
    titulo: String(row.titulo ?? ''),
    descricao: String(row.descricao ?? ''),
    pessoa_id: (row.pessoa_id ?? row.pessoaId ?? null) as string | null,
    data_termino: (row.data_termino ?? row.dataTermino ?? null) as string | null,
    tag: String(row.tag ?? '#planejamento'),
    status: (row.status ?? 'a fazer') as Atividade['status'],
    parent_id: (row.parent_id ?? row.parentId ?? null) as string | null,
    created_at: String(row.created_at ?? row.createdAt ?? ''),
  };
}

const EMPTY_FILTERS: Filters = { titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '', status: '' };

interface GestaoSemanalProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GestaoSemanal: React.FC<GestaoSemanalProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedFarm } = useFarm();
  const [modo, setModo] = useState<'ano' | 'safra'>('ano');
  const [semana, setSemana] = useState<Semana | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [historico, setHistorico] = useState<HistoricoSemana[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showPeriodoTooltip, setShowPeriodoTooltip] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [newForm, setNewForm] = useState({
    titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [carryOverModal, setCarryOverModal] = useState<{
    pendingSemanaId: string;
    candidates: Atividade[];
    semanaNumero: number;
    dataInicio: string;
    dataFim: string;
  } | null>(null);
  const [selectedCarryOver, setSelectedCarryOver] = useState<Set<string>>(new Set());
  const [ultimaSemanaId, setUltimaSemanaId] = useState<string | null>(null);
  const [canEditClosedWeek, setCanEditClosedWeek] = useState(false);
  const [canDeleteWeek, setCanDeleteWeek] = useState(false);
  const [canFecharSemana, setCanFecharSemana] = useState(false);
  const [operating, setOperating] = useState(false);
  const deletingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskForm, setSubtaskForm] = useState({ titulo: '', pessoaId: '', dataTermino: '' });

  // ── Source tab ─────────────────────────────────────────────────────────────
  const [sourceTab, setSourceTab] = useState<'semana' | 'projetos'>('semana');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [projectTasks, setProjectTasks] = useState<UnifiedTask[]>([]);
  const [loadingProjectTasks, setLoadingProjectTasks] = useState(false);
  const [editingProjectTask, setEditingProjectTask] = useState<UnifiedTask | null>(null);
  const [projectEditForm, setProjectEditForm] = useState({ titulo: '', descricao: '', pessoaId: '', activityDate: '' });

  // canEditClosedWeek, canDeleteWeek e canFecharSemana: admin/analista ou pessoa com flag + email igual
  useEffect(() => {
    if (!user) {
      setCanEditClosedWeek(false);
      setCanDeleteWeek(false);
      setCanFecharSemana(false);
      return;
    }
    if (user.role === 'admin' || user.qualification === 'analista') {
      setCanEditClosedWeek(true);
      setCanDeleteWeek(true);
      setCanFecharSemana(true);
      return;
    }
    const email = user.email?.trim()?.toLowerCase();
    if (!email) {
      setCanEditClosedWeek(false);
      setCanDeleteWeek(false);
      setCanFecharSemana(false);
      return;
    }
    checkPermsByEmail(email)
      .then(rows => {
        setCanEditClosedWeek(rows.some(r => r.pode_alterar_semana_fechada));
        setCanDeleteWeek(rows.some(r => r.pode_apagar_semana));
        setCanFecharSemana(rows.some(r => r.pode_alterar_semana_fechada));
      })
      .catch(() => {
        setCanEditClosedWeek(false);
        setCanDeleteWeek(false);
        setCanFecharSemana(false);
      });
  }, [user]);

  // Inject fonts and animation keyframes once
  useEffect(() => {
    if (!document.getElementById('gs-fonts')) {
      const link = document.createElement('link');
      link.id = 'gs-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('gs-styles')) {
      const style = document.createElement('style');
      style.id = 'gs-styles';
      style.textContent = '@keyframes gsFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes gsSlideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}';
      document.head.appendChild(style);
    }
  }, []);

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const farmId = selectedFarm?.id ?? null;
      const isAdmin = user?.role === 'admin' || user?.role === 'administrador';

      const [pessoasRows, semanaRes, historicoRes] = await Promise.all([
        farmId ? listPessoasByFarm(farmId, { assumeTarefas: true }) : Promise.resolve([]),
        (farmId || isAdmin) ? semanasApi.getCurrentSemana(modo, farmId) : Promise.resolve({ ok: false, data: null }),
        (farmId || isAdmin) ? semanasApi.listHistorico(farmId) : Promise.resolve({ ok: false, data: [] }),
      ]);

      const pessoasData: Pessoa[] = pessoasRows.map(p => ({
        id: p.id,
        nome: p.preferred_name || p.full_name,
      }));
      setPessoas(pessoasData);
      setHistorico(historicoRes.ok ? (historicoRes.data as HistoricoSemana[]) : []);

      let semanaData: Semana | null = semanaRes.ok ? (semanaRes.data as Semana | null) : null;

      // Auto-create first week for this mode if none exists
      if (!semanaData) {
        const today = new Date();
        const weekNum = calcWeekNumber(today, modo);
        const monday = getMondayOfWeek(today);
        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5);
        const createRes = await semanasApi.createSemana({
          farm_id: farmId,
          numero: weekNum,
          modo,
          aberta: true,
          data_inicio: toDateStr(monday),
          data_fim: toDateStr(saturday),
        });
        semanaData = createRes.ok ? (createRes.data as Semana) : null;
      }

      setSemana(semanaData);
      setUltimaSemanaId(semanaData?.id ?? null);

      if (semanaData) {
        const atRes = await semanasApi.listAtividades(semanaData.id);
        setAtividades(atRes.ok ? (atRes.data as Record<string, unknown>[]).map(normalizeAtividade) : []);
      } else {
        setAtividades([]);
      }

      setNewForm(prev => ({ ...prev, pessoaId: prev.pessoaId || '' }));
    } finally {
      setLoading(false);
    }
  }, [modo, selectedFarm?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchProjectTasks = useCallback(async (weekStart: string, weekEnd: string) => {
    setLoadingProjectTasks(true);
    try {
      const res = await listTasksByWeek(weekStart, weekEnd);
      if (res.ok) {
        setProjectTasks((res.data as WeekTaskRow[]).map(t => ({
          id: t.id,
          titulo: t.title,
          descricao: t.description ?? '',
          status: t.kanbanStatus as TaskStatus,
          pessoa_id: t.responsiblePersonId,
          data_termino: t.activityDate,
          origin: 'project' as const,
          milestone_id: t.milestoneId,
          initiative_name: t.initiativeName,
          initiative_id: t.initiativeId,
          activity_date: t.activityDate,
        })));
      }
    } finally {
      setLoadingProjectTasks(false);
    }
  }, []);

  useEffect(() => {
    if (sourceTab === 'projetos' && semana) {
      fetchProjectTasks(semana.data_inicio, semana.data_fim);
    } else if (sourceTab === 'semana') {
      setProjectTasks([]);
    }
  }, [sourceTab, semana, fetchProjectTasks]);

  // Expand tasks that have subtasks by default
  useEffect(() => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      for (const a of atividades) {
        if (a.parent_id === null) {
          const hasSubs = atividades.some(s => s.parent_id === a.id);
          if (hasSubs) next.add(a.id);
        }
      }
      return next;
    });
  }, [atividades]);

  // ─── Computed ─────────────────────────────────────────────────────────────────

  const activeTasks = useMemo<UnifiedTask[]>(() => {
    if (sourceTab === 'projetos') return projectTasks;
    return atividades.map(a => ({
      id: a.id, titulo: a.titulo, descricao: a.descricao,
      status: a.status, pessoa_id: a.pessoa_id, data_termino: a.data_termino,
      origin: 'weekly' as const, semana_id: a.semana_id, tag: a.tag, created_at: a.created_at,
    }));
  }, [sourceTab, atividades, projectTasks]);

  const stats = useMemo(() => {
    const totalGeral = atividades.length;
    const totalTarefas = atividades.filter(a => !a.parent_id).length;
    const concluidas = atividades.filter(a => a.status === 'concluída').length;
    const aFazer = totalGeral - concluidas;
    const progresso = totalGeral > 0 ? Math.round((concluidas / totalGeral) * 100) : 0;
    return { totalGeral, totalTarefas, concluidas, aFazer, progresso };
  }, [atividades]);

  const pessoaMap = useMemo(() => {
    const m = new Map<string, string>();
    pessoas.forEach(p => m.set(p.id, p.nome));
    return m;
  }, [pessoas]);

  const getPessoaNome = useCallback((id: string | null) => (id ? pessoaMap.get(id) : null) || '—', [pessoaMap]);

  const { parentTasks, subtasksMap } = useMemo(() => {
    const parents = atividades.filter(a => !a.parent_id);
    const subs = new Map<string, Atividade[]>();
    for (const a of atividades) {
      if (a.parent_id) {
        const list = subs.get(a.parent_id) || [];
        list.push(a);
        subs.set(a.parent_id, list);
      }
    }
    return { parentTasks: parents, subtasksMap: subs };
  }, [atividades]);

  const uniqueTags = useMemo(() => {
    const tags = new Set(atividades.map(a => a.tag).filter(Boolean));
    return Array.from(tags).sort();
  }, [atividades]);

  const filteredParentTasks = useMemo(() => {
    let result = [...parentTasks];
    if (filters.titulo) {
      const q = filters.titulo.toLowerCase();
      result = result.filter(a =>
        a.titulo.toLowerCase().includes(q) || (a.tag && a.tag.toLowerCase().includes(q))
      );
    }
    if (filters.pessoaId)    result = result.filter(a => a.pessoa_id === filters.pessoaId);
    if (filters.dataTermino) result = result.filter(a => a.data_termino === filters.dataTermino);
    if (filters.status)      result = result.filter(a => a.status === filters.status);
    if (sortConfig) {
      result.sort((a, b) => {
        let va = '', vb = '';
        switch (sortConfig.column) {
          case 'titulo':      va = a.titulo; vb = b.titulo; break;
          case 'dataTermino': va = a.data_termino || ''; vb = b.data_termino || ''; break;
          case 'status':      va = a.status; vb = b.status; break;
          case 'pessoa':
            va = (a.pessoa_id ? pessoaMap.get(a.pessoa_id) : '') || '';
            vb = (b.pessoa_id ? pessoaMap.get(b.pessoa_id) : '') || '';
            break;
        }
        const cmp = va.localeCompare(vb, 'pt-BR');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [parentTasks, filters, sortConfig, pessoaMap]);

  const hasActiveFilters = useMemo(() => Object.values(filters).some(v => v !== ''), [filters]);

  const filteredProjectTasks = useMemo(() => {
    let result = [...projectTasks];
    if (filters.titulo)    result = result.filter(t => t.titulo.toLowerCase().includes(filters.titulo.toLowerCase()));
    if (filters.descricao) result = result.filter(t => (t.descricao || '').toLowerCase().includes(filters.descricao.toLowerCase()));
    if (filters.pessoaId)  result = result.filter(t => t.pessoa_id === filters.pessoaId);
    if (filters.status)    result = result.filter(t => t.status === filters.status);
    return result;
  }, [projectTasks, filters]);

  const maxHistoricoNumero = useMemo(
    () => (historico.length > 0 ? Math.max(...historico.map(x => x.semana_numero)) : 0),
    [historico]
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleSort = useCallback((col: string) => {
    setSortConfig(prev => {
      if (!prev || prev.column !== col) return { column: col, direction: 'asc' };
      if (prev.direction === 'asc')      return { column: col, direction: 'desc' };
      return { column: col, direction: 'asc' };
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const resetForm = useCallback(() => {
    setNewForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento' });
    setEditingId(null);
  }, []);

  const handleEditStart = useCallback((at: Atividade) => {
    setNewForm({
      titulo: at.titulo,
      descricao: at.descricao,
      pessoaId: at.pessoa_id ?? '',
      dataTermino: at.data_termino ?? '',
      tag: at.tag,
    });
    setEditingId(at.id);
    setShowTaskModal(true);
  }, []);

  const handleEditCancel = useCallback(() => {
    resetForm();
    setShowTaskModal(false);
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    if (operating || !newForm.titulo.trim() || !semana) return;
    const pessoaId = newForm.pessoaId || pessoas[0]?.id;
    if (!pessoaId) {
      onToast?.('Selecione uma pessoa responsável antes de salvar.', 'warning');
      return;
    }
    if (!newForm.dataTermino) {
      onToast?.('Data de término é obrigatória.', 'warning');
      return;
    }

    setOperating(true);
    try {
    if (editingId) {
      const res = await semanasApi.updateAtividade(editingId, {
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
      });
      if (!res.ok) { onToast?.('Erro ao salvar atividade.', 'error'); return; }
      setAtividades(prev => prev.map(a => a.id === editingId ? {
        ...a,
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
      } : a));
      resetForm();
      setShowTaskModal(false);
    } else {
      const res = await semanasApi.createAtividade({
        semana_id: semana.id,
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
        status: 'a fazer',
      });
      if (!res.ok) { onToast?.('Erro ao adicionar atividade.', 'error'); return; }
      setAtividades(prev => [...prev, normalizeAtividade(res.data as Record<string, unknown>)]);
      setNewForm(prev => ({ ...prev, titulo: '', descricao: '', dataTermino: '' }));
      setShowTaskModal(false);
    }
    } finally {
      setOperating(false);
    }
  }, [newForm, semana, pessoas, editingId, resetForm, operating, onToast]);

  const handleRemoveAtividade = useCallback(async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
      deletingTimerRef.current = setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
    setDeletingId(null);
    const res = await semanasApi.deleteAtividade(id);
    if (!res.ok) { onToast?.('Erro ao excluir atividade.', 'error'); return; }
    setAtividades(prev => prev.filter(a => a.id !== id && a.parent_id !== id));
    if (editingId === id) resetForm();
  }, [deletingId, editingId, resetForm, onToast]);

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    if (status === 'concluída') {
      const openSubs = atividades.filter(a => a.parent_id === id && a.status !== 'concluída');
      if (openSubs.length > 0) {
        onToast?.(`Conclua as subtarefas desta atividade antes de concluí-la. (${openSubs.length} em aberto)`, 'warning');
        return;
      }
    }
    const res = await semanasApi.updateAtividade(id, { status });
    if (!res.ok) { onToast?.('Erro ao atualizar status.', 'error'); return; }
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, [atividades, onToast]);

  const handleCheckboxChange = useCallback(async (id: string, checked: boolean) => {
    if (checked) {
      const openSubs = atividades.filter(a => a.parent_id === id && a.status !== 'concluída');
      if (openSubs.length > 0) {
        onToast?.(`Conclua as subtarefas desta atividade antes de concluí-la. (${openSubs.length} em aberto)`, 'warning');
        return;
      }
    }
    const status = checked ? 'concluída' : 'a fazer';
    const res = await semanasApi.updateAtividade(id, { status });
    if (!res.ok) { onToast?.('Erro ao atualizar status.', 'error'); return; }
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, [atividades, onToast]);

  const handleSaveSubtask = useCallback(async (parentId: string) => {
    if (operating || !subtaskForm.titulo.trim() || !semana) return;
    if (!subtaskForm.dataTermino) {
      onToast?.('Data de término é obrigatória para a subtarefa.', 'warning');
      return;
    }
    if (!subtaskForm.pessoaId) {
      onToast?.('Responsável é obrigatório para a subtarefa.', 'warning');
      return;
    }
    const parent = atividades.find(a => a.id === parentId);
    setOperating(true);
    try {
      const res = await semanasApi.createAtividade({
        semana_id: semana.id,
        titulo: subtaskForm.titulo.trim(),
        descricao: '',
        pessoa_id: subtaskForm.pessoaId,
        data_termino: subtaskForm.dataTermino,
        tag: parent?.tag || '#planejamento',
        status: 'a fazer',
        parent_id: parentId,
      });
      if (!res.ok) { onToast?.('Erro ao adicionar subtarefa.', 'error'); return; }
      setAtividades(prev => [...prev, normalizeAtividade(res.data as Record<string, unknown>)]);
      setSubtaskForm({ titulo: '', pessoaId: '', dataTermino: '' });
      setExpandedTasks(prev => new Set(prev).add(parentId));
    } finally {
      setOperating(false);
    }
  }, [subtaskForm, semana, atividades, operating, onToast]);

  const handleFecharSemana = useCallback(async () => {
    if (operating || !semana?.aberta || !canFecharSemana) return;
    setOperating(true);
    try {
      const total = atividades.length;
      const concluidas = atividades.filter(a => a.status === 'concluída').length;
      // Cria histórico primeiro; se falhar, não fecha a semana
      const res2 = await semanasApi.createHistorico({
        farm_id: semana.farm_id,
        semana_id: semana.id,
        semana_numero: semana.numero,
        total,
        concluidas,
        pendentes: total - concluidas,
      });
      if (!res2.ok) { onToast?.('Erro ao registrar histórico.', 'error'); return; }
      const res1 = await semanasApi.updateSemana(semana.id, { aberta: false });
      if (!res1.ok) {
        // Rollback: deleta o histórico criado
        await semanasApi.deleteHistorico((res2.data as { id: string }).id);
        onToast?.('Erro ao fechar semana.', 'error');
        return;
      }
      onToast?.('Semana fechada com sucesso.', 'success');
      await fetchData();
    } finally {
      setOperating(false);
    }
  }, [semana, atividades, fetchData, operating, onToast]);

  const handleAbrirSemanaDoHistorico = useCallback(async (semanaId: string | null, semanaNumero: number) => {
    setLoading(true);
    setShowHistorico(false);
    try {
      let semanaData: Semana | null = null;
      if (semanaId) {
        const res = await semanasApi.getSemanaById(semanaId);
        semanaData = res.ok ? (res.data as Semana | null) : null;
      }
      if (!semanaData) {
        const farmId = selectedFarm?.id ?? null;
        const res = await semanasApi.getSemanaByNumero(semanaNumero, modo, farmId);
        semanaData = res.ok ? (res.data as Semana | null) : null;
      }
      if (!semanaData) {
        setLoading(false);
        return;
      }
      setSemana(semanaData);
      const atRes = await semanasApi.listAtividades(semanaData.id);
      setAtividades(atRes.ok ? (atRes.data as Record<string, unknown>[]).map(normalizeAtividade) : []);
    } finally {
      setLoading(false);
    }
  }, [modo, selectedFarm?.id]);

  const handleExcluirSemanaDoHistorico = useCallback(async (h: HistoricoSemana, maxNumero: number) => {
    if (operating || !canDeleteWeek) {
      if (!canDeleteWeek) onToast?.('Apagar semana deve ser feito por usuário autorizado', 'warning');
      return;
    }
    if (h.semana_numero !== maxNumero) return;
    setOperating(true);
    try {
    if (h.semana_id) {
      await semanasApi.deleteSemana(h.semana_id); // atividades excluídas em cascade
    }
    await semanasApi.deleteHistorico(h.id);
    await fetchData();
    } finally {
      setOperating(false);
    }
  }, [canDeleteWeek, fetchData, onToast, operating]);

  const handleVoltarSemanaAtual = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const handleConfirmCarryOver = useCallback(async (selectedIds: Set<string>) => {
    if (!carryOverModal) return;
    const chosen = carryOverModal.candidates.filter(a => selectedIds.has(a.id));
    if (chosen.length > 0) {
      // Create parent tasks first
      const parentsRes = await semanasApi.createAtividadesBulk(
        chosen.map(({ titulo, descricao, pessoa_id, data_termino, tag }) => ({
          semana_id: carryOverModal.pendingSemanaId,
          titulo, descricao, pessoa_id, data_termino, tag, status: 'a fazer' as const,
        })),
      );
      if (!parentsRes.ok) { onToast?.('Erro ao transferir atividades.', 'error'); return; }
      // Map old parent ID → new parent ID
      const newParents = parentsRes.data as Atividade[];
      const oldToNew = new Map<string, string>();
      chosen.forEach((oldParent, i) => { if (newParents[i]) oldToNew.set(oldParent.id, newParents[i].id); });
      // Create pending subtasks with new parent IDs
      const subsToCarry: Array<{ semana_id: string; titulo: string; descricao: string; pessoa_id: string | null; data_termino: string | null; tag: string; status: 'a fazer'; parent_id: string }> = [];
      for (const oldParent of chosen) {
        const subs = (subtasksMap.get(oldParent.id) || []).filter(s => s.status !== 'concluída');
        for (const sub of subs) {
          const newParentId = oldToNew.get(oldParent.id);
          if (newParentId) {
            subsToCarry.push({ semana_id: carryOverModal.pendingSemanaId, titulo: sub.titulo, descricao: sub.descricao, pessoa_id: sub.pessoa_id, data_termino: sub.data_termino, tag: sub.tag, status: 'a fazer', parent_id: newParentId });
          }
        }
      }
      if (subsToCarry.length > 0) {
        const subsRes = await semanasApi.createAtividadesBulk(subsToCarry);
        if (!subsRes.ok) onToast?.('Atividades transferidas mas houve erro nas subtarefas.', 'warning');
      }
    }
    setCarryOverModal(null);
    setSelectedCarryOver(new Set());
    await fetchData();
  }, [carryOverModal, subtasksMap, fetchData, onToast]);

  const handleCancelCarryOver = useCallback(async () => {
    setCarryOverModal(null);
    setSelectedCarryOver(new Set());
    await fetchData();
  }, [fetchData]);

  const handleAbrirSemana = useCallback(async () => {
    if (operating || semana?.aberta === true) return;

    setOperating(true);
    try {
    const farmId = selectedFarm?.id ?? null;

    if (semana === null) {
      // Primeiro lançamento: cria semana a partir da data de hoje
      const today = new Date();
      const weekNum = calcWeekNumber(today, modo);
      const monday = getMondayOfWeek(today);
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);
      await semanasApi.createSemana({
        farm_id: farmId,
        numero: weekNum,
        modo,
        aberta: true,
        data_inicio: toDateStr(monday),
        data_fim: toDateStr(saturday),
      });
    } else {
      // Semana existente fechada: abre a próxima
      const nextNumero = semana.numero + 1;
      const nextStart = new Date(semana.data_inicio + 'T00:00:00');
      nextStart.setDate(nextStart.getDate() + 7);
      const nextEnd = new Date(semana.data_fim + 'T00:00:00');
      nextEnd.setDate(nextEnd.getDate() + 7);

      // Verificar se a próxima semana já existe para esta fazenda (evita duplicatas)
      const existenteRes = await semanasApi.getSemanaByNumero(nextNumero, semana.modo, farmId);
      let targetSemana: Semana | null = existenteRes.ok ? (existenteRes.data as Semana | null) : null;

      if (targetSemana) {
        // Já existe: reabrir se estiver fechada
        if (!targetSemana.aberta) {
          await semanasApi.updateSemana(targetSemana.id, { aberta: true });
          targetSemana = { ...targetSemana, aberta: true };
        }
      } else {
        // Não existe: criar normalmente
        const newRes = await semanasApi.createSemana({
          farm_id: farmId,
          numero: nextNumero,
          modo: semana.modo,
          aberta: true,
          data_inicio: toDateStr(nextStart),
          data_fim: toDateStr(nextEnd),
        });
        targetSemana = newRes.ok ? (newRes.data as Semana) : null;
      }

      if (targetSemana) {
        const pending = atividades.filter(a => !a.parent_id && a.status !== 'concluída');
        if (pending.length > 0) {
          setCarryOverModal({
            pendingSemanaId: targetSemana.id,
            candidates: pending,
            semanaNumero: semana.numero,
            dataInicio: semana.data_inicio,
            dataFim: semana.data_fim,
          });
          setSelectedCarryOver(new Set(pending.map(a => a.id)));
          await fetchData();
          return;
        }
      }
    }
    await fetchData();
    } finally {
      setOperating(false);
    }
  }, [semana, modo, atividades, fetchData, selectedFarm?.id, operating]);

  // ─── Project handlers ─────────────────────────────────────────────────────────

  const handleProjectTaskEditStart = useCallback((task: UnifiedTask) => {
    setEditingProjectTask(task);
    setProjectEditForm({
      titulo: task.titulo,
      descricao: task.descricao,
      pessoaId: task.pessoa_id ?? '',
      activityDate: task.activity_date ?? '',
    });
  }, []);

  const handleProjectTaskSave = useCallback(async () => {
    if (!editingProjectTask || operating) return;
    setOperating(true);
    try {
      const res = await updateProjectTask(editingProjectTask.id, {
        title: projectEditForm.titulo.trim(),
        description: projectEditForm.descricao.trim() || null,
        responsible_person_id: projectEditForm.pessoaId || null,
        activity_date: projectEditForm.activityDate || null,
      });
      if (!res.ok) { onToast?.('Erro ao salvar tarefa.', 'error'); return; }
      setProjectTasks(prev => prev.map(t => t.id === editingProjectTask.id ? {
        ...t,
        titulo: projectEditForm.titulo.trim(),
        descricao: projectEditForm.descricao.trim(),
        pessoa_id: projectEditForm.pessoaId || null,
        activity_date: projectEditForm.activityDate || null,
        data_termino: projectEditForm.activityDate || null,
      } : t));
      setEditingProjectTask(null);
    } finally {
      setOperating(false);
    }
  }, [editingProjectTask, projectEditForm, operating, onToast]);

  const handleUnifiedEdit = useCallback((task: UnifiedTask) => {
    if (task.origin === 'project') {
      handleProjectTaskEditStart(task);
    } else if (task.semana_id) {
      handleEditStart({
        id: task.id,
        semana_id: task.semana_id,
        titulo: task.titulo,
        descricao: task.descricao,
        pessoa_id: task.pessoa_id,
        data_termino: task.data_termino,
        tag: task.tag ?? '#planejamento',
        status: task.status,
        parent_id: null,
        created_at: task.created_at ?? '',
      });
    }
  }, [handleProjectTaskEditStart, handleEditStart]);

  // ─── Render helpers ───────────────────────────────────────────────────────────

  const getSortIcon = (col: string) => {
    if (!sortConfig || sortConfig.column !== col) return <span style={{ opacity: 0.5 }}>↕</span>;
    return <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const getTagStyle  = (tag: string) => TAG_STYLES[tag] ?? { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' };
  const getStatusSt  = (s: string)   => STATUS_STYLES[s]  ?? STATUS_STYLES['a fazer'];

  const currentYear = new Date().getFullYear();
  const safraLabel  = getSafraLabel();

  // ─── Shared styles ────────────────────────────────────────────────────────────

  const mono = "'JetBrains Mono', monospace";

  const sortBtnStyle = useCallback((col: string): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
    color: sortConfig?.column === col ? '#4338CA' : '#94A3B8',
    padding: '2px 0', fontFamily: FONT,
  }), [sortConfig]);

  const isAbertaForStyles = semana?.aberta === true;
  const canAbrirForStyles = semana === null || semana?.aberta === false;
  const canFecharForStyles = isAbertaForStyles && canFecharSemana;
  const actionBtnStFechar = useMemo(() => ({
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: canFecharForStyles ? '#DC2626' : '#E2E8F0',
    color: canFecharForStyles ? '#FFF' : '#94A3B8',
    opacity: canFecharForStyles ? 1 : 0.5,
    cursor: canFecharForStyles ? 'pointer' : 'default',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: FONT,
  }), [canFecharForStyles]);
  const actionBtnStAbrir = useMemo(() => ({
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: canAbrirForStyles ? '#059669' : '#E2E8F0',
    color: canAbrirForStyles ? '#FFF' : '#94A3B8',
    opacity: canAbrirForStyles ? 1 : 0.5,
    cursor: canAbrirForStyles ? 'pointer' : 'default',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: FONT,
  }), [canAbrirForStyles]);

  // ─── Loading / empty ──────────────────────────────────────────────────────────

  if (!selectedFarm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#94A3B8', fontFamily: FONT, flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 32 }}>🌾</span>
        <span>Selecione uma fazenda para acessar a gestão semanal.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#94A3B8', fontFamily: FONT }}>
        Carregando...
      </div>
    );
  }

  const isAberta = semana?.aberta === true;
  const isFechada = semana?.aberta === false;
  // Abrir Semana disponível quando: semana fechada OU sem semana alguma (primeiro lançamento)
  const canAbrirSemana = semana === null || semana.aberta === false;
  // Pode incluir/editar/excluir: semana aberta OU (semana fechada E usuário com permissão)
  const canEditInWeek = isAberta || (isFechada && canEditClosedWeek);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', fontFamily: FONT }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>

          {/* Left side */}
          <div>
            {/* Ano / Safra toggle */}
            <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 8, padding: 2, gap: 2, marginBottom: 6 }}>
              {(['ano', 'safra'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
                    transition: 'all 0.15s ease',
                    background: modo === m ? '#0F172A' : 'transparent',
                    color: modo === m ? '#FFF' : '#94A3B8',
                    fontFamily: FONT,
                  }}
                >
                  {m === 'ano' ? 'Ano' : 'Safra'}
                </button>
              ))}
            </div>

            {/* Subtitle */}
            <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6, paddingLeft: 2, margin: '0 0 6px 2px' }}>
              {modo === 'ano' ? `Ano civil ${currentYear} · Jan – Dez` : `Safra ${safraLabel} · Jul – Jun`}
            </p>

            {/* Title + badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, marginTop: 4 }}>
              <h1 style={{ margin: 0, lineHeight: 1 }}>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: '#0F172A', fontFamily: FONT }}>
                  Semana {String(semana?.numero ?? calcWeekNumber(new Date(), modo)).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8', fontFamily: FONT }}> de 53</span>
              </h1>
              <span style={{
                background: semana === null ? '#F1F5F9' : isAberta ? '#ECFDF5' : '#FEF2F2',
                color: semana === null ? '#94A3B8' : isAberta ? '#059669' : '#DC2626',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                borderRadius: 99, padding: '3px 10px', textTransform: 'uppercase',
              }}>
                {semana === null ? 'SEM SEMANA' : isAberta ? 'ABERTA' : 'FECHADA'}
              </span>
            </div>

            {/* Date range — período canônico domingo–sábado */}
            <p
              onMouseEnter={() => setShowPeriodoTooltip(true)}
              onMouseLeave={() => setShowPeriodoTooltip(false)}
              style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0 2px', cursor: 'default', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {formatCanonicalWeekPeriod(semana?.data_inicio ?? new Date())}
              {showPeriodoTooltip && (
                <span style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: '#1E293B', color: '#F8FAFC',
                  fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                  padding: '4px 8px', borderRadius: 6,
                  pointerEvents: 'none', zIndex: 99,
                }}>
                  Semana Referência
                </span>
              )}
            </p>
          </div>

          {/* Right side: action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Drawer source button */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${sourceTab === 'projetos' ? '#C7D2FE' : '#E2E8F0'}`,
                background: sourceTab === 'projetos' ? '#EEF2FF' : '#FFF',
                color: sourceTab === 'projetos' ? '#4338CA' : '#475569',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT,
              }}
            >
              <span>{sourceTab === 'semana' ? '📅 Semana' : '📁 Projetos'}</span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>▼</span>
            </button>
            {semana && ultimaSemanaId && semana.id !== ultimaSemanaId && (
              <button
                onClick={handleVoltarSemanaAtual}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #6366F1',
                  background: '#EEF2FF', color: '#4338CA', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: FONT,
                }}
              >
                Voltar para semana atual
              </button>
            )}
            <button
              onClick={() => setShowHistorico(v => !v)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                background: showHistorico ? '#F1F5F9' : '#FFF',
                color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s ease', fontFamily: FONT,
              }}
            >
              Histórico
            </button>
            <button onClick={handleFecharSemana} disabled={operating || !isAberta || !canFecharSemana} style={actionBtnStFechar}>
              Fechar Semana
            </button>
            <button onClick={handleAbrirSemana} disabled={operating || !canAbrirSemana} style={actionBtnStAbrir}>
              Abrir Semana
            </button>
          </div>
        </div>

        {/* ── 2. HISTÓRICO ──────────────────────────────────────────────────── */}
        {showHistorico && (
          <div style={{
            background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
            padding: 16, marginBottom: 16,
            animation: 'gsFadeIn 0.3s ease',
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: '0 0 10px' }}>Semanas anteriores</p>
            {historico.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Nenhum histórico disponível.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {historico.map(h => {
                  const isLatest = h.semana_numero === maxHistoricoNumero;
                  const deleteEnabled = isLatest && canDeleteWeek;
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderRadius: 8, background: '#F8FAFC', fontSize: 13,
                        border: 'none', width: '100%', fontFamily: FONT,
                        transition: 'background 0.15s', gap: 8,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; }}
                    >
                      <button
                        type="button"
                        onClick={() => handleAbrirSemanaDoHistorico(h.semana_id, h.semana_numero)}
                        style={{
                          flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: 0, border: 'none', cursor: 'pointer', background: 'transparent',
                          textAlign: 'left', fontFamily: FONT, fontSize: 13,
                        }}
                      >
                        <span style={{ fontFamily: mono, fontWeight: 500 }}>
                          Semana {String(h.semana_numero).padStart(2, '0')}
                        </span>
                        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          <span style={{ color: '#64748B' }}>{h.total} tarefas</span>
                          <span style={{ color: '#059669' }}>✓ {h.concluidas}</span>
                          {h.pendentes > 0
                            ? <span style={{ color: '#DC2626' }}>→ {h.pendentes} pendentes</span>
                            : <span style={{ color: '#059669', fontWeight: 500 }}>100%</span>
                          }
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExcluirSemanaDoHistorico(h, maxHistoricoNumero)}
                        title={deleteEnabled ? 'Excluir semana' : (isLatest ? 'Apagar semana deve ser feito por usuário autorizado' : 'Exclua a semana mais recente primeiro')}
                        style={{
                          flexShrink: 0, padding: 4, border: 'none', borderRadius: 6, cursor: deleteEnabled ? 'pointer' : 'not-allowed',
                          background: deleteEnabled ? '#FEE2E2' : 'transparent',
                          color: deleteEnabled ? '#DC2626' : '#94A3B8',
                          opacity: deleteEnabled ? 1 : 0.3,
                          fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 3. STATS CARDS ────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
          {[
            { label: 'Total geral', value: stats.totalGeral,   color: '#475569' },
            { label: 'Tarefas',     value: stats.totalTarefas, color: '#6366F1' },
            { label: 'Concluídas',  value: stats.concluidas,   color: '#059669' },
            { label: 'A fazer',     value: stats.aFazer,       color: '#6B7280' },
          ].map(card => (
            <div key={card.label} style={{ background: '#FFF', borderRadius: 8, padding: '6px 10px', border: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, margin: '0 0 2px' }}>{card.label}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: card.color, margin: 0, fontFamily: mono }}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── 4. PROGRESS BAR ───────────────────────────────────────────────── */}
        <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #F1F5F9', padding: '6px 10px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>Progresso da semana</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', fontFamily: mono }}>{stats.progresso}%</span>
          </div>
          <div style={{ height: 4, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${stats.progresso}%`, borderRadius: 99,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              ...(stats.progresso === 100
                ? { backgroundColor: '#059669' }
                : { background: 'linear-gradient(90deg, #6366F1, #818CF8)' }),
            }} />
          </div>
        </div>

        {/* ── 5. NOVA TAREFA BUTTON ───────────────────────────────────────── */}
        {sourceTab === 'semana' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              onClick={() => {
                if (!canEditInWeek) return;
                setNewForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento' });
                setEditingId(null);
                setShowTaskModal(true);
              }}
              disabled={!canEditInWeek}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: canEditInWeek ? '#3B82F6' : '#E2E8F0',
                color: canEditInWeek ? '#FFF' : '#94A3B8',
                fontSize: 13, fontWeight: 600,
                cursor: canEditInWeek ? 'pointer' : 'not-allowed',
                fontFamily: FONT,
              }}
            >
              + Nova Tarefa
            </button>
          </div>
        )}

        {/* ── 6. LISTA ─────────────────────────────────────────────── */}
        <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 8 }}>

          {/* Sort + Filter header */}
          <div style={{ padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => handleSort('titulo')} style={{ ...sortBtnStyle('titulo'), flex: '1 1 160px' }}>
                TÍTULO {getSortIcon('titulo')}
              </button>
              <button onClick={() => handleSort('pessoa')} style={{ ...sortBtnStyle('pessoa'), flex: '0 0 130px' }}>
                RESPONSÁVEL {getSortIcon('pessoa')}
              </button>
              <button onClick={() => handleSort('dataTermino')} style={{ ...sortBtnStyle('dataTermino'), flex: '0 0 90px' }}>
                TÉRMINO {getSortIcon('dataTermino')}
              </button>
              <button onClick={() => handleSort('status')} style={{ ...sortBtnStyle('status'), flex: '0 0 110px' }}>
                STATUS {getSortIcon('status')}
              </button>
              <div style={{ flex: '0 0 28px' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <input type="text" placeholder="Filtrar título..." value={filters.titulo} list="titulo-tags-list"
                onChange={e => setFilters(p => ({ ...p, titulo: e.target.value }))} style={{ ...FILTER_ST, flex: '1 1 160px' }} />
              <datalist id="titulo-tags-list">
                {uniqueTags.map(tag => <option key={tag} value={tag} />)}
              </datalist>
              <select value={filters.pessoaId} onChange={e => setFilters(p => ({ ...p, pessoaId: e.target.value }))} style={{ ...FILTER_ST, flex: '0 0 130px' }}>
                <option value="">Todos</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div style={{ flex: '0 0 90px' }}>
                <DateInputBR value={filters.dataTermino} onChange={v => setFilters(p => ({ ...p, dataTermino: v }))} placeholder="dd/mm/aaaa" className="w-full" />
              </div>
              <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...FILTER_ST, flex: '0 0 110px' }}>
                <option value="">Todos</option>
                {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {hasActiveFilters ? (
                <button onClick={clearFilters} style={{ flex: '0 0 28px', width: 22, height: 22, borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              ) : <div style={{ flex: '0 0 28px' }} />}
            </div>
          </div>

          {/* Data rows */}
          {sourceTab === 'projetos' && loadingProjectTasks && (
            <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>Carregando tarefas de projetos...</div>
          )}
          {sourceTab === 'projetos' && !loadingProjectTasks && filteredProjectTasks.map(task => {
            const isHovered = hoveredRow === task.id;
            const isConcluida = task.status === 'concluída';
            const stSt = getStatusSt(task.status);
            return (
              <div
                key={task.id}
                onMouseEnter={() => setHoveredRow(task.id)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => handleProjectTaskEditStart(task)}
                style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 1fr 130px 90px 110px 110px',
                  padding: '9px 14px', borderBottom: '1px solid #F8FAFC',
                  alignItems: 'center', columnGap: 8,
                  background: isHovered ? '#F8FAFC' : '#FFF',
                  cursor: 'pointer', transition: 'background 0.15s',
                  borderLeft: '3px solid transparent',
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>📁</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isConcluida ? '#94A3B8' : '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isConcluida ? 'line-through' : 'none' }}>{task.titulo}</div>
                <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.descricao || '—'}</div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPessoaNome(task.pessoa_id)}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: mono }}>{formatDatePtBr(task.data_termino)}</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 110 }}>
                    {task.initiative_name ?? '—'}
                  </span>
                </div>
                <select
                  value={task.status}
                  onChange={e => {
                    const ns = e.target.value;
                    setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: ns as TaskStatus } : t));
                    updateProjectTask(task.id, { kanban_status: ns as import('../lib/api/tasksClient').KanbanStatus }).then(r => {
                      if (!r.ok) {
                        setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
                        onToast?.('Erro ao atualizar status.', 'error');
                      }
                    });
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 11, fontWeight: 500, padding: '2px 4px', borderRadius: 4, width: '100%', color: stSt.text, background: stSt.bg, border: `1px solid ${stSt.border}`, cursor: 'pointer', fontFamily: FONT }}
                >
                  {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div />
              </div>
            );
          })}
          {sourceTab === 'projetos' && !loadingProjectTasks && filteredProjectTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>Nenhuma tarefa de projeto encontrada para esta semana.</div>
          )}
          {sourceTab === 'semana' && filteredParentTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>
              Nenhuma atividade encontrada.
            </div>
          )}
          {sourceTab === 'semana' && filteredParentTasks.map(at => {
            const subs       = subtasksMap.get(at.id) || [];
            const isExpanded = expandedTasks.has(at.id);
            const isConcluida = at.status === 'concluída';
            const isHovered  = hoveredRow === at.id;
            const isDeleting = deletingId === at.id;
            const isEditing  = editingId === at.id;
            const stSt       = getStatusSt(at.status);
            const subsDone   = subs.filter(s => s.status === 'concluída').length;

            return (
              <div key={at.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                {/* ── Parent row ─────────────────────────────────── */}
                <div
                  onMouseEnter={() => setHoveredRow(at.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: isEditing ? '#F5F3FF' : isHovered ? '#F8FAFC' : '#FFF',
                    transition: 'background 0.15s',
                    borderLeft: isEditing ? '3px solid #6366F1' : '3px solid transparent',
                  }}
                >
                  {/* Circular checkbox */}
                  <div
                    onClick={e => { e.stopPropagation(); handleCheckboxChange(at.id, !isConcluida); }}
                    style={{
                      flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                      width: 18, height: 18, borderRadius: 9,
                      border: isConcluida ? 'none' : '2px solid #CBD5E1',
                      background: isConcluida ? '#059669' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {isConcluida && <span style={{ color: '#FFF', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  </div>

                  {/* Title + secondary info */}
                  <div
                    onClick={() => handleEditStart(at)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    {/* Row 1: title + badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 600, color: isConcluida ? '#94A3B8' : '#1E293B',
                        textDecoration: isConcluida ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {at.titulo}
                      </span>
                      {subs.length > 0 && (
                        <span style={{ fontSize: 11, color: '#94A3B8', background: '#F1F5F9', borderRadius: 4, padding: '1px 6px', flexShrink: 0, fontFamily: mono }}>
                          {subsDone}/{subs.length}
                        </span>
                      )}
                    </div>
                    {/* Row 2: date + person */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3 }}>
                      {at.data_termino && (
                        <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 11 }}>⏰</span> {formatDatePtBr(at.data_termino)}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11 }}>👤</span> {getPessoaNome(at.pessoa_id)}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <select
                    value={at.status}
                    onChange={e => { e.stopPropagation(); handleStatusChange(at.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 11, fontWeight: 500, padding: '2px 4px', borderRadius: 4, color: stSt.text, background: stSt.bg, border: `1px solid ${stSt.border}`, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}
                  >
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {/* Add subtask button */}
                  <button
                    onClick={e => { if (!canEditInWeek) return; e.stopPropagation(); setAddingSubtaskFor(at.id); setExpandedTasks(prev => new Set(prev).add(at.id)); setSubtaskForm({ titulo: '', pessoaId: '', dataTermino: '' }); }}
                    title={canEditInWeek ? 'Adicionar subtarefa' : undefined}
                    disabled={!canEditInWeek}
                    style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: '#94A3B8', cursor: canEditInWeek ? 'pointer' : 'default', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canEditInWeek && (isHovered || addingSubtaskFor === at.id) ? 1 : 0, transition: 'opacity 0.15s' }}
                  >+</button>

                  {/* Chevron */}
                  {subs.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedTasks(prev => { const next = new Set(prev); if (next.has(at.id)) next.delete(at.id); else next.add(at.id); return next; }); }}
                      style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    >▼</button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={e => { if (!canEditInWeek) return; e.stopPropagation(); handleRemoveAtividade(at.id); }}
                    title={canEditInWeek ? (isDeleting ? 'Clique novamente para confirmar' : subs.length > 0 ? 'Excluir tarefa e subtarefas' : 'Excluir') : undefined}
                    disabled={!canEditInWeek}
                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: isDeleting ? '#FEE2E2' : 'transparent', color: isDeleting ? '#DC2626' : '#CBD5E1', cursor: canEditInWeek ? 'pointer' : 'default', fontSize: 12, opacity: canEditInWeek && (isHovered || isDeleting) ? 1 : 0, transition: 'opacity 0.15s, background 0.15s, color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: isDeleting ? 700 : 400 }}
                  >
                    {isDeleting ? '?' : '✕'}
                  </button>
                </div>

                {/* ── Subtasks ────────────────────────────────────── */}
                {isExpanded && subs.length > 0 && (
                  <div style={{ margin: '0 14px 6px 44px', borderLeft: '2px solid #E2E8F0', borderRadius: '0 6px 6px 0', background: '#F8FAFC', overflow: 'hidden' }}>
                    {subs.map((sub, idx) => {
                      const subConcluida = sub.status === 'concluída';
                      const subHovered = hoveredRow === sub.id;
                      const subDeleting = deletingId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          onMouseEnter={() => setHoveredRow(sub.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: idx === 0 ? 'none' : '1px solid #EEF2F7', background: subHovered ? '#EFF6FF' : 'transparent', transition: 'background 0.15s' }}
                        >
                          {/* Circular checkbox (smaller) */}
                          <div
                            onClick={e => { e.stopPropagation(); handleCheckboxChange(sub.id, !subConcluida); }}
                            style={{ flexShrink: 0, width: 14, height: 14, borderRadius: 7, border: subConcluida ? 'none' : '1.5px solid #CBD5E1', background: subConcluida ? '#059669' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {subConcluida && <span style={{ color: '#FFF', fontSize: 7, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                          </div>

                          {/* Title */}
                          <div
                            onClick={() => handleEditStart(sub)}
                            style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 400, color: subConcluida ? '#94A3B8' : '#475569', textDecoration: subConcluida ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          >
                            {sub.titulo}
                          </div>

                          {/* Date */}
                          {sub.data_termino && (
                            <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 10 }}>⏰</span> {formatDatePtBr(sub.data_termino)}
                            </span>
                          )}

                          {/* Person */}
                          <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: 10 }}>👤</span> {getPessoaNome(sub.pessoa_id)}
                          </span>

                          {/* Delete */}
                          <button
                            onClick={e => { if (!canEditInWeek) return; e.stopPropagation(); handleRemoveAtividade(sub.id); }}
                            title={canEditInWeek ? (subDeleting ? 'Clique novamente para confirmar' : 'Excluir subtarefa') : undefined}
                            disabled={!canEditInWeek}
                            style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, border: 'none', background: subDeleting ? '#FEE2E2' : 'transparent', color: subDeleting ? '#DC2626' : '#CBD5E1', cursor: canEditInWeek ? 'pointer' : 'default', fontSize: 10, opacity: canEditInWeek && (subHovered || subDeleting) ? 1 : 0, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: subDeleting ? 700 : 400 }}
                          >
                            {subDeleting ? '?' : '✕'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Inline subtask form ─────────────────────────── */}
                {addingSubtaskFor === at.id && (
                  <div style={{ margin: '0 14px 6px 44px', borderLeft: '2px solid #6366F1', borderRadius: '0 6px 6px 0', background: '#F0F9FF', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      autoFocus
                      type="text" placeholder="Nova subtarefa..." value={subtaskForm.titulo}
                      onChange={e => setSubtaskForm(p => ({ ...p, titulo: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveSubtask(at.id)}
                      style={{ ...FILTER_ST, flex: 1 }}
                    />
                    <select
                      value={subtaskForm.pessoaId}
                      onChange={e => setSubtaskForm(p => ({ ...p, pessoaId: e.target.value }))}
                      style={{ ...FILTER_ST, flex: '0 0 120px' }}
                    >
                      <option value="">Responsável</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                    <div style={{ flex: '0 0 110px' }}>
                      <DateInputBR value={subtaskForm.dataTermino} onChange={v => setSubtaskForm(p => ({ ...p, dataTermino: v }))} placeholder="dd/mm/aaaa" className="w-full" />
                    </div>
                    <button
                      onClick={() => handleSaveSubtask(at.id)}
                      disabled={!subtaskForm.titulo.trim() || !subtaskForm.pessoaId || !subtaskForm.dataTermino || operating}
                      style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 6, border: 'none', background: (subtaskForm.titulo.trim() && subtaskForm.pessoaId && subtaskForm.dataTermino) ? '#3B82F6' : '#BFDBFE', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: (subtaskForm.titulo.trim() && subtaskForm.pessoaId && subtaskForm.dataTermino) ? 'pointer' : 'default', fontFamily: FONT, whiteSpace: 'nowrap' }}
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => setAddingSubtaskFor(null)}
                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 7. COUNTER ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px 0' }}>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>
            {sourceTab === 'projetos'
              ? `${filteredProjectTasks.length} tarefas de projetos`
              : hasActiveFilters
                ? `${filteredParentTasks.length} de ${parentTasks.length} tarefas`
                : `${parentTasks.length} tarefas (${atividades.length} total com subtarefas)`}
          </span>
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{
              fontSize: 11, color: '#6366F1', fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT,
            }}>
              Limpar filtros
            </button>
          )}
        </div>

        {/* ── 8. FOOTER ─────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #F1F5F9', textAlign: 'center', fontSize: 11, color: '#CBD5E1' }}>
          Gestão Semanal • Semana {String(semana?.numero ?? 0).padStart(2, '0')} de 53 •{' '}
          {modo === 'ano' ? `Ano ${currentYear}` : `Safra ${safraLabel}`}
        </div>

      </div>

      {/* ── MODAL NOVA / EDITAR TAREFA ──────────────────────────────────────── */}
      {showTaskModal && (
        <div
          onClick={handleEditCancel}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24, animation: 'gsFadeIn 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFF', borderRadius: 16, padding: 24,
              maxWidth: 700, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              fontFamily: FONT,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: editingId ? '#6366F1' : '#0F172A' }}>
                {editingId ? 'Editando atividade' : 'Nova atividade'}
              </p>
              <button
                onClick={handleEditCancel}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Título <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  autoFocus
                  type="text" placeholder="Título" value={newForm.titulo}
                  onChange={e => setNewForm(p => ({ ...p, titulo: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  style={INPUT_ST}
                />
              </div>
              <div style={{ flex: '2 1 220px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descrição</label>
                <input
                  type="text" placeholder="Descrição breve" value={newForm.descricao}
                  onChange={e => setNewForm(p => ({ ...p, descricao: e.target.value }))}
                  style={INPUT_ST}
                />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Responsável <span style={{ color: '#EF4444' }}>*</span></label>
                <select value={newForm.pessoaId} onChange={e => setNewForm(p => ({ ...p, pessoaId: e.target.value }))} style={INPUT_ST}>
                  <option value="">Selecione</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Data Término <span style={{ color: '#EF4444' }}>*</span></label>
                <DateInputBR
                  value={newForm.dataTermino}
                  onChange={v => setNewForm(p => ({ ...p, dataTermino: v }))}
                  className="w-full"
                />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>#</label>
                <input
                  type="text" placeholder="#tag" value={newForm.tag}
                  onChange={e => setNewForm(p => ({ ...p, tag: e.target.value }))}
                  style={INPUT_ST}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={handleEditCancel}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: FONT }}
              >
                Cancelar
              </button>
              {(() => {
                const canSave = !!newForm.titulo.trim() && !!newForm.pessoaId && !!newForm.dataTermino;
                return (
                  <button
                    onClick={handleSave}
                    disabled={operating || !canSave}
                    style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: canSave ? '#3B82F6' : '#BFDBFE', color: '#FFF', cursor: canSave ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, fontFamily: FONT }}
                  >
                    {editingId ? 'Salvar' : 'Adicionar'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CARRY-OVER TAREFAS ────────────────────────────────────────── */}
      {carryOverModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24, animation: 'gsFadeIn 0.2s ease',
          }}
        >
          <div
            style={{
              background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
              maxWidth: 560, width: '100%', maxHeight: '85vh', overflow: 'hidden',
              display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', fontFamily: FONT }}>
                  Tarefas da semana anterior
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8' }}>
                  Semana {String(carryOverModal.semanaNumero).padStart(2, '0')} · {formatWeekRange(carryOverModal.dataInicio, carryOverModal.dataFim)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelCarryOver}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={selectedCarryOver.size === carryOverModal.candidates.length}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedCarryOver(new Set(carryOverModal.candidates.map(a => a.id)));
                  } else {
                    setSelectedCarryOver(new Set());
                  }
                }}
                style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
              />
              <button
                type="button"
                onClick={() => {
                  if (selectedCarryOver.size === carryOverModal.candidates.length) {
                    setSelectedCarryOver(new Set());
                  } else {
                    setSelectedCarryOver(new Set(carryOverModal.candidates.map(a => a.id)));
                  }
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: '#6366F1', fontWeight: 500, fontFamily: FONT,
                }}
              >
                {selectedCarryOver.size === carryOverModal.candidates.length ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1, padding: 16, maxHeight: 320 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {carryOverModal.candidates.map(at => {
                  const tagSt = getTagStyle(at.tag);
                  const stSt = getStatusSt(at.status);
                  const checked = selectedCarryOver.has(at.id);
                  return (
                    <div
                      key={at.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                        borderRadius: 8, background: checked ? '#F5F3FF' : '#F8FAFC',
                        border: `1px solid ${checked ? '#C7D2FE' : '#F1F5F9'}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedCarryOver(prev => {
                          const next = new Set(prev);
                          if (next.has(at.id)) next.delete(at.id);
                          else next.add(at.id);
                          return next;
                        });
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer', pointerEvents: 'none' }}
                      />
                      <span
                        style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                          color: stSt.text, background: stSt.bg, border: `1px solid ${stSt.border}`,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        {at.status}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {at.titulo}
                          {(subtasksMap.get(at.id)?.length ?? 0) > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 10, background: '#EEF2FF', color: '#6366F1', verticalAlign: 'middle' }}>
                              {subtasksMap.get(at.id)!.length} sub
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getPessoaNome(at.pessoa_id)}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                          background: tagSt.bg, color: tagSt.text, border: `1px solid ${tagSt.border}`,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        {at.tag}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleCancelCarryOver()}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#FFF', color: '#64748B', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: FONT,
                }}
              >
                Não trazer nenhuma
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCarryOver(selectedCarryOver)}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#6366F1', color: '#FFF', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, fontFamily: FONT,
                }}
              >
                Confirmar seleção ({selectedCarryOver.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER LATERAL ──────────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1001 }}
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 240,
              background: '#FFF', boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
              display: 'flex', flexDirection: 'column',
              animation: 'gsSlideIn 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0, fontFamily: FONT }}>Visualizar como</p>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(['semana', 'projetos'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setSourceTab(tab); setIsDrawerOpen(false); }}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: 'none',
                    background: sourceTab === tab ? '#EEF2FF' : 'transparent',
                    color: sourceTab === tab ? '#4338CA' : '#475569',
                    fontSize: 13, fontWeight: sourceTab === tab ? 600 : 400,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{tab === 'semana' ? '📅' : '📁'}</span>
                  <div style={{ flex: 1 }}>
                    <div>{tab === 'semana' ? 'Semana' : 'Projetos'}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                      {tab === 'semana' ? 'Tarefas da semana atual' : 'Tarefas de projetos com data nesta semana'}
                    </div>
                  </div>
                  {sourceTab === tab && <span style={{ color: '#4338CA', fontSize: 14 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDIÇÃO TAREFA DE PROJETO ────────────────────────────────────── */}
      {editingProjectTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24, animation: 'gsFadeIn 0.2s ease' }}>
          <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0', maxWidth: 520, width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', fontFamily: FONT }}>Editar tarefa</h2>
                {editingProjectTask.initiative_name && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6366F1' }}>📁 {editingProjectTask.initiative_name}</p>
                )}
              </div>
              <button onClick={() => setEditingProjectTask(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Título</label>
                <input type="text" value={projectEditForm.titulo} onChange={e => setProjectEditForm(p => ({ ...p, titulo: e.target.value }))} style={INPUT_ST} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Descrição</label>
                <input type="text" value={projectEditForm.descricao} onChange={e => setProjectEditForm(p => ({ ...p, descricao: e.target.value }))} style={INPUT_ST} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Responsável</label>
                <select value={projectEditForm.pessoaId} onChange={e => setProjectEditForm(p => ({ ...p, pessoaId: e.target.value }))} style={INPUT_ST}>
                  <option value="">Selecione</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Data da atividade</label>
                <DateInputBR value={projectEditForm.activityDate} onChange={v => setProjectEditForm(p => ({ ...p, activityDate: v }))} className="w-full" />
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingProjectTask(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFF', color: '#64748B', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: FONT }}>Cancelar</button>
              <button
                onClick={handleProjectTaskSave}
                disabled={operating || !projectEditForm.titulo.trim()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: projectEditForm.titulo.trim() ? '#6366F1' : '#C7D2FE', color: '#FFF', cursor: projectEditForm.titulo.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, fontFamily: FONT }}
              >
                {operating ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GestaoSemanal;
