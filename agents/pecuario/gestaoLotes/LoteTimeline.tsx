import React from 'react';
import { History } from 'lucide-react';
import type { TimelineItem } from './types';
import { formatDateBR } from './util';

/** Biografia do lote: todos os eventos do mais recente ao mais antigo. */
const LoteTimeline: React.FC<{ items: TimelineItem[] }> = ({ items }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <History size={16} className="text-gray-400" />
        <h4 className="text-[14px] font-bold text-gray-900">Linha do tempo do lote</h4>
      </div>
      <p className="mb-4 text-[12px] text-gray-500">A biografia do lote — base de toda análise de desempenho.</p>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12.5px] text-gray-400">
          Nenhum evento ainda. Lance o primeiro movimento acima.
        </div>
      ) : (
        <ol className="relative ml-1.5 border-l border-gray-200">
          {items.map((it) => (
            <li key={it.id} className="relative ml-5 pb-5 last:pb-0">
              <span
                className="absolute -left-[26px] top-0.5 h-3 w-3 rounded-full ring-4 ring-white"
                style={{ backgroundColor: it.cor }}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[13.5px] font-bold text-gray-900">{it.titulo}</span>
                <span className="text-[11.5px] font-semibold text-gray-400">{formatDateBR(it.data)}</span>
              </div>
              {it.meta && <p className="mt-0.5 text-[12.5px] text-gray-600">{it.meta}</p>}
              {it.resp && <p className="mt-0.5 text-[11.5px] text-gray-400">Responsável: {it.resp}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default LoteTimeline;
