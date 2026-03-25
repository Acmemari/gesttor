import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DateInputBR from '../components/DateInputBR';
import * as semanasApi from '../lib/api/semanasClient';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { listPessoasByFarm, checkPermsByEmail } from '../lib/api/pessoasClient';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
const KANBAN_COLUMN_LABELS: Record<string, string> = {
  'a fazer': 'A Fazer', 'em andamento': 'Em Andamento',
  'pausada': 'Pausada', 'concluída': 'Concluída',
};
const KANBAN_COLUMN_COLORS: Record<string, { header: string; bg: string; border: string }> = {
  'a fazer':      { header: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  'em andamento': { header: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'pausada':      { header: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  'concluída':    { header: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
};

const GRID_COLS = '36px 2fr 3fr 110px 90px 120px 106px 28px';
const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const PT_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
const SORT_COLS = ['titulo', 'desc', 'pessoa', 'dataTermino', 'tag', 'status'] as const;
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

function getSafraLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

const EMPTY_FILTERS: Filters = { titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '', status: '' };

interface GestaoSemanalProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Kanban sub-components ─────────────────────────────────────────────────────

interface KanbanCardProps {
  task: UnifiedTask;
  onEdit: (task: UnifiedTask) => void;
  pessoaMap: Map<string, string>;
  mono: string;
  isDragging?: boolean;
}

function KanbanCardItem({ task, onEdit, pessoaMap, mono, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.3 : 1,
    background: '#FFF', borderRadius: 8,
    border: isDragging ? '2px solid #6366F1' : '1px solid #E2E8F0',
    padding: '10px 12px', cursor: 'grab',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
    userSelect: 'none',
  };
  const tagSt = task.tag ? (TAG_STYLES[task.tag] ?? { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }) : null;
  const pessoa = task.pessoa_id ? pessoaMap.get(task.pessoa_id) : null;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {task.origin === 'project' && task.initiative_name && (
            <div style={{ fontSize: 10, color: '#6366F1', fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📁 {task.initiative_name}
            </div>
          )}
          {tagSt && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 3, background: tagSt.bg, color: tagSt.text, border: `1px solid ${tagSt.border}`, marginBottom: 4, display: 'inline-block' }}>
              {task.tag}
            </span>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.titulo}
          </div>
          {task.descricao && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.descricao}
            </div>
          )}
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEdit(task); }}
          style={{ flexShrink: 0, padding: 3, border: 'none', background: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 12, borderRadius: 4 }}
          title="Editar"
        >✎</button>
      </div>
      {(pessoa || task.data_termino) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 6 }}>
          {pessoa && <span style={{ fontSize: 10, color: '#64748B', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{pessoa}</span>}
          {task.data_termino && <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: mono, flexShrink: 0, marginLeft: 'auto' }}>{formatDatePtBr(task.data_termino)}</span>}
        </div>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  status: string;
  label: string;
  tasks: UnifiedTask[];
  colColor: { header: string; bg: string; border: string };
  onEdit: (task: UnifiedTask) => void;
  pessoaMap: Map<string, string>;
  mono: string;
  onAddTask?: () => void;
  canAdd?: boolean;
}

function KanbanColumnContainer({ status, label, tasks, colColor, onEdit, pessoaMap, mono, onAddTask, canAdd }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? colColor.bg : '#F8FAFC',
      borderRadius: 10, border: `1px solid ${isOver ? colColor.border : '#E2E8F0'}`,
      minHeight: 200, display: 'flex', flexDirection: 'column',
      transition: 'background 0.15s, border-color 0.15s',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colColor.header, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: colColor.header, background: '#FFF', borderRadius: 99, padding: '1px 7px', border: `1px solid ${colColor.border}` }}>{tasks.length}</span>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <KanbanCardItem key={task.id} task={task} onEdit={onEdit} pessoaMap={pessoaMap} mono={mono} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 8px', color: '#CBD5E1', fontSize: 12 }}>Sem tarefas</div>
        )}
        {canAdd && (
          <button
            onClick={onAddTask}
            style={{
              marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 8,
              border: '1.5px dashed #BFDBFE', background: 'transparent',
              color: '#3B82F6', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            + Nova tarefa
          </button>
        )}
      </div>
    </div>
  );
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
  const formRef = useRef<HTMLDivElement>(null);

  // ── View mode & source tab ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>(
    () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('gestao-view-mode') as 'lista' | 'kanban') : null) ?? 'lista',
  );
  const [sourceTab, setSourceTab] = useState<'semana' | 'projetos'>('semana');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [projectTasks, setProjectTasks] = useState<UnifiedTask[]>([]);
  const [loadingProjectTasks, setLoadingProjectTasks] = useState(false);
  const [activeDragTask, setActiveDragTask] = useState<UnifiedTask | null>(null);
  const [editingProjectTask, setEditingProjectTask] = useState<UnifiedTask | null>(null);
  const [projectEditForm, setProjectEditForm] = useState({ titulo: '', descricao: '', pessoaId: '', activityDate: '' });
  const [kanbanAddStatus, setKanbanAddStatus] = useState<string | null>(null);
  const [kanbanForm, setKanbanForm] = useState({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento' });

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

      const [pessoasRows, semanaRes, historicoRes] = await Promise.all([
        farmId ? listPessoasByFarm(farmId, { assumeTarefas: true }) : Promise.resolve([]),
        semanasApi.getCurrentSemana(modo, farmId),
        semanasApi.listHistorico(farmId),
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
        setAtividades(atRes.ok ? (atRes.data as Atividade[]) : []);
      } else {
        setAtividades([]);
      }

      setNewForm(prev => ({ ...prev, pessoaId: prev.pessoaId || '' }));
    } finally {
      setLoading(false);
    }
  }, [modo, selectedFarm?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { localStorage.setItem('gestao-view-mode', viewMode); }, [viewMode]);

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
    let concluidas = 0, em_andamento = 0, pausada = 0, a_fazer = 0;
    for (const a of activeTasks) {
      switch (a.status) {
        case 'concluída': concluidas++; break;
        case 'em andamento': em_andamento++; break;
        case 'pausada': pausada++; break;
        case 'a fazer': a_fazer++; break;
      }
    }
    const total = activeTasks.length;
    const progresso = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return { total, concluidas, em_andamento, pausada, a_fazer, progresso };
  }, [activeTasks]);

  const pessoaMap = useMemo(() => {
    const m = new Map<string, string>();
    pessoas.forEach(p => m.set(p.id, p.nome));
    return m;
  }, [pessoas]);

  const getPessoaNome = useCallback((id: string | null) => (id ? pessoaMap.get(id) : null) || '—', [pessoaMap]);

  const filteredAndSorted = useMemo(() => {
    let result = [...atividades];
    if (filters.titulo)      result = result.filter(a => a.titulo.toLowerCase().includes(filters.titulo.toLowerCase()));
    if (filters.descricao)   result = result.filter(a => (a.descricao || '').toLowerCase().includes(filters.descricao.toLowerCase()));
    if (filters.pessoaId)    result = result.filter(a => a.pessoa_id === filters.pessoaId);
    if (filters.dataTermino) result = result.filter(a => a.data_termino === filters.dataTermino);
    if (filters.tag)         result = result.filter(a => a.tag.toLowerCase().includes(filters.tag.toLowerCase()));
    if (filters.status)      result = result.filter(a => a.status === filters.status);

    if (sortConfig) {
      result.sort((a, b) => {
        let va = '', vb = '';
        switch (sortConfig.column) {
          case 'titulo':      va = a.titulo;       vb = b.titulo;       break;
          case 'desc':        va = a.descricao;    vb = b.descricao;    break;
          case 'dataTermino': va = a.data_termino || ''; vb = b.data_termino || ''; break;
          case 'tag':         va = a.tag;          vb = b.tag;          break;
          case 'status':      va = a.status;       vb = b.status;       break;
          case 'pessoa': {
            va = (a.pessoa_id ? pessoaMap.get(a.pessoa_id) : '') || '';
            vb = (b.pessoa_id ? pessoaMap.get(b.pessoa_id) : '') || '';
            break;
          }
        }
        const cmp = va.localeCompare(vb, 'pt-BR');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [atividades, filters, sortConfig, pessoaMap]);

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
    setNewForm({ titulo: '', descricao: '', pessoaId: pessoas[0]?.id || '', dataTermino: '', tag: '#planejamento' });
    setEditingId(null);
  }, [pessoas]);

  const handleEditStart = useCallback((at: Atividade) => {
    setNewForm({
      titulo: at.titulo,
      descricao: at.descricao,
      pessoaId: at.pessoa_id ?? '',
      dataTermino: at.data_termino ?? '',
      tag: at.tag,
    });
    setEditingId(at.id);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const handleEditCancel = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    if (operating || !newForm.titulo.trim() || !semana) return;
    const pessoaId = newForm.pessoaId || pessoas[0]?.id;
    if (!pessoaId) {
      onToast?.('Selecione uma pessoa responsável antes de salvar.', 'warning');
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
      setAtividades(prev => [...prev, res.data as Atividade]);
      setNewForm(prev => ({ ...prev, titulo: '', descricao: '', dataTermino: '' }));
    }
    } finally {
      setOperating(false);
    }
  }, [newForm, semana, pessoas, editingId, resetForm, operating, onToast]);

  const handleKanbanSave = useCallback(async () => {
    if (operating || !kanbanForm.titulo.trim() || !semana || !kanbanAddStatus) return;
    const pessoaId = kanbanForm.pessoaId || pessoas[0]?.id;
    if (!pessoaId) {
      onToast?.('Selecione uma pessoa responsável antes de salvar.', 'warning');
      return;
    }
    setOperating(true);
    try {
      const res = await semanasApi.createAtividade({
        semana_id: semana.id,
        titulo: kanbanForm.titulo.trim(),
        descricao: kanbanForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: kanbanForm.dataTermino || null,
        tag: kanbanForm.tag,
        status: kanbanAddStatus,
      });
      if (!res.ok) { onToast?.('Erro ao adicionar atividade.', 'error'); return; }
      setAtividades(prev => [...prev, res.data as Atividade]);
      setKanbanAddStatus(null);
      setKanbanForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento' });
    } finally {
      setOperating(false);
    }
  }, [kanbanForm, semana, pessoas, kanbanAddStatus, operating, onToast]);

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
    setAtividades(prev => prev.filter(a => a.id !== id));
    if (editingId === id) resetForm();
  }, [deletingId, editingId, resetForm, onToast]);

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    const res = await semanasApi.updateAtividade(id, { status });
    if (!res.ok) { onToast?.('Erro ao atualizar status.', 'error'); return; }
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, [onToast]);

  const handleCheckboxChange = useCallback(async (id: string, checked: boolean) => {
    const status = checked ? 'concluída' : 'a fazer';
    const res = await semanasApi.updateAtividade(id, { status });
    if (!res.ok) { onToast?.('Erro ao atualizar status.', 'error'); return; }
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, [onToast]);

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
      setAtividades(atRes.ok ? (atRes.data as Atividade[]) : []);
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
      const res = await semanasApi.createAtividadesBulk(
        chosen.map(({ titulo, descricao, pessoa_id, data_termino, tag }) => ({
          semana_id: carryOverModal.pendingSemanaId,
          titulo,
          descricao,
          pessoa_id,
          data_termino,
          tag,
          status: 'a fazer' as const,
        })),
      );
      if (!res.ok) { onToast?.('Erro ao transferir atividades.', 'error'); return; }
    }
    setCarryOverModal(null);
    setSelectedCarryOver(new Set());
    await fetchData();
  }, [carryOverModal, fetchData, onToast]);

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
        const pending = atividades.filter(a => a.status !== 'concluída');
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

  // ─── Kanban / Project handlers ────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = activeTasks.find(t => t.id === String(event.active.id));
    setActiveDragTask(task ?? null);
  }, [activeTasks]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    // Determine target column: over.id is either a STATUS string or a task id
    let newStatus: string | undefined = STATUS_LIST.find(s => s === overId);
    if (!newStatus) {
      const overTask = activeTasks.find(t => t.id === overId);
      newStatus = overTask?.status;
    }
    if (!newStatus) return;
    const task = activeTasks.find(t => t.id === String(active.id));
    if (!task || task.status === newStatus) return;

    if (task.origin === 'weekly') {
      setAtividades(prev => prev.map(a => a.id === task.id ? { ...a, status: newStatus as Atividade['status'] } : a));
      const res = await semanasApi.updateAtividade(task.id, { status: newStatus });
      if (!res.ok) {
        setAtividades(prev => prev.map(a => a.id === task.id ? { ...a, status: task.status } : a));
        onToast?.('Erro ao atualizar status.', 'error');
      }
    } else {
      setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus as TaskStatus } : t));
      const res = await updateProjectTask(task.id, { kanban_status: newStatus as import('../lib/api/tasksClient').KanbanStatus });
      if (!res.ok) {
        setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
        onToast?.('Erro ao atualizar status.', 'error');
      }
    }
  }, [activeTasks, onToast]);

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

  const sortBtnStylesMap = useMemo(() => {
    const map: Record<string, React.CSSProperties> = {};
    SORT_COLS.forEach(col => {
      map[col] = {
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3,
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
        color: sortConfig?.column === col ? '#4338CA' : '#94A3B8',
        padding: '2px 0', fontFamily: FONT,
      };
    });
    return map;
  }, [sortConfig]);

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

            {/* Date range */}
            <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0 2px' }}>
              {semana ? formatWeekRangeShort(semana.dataInicio, semana.dataFim) : ''}
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
            {/* View mode toggle */}
            <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 8, padding: 2, gap: 2, alignSelf: 'flex-start' }}>
              {(['lista', 'kanban'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', transition: 'all 0.15s ease',
                    background: viewMode === mode ? '#0F172A' : 'transparent',
                    color: viewMode === mode ? '#FFF' : '#94A3B8', fontFamily: FONT,
                  }}
                >
                  {mode === 'lista' ? '≡ Lista' : '⊞ Kanban'}
                </button>
              ))}
            </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 8 }}>
          {[
            { label: 'Total',        value: stats.total,        color: '#475569' },
            { label: 'A fazer',      value: stats.a_fazer,      color: '#6B7280' },
            { label: 'Em andamento', value: stats.em_andamento, color: '#2563EB' },
            { label: 'Pausada',      value: stats.pausada,      color: '#D97706' },
            { label: 'Concluídas',   value: stats.concluidas,   color: '#059669' },
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

        {/* ── 5. FORM (somente na aba Semana, modo lista) ───────────────────── */}
        {sourceTab === 'semana' && viewMode !== 'kanban' && <div
          ref={formRef}
          style={{
            background: '#FFF', borderRadius: 12,
            border: editingId ? '1.5px solid #6366F1' : '1px solid #E2E8F0',
            padding: 16, marginBottom: 16,
            opacity: (canEditInWeek || editingId) ? 1 : 0.55,
            pointerEvents: (canEditInWeek || editingId) ? 'auto' : 'none',
            transition: 'border-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: editingId ? '#6366F1' : '#475569', letterSpacing: '0.3px', margin: 0, transition: 'color 0.2s' }}>
              {editingId ? 'Editando atividade' : 'Nova atividade'}
            </p>
            {!isAberta && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                {canAbrirSemana ? 'Abra a semana para adicionar atividades' : 'Semana fechada — é possível editar atividades existentes'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>

            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Título</label>
              <input
                type="text" placeholder="Título" value={newForm.titulo}
                onChange={e => setNewForm(p => ({ ...p, titulo: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                style={INPUT_ST}
              />
            </div>

            <div style={{ flex: '2 1 220px', minWidth: 180 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Descrição</label>
              <input
                type="text" placeholder="Descrição breve" value={newForm.descricao}
                onChange={e => setNewForm(p => ({ ...p, descricao: e.target.value }))}
                style={INPUT_ST}
              />
            </div>

            <div style={{ flex: '0 1 140px', minWidth: 120 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Responsável</label>
              <select value={newForm.pessoaId} onChange={e => setNewForm(p => ({ ...p, pessoaId: e.target.value }))} style={INPUT_ST}>
                <option value="">Selecione</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div style={{ flex: '0 1 140px', minWidth: 130 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Data término</label>
              <DateInputBR
                value={newForm.dataTermino}
                onChange={v => setNewForm(p => ({ ...p, dataTermino: v }))}
                className="w-full"
              />
            </div>

            <div style={{ flex: '0 1 140px', minWidth: 120 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>#</label>
              <input
                type="text" placeholder="#tag" value={newForm.tag}
                onChange={e => setNewForm(p => ({ ...p, tag: e.target.value }))}
                style={INPUT_ST}
              />
            </div>

            {editingId && (
              <button
                onClick={handleEditCancel}
                style={{
                  flex: '0 0 auto', padding: '7px 16px', borderRadius: 8,
                  border: '1px solid #E2E8F0', background: '#F8FAFC',
                  color: '#64748B', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: FONT,
                }}
              >
                Cancelar
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={operating || (editingId ? !newForm.titulo.trim() : (!canEditInWeek || !newForm.titulo.trim()))}
              style={{
                flex: '0 0 auto', padding: '7px 20px', borderRadius: 8, border: 'none',
                background: (editingId ? newForm.titulo.trim() : (canEditInWeek && newForm.titulo.trim())) ? '#6366F1' : '#C7D2FE',
                color: '#FFF', cursor: (editingId ? newForm.titulo.trim() : (canEditInWeek && newForm.titulo.trim())) ? 'pointer' : 'default',
                fontSize: 13, fontWeight: 600, fontFamily: FONT,
              }}
            >
              {editingId ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>}

        {/* ── 6. LISTA / KANBAN ─────────────────────────────────────────────── */}
        {viewMode === 'lista' && <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 8 }}>

          {/* Sort header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, padding: '8px 14px 0', background: '#F8FAFC', columnGap: 8 }}>
            <div />
            {[
              { col: 'titulo',      label: 'TÍTULO' },
              { col: 'desc',        label: 'DESCRIÇÃO' },
              { col: 'pessoa',      label: 'RESPONSÁVEL' },
              { col: 'dataTermino', label: 'TÉRMINO' },
              { col: 'tag',         label: '#' },
              { col: 'status',      label: 'STATUS' },
            ].map(({ col, label }) => (
              <button key={col} onClick={() => handleSort(col)} style={sortBtnStylesMap[col]}>
                {label} {getSortIcon(col)}
              </button>
            ))}
            <div />
          </div>

          {/* Filter header */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            padding: '4px 14px 8px', background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0', columnGap: 8,
          }}>
            <div />
            <input type="text" placeholder="Filtrar..." value={filters.titulo}
              onChange={e => setFilters(p => ({ ...p, titulo: e.target.value }))} style={FILTER_ST} />
            <input type="text" placeholder="Filtrar..." value={filters.descricao}
              onChange={e => setFilters(p => ({ ...p, descricao: e.target.value }))} style={FILTER_ST} />
            <select value={filters.pessoaId} onChange={e => setFilters(p => ({ ...p, pessoaId: e.target.value }))} style={FILTER_ST}>
              <option value="">Todos</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <DateInputBR
              value={filters.dataTermino}
              onChange={v => setFilters(p => ({ ...p, dataTermino: v }))}
              placeholder="dd/mm/aaaa"
              className="w-full"
            />
            <input type="text" placeholder="Filtrar..." value={filters.tag}
              onChange={e => setFilters(p => ({ ...p, tag: e.target.value }))} style={FILTER_ST} />
            <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={FILTER_ST}>
              <option value="">Todos</option>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasActiveFilters ? (
              <button onClick={clearFilters} style={{
                width: 22, height: 22, borderRadius: 6, border: 'none',
                background: '#FEE2E2', color: '#DC2626', cursor: 'pointer',
                fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                alignSelf: 'center',
              }}>✕</button>
            ) : <div />}
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
                  display: 'grid', gridTemplateColumns: GRID_COLS,
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
          {sourceTab === 'semana' && filteredAndSorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>
              Nenhuma atividade encontrada.
            </div>
          )}
          {sourceTab === 'semana' && filteredAndSorted.map(at => {
            const isConcluida = at.status === 'concluída';
            const isHovered   = hoveredRow === at.id;
            const isEditing   = editingId === at.id;
            const isDeleting  = deletingId === at.id;
            const isDisabled  = false;
            const tagSt       = getTagStyle(at.tag);
            const stSt        = getStatusSt(at.status);

            const rowBg = isEditing
              ? '#F5F3FF'
              : isHovered
                ? '#F8FAFC'
                : isConcluida
                  ? '#FAFFF9'
                  : '#FFF';

            const clickableCell: React.CSSProperties = {
              cursor: isDisabled ? 'default' : 'pointer',
            };

            return (
              <div
                key={at.id}
                onMouseEnter={() => setHoveredRow(at.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: 'grid', gridTemplateColumns: GRID_COLS,
                  padding: '9px 14px', borderBottom: '1px solid #F8FAFC',
                  alignItems: 'center', columnGap: 8,
                  background: rowBg,
                  transition: 'background 0.15s',
                  opacity: isDisabled && !isConcluida ? 0.5 : 1,
                  borderLeft: isEditing ? '3px solid #6366F1' : '3px solid transparent',
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox" checked={isConcluida} disabled={isDisabled}
                  onChange={e => handleCheckboxChange(at.id, e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#059669', cursor: isDisabled ? 'default' : 'pointer' }}
                />

                {/* Título */}
                <div
                  title={at.titulo}
                  onClick={() => !isDisabled && handleEditStart(at)}
                  style={{
                    fontSize: 13, fontWeight: 600, color: '#1E293B',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    ...(isConcluida ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
                    ...clickableCell,
                  }}
                >
                  {at.titulo}
                </div>

                {/* Descrição */}
                <div
                  title={at.descricao}
                  onClick={() => !isDisabled && handleEditStart(at)}
                  style={{
                    fontSize: 12, color: '#64748B',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    ...(isConcluida ? { textDecoration: 'line-through', opacity: 0.4 } : {}),
                    ...clickableCell,
                  }}
                >
                  {at.descricao || '—'}
                </div>

                {/* Responsável */}
                <div
                  onClick={() => !isDisabled && handleEditStart(at)}
                  style={{ fontSize: 12, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...clickableCell }}
                >
                  {getPessoaNome(at.pessoa_id)}
                </div>

                {/* Término */}
                <div
                  onClick={() => !isDisabled && handleEditStart(at)}
                  style={{ fontSize: 11, color: '#94A3B8', fontFamily: mono, ...clickableCell }}
                >
                  {formatDatePtBr(at.data_termino)}
                </div>

                {/* Tag */}
                <div
                  onClick={() => !isDisabled && handleEditStart(at)}
                  style={clickableCell}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                    background: tagSt.bg, color: tagSt.text, border: `1px solid ${tagSt.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {at.tag}
                  </span>
                </div>

                {/* Status dropdown */}
                <select
                  value={at.status} disabled={isDisabled}
                  onChange={e => handleStatusChange(at.id, e.target.value)}
                  style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 4px', borderRadius: 4, width: '100%',
                    color: stSt.text, background: stSt.bg, border: `1px solid ${stSt.border}`,
                    cursor: isDisabled ? 'default' : 'pointer', fontFamily: FONT,
                  }}
                >
                  {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Delete */}
                {canEditInWeek ? (
                  <button
                    onClick={() => handleRemoveAtividade(at.id)}
                    title={isDeleting ? 'Clique novamente para confirmar exclusão' : 'Excluir'}
                    style={{
                      width: 22, height: 22, borderRadius: 6, border: 'none',
                      background: isDeleting ? '#FEE2E2' : 'transparent',
                      color: isDeleting ? '#DC2626' : '#CBD5E1',
                      cursor: 'pointer', fontSize: 12,
                      opacity: isHovered || isDeleting ? 1 : 0,
                      transition: 'opacity 0.15s, background 0.15s, color 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: isDeleting ? 700 : 400,
                    }}
                  >
                    {isDeleting ? '?' : '✕'}
                  </button>
                ) : <div />}
              </div>
            );
          })}
        </div>}

        {/* ── 6b. KANBAN ────────────────────────────────────────────────────── */}
        {viewMode === 'kanban' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
              {STATUS_LIST.map(colStatus => (
                <KanbanColumnContainer
                  key={colStatus}
                  status={colStatus}
                  label={KANBAN_COLUMN_LABELS[colStatus]}
                  tasks={activeTasks.filter(t => t.status === colStatus)}
                  colColor={KANBAN_COLUMN_COLORS[colStatus]}
                  onEdit={handleUnifiedEdit}
                  pessoaMap={pessoaMap}
                  mono={mono}
                  canAdd={sourceTab === 'semana' && canEditInWeek}
                  onAddTask={() => {
                    setKanbanForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento' });
                    setKanbanAddStatus(colStatus);
                  }}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDragTask && (
                <KanbanCardItem
                  task={activeDragTask}
                  isDragging
                  onEdit={() => {}}
                  pessoaMap={pessoaMap}
                  mono={mono}
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* ── 6c. KANBAN ADD MODAL ──────────────────────────────────────────── */}
        {kanbanAddStatus !== null && (
          <div
            onClick={() => setKanbanAddStatus(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#FFF', borderRadius: 16, padding: 24,
                width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: 16,
                fontFamily: FONT,
              }}
            >
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Título</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Título da tarefa..."
                  value={kanbanForm.titulo}
                  onChange={e => setKanbanForm(p => ({ ...p, titulo: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleKanbanSave()}
                  style={{ ...INPUT_ST, fontSize: 18, fontWeight: 600, color: '#1E293B', border: 'none', borderBottom: '1.5px solid #E2E8F0', borderRadius: 0, padding: '4px 0' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descrição</label>
                <textarea
                  placeholder="Descrição breve..."
                  value={kanbanForm.descricao}
                  onChange={e => setKanbanForm(p => ({ ...p, descricao: e.target.value }))}
                  rows={3}
                  style={{ ...INPUT_ST, resize: 'none', lineHeight: 1.5 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Responsável</label>
                  <select value={kanbanForm.pessoaId} onChange={e => setKanbanForm(p => ({ ...p, pessoaId: e.target.value }))} style={INPUT_ST}>
                    <option value="">Selecione</option>
                    {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Término</label>
                  <DateInputBR
                    value={kanbanForm.dataTermino}
                    onChange={v => setKanbanForm(p => ({ ...p, dataTermino: v }))}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tag</label>
                <input
                  type="text"
                  placeholder="#planejamento"
                  value={kanbanForm.tag}
                  onChange={e => setKanbanForm(p => ({ ...p, tag: e.target.value }))}
                  style={INPUT_ST}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setKanbanAddStatus(null)}
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: '1px solid #E2E8F0',
                    background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
                    fontSize: 14, fontWeight: 500, fontFamily: FONT,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleKanbanSave}
                  disabled={operating || !kanbanForm.titulo.trim()}
                  style={{
                    padding: '9px 24px', borderRadius: 10, border: 'none',
                    background: kanbanForm.titulo.trim() ? '#3B82F6' : '#BFDBFE',
                    color: '#FFF', cursor: kanbanForm.titulo.trim() ? 'pointer' : 'default',
                    fontSize: 14, fontWeight: 600, fontFamily: FONT,
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 7. COUNTER ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px 0' }}>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>
            {sourceTab === 'projetos'
              ? `${filteredProjectTasks.length} tarefas de projetos`
              : hasActiveFilters
                ? `${filteredAndSorted.length} de ${atividades.length} atividades`
                : `${atividades.length} atividades`}
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
