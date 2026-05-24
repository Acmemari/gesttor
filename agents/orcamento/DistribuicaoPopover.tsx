/**
 * Popover de distribuição com abas Mensal igual | Sazonal.
 *
 * - Mensal igual: texto explicativo, sem configuração extra.
 * - Sazonal: grid 6×2 com chips dos 12 meses (Jul → Jun).
 *
 * Não existe modo "Único" — para lançamento pontual, o usuário marca um
 * único mês na aba Sazonal.
 */
import React, { useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type DistribuicaoTipo = 'mensal' | 'sazonal';

interface Props {
  /** 12 meses ISO 'YYYY-MM-01' (Jul → Jun do orçamento). */
  meses: string[];
  tipo: DistribuicaoTipo;
  mesesAtivos: string[];
  readOnly?: boolean;
  onChangeTipo: (tipo: DistribuicaoTipo) => void;
  onChangeMesesAtivos: (meses: string[]) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

export default function DistribuicaoPopover({
  meses,
  tipo,
  mesesAtivos,
  readOnly = false,
  onChangeTipo,
  onChangeMesesAtivos,
  onClose,
  align = 'left',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ativos = new Set(mesesAtivos);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  function toggle(mes: string) {
    if (readOnly) return;
    const next = new Set(ativos);
    if (next.has(mes)) next.delete(mes);
    else next.add(mes);
    const ordered = meses.filter((m) => next.has(m));
    onChangeMesesAtivos(ordered);
  }

  const nAtivos = ativos.size;
  const labelMeses = nAtivos === 1 ? 'mês' : 'meses';

  return (
    <div
      ref={ref}
      className={[
        'absolute z-50 mt-1 w-80 rounded-md border border-slate-300 bg-white shadow-lg',
        align === 'right' ? 'right-0' : 'left-0',
      ].join(' ')}
    >
      {/* Abas */}
      <div className="flex border-b border-slate-200 p-1.5 gap-1">
        <button
          type="button"
          onClick={() => onChangeTipo('mensal')}
          disabled={readOnly}
          className={[
            'flex-1 px-3 py-1.5 text-xs rounded transition-colors',
            tipo === 'mensal'
              ? 'bg-emerald-600 text-white font-medium'
              : 'text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          Mensal igual
        </button>
        <button
          type="button"
          onClick={() => onChangeTipo('sazonal')}
          disabled={readOnly}
          className={[
            'flex-1 px-3 py-1.5 text-xs rounded transition-colors',
            tipo === 'sazonal'
              ? 'bg-emerald-600 text-white font-medium'
              : 'text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          Sazonal
        </button>
      </div>

      {tipo === 'mensal' ? (
        <div className="px-4 py-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Total dividido <strong>igualmente</strong> entre os 12 meses.
          </p>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Meses ativos
          </div>
          <div className="px-3 pb-3 grid grid-cols-6 gap-1.5">
            {meses.map((mes) => {
              const ativo = ativos.has(mes);
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => toggle(mes)}
                  disabled={readOnly}
                  className={[
                    'px-1.5 py-1 text-[11px] rounded border transition-colors',
                    ativo
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 ring-1 ring-emerald-200'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-700',
                    readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {format(parseISO(mes), 'MMM', { locale: ptBR })}
                </button>
              );
            })}
          </div>
          <div className="px-3 pb-3 text-[11px] text-slate-500">
            {nAtivos} {labelMeses} · valor dividido entre eles
          </div>
        </>
      )}

      <div className="px-3 py-2 border-t border-slate-200 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
