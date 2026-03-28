import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ptBR } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar as CalendarIcon } from 'lucide-react';

registerLocale('pt-BR', ptBR);

/* ── helpers ────────────────────────────────────────────── */

function parseIso(v?: string): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isFinite(dt.getTime()) ? dt : null;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtBR(d: Date | null): string {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseBR(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(+m[3], +m[2] - 1, +m[1]);
  if (dt.getDate() !== +m[1] || dt.getMonth() !== +m[2] - 1) return null;
  return isFinite(dt.getTime()) ? dt : null;
}

function mask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/* ── componente ────────────────────────────────────────── */

interface DateInputBRProps {
  value?: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  id?: string;
  weekStart?: string; // YYYY-MM-DD — Monday of the active planning week
  weekEnd?: string;   // YYYY-MM-DD — Saturday of the active planning week
}

const DateInputBR: React.FC<DateInputBRProps> = ({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  className = '',
  disabled = false,
  required = false,
  min,
  max,
  id,
  weekStart,
  weekEnd,
}) => {
  const selected = useMemo(() => parseIso(value), [value]);
  const minD = useMemo(() => parseIso(min), [min]);
  const maxD = useMemo(() => parseIso(max), [max]);

  const dayClassName = useCallback(
    (date: Date): string | null => {
      if (!weekStart || !weekEnd) return null;
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const [sy, sm, sd] = weekStart.split('-').map(Number);
      const [ey, em, ed] = weekEnd.split('-').map(Number);
      const s = new Date(sy, sm - 1, sd).getTime();
      const e = new Date(ey, em - 1, ed).getTime();
      if (d < s || d > e) return null;
      if (d === s) return 'week-range-day week-range-start';
      if (d === e) return 'week-range-day week-range-end';
      return 'week-range-day';
    },
    [weekStart, weekEnd],
  );

  const [text, setText] = useState(fmtBR(selected));
  const [showCal, setShowCal] = useState(false);
  const [calPosition, setCalPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);

  // Posiciona o calendário quando abre e recalcula em scroll/resize
  const CALENDAR_HEIGHT = 280;
  const computePosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < CALENDAR_HEIGHT ? rect.top - CALENDAR_HEIGHT : rect.bottom + 4;
    setCalPosition({ top, left: rect.left });
  }, []);

  useLayoutEffect(() => {
    if (showCal && wrapRef.current) {
      computePosition();
    } else {
      setCalPosition(null);
      return;
    }

    let rafId: number | null = null;
    const handleUpdate = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        computePosition();
      });
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [showCal, computePosition]);

  // Sincroniza texto quando value externo muda
  useEffect(() => {
    setText(fmtBR(selected));
  }, [selected]);

  // Fecha calendário ao clicar fora
  useEffect(() => {
    if (!showCal) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideInput = wrapRef.current?.contains(target);
      const insideCal = calRef.current?.contains(target);
      if (!insideInput && !insideCal) {
        setShowCal(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCal]);

  const commitTyped = useCallback(
    (s: string) => {
      let d = parseBR(s);
      if (d) {
        // Restringir ao intervalo min/max
        if (minD && d < minD) d = minD;
        if (maxD && d > maxD) d = maxD;
        onChange(toIso(d));
        setText(fmtBR(d));
      }
    },
    [onChange, minD, maxD],
  );

  const handleBlur = useCallback(() => {
    if (!text.trim()) {
      onChange('');
      return;
    }
    let d = parseBR(text);
    if (d) {
      // Restringir ao intervalo min/max
      if (minD && d < minD) d = minD;
      if (maxD && d > maxD) d = maxD;
      onChange(toIso(d));
      setText(fmtBR(d));
    } else {
      setText(fmtBR(selected)); // reverte
    }
  }, [text, selected, onChange, minD, maxD]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Campo de texto – digitação livre */}
      <input
        id={id}
        type="text"
        value={text}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Data (dd/mm/aaaa)"
        className="w-full pl-3 pr-10 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent/20 transition-all placeholder:text-ai-subtext/40"
        onChange={e => {
          const m = mask(e.target.value);
          setText(m);
          if (m.length === 10) commitTyped(m);
        }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (
            !/[0-9/]/.test(e.key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key)
          ) {
            e.preventDefault();
          }
        }}
      />

      {/* Botão do calendário – abre/fecha o popup */}
      <button
        type="button"
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-ai-subtext/60 hover:text-ai-accent hover:bg-ai-surface2 transition-colors"
        aria-label="Abrir calendário de datas"
        onClick={() => setShowCal(p => !p)}
      >
        <CalendarIcon size={16} />
      </button>

      {/* Popup do calendário (Portal – fora do overflow do modal) */}
      {showCal &&
        calPosition &&
        createPortal(
          <div
            ref={calRef}
            className="fixed z-[9999] bg-ai-bg border border-ai-border rounded-lg shadow-xl"
            style={{ top: calPosition.top, left: calPosition.left }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <DatePicker
              selected={selected}
              onChange={(date: Date | null) => {
                if (date) {
                  onChange(toIso(date));
                  setText(fmtBR(date));
                }
                setTimeout(() => setShowCal(false), 0);
              }}
              inline
              locale="pt-BR"
              minDate={minD || undefined}
              maxDate={maxD || undefined}
              dayClassName={dayClassName}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DateInputBR;
