/**
 * Cascata Centro → Subcentro → Categoria → Folha (4 selects).
 *
 * Trabalha com o plano de contas hierárquico (nivel 1..4). O usuário pode parar
 * em qualquer nível folha (não precisa chegar até 4). A seleção final é uma
 * conta com `isFolha=true`.
 */
import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { PlanoContaRow } from '../../lib/api/orcamentosClient';

interface Props {
  contas: PlanoContaRow[];
  /** Apenas raízes de despesa: '2','3','4','5','6','8'. */
  raizesPermitidas?: string[];
  selectedId: string | null;
  onChange: (planoContaId: string | null) => void;
  disabled?: boolean;
}

const RAIZES_DESPESA_DEFAULT = ['2', '3', '4', '5', '6', '8'];

export default function LancamentoCascata({
  contas,
  raizesPermitidas = RAIZES_DESPESA_DEFAULT,
  selectedId,
  onChange,
  disabled = false,
}: Props) {
  // Index by id + by parent
  const { byId, childrenOf } = useMemo(() => {
    const byId = new Map<string, PlanoContaRow>();
    const childrenOf = new Map<string | null, PlanoContaRow[]>();
    for (const c of contas) {
      if (!c.ativo) continue;
      byId.set(c.id, c);
      const arr = childrenOf.get(c.numeroPaiId) ?? [];
      arr.push(c);
      childrenOf.set(c.numeroPaiId, arr);
    }
    // Ordena numericamente por numero
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => {
        const pa = a.numero.split('.').map(Number);
        const pb = b.numero.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const x = pa[i] ?? 0;
          const y = pb[i] ?? 0;
          if (x !== y) return x - y;
        }
        return 0;
      });
    }
    return { byId, childrenOf };
  }, [contas]);

  // Caminho do nó selecionado até a raiz
  const caminho: PlanoContaRow[] = useMemo(() => {
    if (!selectedId) return [];
    const path: PlanoContaRow[] = [];
    let cur: PlanoContaRow | undefined = byId.get(selectedId);
    while (cur) {
      path.unshift(cur);
      cur = cur.numeroPaiId ? byId.get(cur.numeroPaiId) : undefined;
    }
    return path;
  }, [selectedId, byId]);

  // Raízes permitidas (nivel 1, numero ∈ raizesPermitidas)
  const raizes = useMemo(
    () => (childrenOf.get(null) ?? []).filter((c) => raizesPermitidas.includes(c.numero)),
    [childrenOf, raizesPermitidas],
  );

  // Helper: opções de um nível dado o pai
  function opcoesDoNivel(nivel: number): PlanoContaRow[] {
    if (nivel === 0) return raizes;
    const pai = caminho[nivel - 1];
    if (!pai) return [];
    return childrenOf.get(pai.id) ?? [];
  }

  function selecionarNivel(nivel: number, novoId: string | null) {
    if (!novoId) {
      // Cancelou: corta o caminho a partir desse nível
      const novoCaminho = caminho.slice(0, nivel);
      onChange(novoCaminho.length > 0 ? novoCaminho[novoCaminho.length - 1].id : null);
      return;
    }
    onChange(novoId);
  }

  const niveisRender = [0, 1, 2, 3]; // até 4 níveis

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {niveisRender.slice(0, 3).map((nivel) => {
          const opcoes = opcoesDoNivel(nivel);
          const valorAtual = caminho[nivel]?.id ?? '';
          const labels = ['Centro de custo', 'Subcentro', 'Categoria'];
          if (opcoes.length === 0 && nivel > 0) return null;
          return (
            <div key={nivel}>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                {labels[nivel]}
                {nivel === 0 && <span className="text-red-500">*</span>}
              </label>
              <select
                value={valorAtual}
                onChange={(e) => selecionarNivel(nivel, e.target.value || null)}
                disabled={disabled || (nivel > 0 && opcoes.length === 0)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">— selecione —</option>
                {opcoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Nível 4 (folha) — só aparece se houver filhos do nível 3 selecionado */}
      {(() => {
        const opcoes = opcoesDoNivel(3);
        if (opcoes.length === 0) return null;
        const valorAtual = caminho[3]?.id ?? '';
        return (
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Detalhe
            </label>
            <select
              value={valorAtual}
              onChange={(e) => selecionarNivel(3, e.target.value || null)}
              disabled={disabled}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">— selecione —</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        );
      })()}

      {/* Breadcrumb visual */}
      {caminho.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500 pt-1">
          {caminho.map((c, idx) => (
            <React.Fragment key={c.id}>
              {idx > 0 && <ChevronRight size={10} className="text-slate-400" />}
              <span
                className={[
                  'inline-flex items-center px-2 py-0.5 rounded',
                  c.isFolha
                    ? 'bg-emerald-100 text-emerald-800 font-medium'
                    : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {c.nome}
              </span>
            </React.Fragment>
          ))}
          {caminho[caminho.length - 1]?.isFolha === false && (
            <span className="text-amber-700 ml-2">Selecione um nível folha</span>
          )}
        </div>
      )}
    </div>
  );
}
