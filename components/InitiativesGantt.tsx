import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { gantt } from 'dhtmlx-gantt';
import { Download, Maximize, Minimize } from 'lucide-react';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import './gantt-custom.css';
import type { InitiativeWithProgress } from '../lib/initiatives';
import type { DeliveryRow } from '../lib/deliveries';
import type { ProjectRow } from '../lib/projects';

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

interface InitiativesGanttProps {
  projects: ProjectRow[];
  initiatives: InitiativeWithProgress[];
  deliveries: DeliveryRow[];
  onTaskDateChange?: (change: GanttDateChange) => void;
  ganttStart?: string;
  ganttEnd?: string;
  zoomLevel?: ZoomLevel;
  onZoomChange?: (z: ZoomLevel) => void;
  allowedZooms?: ZoomLevel[];
}

interface GanttTask {
  id: string;
  text: string;
  start_date: string;
  duration: number;
  end_date?: string;
  parent?: string;
  open?: boolean;
  progress?: number;
  type?: string;
  readonly?: boolean;
  taskType?: 'program' | 'delivery' | 'initiative' | 'task';
}

export interface GanttDateChange {
  type: 'program' | 'delivery' | 'initiative' | 'task';
  id: string;
  start_date: string;
  end_date: string;
}

const DAY_MS = 86_400_000;
const UNLINKED_PROGRAM_ID = '__unlinked_program__';
const UNLINKED_DELIVERY_ID = '__unlinked__';
const DATE_BR_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const PT_BR_GANTT_DATE_LOCALE = {
  month_full: [
    'Janeiro',
    'Fevereiro',
    'Marco',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ],
  month_short: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  day_full: ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'],
  day_short: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
};

type DepthLevel = 1 | 2 | 3 | 4;

const DEPTH_BY_TYPE: Record<string, DepthLevel> = {
  program: 1,
  delivery: 2,
  initiative: 3,
  task: 4,
};

const ZOOM_OPTIONS: ReadonlyArray<{ key: ZoomLevel; label: string }> = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'quarter', label: 'Trimestre' },
] as const;

const LEVEL_OPTIONS: ReadonlyArray<{ key: DepthLevel; label: string }> = [
  { key: 1, label: 'Nível 1' },
  { key: 2, label: 'Nível 1 e 2' },
  { key: 3, label: 'Nível 1 a 3' },
  { key: 4, label: 'Nível 1 a 4' },
] as const;

const ZOOM_CONFIGS: Record<ZoomLevel, { scales: Array<Record<string, unknown>>; minColumnWidth: number }> = {
  day: {
    scales: [
      { unit: 'month', step: 1, format: '%F %Y' },
      { unit: 'day', step: 1, format: '%d' },
    ],
    minColumnWidth: 32,
  },
  week: {
    scales: [
      { unit: 'month', step: 1, format: '%F %Y' },
      { unit: 'week', step: 1, format: 'Sem %W' },
    ],
    minColumnWidth: 55,
  },
  month: {
    scales: [
      { unit: 'year', step: 1, format: '%Y' },
      { unit: 'month', step: 1, format: '%M' },
    ],
    minColumnWidth: 80,
  },
  quarter: {
    scales: [
      { unit: 'year', step: 1, format: '%Y' },
      {
        unit: 'quarter',
        step: 1,
        format: (date: Date) => `T${Math.floor(date.getMonth() / 3) + 1}`,
      },
    ],
    minColumnWidth: 120,
  },
};

const SEG_WRAPPER = 'inline-flex items-center rounded-2xl bg-slate-100 p-1';
const SEG_BTN = 'px-3 py-1.5 text-[11px] font-semibold rounded-xl transition-all duration-150';
const SEG_ACTIVE = `${SEG_BTN} bg-white text-indigo-600 shadow-sm`;
const SEG_INACTIVE = `${SEG_BTN} text-slate-500 hover:text-slate-700`;
const ICON_BTN =
  'inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors';

const parseISODate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value.slice(0, 10) + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
};

const toGanttDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const inclusiveDurationDays = (start: Date, end: Date): number =>
  Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getTaskEndDateInclusive = (task: { start_date: Date; duration: number }): Date =>
  addDays(task.start_date, Math.max(1, Number(task.duration) || 1) - 1);

const formatDateBR = (d: Date): string => DATE_BR_FORMATTER.format(d);

const applyZoomConfig = (level: ZoomLevel) => {
  const config = ZOOM_CONFIGS[level];
  gantt.config.scales = config.scales as unknown as typeof gantt.config.scales;
  gantt.config.min_column_width = config.minColumnWidth;
};

/* ── Shared sub-components (stable refs, no re-render cost) ────────── */

const ZoomButtons: React.FC<{
  active: ZoomLevel;
  onChange: (z: ZoomLevel) => void;
  allowedZooms?: ZoomLevel[];
}> = React.memo(({ active, onChange, allowedZooms = ['day', 'week', 'month', 'quarter'] }) => (
  <div className={SEG_WRAPPER}>
    {ZOOM_OPTIONS.map(z => {
      const allowed = allowedZooms.includes(z.key);
      return (
        <button
          key={z.key}
          type="button"
          onClick={() => allowed && onChange(z.key)}
          disabled={!allowed}
          className={`${active === z.key ? SEG_ACTIVE : SEG_INACTIVE} ${!allowed ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {z.label}
        </button>
      );
    })}
  </div>
));
ZoomButtons.displayName = 'ZoomButtons';

const LevelButtons: React.FC<{ active: DepthLevel; onChange: (d: DepthLevel) => void }> = React.memo(
  ({ active, onChange }) => (
    <div className={SEG_WRAPPER}>
      {LEVEL_OPTIONS.map(l => (
        <button
          key={l.key}
          type="button"
          onClick={() => onChange(l.key)}
          className={active === l.key ? SEG_ACTIVE : SEG_INACTIVE}
        >
          {l.label}
        </button>
      ))}
    </div>
  ),
);
LevelButtons.displayName = 'LevelButtons';

/* ── Main component ────────────────────────────────────────────────── */

const InitiativesGantt: React.FC<InitiativesGanttProps> = ({
  projects,
  initiatives,
  deliveries,
  onTaskDateChange,
  ganttStart,
  ganttEnd,
  zoomLevel: zoomLevelProp,
  onZoomChange,
  allowedZooms = ['day', 'week', 'month', 'quarter'],
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const maxDepthRef = useRef<DepthLevel>(4);
  const onTaskDateChangeRef = useRef(onTaskDateChange);
  onTaskDateChangeRef.current = onTaskDateChange;

  const [zoomLevelInternal, setZoomLevelInternal] = useState<ZoomLevel>('day');
  const zoomLevel = zoomLevelProp ?? zoomLevelInternal;
  const setZoomLevel = useCallback(
    (z: ZoomLevel) => {
      if (onZoomChange) onZoomChange(z);
      else setZoomLevelInternal(z);
    },
    [onZoomChange],
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [maxDepthLevel, setMaxDepthLevel] = useState<DepthLevel>(4);
  const [isExporting, setIsExporting] = useState(false);

  const tasks = useMemo<GanttTask[]>(() => {
    const result: GanttTask[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const initiativesByDelivery = new Map<string, InitiativeWithProgress[]>();
    for (const initiative of initiatives) {
      const deliveryId = initiative.delivery_id || UNLINKED_DELIVERY_ID;
      const list = initiativesByDelivery.get(deliveryId) || [];
      list.push(initiative);
      initiativesByDelivery.set(deliveryId, list);
    }

    const deliveryGroups = new Map<
      string,
      { id: string; name: string; projectId: string; initiatives: InitiativeWithProgress[] }
    >();

    for (const delivery of deliveries) {
      const list = initiativesByDelivery.get(delivery.id);
      if (!list || list.length === 0) continue;
      deliveryGroups.set(delivery.id, {
        id: delivery.id,
        name: delivery.name || 'Entrega sem nome',
        projectId: delivery.project_id || UNLINKED_PROGRAM_ID,
        initiatives: [...list].sort((a, b) => a.sort_order - b.sort_order),
      });
    }

    for (const [deliveryId, list] of initiativesByDelivery.entries()) {
      if (deliveryGroups.has(deliveryId)) continue;
      if (deliveryId === UNLINKED_DELIVERY_ID) {
        deliveryGroups.set(deliveryId, {
          id: deliveryId,
          name: 'Sem entrega vinculada',
          projectId: UNLINKED_PROGRAM_ID,
          initiatives: [...list].sort((a, b) => a.sort_order - b.sort_order),
        });
        continue;
      }
      deliveryGroups.set(deliveryId, {
        id: deliveryId,
        name: 'Entrega não encontrada',
        projectId: UNLINKED_PROGRAM_ID,
        initiatives: [...list].sort((a, b) => a.sort_order - b.sort_order),
      });
    }

    const deliveriesByProgram = new Map<
      string,
      Array<{ id: string; name: string; initiatives: InitiativeWithProgress[] }>
    >();

    for (const group of deliveryGroups.values()) {
      const key = group.projectId || UNLINKED_PROGRAM_ID;
      const list = deliveriesByProgram.get(key) || [];
      list.push({ id: group.id, name: group.name, initiatives: group.initiatives });
      deliveriesByProgram.set(key, list);
    }

    const programs: Array<{
      id: string;
      name: string;
      deliveries: Array<{ id: string; name: string; initiatives: InitiativeWithProgress[] }>;
    }> = [];
    const seenProgramIds = new Set<string>();

    for (const project of projects) {
      const groupedDeliveries = deliveriesByProgram.get(project.id);
      if (!groupedDeliveries || groupedDeliveries.length === 0) continue;
      programs.push({
        id: project.id,
        name: project.name || 'Programa sem nome',
        deliveries: groupedDeliveries,
      });
      seenProgramIds.add(project.id);
    }

    const unlinkedDeliveries = deliveriesByProgram.get(UNLINKED_PROGRAM_ID) || [];
    if (unlinkedDeliveries.length > 0) {
      programs.push({
        id: UNLINKED_PROGRAM_ID,
        name: 'Sem programa vinculado',
        deliveries: unlinkedDeliveries,
      });
      seenProgramIds.add(UNLINKED_PROGRAM_ID);
    }

    for (const [programId, groupedDeliveries] of deliveriesByProgram.entries()) {
      if (seenProgramIds.has(programId)) continue;
      programs.push({
        id: programId,
        name: 'Programa não encontrado',
        deliveries: groupedDeliveries,
      });
    }

    for (const program of programs) {
      let programStart: Date | null = null;
      let programEnd: Date | null = null;
      const deliveryNodes: GanttTask[] = [];
      const childNodes: GanttTask[] = [];

      for (const delivery of program.deliveries) {
        let deliveryStart: Date | null = null;
        let deliveryEnd: Date | null = null;
        const initiativeNodes: GanttTask[] = [];
        const taskNodes: GanttTask[] = [];

        for (const initiative of delivery.initiatives) {
          let earliestMilestone: Date | null = null;
          let latestMilestone: Date | null = null;
          let earliestTaskStart: Date | null = null;
          let latestTaskEnd: Date | null = null;

          const milestoneTasks = (initiative.milestones || []).flatMap(m =>
            (m.tasks || []).map(t => ({ ...t, milestoneTitle: m.title })),
          );
          milestoneTasks.sort((a, b) => a.sort_order - b.sort_order);

          for (const milestone of initiative.milestones || []) {
            const due = parseISODate(milestone.due_date);
            if (!due) continue;
            if (!earliestMilestone || due < earliestMilestone) earliestMilestone = due;
            if (!latestMilestone || due > latestMilestone) latestMilestone = due;
          }

          for (const task of milestoneTasks) {
            const taskStart =
              parseISODate(task.activity_date) ||
              parseISODate(task.due_date) ||
              parseISODate(initiative.start_date) ||
              today;
            const taskDuration = Math.max(1, Number(task.duration_days) || 1);
            const taskEnd = addDays(taskStart, taskDuration - 1);

            if (!earliestTaskStart || taskStart < earliestTaskStart) earliestTaskStart = taskStart;
            if (!latestTaskEnd || taskEnd > latestTaskEnd) latestTaskEnd = taskEnd;

            taskNodes.push({
              id: `task-${task.id}`,
              text: task.title || 'Tarefa',
              parent: `initiative-${initiative.id}`,
              start_date: toGanttDate(taskStart),
              end_date: toGanttDate(taskEnd),
              duration: taskDuration,
              progress: task.completed ? 1 : 0,
              taskType: 'task',
            });
          }

          const initiativeStart =
            parseISODate(initiative.start_date) || earliestTaskStart || earliestMilestone || today;
          const rawInitiativeEnd =
            parseISODate(initiative.end_date) || latestTaskEnd || latestMilestone || initiativeStart;
          const initiativeEnd = rawInitiativeEnd < initiativeStart ? initiativeStart : rawInitiativeEnd;

          initiativeNodes.push({
            id: `initiative-${initiative.id}`,
            text: initiative.name || 'Macro atividade sem nome',
            parent: `delivery-${delivery.id}`,
            start_date: toGanttDate(initiativeStart),
            end_date: toGanttDate(initiativeEnd),
            duration: inclusiveDurationDays(initiativeStart, initiativeEnd),
            open: true,
            progress: Math.min(1, Math.max(0, (initiative.progress || 0) / 100)),
            taskType: 'initiative',
          });

          if (!deliveryStart || initiativeStart < deliveryStart) deliveryStart = initiativeStart;
          if (!deliveryEnd || initiativeEnd > deliveryEnd) deliveryEnd = initiativeEnd;
        }

        const resolvedDeliveryStart = deliveryStart || today;
        const resolvedDeliveryEnd = deliveryEnd || resolvedDeliveryStart;

        deliveryNodes.push({
          id: `delivery-${delivery.id}`,
          text: delivery.name,
          parent: `program-${program.id}`,
          start_date: toGanttDate(resolvedDeliveryStart),
          end_date: toGanttDate(resolvedDeliveryEnd),
          duration: inclusiveDurationDays(resolvedDeliveryStart, resolvedDeliveryEnd),
          open: true,
          type: 'project',
          readonly: delivery.id === UNLINKED_DELIVERY_ID,
          taskType: 'delivery',
        });
        childNodes.push(...initiativeNodes, ...taskNodes);

        if (!programStart || resolvedDeliveryStart < programStart) programStart = resolvedDeliveryStart;
        if (!programEnd || resolvedDeliveryEnd > programEnd) programEnd = resolvedDeliveryEnd;
      }

      const resolvedProgramStart = programStart || today;
      const resolvedProgramEnd = programEnd || resolvedProgramStart;

      result.push({
        id: `program-${program.id}`,
        text: program.name,
        start_date: toGanttDate(resolvedProgramStart),
        end_date: toGanttDate(resolvedProgramEnd),
        duration: inclusiveDurationDays(resolvedProgramStart, resolvedProgramEnd),
        open: true,
        type: 'project',
        readonly: program.id === UNLINKED_PROGRAM_ID,
        taskType: 'program',
      });
      result.push(...deliveryNodes, ...childNodes);
    }

    return result;
  }, [projects, initiatives, deliveries]);

  const initGantt = useCallback(() => {
    if (!containerRef.current || initializedRef.current) return;

    gantt.locale.date = PT_BR_GANTT_DATE_LOCALE as typeof gantt.locale.date;

    gantt.plugins({ marker: true, tooltip: true });

    gantt.config.readonly = false;
    gantt.config.drag_move = true;
    gantt.config.drag_resize = true;
    gantt.config.drag_progress = false;
    gantt.config.drag_links = false;
    gantt.config.xml_date = '%Y-%m-%d';
    gantt.config.date_format = '%Y-%m-%d';
    gantt.config.autosize = false;
    gantt.config.open_tree_initially = true;
    gantt.config.show_progress = true;
    gantt.config.row_height = 36;
    gantt.config.scale_height = 64;
    gantt.config.grid_width = 320;
    gantt.config.columns = [
      { name: 'text', label: 'CRONOGRAMA DE ATIVIDADES', tree: true, width: '*', min_width: 180 },
    ];

    applyZoomConfig('day');

    gantt.templates.task_class = (_s: Date, _e: Date, task: Record<string, unknown>) => {
      const tt = task.taskType as string | undefined;
      if (tt === 'program') return 'gantt-program-row';
      if (tt === 'delivery') return 'gantt-delivery-row';
      if (tt === 'task') return 'gantt-task-row';
      return '';
    };

    gantt.templates.grid_row_class = (_s: Date, _e: Date, task: Record<string, unknown>) => {
      const tt = task.taskType as string | undefined;
      if (tt === 'program') return 'gantt-program-row';
      if (tt === 'delivery') return 'gantt-delivery-row';
      if (tt === 'task') return 'gantt-task-row';
      return '';
    };

    gantt.templates.tooltip_text = (start: Date, end: Date, task: Record<string, unknown>) => {
      const tt = task.taskType as string | undefined;
      const name = String(task.text || '');
      const dur = Math.max(1, Number(task.duration) || 1);

      let html = `<strong>${name}</strong><br/>${formatDateBR(start)} — ${formatDateBR(end)}<br/>${dur} dia${dur > 1 ? 's' : ''}`;

      if (tt === 'program') {
        html += '<br/>Nível: Programa';
      } else if (tt === 'delivery') {
        html += '<br/>Nível: Entrega';
      } else if (tt === 'initiative') {
        html += `<br/>Progresso: ${Math.round((Number(task.progress) || 0) * 100)}%`;
      } else if (tt === 'task') {
        html += `<br/>${Number(task.progress) >= 1 ? 'Concluído' : 'Pendente'}`;
      }
      return html;
    };

    const evBeforeDrag = gantt.attachEvent('onBeforeTaskDrag', (id: string) => {
      const task = gantt.getTask(id);
      if (task?.readonly) return false;
      const taskId = String(task?.id || '');
      return !(taskId.startsWith('delivery-') && taskId.endsWith(UNLINKED_DELIVERY_ID));
    });

    const evAfterDrag = gantt.attachEvent('onAfterTaskDrag', (id: string) => {
      const cb = onTaskDateChangeRef.current;
      if (!cb) return true;
      const task = gantt.getTask(id);
      const taskId = String(task?.id || '');
      if (!taskId) return true;

      const cleanId = taskId.replace(/^(program-|delivery-|initiative-|task-)/, '');
      if (!cleanId || cleanId === UNLINKED_DELIVERY_ID || cleanId === UNLINKED_PROGRAM_ID) return true;

      cb({
        type: taskId.startsWith('program-')
          ? 'program'
          : taskId.startsWith('delivery-')
            ? 'delivery'
            : taskId.startsWith('task-')
              ? 'task'
              : 'initiative',
        id: cleanId,
        start_date: toGanttDate(task.start_date),
        end_date: toGanttDate(getTaskEndDateInclusive(task as { start_date: Date; duration: number })),
      });
      return true;
    });

    const evDisplay = gantt.attachEvent('onBeforeTaskDisplay', (_id: string, task: Record<string, unknown>) => {
      const depth = DEPTH_BY_TYPE[task.taskType as string] ?? 1;
      return depth <= maxDepthRef.current;
    });

    gantt.init(containerRef.current);
    initializedRef.current = true;

    const todayMarker = gantt.addMarker({
      start_date: new Date(),
      css: 'gantt-today-marker',
      text: 'Hoje',
    });

    return () => {
      gantt.detachEvent(evBeforeDrag);
      gantt.detachEvent(evAfterDrag);
      gantt.detachEvent(evDisplay);
      try {
        if (todayMarker) gantt.deleteMarker(todayMarker);
      } catch {
        /* marker may already be removed */
      }
      gantt.clearAll();
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = initGantt();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [initGantt]);

  useEffect(() => {
    if (!initializedRef.current) return;
    applyZoomConfig(zoomLevel);
    gantt.render();
  }, [zoomLevel]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (ganttStart && ganttEnd) {
      const startDate = new Date(ganttStart + 'T00:00:00');
      const endDate = new Date(ganttEnd + 'T00:00:00');
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        gantt.config.start_date = startDate;
        gantt.config.end_date = endDate;
      }
    } else {
      (gantt.config as { start_date?: Date; end_date?: Date }).start_date = undefined;
      (gantt.config as { start_date?: Date; end_date?: Date }).end_date = undefined;
    }
    gantt.render();
  }, [ganttStart, ganttEnd]);

  useEffect(() => {
    maxDepthRef.current = maxDepthLevel;
    if (initializedRef.current) gantt.render();
  }, [maxDepthLevel]);

  useEffect(() => {
    if (!initializedRef.current) return;
    gantt.batchUpdate(() => {
      gantt.clearAll();
      gantt.parse({ data: tasks, links: [] });
    });
  }, [tasks]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
      if (!initializedRef.current) return;
      if (fullscreenRafRef.current !== null) cancelAnimationFrame(fullscreenRafRef.current);
      fullscreenRafRef.current = requestAnimationFrame(() => gantt.render());
    };

    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      if (fullscreenRafRef.current !== null) cancelAnimationFrame(fullscreenRafRef.current);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const target = wrapperRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement === target) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      /* fullscreen may be blocked by browser policy */
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const target = wrapperRef.current;
    if (!target || isExporting) return;
    setIsExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(target, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `cronograma-atividades-${toGanttDate(new Date())}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      /* export can fail in restricted contexts */
    }
    setIsExporting(false);
  }, [isExporting]);

  if (tasks.length === 0) {
    return (
      <div className="bg-ai-surface/50 border border-ai-border rounded-xl p-8 text-center text-sm text-ai-subtext">
        Não há atividades com datas programadas para exibir no Gantt.
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`bg-white border border-slate-200 overflow-hidden shadow-sm ${isFullscreen ? 'rounded-none px-3 pb-3' : 'rounded-xl'}`}
    >
      {isFullscreen ? (
        <>
          {/* Row 1: title + exit fullscreen */}
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-slate-700 tracking-tight">Atividades em Foco</span>
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Sair da Tela cheia"
              aria-label="Sair da Tela cheia"
              className={ICON_BTN}
            >
              <Minimize size={16} />
            </button>
          </div>

          {/* Row 2: zoom + levels + download */}
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <ZoomButtons active={zoomLevel} onChange={setZoomLevel} allowedZooms={allowedZooms} />
            <div className="flex items-center gap-2">
              <LevelButtons active={maxDepthLevel} onChange={setMaxDepthLevel} />
              <button
                type="button"
                onClick={handleDownload}
                disabled={isExporting}
                title="Download do gráfico"
                aria-label="Download do gráfico"
                className={`${ICON_BTN} ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-600"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700 tracking-tight">Cronograma de Atividades</span>
          </div>

          <div className="flex items-center gap-2">
            <ZoomButtons active={zoomLevel} onChange={setZoomLevel} allowedZooms={allowedZooms} />
            <LevelButtons active={maxDepthLevel} onChange={setMaxDepthLevel} />
            <button
              type="button"
              onClick={handleDownload}
              disabled={isExporting}
              title="Download do gráfico"
              aria-label="Download do gráfico"
              className={`${ICON_BTN} ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Download size={16} />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Tela cheia"
              aria-label="Tela cheia"
              className={ICON_BTN}
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full pr-2" style={{ height: isFullscreen ? 'calc(100vh - 104px)' : '520px' }} />
    </div>
  );
};

export default InitiativesGantt;
