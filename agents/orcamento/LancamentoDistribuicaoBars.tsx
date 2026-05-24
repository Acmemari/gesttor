/**
 * Distribuição mensal visual: 12 barras clicáveis com input inline para ajustes
 * pontuais. Barras "padrão" são cinza; barras com override viram amarelas.
 *
 * Para recorrência:
 * - mensal:  todas barras começam com valorBase; cliques permitem override
 * - sazonal: barras começam ocultas (zeradas); cliques ATIVAM o mês
 * - unica:   apenas 1 barra ativa, escolhida pelo mês inicial
 */
import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL, parseBRL } from '../../lib/format/brl';
import type { Recorrencia } from '../../lib/api/lancamentosClient';

interface Props {
  /** 12 meses ISO 'YYYY-MM-01' do orçamento. */
  meses: string[];
  recorrencia: Recorrencia;
  valorBase: number;
  /** Mapa atual (override por mês). Vazio = usar valorBase. */
  distribuicaoMensal: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  readOnly?: boolean;
}

export default function LancamentoDistribuicaoBars({
  meses,
  recorrencia,
  valorBase,
  distribuicaoMensal,
  onChange,
  readOnly = false,
}: Props) {
  const [editingMes, setEditingMes] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Maior valor pra escalar altura das barras
  const valorPorMes = meses.map((m) => {
    const explicito = distribuicaoMensal[m];
    if (explicito !== undefined) return explicito;
    if (recorrencia === 'mensal') return valorBase;
    return 0;
  });
  const maxVal = Math.max(1, ...valorPorMes.map((v) => Math.abs(v)));

  function commitMes(mes: string, valor: number | null) {
    const next = { ...distribuicaoMensal };
    if (valor === null || valor === 0) {
      // Mensal: zerar = override pra 0 (não remove — mas se igual ao base, remove)
      // Sazonal/única: zerar = remover a chave (desativar mês)
      if (recorrencia === 'mensal' && valor === null) {
        delete next[mes];
      } else if (recorrencia !== 'mensal') {
        delete next[mes];
      } else {
        next[mes] = 0;
      }
    } else {
      next[mes] = valor;
    }
    onChange(next);
    setEditingMes(null);
  }

  function startEdit(mes: string) {
    if (readOnly) return;
    const atual = distribuicaoMensal[mes] ?? (recorrencia === 'mensal' ? valorBase : 0);
    setDraft(atual ? String(atual).replace('.', ',') : '');
    setEditingMes(mes);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
          Distribuição mensal
        </span>
        <span className="text-[10px] text-slate-400">
          {recorrencia === 'mensal' && 'Clique numa barra pra ajustar pontualmente'}
          {recorrencia === 'sazonal' && 'Clique pra ativar/desativar o mês'}
          {recorrencia === 'unica' && 'Clique no mês do lançamento'}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-1 h-24">
        {meses.map((mes) => {
          const valor = distribuicaoMensal[mes];
          const usandoBase = valor === undefined;
          const valorEfetivo = valor !== undefined ? valor : recorrencia === 'mensal' ? valorBase : 0;
          const altura = maxVal > 0 ? Math.max(4, (Math.abs(valorEfetivo) / maxVal) * 100) : 4;
          const ativo = valorEfetivo > 0 || (recorrencia === 'mensal' && valor !== 0);
          const overrideado = !usandoBase && recorrencia === 'mensal';

          return (
            <button
              key={mes}
              type="button"
              onClick={() => startEdit(mes)}
              disabled={readOnly}
              title={`${format(parseISO(mes), 'MMM/yy', { locale: ptBR })} — ${formatBRL(valorEfetivo) || '—'}`}
              className={[
                'relative flex items-end justify-center rounded transition-colors',
                ativo
                  ? overrideado
                    ? 'bg-amber-400 hover:bg-amber-500'
                    : 'bg-emerald-400 hover:bg-emerald-500'
                  : 'bg-slate-200 hover:bg-slate-300',
                readOnly ? 'cursor-default' : 'cursor-pointer',
              ].join(' ')}
              style={{ height: `${altura}%`, minHeight: 4 }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-12 gap-1 mt-1">
        {meses.map((mes) => (
          <div key={`label-${mes}`} className="text-center text-[9px] text-slate-500 uppercase">
            {format(parseISO(mes), 'MMM', { locale: ptBR })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-1 mt-0.5">
        {meses.map((mes) => {
          const valor = distribuicaoMensal[mes] ?? (recorrencia === 'mensal' ? valorBase : 0);
          return (
            <div key={`val-${mes}`} className="text-center text-[9px] text-slate-600 font-mono leading-tight">
              {valor > 0 ? formatBRL(valor) : '—'}
            </div>
          );
        })}
      </div>

      {/* Inline editor */}
      {editingMes && (
        <div className="mt-3 flex items-center gap-2 bg-white rounded p-2 border border-emerald-300">
          <span className="text-xs text-slate-500">
            {format(parseISO(editingMes), 'MMMM/yyyy', { locale: ptBR })}:
          </span>
          <span className="text-xs text-slate-400">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMes(editingMes, parseBRL(draft));
              if (e.key === 'Escape') setEditingMes(null);
            }}
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:border-emerald-500 focus:outline-none"
            placeholder={recorrencia === 'mensal' ? String(valorBase) : '0'}
          />
          <button
            type="button"
            onClick={() => commitMes(editingMes, parseBRL(draft))}
            className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            OK
          </button>
          {distribuicaoMensal[editingMes] !== undefined && (
            <button
              type="button"
              onClick={() => commitMes(editingMes, null)}
              className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
            >
              {recorrencia === 'mensal' ? 'Resetar' : 'Desativar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
