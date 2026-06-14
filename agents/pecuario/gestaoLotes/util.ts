/**
 * Selectors PUROS da Gestão de Lotes + formatadores.
 *
 * Toda a verdade dos estados do lote (saldo, composição, local, regime, fase)
 * é derivada aqui a partir do ledger de eventos (lote_eventos). Nenhum estado é
 * guardado diretamente — só eventos. Estas funções são testadas em isolamento.
 */
import type {
  LoteEventoRow,
  TimelineItem,
  AlocacaoDados,
  TransferenciaDados,
  ManejoDados,
  ReproDados,
} from './types';

// ── Datas ─────────────────────────────────────────────────────────────────────

/** Data de hoje em ISO 'AAAA-MM-DD' (horário local). */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Formata 'AAAA-MM-DD' → 'DD/MM/AAAA' (sem efeitos de fuso). */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

// ── Ordenação ───────────────────────────────────────────────────────────────

/** Compara eventos por (data, createdAt) crescente. */
function byDataAsc(a: LoteEventoRow, b: LoteEventoRow): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

/** Último evento (mais recente) que satisfaz o predicado, ou null. */
function ultimo(
  eventos: LoteEventoRow[],
  pred: (e: LoteEventoRow) => boolean,
): LoteEventoRow | null {
  let melhor: LoteEventoRow | null = null;
  for (const e of eventos) {
    if (!pred(e)) continue;
    if (melhor === null || byDataAsc(melhor, e) <= 0) melhor = e;
  }
  return melhor;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── Selectors de estado ───────────────────────────────────────────────────────

/** Local atual = `para` da última transferência; senão '—'. */
export function localAtual(eventos: LoteEventoRow[]): string {
  const e = ultimo(eventos, (x) => x.tipo === 'transferencia');
  return e ? ((e.dados as TransferenciaDados).para || '—') : '—';
}

/** Plano nutricional vigente = `plano` do último manejo nutricional; senão null. */
export function planoNutri(eventos: LoteEventoRow[]): string | null {
  const e = ultimo(eventos, (x) => x.tipo === 'manejo' && (x.dados as ManejoDados).dim === 'nutricional');
  return e ? ((e.dados as ManejoDados).plano || null) : null;
}

/** Protocolo reprodutivo ativo = `plano` do último manejo reprodutivo; senão null. */
export function protocolo(eventos: LoteEventoRow[]): string | null {
  const e = ultimo(eventos, (x) => x.tipo === 'manejo' && (x.dados as ManejoDados).dim === 'reprodutivo');
  return e ? ((e.dados as ManejoDados).plano || null) : null;
}

/** Último evento reprodutivo (para fase + detalhe + data). */
export function ultimoRepro(eventos: LoteEventoRow[]): LoteEventoRow | null {
  return ultimo(eventos, (x) => x.tipo === 'repro');
}

/** Fase reprodutiva = `fase` do último evento repro; senão "Sem evento reprodutivo". */
export function faseRepro(eventos: LoteEventoRow[]): string {
  const e = ultimoRepro(eventos);
  return e ? ((e.dados as ReproDados).fase || 'Sem evento reprodutivo') : 'Sem evento reprodutivo';
}

/** Saldo = Σ entradas − Σ saídas (alocações). */
export function saldo(eventos: LoteEventoRow[]): number {
  let total = 0;
  for (const e of eventos) {
    if (e.tipo !== 'alocacao') continue;
    const d = e.dados as AlocacaoDados;
    const q = num(d.qtd) || (Array.isArray(d.animais) ? d.animais.length : 0);
    total += d.sentido === 'saida' ? -q : q;
  }
  return total;
}

export interface ComposicaoLinha {
  categoriaId: string | null;
  categoriaNome?: string;
  qtd: number;
}

/** Composição = mapa categoria→quantidade líquida (entradas − saídas), só qtd > 0. */
export function composicao(eventos: LoteEventoRow[]): ComposicaoLinha[] {
  const acc = new Map<string, ComposicaoLinha>();
  for (const e of eventos) {
    if (e.tipo !== 'alocacao') continue;
    const d = e.dados as AlocacaoDados;
    const q = num(d.qtd) || (Array.isArray(d.animais) ? d.animais.length : 0);
    const key = d.categoriaId || `@${d.categoriaNome || ''}`;
    const cur = acc.get(key) || { categoriaId: d.categoriaId ?? null, categoriaNome: d.categoriaNome, qtd: 0 };
    cur.qtd += d.sentido === 'saida' ? -q : q;
    if (!cur.categoriaNome && d.categoriaNome) cur.categoriaNome = d.categoriaNome;
    acc.set(key, cur);
  }
  return Array.from(acc.values()).filter((l) => l.qtd > 0);
}

/**
 * Pendências por categoria = mapa categoria→cabeças SEM identificação líquidas
 * (Σ naoIdent entradas − Σ naoIdent saídas), só qtd > 0. Espelha `composicao`,
 * mas conta `naoIdent` em vez de `qtd` — é a base para gerir as cabeças que
 * entraram "por categoria" (incluir, baixar, transferir, identificar).
 */
export function pendenciasPorCategoria(eventos: LoteEventoRow[]): ComposicaoLinha[] {
  const acc = new Map<string, ComposicaoLinha>();
  for (const e of eventos) {
    if (e.tipo !== 'alocacao') continue;
    const d = e.dados as AlocacaoDados;
    const n = num(d.naoIdent);
    if (n === 0) continue;
    const key = d.categoriaId || `@${d.categoriaNome || ''}`;
    const cur = acc.get(key) || { categoriaId: d.categoriaId ?? null, categoriaNome: d.categoriaNome, qtd: 0 };
    cur.qtd += d.sentido === 'saida' ? -n : n;
    if (!cur.categoriaNome && d.categoriaNome) cur.categoriaNome = d.categoriaNome;
    acc.set(key, cur);
  }
  return Array.from(acc.values()).filter((l) => l.qtd > 0);
}

/** Pendências = Σ naoIdent das entradas − Σ naoIdent das saídas (clamp ≥ 0). */
export function pendencias(eventos: LoteEventoRow[]): number {
  let total = 0;
  for (const e of eventos) {
    if (e.tipo !== 'alocacao') continue;
    const d = e.dados as AlocacaoDados;
    const n = num(d.naoIdent);
    total += d.sentido === 'saida' ? -n : n;
  }
  return Math.max(0, total);
}

/** Animais vinculados = IDs que entraram por ID e não saíram (dedup, ordem de entrada). */
export function animaisVinculados(eventos: LoteEventoRow[]): string[] {
  const ordenados = [...eventos].sort(byDataAsc);
  const set = new Set<string>();
  for (const e of ordenados) {
    if (e.tipo !== 'alocacao') continue;
    const d = e.dados as AlocacaoDados;
    if (!Array.isArray(d.animais)) continue;
    for (const id of d.animais) {
      if (d.sentido === 'saida') set.delete(id);
      else set.add(id);
    }
  }
  return Array.from(set);
}

/** Primeiro lote cujo `animaisVinculados` contém o ID (null = sem lote). */
export function loteDoAnimal(
  animalId: string,
  eventosByLote: Record<string, LoteEventoRow[]>,
): string | null {
  for (const [loteId, eventos] of Object.entries(eventosByLote)) {
    if (animaisVinculados(eventos).includes(animalId)) return loteId;
  }
  return null;
}

/** Mapa animalId → loteId derivado do ledger (vínculo por ID), para toda a org. */
export function ledgerLoteByAnimal(
  eventosByLote: Record<string, LoteEventoRow[]>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [loteId, eventos] of Object.entries(eventosByLote)) {
    for (const id of animaisVinculados(eventos)) map.set(id, loteId);
  }
  return map;
}

/** Resolve o texto livre de `ficha.lote` para um id de lote real (por id, nome ou código). */
export function resolveLoteIdFromText(
  text: string | null | undefined,
  lotes: { id: string; nome: string; codigo: string | null }[],
): string | null {
  if (!text || !text.trim()) return null;
  const t = text.trim().toLowerCase();
  const hit = lotes.find(
    (l) =>
      l.id.toLowerCase() === t ||
      l.nome.trim().toLowerCase() === t ||
      (l.codigo || '').trim().toLowerCase() === t,
  );
  return hit?.id ?? null;
}

// ── Linha do tempo (biografia do lote) ────────────────────────────────────────

const COR_POR_TIPO: Record<string, string> = {
  alocacao: '#f97316',     // laranja
  transferencia: '#0891b2', // ciano (Localização)
  manejo: '#16a34a',        // verde
  repro: '#0d9488',         // teal
};

interface TimelineResolvers {
  catNome?: (id: string | null) => string;
  loteNome?: (id: string | null) => string;
}

/** Linha do tempo: todos os eventos do lote, do mais recente ao mais antigo. */
export function timeline(eventos: LoteEventoRow[], resolvers: TimelineResolvers = {}): TimelineItem[] {
  const catNome = resolvers.catNome ?? (() => '');
  const loteNome = resolvers.loteNome ?? ((id) => id ?? '');

  const items = eventos.map((e): TimelineItem => {
    let titulo = '';
    let meta = '';
    if (e.tipo === 'alocacao') {
      const d = e.dados as AlocacaoDados;
      const n = num(d.qtd) || (Array.isArray(d.animais) ? d.animais.length : 0);
      const sinal = d.sentido === 'saida' ? '−' : '+';
      const cat = d.categoriaNome || catNome(d.categoriaId) || 'animais';
      titulo = `${sinal}${n} ${cat}`.trim();
      const partes: string[] = [];
      if (d.outroLoteId) partes.push(`${d.sentido === 'saida' ? 'para' : 'de'} ${loteNome(d.outroLoteId)}`);
      else if (d.sentido !== 'saida') partes.push('Entrada nova no rebanho');
      if (num(d.naoIdent) > 0) partes.push(`${num(d.naoIdent)} sem identificação`);
      if (Array.isArray(d.animais) && d.animais.length > 0) partes.push(`${d.animais.length} por ID`);
      meta = partes.join(' · ');
    } else if (e.tipo === 'transferencia') {
      const d = e.dados as TransferenciaDados;
      titulo = `Transferência → ${d.para}`;
      meta = `${d.de || '—'} → ${d.para} (${d.tipoLocal})`;
    } else if (e.tipo === 'manejo') {
      const d = e.dados as ManejoDados;
      titulo = d.dim === 'nutricional' ? 'Mudança de regime nutricional' : 'Protocolo reprodutivo';
      meta = d.plano || '';
    } else if (e.tipo === 'repro') {
      const d = e.dados as ReproDados;
      titulo = d.fase || 'Evento reprodutivo';
      meta = d.detalhe || '';
    }
    return {
      id: e.id,
      data: e.data,
      tipo: e.tipo,
      cor: COR_POR_TIPO[e.tipo] || '#64748b',
      titulo,
      meta,
      resp: e.resp,
    };
  });

  // Mais recente primeiro.
  return items.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return 0;
  });
}

/** Agrupa eventos por loteId (a partir da lista da org). */
export function groupByLote(eventos: LoteEventoRow[]): Record<string, LoteEventoRow[]> {
  const map: Record<string, LoteEventoRow[]> = {};
  for (const e of eventos) {
    (map[e.loteId] ||= []).push(e);
  }
  return map;
}
