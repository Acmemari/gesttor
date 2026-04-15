import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DesempenhoView from './DesempenhoView';
import TranscricoesView from './TranscricoesView';
import TranscreverReuniao from './TranscreverReuniao';
import AtasView from './AtasView';
import DateInputBR from '../components/DateInputBR';
import { Clock, User, MoreVertical } from 'lucide-react';
import * as semanasApi from '../lib/api/semanasClient';
import { listSemanaParticipantes, saveParticipantes, listSemanasByFarm, type SemanaParticipanteRow, type ParticipantePayload, type SemanaRow } from '../lib/api/semanasClient';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { listPessoasByFarm, checkPermsByEmail } from '../lib/api/pessoasClient';
import { listTasksByWeek, updateTask as updateProjectTask, type WeekTaskRow } from '../lib/api/tasksClient';
import { createTranscricao } from '../lib/api/semanaTranscricoesClient';
import { storageUpload } from '../lib/storage';
import { calcWeekNumber, getMondayOfWeek, toIsoDate } from '../lib/weeklyUtils';

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
  prioridade: 'alta' | 'média' | 'baixa';
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
  reopened_at: string | null;
}

interface Filters {
  prioridade: string;
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

interface TodasPessoa {
  id: string;
  nome: string;
  assumeTarefasFazenda: boolean;
}

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
const FILTER_BAR_ST: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, color: '#475569', outline: 'none', fontFamily: FONT, background: '#FFF',
  height: 38,
};
const GRID_COLS = '1fr 180px 130px 110px 40px';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDatePtBr(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}

function getPrazoStatus(dateStr: string | null, status: string): 'no_prazo' | 'atrasada' | null {
  if (!dateStr || status === 'concluída') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return due >= today ? 'no_prazo' : 'atrasada';
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
function normalizeHistorico(row: Record<string, unknown>): HistoricoSemana {
  return {
    id: String(row.id ?? ''),
    semana_numero: Number(row.semana_numero ?? row.semanaNumero ?? 0),
    semana_id: (row.semana_id ?? row.semanaId ?? null) as string | null,
    total: Number(row.total ?? 0),
    concluidas: Number(row.concluidas ?? 0),
    pendentes: Number(row.pendentes ?? 0),
    closed_at: String(row.closed_at ?? row.closedAt ?? ''),
    reopened_at: (row.reopened_at ?? row.reopenedAt ?? null) as string | null,
  };
}

function normalizeSemana(row: Record<string, unknown>): Semana {
  return {
    id: String(row.id ?? ''),
    numero: Number(row.numero ?? 0),
    modo: (row.modo ?? 'ano') as 'ano' | 'safra',
    aberta: Boolean(row.aberta ?? false),
    data_inicio: String(row.data_inicio ?? row.dataInicio ?? ''),
    data_fim: String(row.data_fim ?? row.dataFim ?? ''),
    farm_id: (row.farm_id ?? row.farmId ?? null) as string | null,
  };
}

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
    prioridade: (row.prioridade ?? 'média') as Atividade['prioridade'],
    parent_id: (row.parent_id ?? row.parentId ?? null) as string | null,
    created_at: String(row.created_at ?? row.createdAt ?? ''),
  };
}

const EMPTY_FILTERS: Filters = { prioridade: '', descricao: '', pessoaId: '', dataTermino: '', tag: '', status: '' };

interface GestaoSemanalProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  activeView?: 'rotina' | 'historico' | 'desempenho' | 'transcricoes' | 'atas';
  onViewChange?: (view: 'rotina' | 'historico' | 'desempenho' | 'transcricoes' | 'atas') => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GestaoSemanal: React.FC<GestaoSemanalProps> = ({ onToast, activeView: activeViewProp, onViewChange }) => {
  const { user } = useAuth();
  const { selectedFarm } = useFarm();
  const [modo, setModo] = useState<'ano' | 'safra'>('ano');
  const [semana, setSemana] = useState<Semana | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [historico, setHistorico] = useState<HistoricoSemana[]>([]);
  const [activeViewLocal, setActiveViewLocal] = useState<'rotina' | 'historico' | 'desempenho' | 'transcricoes' | 'atas'>('rotina');
  const [histWeekOpened, setHistWeekOpened] = useState(false);
  const activeView = activeViewProp ?? activeViewLocal;
  const setActiveView = (v: 'rotina' | 'historico' | 'desempenho' | 'transcricoes' | 'atas') => {
    setActiveViewLocal(v);
    onViewChange?.(v);
  };
  const [showPeriodoTooltip, setShowPeriodoTooltip] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [newForm, setNewForm] = useState({
    titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento', prioridade: 'média',
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // ── Source tab ─────────────────────────────────────────────────────────────
  const [sourceTab, setSourceTab] = useState<'semana' | 'projetos'>('semana');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [projectTasks, setProjectTasks] = useState<UnifiedTask[]>([]);
  const [loadingProjectTasks, setLoadingProjectTasks] = useState(false);
  const [editingProjectTask, setEditingProjectTask] = useState<UnifiedTask | null>(null);
  const [projectEditForm, setProjectEditForm] = useState({ titulo: '', descricao: '', pessoaId: '', activityDate: '' });

  // ── Participantes ───────────────────────────────────────────────────────────
  const [showParticipantes, setShowParticipantes] = useState(false);

  // ── Transcrições ─────────────────────────────────────────────────────────────
  const [showTranscricaoModal, setShowTranscricaoModal] = useState(false);
  const [transcricaoFile, setTranscricaoFile] = useState<File | null>(null);
  const [transcricaoDesc, setTranscricaoDesc] = useState('');
  const [transcricaoUploading, setTranscricaoUploading] = useState(false);
  const [transcricaoError, setTranscricaoError] = useState<string | null>(null);
  const [transcricoesRefreshKey, setTranscricoesRefreshKey] = useState(0);
  const [transcricaoSemanaId, setTranscricaoSemanaId] = useState<string>('');
  const [allSemanas, setAllSemanas] = useState<SemanaRow[]>([]);
  const [todasPessoas, setTodasPessoas] = useState<TodasPessoa[]>([]);
  const [participantesMap, setParticipantesMap] = useState<Map<string, { presenca: boolean; modalidade: 'online' | 'presencial' }>>(new Map());
  const [savingParticipantes, setSavingParticipantes] = useState(false);

  // Close three-dot menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

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

      const [pessoasRows, semanaRes, historicoRes, todasPessoasRows] = await Promise.all([
        (farmId ? listPessoasByFarm(farmId, { assumeTarefas: true }) : Promise.resolve([])).catch(() => []),
        ((farmId || isAdmin) ? semanasApi.getCurrentSemana(farmId) : Promise.resolve({ ok: false, data: null })).catch(() => ({ ok: false as const, data: null })),
        ((farmId || isAdmin) ? semanasApi.listHistorico(farmId) : Promise.resolve({ ok: false, data: [] })).catch(() => ({ ok: false as const, data: [] })),
        (farmId ? listPessoasByFarm(farmId, {}) : Promise.resolve([])).catch(() => []),
      ]);

      const pessoasData: Pessoa[] = pessoasRows.map(p => ({
        id: p.id,
        nome: p.preferred_name || p.full_name,
      }));
      setPessoas(pessoasData);

      // Build sorted list of all people for participantes modal
      const assumeSet = new Set(pessoasData.map(p => p.id));
      const allPeople: TodasPessoa[] = (todasPessoasRows as any[])
        .map((p: any) => ({
          id: p.id,
          nome: p.preferred_name || p.full_name,
          assumeTarefasFazenda: assumeSet.has(p.id),
        }))
        .sort((a: TodasPessoa, b: TodasPessoa) => {
          if (a.assumeTarefasFazenda !== b.assumeTarefasFazenda) return a.assumeTarefasFazenda ? -1 : 1;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        });
      setTodasPessoas(allPeople);
      setHistorico(historicoRes.ok ? (historicoRes.data as Record<string, unknown>[]).map(normalizeHistorico) : []);

      let semanaData: Semana | null = semanaRes.ok && semanaRes.data
        ? normalizeSemana(semanaRes.data as Record<string, unknown>)
        : null;

      // If no open week, check if one exists for current dates (but don't auto-create)
      if (!semanaData) {
        const today = new Date();
        const monday = getMondayOfWeek(today);
        const mondayStr = toIsoDate(monday);
        const existenteRes = await semanasApi.getSemanaByDataInicio(mondayStr, farmId);
        if (existenteRes.ok && existenteRes.data) {
          semanaData = normalizeSemana(existenteRes.data as Record<string, unknown>);
        }
        // If still null, user must click "Abrir Semana" to create one
      }

      setSemana(semanaData);
      setUltimaSemanaId(semanaData?.id ?? null);

      if (semanaData) {
        const [atRes, pRes] = await Promise.all([
          semanasApi.listAtividades(semanaData.id),
          listSemanaParticipantes(semanaData.id),
        ]);
        setAtividades(atRes.ok ? (atRes.data as Record<string, unknown>[]).map(normalizeAtividade) : []);
        if (pRes.ok) {
          const map = new Map<string, { presenca: boolean; modalidade: 'online' | 'presencial' }>();
          for (const row of pRes.data as SemanaParticipanteRow[]) {
            map.set(row.pessoaId, { presenca: row.presenca, modalidade: row.modalidade });
          }
          setParticipantesMap(map);
        }
      } else {
        setAtividades([]);
      }

      setNewForm(prev => ({ ...prev, pessoaId: prev.pessoaId || '' }));
    } finally {
      setLoading(false);
    }
  }, [modo, selectedFarm?.id, user?.role]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch all semanas for transcription week selector
  useEffect(() => {
    if (!selectedFarm?.id) { setAllSemanas([]); return; }
    listSemanasByFarm(selectedFarm.id)
      .then(rows => {
        setAllSemanas(rows);
        const open = rows.find(s => s.aberta);
        setTranscricaoSemanaId(open?.id ?? rows[0]?.id ?? '');
      })
      .catch(() => setAllSemanas([]));
  }, [selectedFarm?.id]);

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


  const filteredParentTasks = useMemo(() => {
    let result = [...parentTasks];
    if (filters.prioridade) {
      result = result.filter(a => a.prioridade === filters.prioridade);
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
    setNewForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento', prioridade: 'média' });
    setEditingId(null);
  }, []);

  const handleEditStart = useCallback((at: Atividade) => {
    if (!semana?.aberta) { onToast?.('Reabra a semana para fazer a edição', 'warning'); return; }
    setNewForm({
      titulo: at.titulo,
      descricao: at.descricao,
      pessoaId: at.pessoa_id ?? '',
      dataTermino: at.data_termino ?? '',
      tag: at.tag,
      prioridade: at.prioridade ?? 'média',
    });
    setEditingId(at.id);
    setShowTaskModal(true);
  }, [semana?.aberta, onToast]);

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
        prioridade: newForm.prioridade,
      });
      if (!res.ok) { onToast?.('Erro ao salvar atividade.', 'error'); return; }
      setAtividades(prev => prev.map(a => a.id === editingId ? {
        ...a,
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
        prioridade: newForm.prioridade as Atividade['prioridade'],
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
        prioridade: newForm.prioridade,
        status: 'a fazer',
      });
      if (!res.ok) { onToast?.('Erro ao adicionar atividade.', 'error'); return; }
      setAtividades(prev => [...prev, normalizeAtividade(res.data as Record<string, unknown>)]);
      setNewForm(prev => ({ ...prev, titulo: '', descricao: '', dataTermino: '', prioridade: 'média' }));
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
    if (!semana?.aberta) { onToast?.('Reabra a semana para fazer a edição', 'warning'); return; }
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
  }, [atividades, semana?.aberta, onToast]);

  const handleCheckboxChange = useCallback(async (id: string, checked: boolean) => {
    if (!semana?.aberta) { onToast?.('Reabra a semana para fazer a edição', 'warning'); return; }
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
  }, [atividades, semana?.aberta, onToast]);

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
        prioridade: parent?.prioridade || 'média',
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
      const pendentes = total - concluidas;
      const existingHistorico = historico.find(h => h.semana_id === semana.id);
      let res2: { ok: boolean; data?: unknown; error?: string };
      if (existingHistorico) {
        // Atualiza histórico existente (semana reaberta e re-fechada)
        res2 = await semanasApi.updateHistorico(existingHistorico.id, {
          semana_numero: calcWeekNumber(new Date(semana.data_inicio + 'T00:00:00'), modo),
          total,
          concluidas,
          pendentes,
        });
      } else {
        // Primeiro fechamento: cria histórico
        res2 = await semanasApi.createHistorico({
          farm_id: semana.farm_id,
          semana_id: semana.id,
          semana_numero: calcWeekNumber(new Date(semana.data_inicio + 'T00:00:00'), modo),
          total,
          concluidas,
          pendentes,
        });
      }
      if (!res2.ok) { onToast?.('Erro ao registrar histórico.', 'error'); return; }
      const res1 = await semanasApi.updateSemana(semana.id, { aberta: false });
      if (!res1.ok) {
        // Rollback: só deleta se foi criado (não se foi atualizado)
        if (!existingHistorico) {
          await semanasApi.deleteHistorico((res2.data as { id: string }).id);
        }
        onToast?.('Erro ao fechar semana.', 'error');
        return;
      }
      onToast?.('Semana fechada com sucesso.', 'success');
      await fetchData();
    } finally {
      setOperating(false);
    }
  }, [semana, atividades, historico, modo, fetchData, operating, onToast]);

  const handleAbrirSemanaDoHistorico = useCallback(async (semanaId: string | null, semanaNumero: number) => {
    setLoading(true);
    setHistWeekOpened(true);
    try {
      let semanaData: Semana | null = null;
      if (semanaId) {
        const res = await semanasApi.getSemanaById(semanaId);
        semanaData = res.ok && res.data ? normalizeSemana(res.data as Record<string, unknown>) : null;
      }
      if (!semanaData) {
        const farmId = selectedFarm?.id ?? null;
        const res = await semanasApi.getSemanaByNumero(semanaNumero, modo, farmId);
        semanaData = res.ok && res.data ? normalizeSemana(res.data as Record<string, unknown>) : null;
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

  // ── Upload de transcrição ─────────────────────────────────────────────────────
  const handleTranscricaoUpload = useCallback(async () => {
    if (!transcricaoFile || !transcricaoSemanaId || !selectedFarm) return;
    setTranscricaoUploading(true);
    setTranscricaoError(null);
    try {
      const ext = transcricaoFile.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const uid = crypto.randomUUID();
      const storagePath = `${selectedFarm.id}/${transcricaoSemanaId}/${uid}.${ext}`;
      await storageUpload('meeting-transcriptions', storagePath, transcricaoFile, {
        contentType: transcricaoFile.type || `application/${ext}`,
      });
      await createTranscricao({
        semanaId: transcricaoSemanaId,
        farmId: selectedFarm.id,
        organizationId: selectedFarm.organizationId,
        fileName: `${uid}.${ext}`,
        originalName: transcricaoFile.name,
        fileType: transcricaoFile.type || `application/${ext}`,
        fileSize: transcricaoFile.size,
        storagePath,
        descricao: transcricaoDesc.trim() || null,
        tipo: 'manual',
      });
      setShowTranscricaoModal(false);
      setTranscricaoFile(null);
      setTranscricaoDesc('');
      setTranscricoesRefreshKey(k => k + 1);
      onToast?.('Transcrição enviada com sucesso!', 'success');
    } catch (err) {
      setTranscricaoError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
    } finally {
      setTranscricaoUploading(false);
    }
  }, [transcricaoFile, transcricaoDesc, transcricaoSemanaId, selectedFarm, onToast]);

  // Ao voltar para 'rotina' a partir do histórico com uma semana histórica aberta, recarrega a semana atual
  const prevActiveViewRef = useRef(activeView);
  useEffect(() => {
    const prev = prevActiveViewRef.current;
    prevActiveViewRef.current = activeView;
    if (activeView !== 'historico') {
      setHistWeekOpened(false);
    }
    if (activeView === 'rotina' && prev !== 'rotina') {
      const isHistorical = semana?.aberta === false && ultimaSemanaId !== null && semana?.id !== ultimaSemanaId;
      if (isHistorical) fetchData();
    }
  }, [activeView, semana, ultimaSemanaId, fetchData]);

  const handleSaveParticipantes = useCallback(async () => {
    if (!semana || savingParticipantes) return;
    setSavingParticipantes(true);
    try {
      const payload: ParticipantePayload[] = todasPessoas.map(p => {
        const entry = participantesMap.get(p.id);
        return {
          pessoaId: p.id,
          presenca: entry?.presenca ?? false,
          modalidade: entry?.modalidade ?? 'presencial',
        };
      });
      const res = await saveParticipantes(semana.id, payload);
      if (res.ok) {
        onToast?.('Presenças confirmadas!', 'success');
        setShowParticipantes(false);
      } else {
        onToast?.('Erro ao salvar presenças.', 'error');
      }
    } finally {
      setSavingParticipantes(false);
    }
  }, [semana, todasPessoas, participantesMap, savingParticipantes, onToast]);

  const handleConfirmCarryOver = useCallback(async (selectedIds: Set<string>) => {
    if (!carryOverModal) return;
    const chosen = carryOverModal.candidates.filter(a => selectedIds.has(a.id));
    if (chosen.length > 0) {
      // Create parent tasks first
      const parentsRes = await semanasApi.createAtividadesBulk(
        chosen.map(({ titulo, descricao, pessoa_id, data_termino, tag, prioridade }) => ({
          semana_id: carryOverModal.pendingSemanaId,
          titulo, descricao, pessoa_id, data_termino, tag, prioridade, status: 'a fazer' as const,
        })),
      );
      if (!parentsRes.ok) { onToast?.('Erro ao transferir atividades.', 'error'); return; }
      // Map old parent ID → new parent ID
      const newParents = parentsRes.data as Atividade[];
      const oldToNew = new Map<string, string>();
      chosen.forEach((oldParent, i) => { if (newParents[i]) oldToNew.set(oldParent.id, newParents[i].id); });
      // Create pending subtasks with new parent IDs
      const subsToCarry: Array<{ semana_id: string; titulo: string; descricao: string; pessoa_id: string | null; data_termino: string | null; tag: string; prioridade: string; status: 'a fazer'; parent_id: string }> = [];
      for (const oldParent of chosen) {
        const subs = (subtasksMap.get(oldParent.id) || []).filter(s => s.status !== 'concluída');
        for (const sub of subs) {
          const newParentId = oldToNew.get(oldParent.id);
          if (newParentId) {
            subsToCarry.push({ semana_id: carryOverModal.pendingSemanaId, titulo: sub.titulo, descricao: sub.descricao, pessoa_id: sub.pessoa_id, data_termino: sub.data_termino, tag: sub.tag, prioridade: sub.prioridade, status: 'a fazer', parent_id: newParentId });
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
        data_inicio: toIsoDate(monday),
        data_fim: toIsoDate(saturday),
      });
    } else {
      // Semana existente fechada: abre a próxima
      const nextStart = new Date(semana.data_inicio + 'T00:00:00');
      nextStart.setDate(nextStart.getDate() + 7);
      const nextEnd = new Date(semana.data_fim + 'T00:00:00');
      nextEnd.setDate(nextEnd.getDate() + 7);
      const nextStartStr = toIsoDate(nextStart);

      // Verificar se a próxima semana já existe para esta fazenda (evita duplicatas)
      const existenteRes = await semanasApi.getSemanaByDataInicio(nextStartStr, farmId);
      let targetSemana: Semana | null = existenteRes.ok && existenteRes.data ? normalizeSemana(existenteRes.data as Record<string, unknown>) : null;

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
          numero: calcWeekNumber(nextStart, modo),
          modo,
          aberta: true,
          data_inicio: nextStartStr,
          data_fim: toIsoDate(nextEnd),
        });
        targetSemana = newRes.ok && newRes.data ? normalizeSemana(newRes.data as Record<string, unknown>) : null;
      }

      if (targetSemana) {
        const pending = atividades.filter(a => !a.parent_id && a.status !== 'concluída');
        if (pending.length > 0) {
          setCarryOverModal({
            pendingSemanaId: targetSemana.id,
            candidates: pending,
            semanaNumero: calcWeekNumber(new Date(semana.data_inicio + 'T00:00:00'), modo),
            dataInicio: semana.data_inicio,
            dataFim: semana.data_fim,
          });
          setSelectedCarryOver(new Set(pending.map(a => a.id)));
          // Don't fetchData here — modal is open with current data.
          // fetchData will be called after the modal closes (handleConfirmCarryOver or dismiss).
          return;
        }
      }
    }
    await fetchData();
    } finally {
      setOperating(false);
    }
  }, [semana, modo, atividades, fetchData, selectedFarm?.id, operating]);

  const handleReopenSemana = useCallback(async () => {
    if (operating || !semana || !canEditClosedWeek) return;
    setOperating(true);
    try {
      const res = await semanasApi.updateSemana(semana.id, { aberta: true });
      if (res.ok) {
        onToast?.('Semana reaberta com sucesso', 'success');
        await fetchData();
      } else {
        onToast?.('Erro ao reabrir semana', 'error');
      }
    } finally {
      setOperating(false);
    }
  }, [operating, semana, canEditClosedWeek, onToast, fetchData]);

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
  const actionBtnStReabrir = useMemo(() => ({
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: canEditClosedWeek ? '#059669' : '#E2E8F0',
    color: canEditClosedWeek ? '#FFF' : '#94A3B8',
    opacity: canEditClosedWeek ? 1 : 0.5,
    cursor: canEditClosedWeek ? 'pointer' : 'default',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: FONT,
  }), [canEditClosedWeek]);

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
  // Abrir Semana disponível apenas para primeiro lançamento (sem semana) ou semana mais recente fechada
  const isHistoricalClosedWeek = isFechada && semana !== null && (histWeekOpened || (ultimaSemanaId !== null && semana.id !== ultimaSemanaId));
  const canAbrirSemana = semana === null || (isFechada && !isHistoricalClosedWeek);
  // Pode incluir/editar/excluir somente quando a semana está aberta
  const canEditInWeek = isAberta;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', fontFamily: FONT }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>

          {/* Left side — hidden on transcricoes/atas view */}
          {activeView !== 'transcricoes' && activeView !== 'atas' && (
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
                  Semana {String(semana ? calcWeekNumber(new Date(semana.data_inicio + 'T00:00:00'), modo) : calcWeekNumber(new Date(), modo)).padStart(2, '0')}
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
          )}

          {/* Right side: action buttons */}
          <div style={{ display: (activeView === 'transcricoes' || activeView === 'atas' || activeView === 'desempenho' || (activeView === 'historico' && !histWeekOpened)) ? 'none' : 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Drawer source button */}
            {activeView !== 'transcricoes' && activeView !== 'atas' && (
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
            )}
            {activeView !== 'transcricoes' && activeView !== 'atas' && (
            <button
              onClick={() => setShowParticipantes(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${showParticipantes ? '#BFDBFE' : '#E2E8F0'}`,
                background: showParticipantes ? '#EFF6FF' : '#FFF',
                color: showParticipantes ? '#2563EB' : '#475569',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT,
                transition: 'all 0.15s ease',
              }}
            >
              <span>👥</span>
              <span>Participantes</span>
            </button>
            )}
            {activeView !== 'transcricoes' && activeView !== 'atas' && semana && (
              <button
                onClick={() => { setTranscricaoSemanaId(semana.id); setShowTranscricaoModal(true); }}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#FFF', color: '#475569',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📄</span>
                <span>Transcrição</span>
              </button>
            )}
            {activeView !== 'transcricoes' && activeView !== 'atas' && semana && ultimaSemanaId && semana.id !== ultimaSemanaId && (
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
            {activeView !== 'transcricoes' && activeView !== 'atas' && (<>
            <button onClick={handleFecharSemana} disabled={operating || !isAberta || !canFecharSemana} style={actionBtnStFechar}>
              Fechar Semana
            </button>
            {isHistoricalClosedWeek ? (
              <button onClick={handleReopenSemana} disabled={operating || !canEditClosedWeek} style={actionBtnStReabrir}>
                Reabrir Semana
              </button>
            ) : (
              <button onClick={handleAbrirSemana} disabled={operating || !canAbrirSemana} style={actionBtnStAbrir}>
                Abrir Semana
              </button>
            )}
            </>)}
          </div>
        </div>

        {/* ── 2. HISTÓRICO ──────────────────────────────────────────────────── */}
        {activeView === 'historico' && !histWeekOpened && (
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: mono, fontWeight: 500 }}>
                            Semana {String(h.semana_numero > 0 ? h.semana_numero : calcWeekNumber(new Date(h.closed_at), modo)).padStart(2, '0')}
                          </span>
                          {h.closed_at && (
                            <span style={{ color: '#94A3B8', fontFamily: FONT, fontWeight: 400 }}>
                              {formatCanonicalWeekPeriod(new Date(h.closed_at))}
                            </span>
                          )}
                          {h.reopened_at && (
                            <span style={{ color: '#F59E0B', fontSize: 11, fontWeight: 500, fontStyle: 'italic' }}>
                              alterada depois de fechar
                            </span>
                          )}
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

        {/* ── DESEMPENHO ────────────────────────────────────────────────── */}
        {activeView === 'desempenho' && (
          <DesempenhoView
            farmId={selectedFarm?.id ?? null}
            semana={semana}
            onToast={onToast}
          />
        )}

        {/* ── TRANSCRIÇÕES ──────────────────────────────────────────────────── */}
        {activeView === 'transcricoes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 4px', fontFamily: FONT }}>
                Transcrições
              </h2>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                Transcreva áudios de reunião ou envie documentos
              </p>
            </div>

            {/* Bloco superior: Transcrição de áudio */}
            {selectedFarm && (
              <TranscreverReuniao
                farmId={selectedFarm.id}
                organizationId={selectedFarm.organizationId}
                semanas={allSemanas.map(s => ({
                  id: s.id,
                  numero: s.numero,
                  data_inicio: s.data_inicio,
                  data_fim: s.data_fim,
                  modo: s.modo,
                  aberta: s.aberta,
                }))}
                onSaved={() => setTranscricoesRefreshKey(k => k + 1)}
                onToast={onToast}
              />
            )}

            {/* Botão de upload manual */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setTranscricaoSemanaId(semana?.id ?? allSemanas.find(s => s.aberta)?.id ?? allSemanas[0]?.id ?? '');
                  setShowTranscricaoModal(true);
                }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>📄</span>
                Enviar Documento
              </button>
            </div>

            {/* Bloco inferior: Lista de transcrições */}
            <TranscricoesView
              farmId={selectedFarm?.id ?? null}
              semana={semana}
              organizationId={selectedFarm?.organizationId ?? null}
              refreshKey={transcricoesRefreshKey}
              onToast={onToast}
            />
          </div>
        )}

        {/* ── ATAS ──────────────────────────────────────────────────────────── */}
        {activeView === 'atas' && (
          <AtasView
            farmId={selectedFarm?.id ?? null}
            organizationId={selectedFarm?.organizationId ?? null}
            onToast={onToast}
          />
        )}

        {(activeView === 'rotina' || (activeView === 'historico' && histWeekOpened)) && (<>
        {/* ── Voltar ao histórico ────────────────────────────────────────────── */}
        {activeView === 'historico' && histWeekOpened && (
          <button
            onClick={() => setHistWeekOpened(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: 13, fontWeight: 500, padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT }}
          >
            ← Ver histórico
          </button>
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

        {/* ── 5. FILTER BAR + NOVA TAREFA ───────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
          background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
          padding: '10px 16px', flexWrap: 'wrap',
        }}>
          <select
            value={filters.prioridade}
            onChange={e => setFilters(p => ({ ...p, prioridade: e.target.value }))}
            style={{ ...FILTER_BAR_ST, flex: '0 0 160px' }}
          >
            <option value="">Prioridade: Todos</option>
            <option value="alta">Alta</option>
            <option value="média">Média</option>
            <option value="baixa">Baixa</option>
          </select>
          <select value={filters.pessoaId} onChange={e => setFilters(p => ({ ...p, pessoaId: e.target.value }))} style={{ ...FILTER_BAR_ST, flex: '0 0 180px' }}>
            <option value="">Responsável: Todos</option>
            {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <div style={{ flex: '0 0 150px' }}>
            <DateInputBR value={filters.dataTermino} onChange={v => setFilters(p => ({ ...p, dataTermino: v }))} placeholder="dd/mm/aaaa" className="w-full" weekStart={semana?.data_inicio ?? undefined} weekEnd={semana?.data_fim ?? undefined} />
          </div>
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...FILTER_BAR_ST, flex: '0 0 150px' }}>
            <option value="">Status: Todos</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          )}
          {sourceTab === 'semana' && (
            <button
              onClick={() => {
                if (!canEditInWeek) return;
                setNewForm({ titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '#planejamento', prioridade: 'média' });
                setEditingId(null);
                setShowTaskModal(true);
              }}
              disabled={!canEditInWeek}
              style={{
                padding: '9px 20px', borderRadius: 20, border: 'none',
                background: canEditInWeek ? '#3B82F6' : '#E2E8F0',
                color: canEditInWeek ? '#FFF' : '#94A3B8',
                fontSize: 14, fontWeight: 600,
                cursor: canEditInWeek ? 'pointer' : 'not-allowed',
                fontFamily: FONT, whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              + Nova Tarefa
            </button>
          )}
        </div>

        {/* ── 6. LISTA ─────────────────────────────────────────────── */}
        <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: 8 }}>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
            alignItems: 'center', borderRadius: '12px 12px 0 0',
          }}>
            <button onClick={() => handleSort('titulo')} style={sortBtnStyle('titulo')}>
              TÍTULO {getSortIcon('titulo')}
            </button>
            <button onClick={() => handleSort('pessoa')} style={sortBtnStyle('pessoa')}>
              RESPONSÁVEL {getSortIcon('pessoa')}
            </button>
            <button onClick={() => handleSort('status')} style={sortBtnStyle('status')}>
              STATUS {getSortIcon('status')}
            </button>
            <button onClick={() => handleSort('dataTermino')} style={sortBtnStyle('dataTermino')}>
              PRAZO {getSortIcon('dataTermino')}
            </button>
            <div />
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
            const prazoStatus = getPrazoStatus(at.data_termino, at.status);
            const subsDone   = subs.filter(s => s.status === 'concluída').length;

            return (
              <div key={at.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                {/* ── Parent row ─────────────────────────────────── */}
                <div
                  onMouseEnter={() => setHoveredRow(at.id)}
                  onMouseLeave={() => { setHoveredRow(null); }}
                  style={{
                    display: 'grid', gridTemplateColumns: GRID_COLS,
                    padding: '10px 14px', alignItems: 'center',
                    background: isEditing ? '#F5F3FF' : isHovered ? '#F8FAFC' : '#FFF',
                    transition: 'background 0.15s',
                    borderLeft: isEditing ? '3px solid #6366F1' : '3px solid transparent',
                  }}
                >
                  {/* TÍTULO column: checkbox + title + date */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <div
                      onClick={e => { e.stopPropagation(); handleCheckboxChange(at.id, !isConcluida); }}
                      style={{
                        flexShrink: 0, marginTop: 2,
                        width: 18, height: 18, borderRadius: 9,
                        border: isConcluida ? 'none' : '2px solid #CBD5E1',
                        background: isConcluida ? '#059669' : 'transparent',
                        cursor: canEditInWeek ? 'pointer' : 'default',
                        opacity: canEditInWeek || isConcluida ? 1 : 0.4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isConcluida && <span style={{ color: '#FFF', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div
                      onClick={() => handleEditStart(at)}
                      style={{ flex: 1, minWidth: 0, cursor: canEditInWeek ? 'pointer' : 'default' }}
                    >
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
                      {at.data_termino && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Clock size={12} color="#94A3B8" />
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>{formatDatePtBr(at.data_termino)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RESPONSÁVEL column */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <User size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPessoaNome(at.pessoa_id)}</span>
                  </div>

                  {/* STATUS column */}
                  <select
                    value={at.status}
                    onChange={e => { e.stopPropagation(); handleStatusChange(at.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    disabled={!canEditInWeek}
                    style={{ fontSize: 11, fontWeight: 500, padding: '3px 6px', borderRadius: 6, color: stSt.text, background: stSt.bg, border: `1px solid ${stSt.border}`, cursor: canEditInWeek ? 'pointer' : 'default', fontFamily: FONT, width: '100%' }}
                  >
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {/* PRAZO column */}
                  <div>
                    {prazoStatus ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        textTransform: 'uppercase' as const,
                        color: prazoStatus === 'no_prazo' ? '#15803D' : '#FFF',
                        background: prazoStatus === 'no_prazo' ? '#DCFCE7' : '#EF4444',
                        whiteSpace: 'nowrap',
                      }}>
                        {prazoStatus === 'no_prazo' ? 'NO PRAZO' : 'ATRASADA'}
                      </span>
                    ) : isConcluida && at.data_termino ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        textTransform: 'uppercase' as const,
                        color: '#15803D', background: '#DCFCE7', whiteSpace: 'nowrap',
                      }}>
                        NO PRAZO
                      </span>
                    ) : null}
                  </div>

                  {/* Three-dot menu */}
                  <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === at.id ? null : at.id); }}
                      style={{
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: openMenuId === at.id ? '#F1F5F9' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: isHovered || openMenuId === at.id ? 1 : 0,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <MoreVertical size={16} color="#64748B" />
                    </button>
                    {openMenuId === at.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', zIndex: 50,
                        background: '#FFF', borderRadius: 8, border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 180, overflow: 'hidden',
                      }}>
                        {subs.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); setExpandedTasks(prev => { const next = new Set(prev); if (next.has(at.id)) next.delete(at.id); else next.add(at.id); return next; }); setOpenMenuId(null); }}
                            style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#475569', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {isExpanded ? '▲ Recolher subtarefas' : '▼ Expandir subtarefas'}
                          </button>
                        )}
                        {canEditInWeek && (
                          <button onClick={e => { e.stopPropagation(); setAddingSubtaskFor(at.id); setExpandedTasks(prev => new Set(prev).add(at.id)); setSubtaskForm({ titulo: '', pessoaId: '', dataTermino: '' }); setOpenMenuId(null); }}
                            style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#475569', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            + Adicionar subtarefa
                          </button>
                        )}
                        {canEditInWeek && (
                          <button onClick={e => { e.stopPropagation(); handleRemoveAtividade(at.id); setOpenMenuId(null); }}
                            style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: isDeleting ? '#DC2626' : '#EF4444', fontFamily: FONT, fontWeight: isDeleting ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {isDeleting ? '⚠ Confirmar exclusão' : (subs.length > 0 ? '✕ Excluir tarefa e subtarefas' : '✕ Excluir')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Subtasks ────────────────────────────────────── */}
                {isExpanded && subs.length > 0 && (
                  <div style={{ margin: '0 14px 6px 44px', borderLeft: '2px solid #E2E8F0', borderRadius: '0 6px 6px 0', background: '#F8FAFC', overflow: 'hidden' }}>
                    {subs.map((sub, idx) => {
                      const subConcluida = sub.status === 'concluída';
                      const subHovered = hoveredRow === sub.id;
                      const subDeleting = deletingId === sub.id;
                      const subPrazo = getPrazoStatus(sub.data_termino, sub.status);
                      return (
                        <div
                          key={sub.id}
                          onMouseEnter={() => setHoveredRow(sub.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: idx === 0 ? 'none' : '1px solid #EEF2F7', background: subHovered ? '#EFF6FF' : 'transparent', transition: 'background 0.15s' }}
                        >
                          {/* Circular checkbox (smaller) */}
                          <div
                            onClick={e => { e.stopPropagation(); handleCheckboxChange(sub.id, !subConcluida); }}
                            style={{ flexShrink: 0, width: 14, height: 14, borderRadius: 7, border: subConcluida ? 'none' : '1.5px solid #CBD5E1', background: subConcluida ? '#059669' : 'transparent', cursor: canEditInWeek ? 'pointer' : 'default', opacity: canEditInWeek || subConcluida ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

                          {/* Right-side group: date · person | prazo */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                            {sub.data_termino && (
                              <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={11} color="#94A3B8" /> {formatDatePtBr(sub.data_termino)}
                              </span>
                            )}
                            {sub.data_termino && <span style={{ color: '#CBD5E1', fontSize: 10 }}>•</span>}
                            <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <User size={11} color="#94A3B8" /> {getPessoaNome(sub.pessoa_id)}
                            </span>
                            {(subPrazo || subConcluida) && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, flexShrink: 0, padding: '1px 6px',
                                borderRadius: 4, textTransform: 'uppercase' as const,
                                color: (!subPrazo && subConcluida) ? '#15803D' : subPrazo === 'no_prazo' ? '#15803D' : '#FFF',
                                background: (!subPrazo && subConcluida) ? '#DCFCE7' : subPrazo === 'no_prazo' ? '#DCFCE7' : '#EF4444',
                              }}>
                                {(!subPrazo && subConcluida) ? 'NO PRAZO' : subPrazo === 'no_prazo' ? 'NO PRAZO' : 'ATRASADA'}
                              </span>
                            )}
                          </div>

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
                      <DateInputBR value={subtaskForm.dataTermino} onChange={v => setSubtaskForm(p => ({ ...p, dataTermino: v }))} placeholder="dd/mm/aaaa" className="w-full" weekStart={semana?.data_inicio ?? undefined} weekEnd={semana?.data_fim ?? undefined} />
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
          Gestão Semanal • Semana {String(semana ? calcWeekNumber(new Date(semana.data_inicio + 'T00:00:00'), modo) : 0).padStart(2, '0')} de 53 •{' '}
          {modo === 'ano' ? `Ano ${currentYear}` : `Safra ${safraLabel}`}
        </div>
        </>)}

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
                  weekStart={semana?.data_inicio ?? undefined}
                  weekEnd={semana?.data_fim ?? undefined}
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
              <div style={{ flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Prioridade</label>
                <select
                  value={newForm.prioridade}
                  onChange={e => setNewForm(p => ({ ...p, prioridade: e.target.value }))}
                  style={INPUT_ST}
                >
                  <option value="alta">Alta</option>
                  <option value="média">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
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

      {/* ── MODAL PARTICIPANTES ─────────────────────────────────────────────── */}
      {showParticipantes && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24, animation: 'gsFadeIn 0.2s ease',
          }}
          onClick={() => setShowParticipantes(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
              maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>👥</span> Participantes da Reunião
                </h2>
                {semana && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8', fontFamily: FONT }}>
                    SEMANA {String(semana.numero).padStart(2, '0')} · {semana.modo === 'ano' ? new Date(semana.data_inicio + 'T00:00:00').getFullYear() : safraLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantes(false)}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable list */}
            <div style={{ overflow: 'auto', flex: 1, padding: '8px 16px' }}>
              {todasPessoas.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: '16px 0', textAlign: 'center' }}>Nenhuma pessoa vinculada a esta fazenda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, paddingBottom: 8 }}>
                  {todasPessoas.map(p => {
                    const entry = participantesMap.get(p.id);
                    const checked = entry?.presenca ?? false;
                    const modalidade = entry?.modalidade ?? 'presencial';
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                          borderRadius: 8,
                          background: checked ? '#F0FDF4' : '#F8FAFC',
                          border: `1px solid ${checked ? '#BBF7D0' : '#F1F5F9'}`,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setParticipantesMap(prev => {
                            const next = new Map(prev);
                            const cur = next.get(p.id) ?? { presenca: false, modalidade: 'presencial' as const };
                            next.set(p.id, { ...cur, presenca: !cur.presenca });
                            return next;
                          });
                        }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                          background: checked ? '#22C55E' : 'transparent',
                          border: `2px solid ${checked ? '#22C55E' : '#CBD5E1'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <span style={{ color: '#FFF', fontSize: 12, lineHeight: 1 }}>✓</span>}
                        </div>

                        {/* Name */}
                        <span style={{
                          flex: 1, fontSize: 13, fontFamily: FONT,
                          color: checked ? '#1E293B' : '#94A3B8',
                          textDecoration: 'none',
                          fontWeight: checked ? 500 : 400,
                        }}>
                          {p.nome}
                        </span>

                        {/* Modality toggles */}
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Online"
                            onClick={() => {
                              setParticipantesMap(prev => {
                                const next = new Map(prev);
                                const cur = next.get(p.id) ?? { presenca: false, modalidade: 'presencial' as const };
                                next.set(p.id, { ...cur, modalidade: 'online' });
                                return next;
                              });
                            }}
                            style={{
                              width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: modalidade === 'online' ? '#EFF6FF' : '#F1F5F9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: modalidade === 'online' ? '#3B82F6' : '#94A3B8' }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                          </button>
                          <button
                            type="button"
                            title="Presencial"
                            onClick={() => {
                              setParticipantesMap(prev => {
                                const next = new Map(prev);
                                const cur = next.get(p.id) ?? { presenca: false, modalidade: 'presencial' as const };
                                next.set(p.id, { ...cur, modalidade: 'presencial' });
                                return next;
                              });
                            }}
                            style={{
                              width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: modalidade === 'presencial' ? '#F0FDF4' : '#F1F5F9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: modalidade === 'presencial' ? '#22C55E' : '#94A3B8' }}><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: 16, borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleSaveParticipantes}
                disabled={savingParticipantes}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                  background: savingParticipantes ? '#93C5FD' : '#3B82F6', color: '#FFF',
                  fontSize: 13, fontWeight: 600, cursor: savingParticipantes ? 'default' : 'pointer',
                  fontFamily: FONT,
                }}
              >
                {savingParticipantes ? 'Salvando...' : 'Confirmar Presença'}
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
                <DateInputBR value={projectEditForm.activityDate} onChange={v => setProjectEditForm(p => ({ ...p, activityDate: v }))} className="w-full" weekStart={semana?.data_inicio ?? undefined} weekEnd={semana?.data_fim ?? undefined} />
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

      {/* ── MODAL UPLOAD TRANSCRIÇÃO ────────────────────────────────────────── */}
      {showTranscricaoModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
          }}
          onClick={e => {
            if (e.target === e.currentTarget && !transcricaoUploading) {
              setShowTranscricaoModal(false);
              setTranscricaoFile(null);
              setTranscricaoDesc('');
              setTranscricaoError(null);
            }
          }}
        >
          <div style={{
            background: '#FFF', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw',
            border: '1px solid #E2E8F0', boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
            fontFamily: FONT,
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Enviar Documento</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>
                  Upload manual de transcrição ou ata de reunião
                </p>
              </div>
              <button
                onClick={() => {
                  if (!transcricaoUploading) {
                    setShowTranscricaoModal(false);
                    setTranscricaoFile(null);
                    setTranscricaoDesc('');
                    setTranscricaoError(null);
                  }
                }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94A3B8', padding: 4, lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Week selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                Reunião Semanal
              </label>
              <select
                value={transcricaoSemanaId}
                onChange={e => setTranscricaoSemanaId(e.target.value)}
                disabled={transcricaoUploading}
                style={{ ...INPUT_ST, cursor: 'pointer' }}
              >
                {allSemanas.length === 0 && <option value="">Nenhuma semana disponível</option>}
                {allSemanas.map(s => (
                  <option key={s.id} value={s.id}>
                    Semana {String(s.numero).padStart(2, '0')} — {s.data_inicio} a {s.data_fim}
                    {s.aberta ? ' (aberta)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* File picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                Arquivo{' '}
                <span style={{ color: '#94A3B8', fontWeight: 400 }}>
                  (PDF, DOCX, MD, TXT, RTF — máx 50 MB)
                </span>
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.md,.txt,.rtf,.odt"
                disabled={transcricaoUploading}
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 50 * 1024 * 1024) {
                    setTranscricaoError('Arquivo muito grande (máx 50 MB).');
                    setTranscricaoFile(null);
                    return;
                  }
                  setTranscricaoFile(f);
                  setTranscricaoError(null);
                }}
                style={{ ...INPUT_ST, cursor: 'pointer', padding: '7px 10px' }}
              />
              {transcricaoFile && (
                <p style={{ fontSize: 11, color: '#059669', margin: '4px 0 0' }}>
                  {transcricaoFile.name} ({(transcricaoFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                Observações{' '}
                <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea
                value={transcricaoDesc}
                onChange={e => setTranscricaoDesc(e.target.value)}
                disabled={transcricaoUploading}
                placeholder="Ex: Ata da reunião de segunda-feira..."
                rows={3}
                style={{ ...INPUT_ST, resize: 'vertical', minHeight: 68 }}
              />
            </div>

            {transcricaoError && (
              <p style={{
                fontSize: 12, color: '#DC2626', margin: '0 0 14px',
                background: '#FEF2F2', padding: '8px 12px', borderRadius: 8,
              }}>
                {transcricaoError}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowTranscricaoModal(false);
                  setTranscricaoFile(null);
                  setTranscricaoDesc('');
                  setTranscricaoError(null);
                }}
                disabled={transcricaoUploading}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleTranscricaoUpload}
                disabled={!transcricaoFile || !transcricaoSemanaId || transcricaoUploading}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: transcricaoFile && transcricaoSemanaId && !transcricaoUploading ? '#3B82F6' : '#E2E8F0',
                  color: transcricaoFile && transcricaoSemanaId && !transcricaoUploading ? '#FFF' : '#94A3B8',
                  fontSize: 13, fontWeight: 600,
                  cursor: transcricaoFile && transcricaoSemanaId && !transcricaoUploading ? 'pointer' : 'default',
                  fontFamily: FONT,
                }}
              >
                {transcricaoUploading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GestaoSemanal;
