import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import VersaoBadge from './VersaoBadge';
import type { OrcamentoVersao, OrcamentoStatus } from './types';

interface VersaoDropdownProps {
  versoes: OrcamentoVersao[];
  versaoAtivaId: string | null;
  onChange: (id: string) => void;
}

export default function VersaoDropdown({ versoes, versaoAtivaId, onChange }: VersaoDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? versoes[0];
  if (!ativa) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-400"
      >
        Sem versão
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <span>{ativa.nome}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-72 rounded-md border border-slate-200 bg-white shadow-lg z-50 max-h-80 overflow-y-auto">
          <ul className="py-1">
            {versoes.map((v) => {
              const isActive = v.id === ativa.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(v.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${isActive ? 'bg-slate-50' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate font-medium text-slate-800">{v.nome}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(v.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <VersaoBadge status={v.tipo as OrcamentoStatus} size="sm" showTooltip={false} />
                      {isActive && <Check size={14} className="text-emerald-600" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
