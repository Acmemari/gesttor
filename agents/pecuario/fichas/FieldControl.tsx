import React from 'react';
import type { LrField, LookupItem } from './types';

interface FieldControlProps {
  field: LrField;
  value: string;
  onChange: (value: string) => void;
  categories: LookupItem[];
  lotes: LookupItem[];
  /** Listas dinâmicas para campos 'lookup' (ex.: { motivo: motivos }). */
  lookups?: Record<string, LookupItem[]>;
  /** Sobrescreve as opções estáticas de campos 'select' por id (ex.: raças cadastradas). */
  optionsOverride?: Record<string, string[]>;
  /** linha de lançamento (por animal) usa controles menores. */
  compact?: boolean;
  /** grid de Dados Adicionais. */
  grid?: boolean;
}

const baseInput =
  'w-full rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 transition-colors';

const FieldControl: React.FC<FieldControlProps> = ({
  field,
  value,
  onChange,
  categories,
  lotes,
  lookups,
  optionsOverride,
  compact = false,
  grid = false,
}) => {
  const sizing = compact ? 'h-[38px] px-2 text-[12.5px]' : 'h-10 px-3 text-sm';
  const inputCls = `${baseInput} ${sizing}`;
  const labelCls = `font-semibold text-gray-700 truncate ${compact ? 'text-[11px]' : grid ? 'text-xs' : 'text-[12.5px]'}`;

  const control = () => {
    switch (field.type) {
      case 'text':
        return (
          <input
            className={inputCls}
            placeholder={field.placeholder || ''}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'textarea':
        return (
          <textarea
            className={`${baseInput} px-3 py-2 text-sm resize-y`}
            rows={2}
            placeholder={field.placeholder || ''}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'number':
        return (
          <input
            type="text"
            inputMode="decimal"
            className={inputCls}
            placeholder={field.placeholder || ''}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            className={inputCls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'weight':
        return (
          <div className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 ${compact ? 'h-[38px]' : 'h-10'} focus-within:border-[#16a34a] focus-within:ring-[3px] focus-within:ring-[#16a34a]/15`}>
            <input
              type="text"
              inputMode="decimal"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-gray-800 outline-none tabular-nums"
              placeholder="0,0"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <span className="shrink-0 text-xs font-bold text-[#16a34a]">Kg</span>
          </div>
        );
      case 'money':
        return (
          <div className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 ${compact ? 'h-[38px]' : 'h-10'} focus-within:border-[#16a34a] focus-within:ring-[3px] focus-within:ring-[#16a34a]/15`}>
            <span className="shrink-0 text-xs font-bold text-[#16a34a]">R$</span>
            <input
              type="text"
              inputMode="decimal"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-gray-800 outline-none tabular-nums"
              placeholder={field.placeholder || '0,00'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        );
      case 'sexo':
        return (
          <select className={inputCls} value={value || 'Macho'} onChange={(e) => onChange(e.target.value)}>
            <option value="Macho">♂ M</option>
            <option value="Fêmea">♀ F</option>
          </select>
        );
      case 'cat':
        return (
          <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Selecione</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        );
      case 'lote':
        return (
          <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        );
      case 'lookup': {
        const opts = lookups?.[field.lookupKey ?? field.id] ?? [];
        return (
          <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{field.placeholder || 'Selecione'}</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        );
      }
      case 'select': {
        const opts = optionsOverride?.[field.id] ?? field.options ?? [];
        return (
          <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
            {field.placeholder ? <option value="">{field.placeholder}</option> : null}
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className={labelCls}>
        {field.label}
        {field.req ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {control()}
    </div>
  );
};

export default FieldControl;
