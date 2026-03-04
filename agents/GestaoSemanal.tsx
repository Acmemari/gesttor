import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import DateInputBR from '../components/DateInputBR';

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
}

interface Atividade {
  id: string;
  semana_id: string;
  titulo: string;
  descricao: string;
  pessoa_id: string;
  data_termino: string | null;
  tag: string;
  status: 'a fazer' | 'em andamento' | 'pausada' | 'concluída';
  created_at: string;
}

interface HistoricoSemana {
  id: string;
  semana_numero: number;
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

const TAGS = [
  '#planejamento', '#desenvolvimento', '#revisão',
  '#deploy', '#reunião', '#bug', '#docs',
];

const STATUS_LIST = ['a fazer', 'em andamento', 'pausada', 'concluída'] as const;

const GRID_COLS = '36px 2fr 3fr 110px 90px 120px 106px 28px';
const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcWeekNumber(date: Date, modo: 'ano' | 'safra'): number {
  if (modo === 'ano') {
    const start = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((date.getTime() - start.getTime()) / (7 * 864e5) + 1);
  }
  const month = date.getMonth();
  const year = date.getFullYear();
  const safraStart = month >= 6 ? new Date(year, 6, 1) : new Date(year - 1, 6, 1);
  return Math.ceil((date.getTime() - safraStart.getTime()) / (7 * 864e5) + 1);
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

function getSafraLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

const EMPTY_FILTERS: Filters = { titulo: '', descricao: '', pessoaId: '', dataTermino: '', tag: '', status: '' };

// ─── Component ────────────────────────────────────────────────────────────────

const GestaoSemanal: React.FC = () => {
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
  const deletingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

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
      style.textContent = '@keyframes gsFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);
    }
  }, []);

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pessoasRes, semanaRes, historicoRes] = await Promise.all([
        supabase.from('people').select('id, full_name, preferred_name').eq('assume_tarefas_fazenda', true).order('full_name'),
        supabase.from('semanas').select('*').eq('modo', modo).order('numero', { ascending: false }).limit(1),
        supabase.from('historico_semanas').select('*').order('closed_at', { ascending: false }),
      ]);

      const pessoasData: Pessoa[] = (pessoasRes.data || []).map((p: { id: string; full_name: string; preferred_name: string | null }) => ({
        id: p.id,
        nome: p.preferred_name || p.full_name,
      }));
      setPessoas(pessoasData);
      setHistorico(historicoRes.data || []);

      let semanaData: Semana | null = semanaRes.data?.[0] ?? null;

      // Auto-create first week for this mode if none exists
      if (!semanaData) {
        const today = new Date();
        const weekNum = calcWeekNumber(today, modo);
        const monday = getMondayOfWeek(today);
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        const { data: created } = await supabase
          .from('semanas')
          .insert({ numero: weekNum, modo, aberta: true, data_inicio: toDateStr(monday), data_fim: toDateStr(friday) })
          .select()
          .single();
        semanaData = created;
      }

      setSemana(semanaData);

      if (semanaData) {
        const { data: atividadesData } = await supabase
          .from('atividades')
          .select('*')
          .eq('semana_id', semanaData.id)
          .order('created_at');
        setAtividades(atividadesData || []);
      } else {
        setAtividades([]);
      }

      setNewForm(prev => ({ ...prev, pessoaId: prev.pessoaId || pessoasData[0]?.id || '' }));
    } finally {
      setLoading(false);
    }
  }, [modo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (pessoas.length > 0 && !newForm.pessoaId) {
      setNewForm(prev => ({ ...prev, pessoaId: pessoas[0].id }));
    }
  }, [pessoas]);

  // ─── Computed ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = atividades.length;
    const concluidas = atividades.filter(a => a.status === 'concluída').length;
    const em_andamento = atividades.filter(a => a.status === 'em andamento').length;
    const pausada = atividades.filter(a => a.status === 'pausada').length;
    const a_fazer = atividades.filter(a => a.status === 'a fazer').length;
    const progresso = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return { total, concluidas, em_andamento, pausada, a_fazer, progresso };
  }, [atividades]);

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
            va = pessoas.find(p => p.id === a.pessoa_id)?.nome || '';
            vb = pessoas.find(p => p.id === b.pessoa_id)?.nome || '';
            break;
          }
        }
        const cmp = va.localeCompare(vb, 'pt-BR');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [atividades, filters, sortConfig, pessoas]);

  const hasActiveFilters = useMemo(() => Object.values(filters).some(v => v !== ''), [filters]);

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
      pessoaId: at.pessoa_id,
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
    if (!newForm.titulo.trim() || !semana) return;
    const pessoaId = newForm.pessoaId || pessoas[0]?.id;
    if (!pessoaId) return;

    if (editingId) {
      const { error } = await supabase.from('atividades').update({
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
      }).eq('id', editingId);
      if (error) { console.error('Erro ao editar atividade:', error); return; }
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
      const { data, error } = await supabase.from('atividades').insert({
        semana_id: semana.id,
        titulo: newForm.titulo.trim(),
        descricao: newForm.descricao.trim(),
        pessoa_id: pessoaId,
        data_termino: newForm.dataTermino || null,
        tag: newForm.tag,
        status: 'a fazer',
      }).select().single();
      if (error) { console.error('Erro ao adicionar atividade:', error); return; }
      if (data) {
        setAtividades(prev => [...prev, data as Atividade]);
        setNewForm(prev => ({ ...prev, titulo: '', descricao: '', dataTermino: '' }));
      }
    }
  }, [newForm, semana, pessoas, editingId, resetForm]);

  const handleRemoveAtividade = useCallback(async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
      deletingTimerRef.current = setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
    setDeletingId(null);
    await supabase.from('atividades').delete().eq('id', id);
    setAtividades(prev => prev.filter(a => a.id !== id));
    if (editingId === id) resetForm();
  }, [deletingId, editingId, resetForm]);

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    await supabase.from('atividades').update({ status }).eq('id', id);
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, []);

  const handleCheckboxChange = useCallback(async (id: string, checked: boolean) => {
    const status = checked ? 'concluída' : 'a fazer';
    await supabase.from('atividades').update({ status }).eq('id', id);
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, status: status as Atividade['status'] } : a));
  }, []);

  const handleFecharSemana = useCallback(async () => {
    if (!semana?.aberta) return;
    const total = atividades.length;
    const concluidas = atividades.filter(a => a.status === 'concluída').length;
    await supabase.from('semanas').update({ aberta: false }).eq('id', semana.id);
    await supabase.from('historico_semanas').insert({
      semana_numero: semana.numero,
      total,
      concluidas,
      pendentes: total - concluidas,
      closed_at: new Date().toISOString(),
    });
    await fetchData();
  }, [semana, atividades, fetchData]);

  const handleAbrirSemana = useCallback(async () => {
    if (semana?.aberta === true) return;

    if (semana === null) {
      // Primeiro lançamento: cria semana a partir da data de hoje
      const today = new Date();
      const weekNum = calcWeekNumber(today, modo);
      const monday = getMondayOfWeek(today);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      await supabase.from('semanas').insert({
        numero: weekNum,
        modo,
        aberta: true,
        data_inicio: toDateStr(monday),
        data_fim: toDateStr(friday),
      });
    } else {
      // Semana existente fechada: abre a próxima
      const nextStart = new Date(semana.data_inicio + 'T00:00:00');
      nextStart.setDate(nextStart.getDate() + 7);
      const nextEnd = new Date(semana.data_fim + 'T00:00:00');
      nextEnd.setDate(nextEnd.getDate() + 7);

      const { data: newSemana } = await supabase
        .from('semanas')
        .insert({
          numero: semana.numero + 1,
          modo: semana.modo,
          aberta: true,
          data_inicio: toDateStr(nextStart),
          data_fim: toDateStr(nextEnd),
        })
        .select()
        .single();

      if (newSemana) {
        const pending = atividades.filter(a => a.status !== 'concluída');
        if (pending.length > 0) {
          await supabase.from('atividades').insert(
            pending.map(({ titulo, descricao, pessoa_id, data_termino, tag }) => ({
              semana_id: newSemana.id,
              titulo,
              descricao,
              pessoa_id,
              data_termino,
              tag,
              status: 'a fazer',
            }))
          );
        }
      }
    }
    await fetchData();
  }, [semana, modo, atividades, fetchData]);

  // ─── Render helpers ───────────────────────────────────────────────────────────

  const getSortIcon = (col: string) => {
    if (!sortConfig || sortConfig.column !== col) return <span style={{ opacity: 0.5 }}>↕</span>;
    return <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const getPessoaNome = (id: string) => pessoas.find(p => p.id === id)?.nome || '—';
  const getTagStyle  = (tag: string) => TAG_STYLES[tag] ?? { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' };
  const getStatusSt  = (s: string)   => STATUS_STYLES[s]  ?? STATUS_STYLES['a fazer'];

  const currentYear = new Date().getFullYear();
  const safraLabel  = getSafraLabel();

  // ─── Shared styles ────────────────────────────────────────────────────────────

  const font = "'DM Sans', sans-serif";
  const mono = "'JetBrains Mono', monospace";

  const inputSt: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
    fontSize: 13, color: '#1E293B', outline: 'none', width: '100%', fontFamily: font,
    background: '#FFF',
  };

  const filterSt: React.CSSProperties = {
    width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid #E2E8F0',
    fontSize: 11, color: '#475569', outline: 'none', fontFamily: font, background: '#FFF',
  };

  const sortBtnSt = (col: string): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
    color: sortConfig?.column === col ? '#4338CA' : '#94A3B8',
    padding: '2px 0', fontFamily: font,
  });

  const actionBtnSt = (active: boolean, activeColor: string): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: active ? activeColor : '#E2E8F0',
    color: active ? '#FFF' : '#94A3B8',
    opacity: active ? 1 : 0.5,
    cursor: active ? 'pointer' : 'default',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: font,
  });

  // ─── Loading / empty ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#94A3B8', fontFamily: font }}>
        Carregando...
      </div>
    );
  }

  const isAberta = semana?.aberta === true;
  const isFechada = semana?.aberta === false;
  // Abrir Semana disponível quando: semana fechada OU sem semana alguma (primeiro lançamento)
  const canAbrirSemana = semana === null || semana.aberta === false;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', fontFamily: font }}>
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
                    fontFamily: font,
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
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: '#0F172A', fontFamily: font }}>
                  Semana {String(semana?.numero ?? 0).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8', fontFamily: font }}> de 53</span>
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
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {semana ? formatWeekRange(semana.data_inicio, semana.data_fim) : ''}
            </p>
          </div>

          {/* Right side: action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowHistorico(v => !v)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                background: showHistorico ? '#F1F5F9' : '#FFF',
                color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s ease', fontFamily: font,
              }}
            >
              Histórico
            </button>
            <button onClick={handleFecharSemana} disabled={!isAberta} style={actionBtnSt(isAberta, '#DC2626')}>
              Fechar Semana
            </button>
            <button onClick={handleAbrirSemana} disabled={!canAbrirSemana} style={actionBtnSt(canAbrirSemana, '#059669')}>
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
                {historico.map(h => (
                  <div key={h.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8, background: '#F8FAFC', fontSize: 13,
                  }}>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 3. STATS CARDS ────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total',        value: stats.total,        color: '#475569' },
            { label: 'A fazer',      value: stats.a_fazer,      color: '#6B7280' },
            { label: 'Em andamento', value: stats.em_andamento, color: '#2563EB' },
            { label: 'Pausada',      value: stats.pausada,      color: '#D97706' },
            { label: 'Concluídas',   value: stats.concluidas,   color: '#059669' },
          ].map(card => (
            <div key={card.label} style={{ background: '#FFF', borderRadius: 10, padding: '12px 14px', border: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, margin: '0 0 4px' }}>{card.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: card.color, margin: 0, fontFamily: mono }}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── 4. PROGRESS BAR ───────────────────────────────────────────────── */}
        <div style={{ background: '#FFF', borderRadius: 10, border: '1px solid #F1F5F9', padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Progresso da semana</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: mono }}>{stats.progresso}%</span>
          </div>
          <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${stats.progresso}%`, borderRadius: 99,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              ...(stats.progresso === 100
                ? { backgroundColor: '#059669' }
                : { background: 'linear-gradient(90deg, #6366F1, #818CF8)' }),
            }} />
          </div>
        </div>

        {/* ── 5. FORM ───────────────────────────────────────────────────────── */}
        <div
          ref={formRef}
          style={{
            background: '#FFF', borderRadius: 12,
            border: editingId ? '1.5px solid #6366F1' : '1px solid #E2E8F0',
            padding: 16, marginBottom: 16,
            opacity: isAberta ? 1 : 0.55,
            pointerEvents: isAberta ? 'auto' : 'none',
            transition: 'border-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: editingId ? '#6366F1' : '#475569', letterSpacing: '0.3px', margin: 0, transition: 'color 0.2s' }}>
              {editingId ? 'Editando atividade' : 'Nova atividade'}
            </p>
            {!isAberta && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                {canAbrirSemana ? 'Abra a semana para adicionar atividades' : 'Semana fechada'}
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
                style={inputSt}
              />
            </div>

            <div style={{ flex: '2 1 220px', minWidth: 180 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Descrição</label>
              <input
                type="text" placeholder="Descrição breve" value={newForm.descricao}
                onChange={e => setNewForm(p => ({ ...p, descricao: e.target.value }))}
                style={inputSt}
              />
            </div>

            <div style={{ flex: '0 1 140px', minWidth: 120 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: 3 }}>Responsável</label>
              <select value={newForm.pessoaId} onChange={e => setNewForm(p => ({ ...p, pessoaId: e.target.value }))} style={inputSt}>
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
                style={inputSt}
              />
            </div>

            {editingId && (
              <button
                onClick={handleEditCancel}
                style={{
                  flex: '0 0 auto', padding: '7px 16px', borderRadius: 8,
                  border: '1px solid #E2E8F0', background: '#F8FAFC',
                  color: '#64748B', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: font,
                }}
              >
                Cancelar
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={!isAberta || !newForm.titulo.trim()}
              style={{
                flex: '0 0 auto', padding: '7px 20px', borderRadius: 8, border: 'none',
                background: isAberta && newForm.titulo.trim() ? '#6366F1' : '#C7D2FE',
                color: '#FFF', cursor: isAberta && newForm.titulo.trim() ? 'pointer' : 'default',
                fontSize: 13, fontWeight: 600, fontFamily: font,
              }}
            >
              {editingId ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>

        {/* ── 6. TABLE ──────────────────────────────────────────────────────── */}
        <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 8 }}>

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
              <button key={col} onClick={() => handleSort(col)} style={sortBtnSt(col)}>
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
              onChange={e => setFilters(p => ({ ...p, titulo: e.target.value }))} style={filterSt} />
            <input type="text" placeholder="Filtrar..." value={filters.descricao}
              onChange={e => setFilters(p => ({ ...p, descricao: e.target.value }))} style={filterSt} />
            <select value={filters.pessoaId} onChange={e => setFilters(p => ({ ...p, pessoaId: e.target.value }))} style={filterSt}>
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
              onChange={e => setFilters(p => ({ ...p, tag: e.target.value }))} style={filterSt} />
            <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={filterSt}>
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
          {filteredAndSorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>
              Nenhuma atividade encontrada.
            </div>
          ) : filteredAndSorted.map(at => {
            const isConcluida = at.status === 'concluída';
            const isHovered   = hoveredRow === at.id;
            const isEditing   = editingId === at.id;
            const isDeleting  = deletingId === at.id;
            const isDisabled  = !semana?.aberta;
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
                    cursor: isDisabled ? 'default' : 'pointer', fontFamily: font,
                  }}
                >
                  {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Delete */}
                {isAberta ? (
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
        </div>

        {/* ── 7. COUNTER ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px 0' }}>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>
            {hasActiveFilters
              ? `${filteredAndSorted.length} de ${atividades.length} atividades`
              : `${atividades.length} atividades`}
          </span>
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{
              fontSize: 11, color: '#6366F1', fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: font,
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
    </div>
  );
};

export default GestaoSemanal;
