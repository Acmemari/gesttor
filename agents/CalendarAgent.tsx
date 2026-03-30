import React, { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { DateSelectArg, EventClickArg, EventInput } from '@fullcalendar/core';
import { AlertTriangle, Trash2 } from 'lucide-react';
import DateInputBR from '../components/DateInputBR';

/**
 * Calendário - visualização mensal, semanal e diária de eventos.
 */
const CalendarAgent: React.FC = () => {
  const [events, setEvents] = useState<EventInput[]>([
    { id: '1', title: 'Evento 1', start: '2025-02-10', end: '2025-02-12' },
    { id: '2', title: 'Evento 2', start: '2025-02-15T10:00:00', end: '2025-02-15T12:00:00' },
  ]);

  const [promptState, setPromptState] = useState<{
    open: boolean;
    selectInfo: DateSelectArg | null;
    value: string;
    date: string;
  }>({ open: false, selectInfo: null, value: '', date: '' });

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    event: { id: string; title: string } | null;
  }>({ open: false, event: null });

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    selectInfo.view.calendar.unselect();
    setPromptState({
      open: true,
      selectInfo,
      value: '',
      date: selectInfo.startStr.slice(0, 10),
    });
  };

  const handlePromptConfirm = () => {
    const { selectInfo, value, date } = promptState;
    setPromptState({ open: false, selectInfo: null, value: '', date: '' });
    if (!selectInfo || !value?.trim()) return;
    setEvents(prev => [
      ...prev,
      {
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: value.trim(),
        start: date || selectInfo.startStr,
        end: selectInfo.endStr,
        allDay: selectInfo.allDay,
      },
    ]);
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    setConfirmState({ open: true, event: { id: clickInfo.event.id!, title: clickInfo.event.title } });
  };

  const handleConfirmDelete = () => {
    if (confirmState.event) {
      setEvents(prev => prev.filter(e => e.id !== confirmState.event!.id));
    }
    setConfirmState({ open: false, event: null });
  };

  return (
    <div className="h-full p-4 md:p-6">
      {/* Modal: Inclua uma atividade */}
      {promptState.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setPromptState({ open: false, selectInfo: null, value: '', date: '' })}
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
                  onChange={e => setPromptState(p => ({ ...p, value: e.target.value }))}
                  placeholder="Ex: Vacinação, Pesagem, etc."
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handlePromptConfirm()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ai-subtext uppercase tracking-wider mb-1">Data</label>
                <DateInputBR value={promptState.date} onChange={v => setPromptState(p => ({ ...p, date: v }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptState({ open: false, selectInfo: null, value: '', date: '' })}
                className="px-4 py-2 rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePromptConfirm}
                className="px-4 py-2 rounded-md bg-ai-accent text-white hover:opacity-90"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar exclusão */}
      {confirmState.open && confirmState.event && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmState({ open: false, event: null })}
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
                onClick={() => setConfirmState({ open: false, event: null })}
                className="px-4 py-2 rounded-lg border border-ai-border text-ai-subtext hover:text-ai-text hover:bg-ai-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-sm"
              >
                <Trash2 size={18} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-[calc(100%-2rem)] min-h-[500px] rounded-xl border border-ai-border bg-white dark:bg-ai-surface overflow-auto">
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
          editable={true}
          selectable={true}
          selectMirror={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          events={events}
        />
      </div>
    </div>
  );
};

export default CalendarAgent;
