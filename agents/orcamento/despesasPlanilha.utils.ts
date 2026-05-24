/**
 * Utilitários puros compartilhados entre o grid de despesas (read-only),
 * a tabela de categorias inferior e cálculos derivados.
 */
import { format, parseISO, addMonths } from 'date-fns';
import type { ContaPlanilha } from '../../lib/api/orcamentoItensClient';
import type { LancamentoRow } from '../../lib/api/lancamentosClient';

export const NOMES_RAIZ: Record<string, string> = {
  '2': 'Agricultura e Silvicultura',
  '3': 'Investimentos',
  '4': 'Mão de Obra Permanente',
  '5': 'Pecuária',
  '6': 'Suporte Produção',
  '8': 'Outros Débitos',
};

/** Gera 12 meses ISO (primeiro dia de cada mês) a partir de dataInicio. */
export function gerarMeses(dataInicioIso: string): string[] {
  const inicio = parseISO(dataInicioIso);
  const meses: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = addMonths(inicio, i);
    meses.push(format(d, 'yyyy-MM-01'));
  }
  return meses;
}

export interface HierarquiaContas {
  childrenById: Map<string | null, ContaPlanilha[]>;
  descendantesFolhasById: Map<string, string[]>;
  porId: Map<string, ContaPlanilha>;
}

export function montarHierarquia(contas: ContaPlanilha[]): HierarquiaContas {
  const childrenById = new Map<string | null, ContaPlanilha[]>();
  const porId = new Map<string, ContaPlanilha>();
  for (const c of contas) {
    porId.set(c.id, c);
    const arr = childrenById.get(c.numeroPaiId) ?? [];
    arr.push(c);
    childrenById.set(c.numeroPaiId, arr);
  }
  const descById = new Map<string, string[]>();
  for (const c of contas) {
    if (c.isFolha) continue;
    const folhas: string[] = [];
    const stack = [...(childrenById.get(c.id) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.isFolha) folhas.push(node.id);
      else stack.push(...(childrenById.get(node.id) ?? []));
    }
    descById.set(c.id, folhas);
  }
  return { childrenById, descendantesFolhasById: descById, porId };
}

/** Devolve todas as folhas-descendentes de uma conta. Se a conta já for folha, retorna [conta.id]. */
export function folhasDescendentes(
  contaId: string,
  hierarquia: HierarquiaContas,
): string[] {
  const c = hierarquia.porId.get(contaId);
  if (!c) return [];
  if (c.isFolha) return [contaId];
  return hierarquia.descendantesFolhasById.get(contaId) ?? [];
}

/**
 * Soma os valores mensais de todos os lançamentos ativos agrupados por folha.
 * Retorna Map<folhaId, Record<mesIso, valor>>.
 */
export function calcularValoresPorFolha(
  lancamentos: LancamentoRow[],
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const l of lancamentos) {
    if (l.status !== 'ativo') continue;
    const cur = out.get(l.planoContaId) ?? {};
    for (const [mes, v] of Object.entries(l.distribuicaoMensal)) {
      cur[mes] = (cur[mes] ?? 0) + Number(v);
    }
    out.set(l.planoContaId, cur);
  }
  return out;
}

/** Agrupa lançamentos por folha (planoContaId). */
export function agruparLancamentosPorFolha(
  lancamentos: LancamentoRow[],
): Map<string, LancamentoRow[]> {
  const out = new Map<string, LancamentoRow[]>();
  for (const l of lancamentos) {
    const arr = out.get(l.planoContaId) ?? [];
    arr.push(l);
    out.set(l.planoContaId, arr);
  }
  return out;
}

/** Soma agregada de uma categoria num mês (ou total geral se mes omitido). */
export function somaCategoria(
  contaId: string,
  hierarquia: HierarquiaContas,
  valoresPorFolha: Map<string, Record<string, number>>,
  mes?: string,
): number {
  const folhas = hierarquia.descendantesFolhasById.get(contaId) ?? [];
  let total = 0;
  for (const folhaId of folhas) {
    const v = valoresPorFolha.get(folhaId);
    if (!v) continue;
    if (mes) {
      const x = v[mes];
      if (typeof x === 'number' && Number.isFinite(x)) total += x;
    } else {
      for (const x of Object.values(v)) {
        if (typeof x === 'number' && Number.isFinite(x)) total += x;
      }
    }
  }
  return total;
}

export function somaFolhaTotal(
  contaId: string,
  valoresPorFolha: Map<string, Record<string, number>>,
): number {
  const v = valoresPorFolha.get(contaId);
  if (!v) return 0;
  let total = 0;
  for (const x of Object.values(v)) {
    if (typeof x === 'number' && Number.isFinite(x)) total += x;
  }
  return total;
}

export function totalGeralPorMes(
  contas: ContaPlanilha[],
  valoresPorFolha: Map<string, Record<string, number>>,
  mes: string,
): number {
  let total = 0;
  for (const c of contas) {
    if (!c.isFolha) continue;
    const v = valoresPorFolha.get(c.id);
    if (v && typeof v[mes] === 'number') total += v[mes];
  }
  return total;
}

export function totalGeralGlobal(
  contas: ContaPlanilha[],
  valoresPorFolha: Map<string, Record<string, number>>,
): number {
  let total = 0;
  for (const c of contas) {
    if (!c.isFolha) continue;
    const v = valoresPorFolha.get(c.id);
    if (!v) continue;
    for (const x of Object.values(v)) {
      if (typeof x === 'number') total += x;
    }
  }
  return total;
}

/**
 * Distribui um valor mensal conforme a recorrência:
 * - 'mensal': mesmo valor em todos os 12 meses
 * - 'sazonal': mesmo valor apenas nos meses ativos passados em mesesAtivos
 * - 'unica': mesmo valor apenas no primeiro mês de mesesAtivos (ou meses[0])
 */
export function distribuirValor(
  valorMensal: number,
  recorrencia: 'mensal' | 'sazonal' | 'unica',
  meses: string[],
  mesesAtivos?: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (recorrencia === 'mensal') {
    for (const m of meses) out[m] = valorMensal;
    return out;
  }
  if (recorrencia === 'sazonal') {
    const ativos = mesesAtivos && mesesAtivos.length > 0 ? mesesAtivos : meses;
    for (const m of ativos) out[m] = valorMensal;
    return out;
  }
  // unica (preservado para lançamentos legados; UI nova não cria)
  const primeiro = mesesAtivos?.[0] ?? meses[0];
  if (primeiro) out[primeiro] = valorMensal;
  return out;
}

/** Detecta os meses com valor > 0 num mapa de distribuição. */
export function mesesAtivosDe(
  distribuicaoMensal: Record<string, number>,
): string[] {
  return Object.entries(distribuicaoMensal)
    .filter(([, v]) => v > 0)
    .map(([m]) => m)
    .sort();
}

/** Valor mensal médio (total ÷ n_meses_ativos). 0 se nenhum mês ativo. */
export function valorMensalMedio(
  distribuicaoMensal: Record<string, number>,
): number {
  const ativos = mesesAtivosDe(distribuicaoMensal);
  if (ativos.length === 0) return 0;
  const total = ativos.reduce((a, m) => a + (distribuicaoMensal[m] ?? 0), 0);
  return total / ativos.length;
}

/**
 * Combinação Centro de Custo × Subcentro derivada do plano de contas:
 * - CC: raiz (nivel === 1)
 * - Subcentro: filho de nivel 2 (ou o próprio CC se ele for folha)
 * Cada combinação carrega a lista de folhas-descendentes (= categorias).
 */
export interface CentroCustoSub {
  /** Identificador estável: `${ccId}|${subId}`. */
  id: string;
  ccId: string;
  ccNome: string;
  subId: string;
  subNome: string;
  /** Folhas-descendentes do subcentro (= categorias lançáveis). */
  folhasIds: string[];
}

/**
 * Devolve as combinações CC×Subcentro existentes no plano de contas,
 * filtradas para incluir apenas subcentros com folhas-descendentes.
 */
export function listarCentrosCustoSubs(
  hierarquia: HierarquiaContas,
): CentroCustoSub[] {
  const out: CentroCustoSub[] = [];
  const raizes = hierarquia.childrenById.get(null) ?? [];
  for (const cc of raizes) {
    const filhos = hierarquia.childrenById.get(cc.id) ?? [];
    if (cc.isFolha) {
      // CC sem subcentros — usa o próprio como linha
      out.push({
        id: `${cc.id}|${cc.id}`,
        ccId: cc.id,
        ccNome: cc.nome,
        subId: cc.id,
        subNome: '—',
        folhasIds: [cc.id],
      });
      continue;
    }
    for (const sub of filhos) {
      const folhasIds = sub.isFolha
        ? [sub.id]
        : hierarquia.descendantesFolhasById.get(sub.id) ?? [];
      if (folhasIds.length === 0) continue;
      out.push({
        id: `${cc.id}|${sub.id}`,
        ccId: cc.id,
        ccNome: cc.nome,
        subId: sub.id,
        subNome: sub.nome,
        folhasIds,
      });
    }
  }
  return out;
}

/** Soma o valor de várias folhas num mês específico (ou total se mes omitido). */
export function somaFolhasNoMes(
  folhasIds: string[],
  valoresPorFolha: Map<string, Record<string, number>>,
  mes?: string,
): number {
  let total = 0;
  for (const fid of folhasIds) {
    const v = valoresPorFolha.get(fid);
    if (!v) continue;
    if (mes) {
      const x = v[mes];
      if (typeof x === 'number' && Number.isFinite(x)) total += x;
    } else {
      for (const x of Object.values(v)) {
        if (typeof x === 'number' && Number.isFinite(x)) total += x;
      }
    }
  }
  return total;
}
