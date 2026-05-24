/**
 * Painel direito do bloco inferior: detalhamento de produtos de UM lançamento.
 *
 * Reaproveita `LancamentoProdutosTable` para edição. Ao salvar via PATCH, o
 * backend recalcula `valorBase` e `distribuicaoMensal` conforme `recorrencia`.
 * O componente envia a lista completa de produtos (replace-all).
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Save, X, Package } from 'lucide-react';
import LancamentoProdutosTable from './LancamentoProdutosTable';
import {
  updateLancamento,
  type LancamentoRow,
  type ProdutoInput,
} from '../../lib/api/lancamentosClient';

interface Props {
  lancamento: LancamentoRow | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (l: LancamentoRow) => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
}

export default function ProdutosDetalhamentoPanel({
  lancamento,
  readOnly,
  onClose,
  onSaved,
  onToast,
}: Props) {
  const [produtos, setProdutos] = useState<ProdutoInput[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!lancamento) return;
    setProdutos(
      lancamento.produtos.map((p) => ({
        nome: p.nome,
        quantidade: Number(p.quantidade),
        unidade: p.unidade ?? 'un',
        valorUnitario: Number(p.valorUnitario),
      })),
    );
    setDirty(false);
  }, [lancamento?.id, lancamento?.produtos.length, lancamento?.updatedAt]);

  if (!lancamento) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
        <Package size={32} className="opacity-40 mb-3" />
        <p className="text-[12px] font-medium text-slate-700 mb-1">Detalhe por produto</p>
        <p className="text-[11px] text-slate-500">
          Clique no ícone{' '}
          <Package size={10} className="inline -mt-0.5 text-emerald-600" /> de uma categoria
          para detalhar produtos aqui.
        </p>
      </div>
    );
  }

  async function salvar() {
    if (!lancamento) return;
    setSalvando(true);
    try {
      const res = await updateLancamento(lancamento.id, { produtos });
      if ('error' in res) {
        onToast?.(`Erro ao salvar produtos: ${res.error}`, 'error');
        setSalvando(false);
        return;
      }
      onSaved(res.data);
      setDirty(false);
      onToast?.('Produtos atualizados.', 'success');
    } catch (err) {
      onToast?.('Erro inesperado ao salvar produtos', 'error');
    } finally {
      setSalvando(false);
    }
  }

  const valorMensalAnualizado = lancamento.valorBase * 12;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[12px] font-semibold text-slate-800 truncate">
            Detalhamento — {lancamento.descricao || 'Lançamento'}
          </h3>
          <p className="text-[10.5px] text-slate-500 truncate">
            Soma dos produtos sobrescreve o "Valor Mensal" do lançamento
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-700 rounded"
          title="Fechar painel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <LancamentoProdutosTable
          produtos={produtos}
          onChange={(novos) => {
            setProdutos(novos);
            setDirty(true);
          }}
          readOnly={readOnly}
          valorMensalAnualizado={valorMensalAnualizado}
        />
      </div>

      <div className="px-3 py-1.5 border-t border-slate-200 bg-white shrink-0 flex items-center justify-end gap-2">
        {!readOnly && (
          <button
            type="button"
            onClick={salvar}
            disabled={!dirty || salvando}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
              dirty && !salvando
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed',
            ].join(' ')}
          >
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar produtos
          </button>
        )}
      </div>
    </div>
  );
}
