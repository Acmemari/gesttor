/**
 * Tabela editável de produtos: nome, quantidade, unidade, valor unitário, subtotal.
 * Linhas adicionáveis dinamicamente. Quando há produtos, a soma define o valor.
 */
import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { formatBRL, formatBRLFull, parseBRL } from '../../lib/format/brl';
import type { ProdutoInput } from '../../lib/api/lancamentosClient';

interface Props {
  produtos: ProdutoInput[];
  onChange: (produtos: ProdutoInput[]) => void;
  readOnly?: boolean;
  /** Valor mensal × 12 (referência pra comparar) */
  valorMensalAnualizado?: number;
}

const UNIDADES_COMUNS = ['un', 'L', 'kg', 'sc', 'ha', 'cab', 'h', 'mês'];

export default function LancamentoProdutosTable({
  produtos,
  onChange,
  readOnly = false,
  valorMensalAnualizado,
}: Props) {
  function adicionar() {
    onChange([...produtos, { nome: '', quantidade: 0, unidade: 'un', valorUnitario: 0 }]);
  }

  function remover(idx: number) {
    onChange(produtos.filter((_, i) => i !== idx));
  }

  function atualizar(idx: number, patch: Partial<ProdutoInput>) {
    onChange(produtos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  const somaAnual = produtos.reduce((acc, p) => acc + Number(p.quantidade) * Number(p.valorUnitario), 0);

  const divergencia =
    valorMensalAnualizado !== undefined && valorMensalAnualizado > 0
      ? (somaAnual - valorMensalAnualizado) / valorMensalAnualizado
      : null;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-12 gap-1 px-2 py-1 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        <div className="col-span-5">Produto</div>
        <div className="col-span-2 text-right">Qtd</div>
        <div className="col-span-1 text-center">Un</div>
        <div className="col-span-2 text-right">Vl. Unit</div>
        <div className="col-span-2 text-right">Total</div>
      </div>

      {produtos.length === 0 ? (
        <div className="px-2 py-3 text-center text-[11px] text-slate-400">
          Nenhum produto detalhado.
        </div>
      ) : (
        produtos.map((p, idx) => {
          const subtotal = Number(p.quantidade) * Number(p.valorUnitario);
          return (
            <div key={idx} className="grid grid-cols-12 gap-1 px-2 py-1 border-b border-slate-100 items-center">
              <input
                type="text"
                value={p.nome}
                onChange={(e) => atualizar(idx, { nome: e.target.value })}
                disabled={readOnly}
                placeholder="Ex.: Vacina aftosa"
                className="col-span-5 px-1.5 py-0.5 text-[11px] border border-transparent rounded hover:border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <input
                type="text"
                inputMode="decimal"
                value={p.quantidade ? String(p.quantidade).replace('.', ',') : ''}
                onChange={(e) => {
                  const n = parseBRL(e.target.value);
                  atualizar(idx, { quantidade: n ?? 0 });
                }}
                disabled={readOnly}
                placeholder="0"
                className="col-span-2 px-1.5 py-0.5 text-[11px] text-right border border-transparent rounded hover:border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <select
                value={p.unidade ?? 'un'}
                onChange={(e) => atualizar(idx, { unidade: e.target.value })}
                disabled={readOnly}
                className="col-span-1 px-0.5 py-0.5 text-[10.5px] border border-transparent rounded hover:border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
              >
                {UNIDADES_COMUNS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={p.valorUnitario ? String(p.valorUnitario).replace('.', ',') : ''}
                onChange={(e) => {
                  const n = parseBRL(e.target.value);
                  atualizar(idx, { valorUnitario: n ?? 0 });
                }}
                disabled={readOnly}
                placeholder="0,00"
                className="col-span-2 px-1.5 py-0.5 text-[11px] text-right border border-transparent rounded hover:border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="col-span-2 flex items-center justify-end gap-1">
                <span className="text-[11px] font-medium text-slate-700">
                  {subtotal > 0 ? formatBRLFull(subtotal) : '—'}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remover(idx)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title="Remover"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {!readOnly && (
        <div className="px-2 py-1.5 border-b border-slate-100">
          <button
            type="button"
            onClick={adicionar}
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium"
          >
            <Plus size={11} />
            Adicionar produto
          </button>
        </div>
      )}

      {/* Footer com totais e divergência */}
      <div className="px-2 py-1.5 bg-slate-900 text-white flex items-center justify-between text-[11px]">
        <div>
          <span className="uppercase tracking-wide text-slate-400 text-[10px]">Soma Anual</span>
          <div className="text-[12px] font-semibold">{formatBRLFull(somaAnual)}</div>
        </div>
        {valorMensalAnualizado !== undefined && (
          <div className="text-right">
            <span className="uppercase tracking-wide text-slate-400 text-[10px]">
              vs Valor Mensal × 12
            </span>
            <div
              className={[
                'text-[12px] font-semibold',
                divergencia === null
                  ? 'text-white'
                  : Math.abs(divergencia) < 0.05
                    ? 'text-emerald-300'
                    : 'text-amber-300',
              ].join(' ')}
            >
              {formatBRLFull(somaAnual - valorMensalAnualizado)}
              {divergencia !== null && (
                <span className="ml-1 text-[10.5px]">
                  ({(divergencia * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
