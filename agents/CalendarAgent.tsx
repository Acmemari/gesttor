import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { AlertTriangle, CalendarDays, Loader2, Trash2 } from 'lucide-react';
import DateInputBR from '../components/DateInputBR';
import { useFarm } from '../contexts/FarmContext';
import { addDaysIso } from '../lib/dateHelpers';
import * as semanasApi from '../lib/api/semanasClient';
import { calcWeekNumber, getWeekRange, toIsoDate } from '../lib/weeklyUtils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface CalendarAgentProps {
  onToast?: (msg: string, type: ToastType) => void;
}

interface CalendarActivity {
  id: string;
  semana_id: string;
  titulo: string;
  descricao: string;
  pessoa_id: string | null;
  data_termino: string | null;
  tag: string;
  status: string;
  prioridade: string;
  parent_id: string | null;
  created_at: string;
}

interface VisibleRange {
  start: string;
  end: string;
}

type CalendarActivityInput = Partial<CalendarActivity> & {
  semanaId?: string;
  pessoaId?: string | null;
  dataTermino?: string | null;
  parentId?: string | null;
  createdAt?: string;
};

function normalizeAtividade(row: CalendarActivityInput): CalendarActivity {
  return {
    id: String(row.id ?? ''),
    semana_id: String(row.semana_id ?? row.semanaId ?? ''),
    titulo: String(row.titulo ?? ''),
    descricao: String(row.descricao ?? ''),
    pessoa_id: (row.pessoa_id ?? row.pessoaId ?? null) as string | null,
    data_termino: (row.data_termino ?? row.dataTermino ?? null) as string | null,
    tag: String(row.tag ?? '#planejamento'),
    status: String(row.status ?? 'a fazer'),
    prioridade: String(row.prioridade ?? 'média'),
    parent_id: (row.parent_id ?? row.parentId ?? null) as string | null,
    created_at: String(row.created_at ?? row.createdAt ?? ''),
  };
}

function toCalendarEvent(activity: CalendarActivity): EventInput {
  return {
    id: activity.id,
    title: activity.titulo,
    start: activity.data_termino ?? undefined,
    allDay: true,
  };
}

const INITIAL_PROMPT_STATE = { open: false, selectInfo: null, value: '', date: '' };
const INITIAL_CONFIRM_STATE = { open: false, event: null };

const CalendarAgent: React.FC<CalendarAgentProps> = ({ onToast }) => {
  const { selectedFarm } = useFarm();
  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [promptState, setPromptState] = useState<{
    open: boolean;
    selectInfo: DateSelectArg | null;
    value: string;
    date: string;
  }>(INITIAL_PROMPT_STATE);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    event: { id: string; title: string } | null;
  }>(INITIAL_CONFIRM_STATE);

  const events = useMemo(() => activities.filter(item => item.data_termino).map(toCalendarEvent), [activities]);

  const loadActivities = useCallback(async () => {
    if (!selectedFarm?.id || !visibleRange) {
      setActivities([]);
      return;
    }

    setLoading(true);
    try {
      const res = await semanasApi.listAtividadesByPeriod(selectedFarm.id, visibleRange.start, visibleRange.end);
      if ('error' in res) {
        onToast?.(res.error || 'Erro ao carregar calendário.', 'error');
        setActivities([]);
        return;
      }

      setActivities(res.data.map(normalizeAtividade));
    } finally {
      setLoading(false);
    }
  }, [onToast, selectedFarm?.id, visibleRange]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const start = toIsoDate(arg.start);
    const endExclusive = toIsoDate(arg.end);
    const end = addDaysIso(endExclusive, -1);
    setVisibleRange(prev => (prev?.start === start && prev?.end === end ? prev : { start, end }));
  }, []);

  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    selectInfo.view.calendar.unselect();
    if (!selectedFarm?.id) {
      onToast?.('Selecione uma fazenda antes de adicionar anotações no calendário.', 'warning');
      return;
    }
    setPromptState({
      open: true,
      selectInfo,
      value: '',
      date: selectInfo.startStr.slice(0, 10),
    });
  }, [onToast, selectedFarm?.id]);

  const resolveSemanaId = useCallback(async (dateIso: string) => {
    if (!selectedFarm?.id) {
      throw new Error('Selecione uma fazenda para salvar atividades no calendário.');
    }

    const targetDate = new Date(`${dateIso}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
      throw new Error('Data inválida para criação da atividade.');
    }

    const weekRange = getWeekRange(targetDate);
    const existing = await semanasApi.getSemanaByDataInicio(weekRange.startIso, selectedFarm.id);
    if ('error' in existing) {
      throw new Error(existing.error || 'Não foi possível localizar a semana da atividade.');
    }

    if (existing.data?.id) {
      return String(existing.data.id);
    }

    const created = await semanasApi.createSemana({
      farm_id: selectedFarm.id,
      numero: calcWeekNumber(targetDate, 'ano'),
      modo: 'ano',
      aberta: true,
      data_inicio: weekRange.startIso,
      data_fim: weekRange.endIso,
    });

    if ('error' in created) {
      throw new Error(created.error || 'Não foi possível criar a semana da atividade.');
    }

    if (!created.data?.id) {
      throw new Error('Não foi possível criar a semana da atividade.');
    }

    return String(created.data.id);
  }, [selectedFarm?.id]);

  const handlePromptConfirm = useCallback(async () => {
    const { selectInfo, value, date } = promptState;
    if (!selectInfo || !value.trim()) {
      setPromptState(INITIAL_PROMPT_STATE);
      return;
    }

    setSaving(true);
    try {
      const targetDate = date || selectInfo.startStr.slice(0, 10);
      const semanaId = await resolveSemanaId(targetDate);
      const res = await semanasApi.createAtividade({
        semana_id: semanaId,
        titulo: value.trim(),
        descricao: '',
        pessoa_id: null,
        data_termino: targetDate,
        tag: '#planejamento',
        status: 'a fazer',
        prioridade: 'média',
      });

      if ('error' in res) {
        onToast?.(res.error || 'Erro ao salvar atividade no calendário.', 'error');
        return;
      }

      const created = normalizeAtividade(res.data);
      setActivities(prev => [...prev.filter(item => item.id !== created.id), created]);
      setPromptState(INITIAL_PROMPT_STATE);
      onToast?.('Atividade salva no calendário.', 'success');
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : 'Erro ao salvar atividade no calendário.', 'error');
    } finally {
      setSaving(false);
    }
  }, [onToast, promptState, resolveSemanaId]);

  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    setConfirmState({
      open: true,
      event: { id: clickInfo.event.id, title: clickInfo.event.title },
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmState.event) return;

    setDeleting(true);
    try {
      const res = await semanasApi.deleteAtividade(confirmState.event.id);
      if ('error' in res) {
        onToast?.(res.error || 'Erro ao excluir atividade do calendário.', 'error');
        return;
      }

      setActivities(prev => prev.filter(item => item.id !== confirmState.event?.id));
      setConfirmState(INITIAL_CONFIRM_STATE);
      onToast?.('Atividade excluída do calendário.', 'success');
    } finally {
      setDeleting(false);
    }
  }, [confirmState.event, onToast]);

  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    const nextDate = dropInfo.event.start ? toIsoDate(dropInfo.event.start) : '';
    if (!nextDate) {
      dropInfo.revert();
      onToast?.('Não foi possível determinar a nova data da atividade.', 'error');
      return;
    }

    setDraggingId(dropInfo.event.id);
    try {
      const res = await semanasApi.updateAtividade(dropInfo.event.id, { data_termino: nextDate });
      if ('error' in res) {
        dropInfo.revert();
        onToast?.(res.error || 'Erro ao atualizar atividade no calendário.', 'error');
        return;
      }

      const updated = normalizeAtividade(res.data);
      setActivities(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      onToast?.('Data da atividade atualizada.', 'success');
    } finally {
      setDraggingId(null);
    }
  }, [onToast]);

  if (!selectedFarm?.id) {
    return (
      <div className="h-full p-4 md:p-6">
        <div className="h-full min-h-[360px] rounded-2xl border border-dashed border-ai-border bg-ai-surface/40 flex flex-col items-center justify-center text-center px-6">
          <div className="mb-4 rounded-full bg-ai-accent/10 p-4 text-ai-accent">
            <CalendarDays size={28} />
          </div>
          <h2 className="text-lg font-semibold text-ai-text mb-2">Selecione uma fazenda para usar o calendário</h2>
          <p className="max-w-md text-sm text-ai-subtext">
            As anotações do calendário são salvas como atividades semanais da fazenda selecionada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 md:p-6">
      {promptState.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !saving && setPromptState(INITIAL_PROMPT_STATE)}
        >
          <div
            className="bg-ai-bg border border-ai-border rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-ai-text mb-3">Inclua uma atividade</h3>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-ai-subtext uppercase tracking-wider mb-1">
                  Atividade
                </label>
                <input
                  type="text"
                  value={promptState.value}
                  onChange={e => setPromptState(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="Ex: Vacinação, Pesagem, etc."
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && !saving && void handlePromptConfirm()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ai-subtext uppercase tracking-wider mb-1">Data</label>
                <DateInputBR value={promptState.date} onChange={v => setPromptState(prev => ({ ...prev, date: v }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPromptState(INITIAL_PROMPT_STATE)}
                className="px-4 py-2 rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handlePromptConfirm()}
                className="px-4 py-2 rounded-md bg-ai-accent text-white hover:opacity-90 disabled:opacity-70"
              >
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState.open && confirmState.event && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmState(INITIAL_CONFIRM_STATE)}
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
                <h3 className="text-xl font-bold text-ai-text">Excluir Atividade</h3>
              </div>

              <div className="space-y-3">
                <p className="text-ai-text font-medium">
                  Deseja realmente excluir a atividade{' '}
                  <span className="text-ai-accent">"{confirmState.event.title}"</span>?
                </p>
                <p className="text-ai-subtext text-sm leading-relaxed">
                  Esta ação não poderá ser desfeita e a atividade será removida permanentemente do seu calendário.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-ai-surface/50 border-t border-ai-border">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmState(INITIAL_CONFIRM_STATE)}
                className="px-4 py-2 rounded-lg border border-ai-border text-ai-subtext hover:text-ai-text hover:bg-ai-surface transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-70"
              >
                <Trash2 size={18} />
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative h-[calc(100%-2rem)] min-h-[500px] rounded-xl border border-ai-border bg-white dark:bg-ai-surface overflow-hidden">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-ai-bg/90 py-2 text-sm text-ai-subtext">
            <Loader2 size={16} className="animate-spin" />
            Carregando calendário...
          </div>
        )}

        <div className="h-full overflow-auto">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={ptBrLocale}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            height="auto"
            fixedWeekCount={false}
            editable={!saving && !deleting && !draggingId}
            eventDurationEditable={false}
            selectable={!saving && !deleting}
            selectMirror
            select={handleDateSelect}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            events={events}
          />
        </div>
      </div>
    </div>
  );
};

export default CalendarAgent;
