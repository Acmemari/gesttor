/**
 * Repositório de Lançamentos de Despesa.
 *
 * Modelo:
 * - 1 lançamento = 1 compromisso de despesa numa conta-folha (versão+fazenda+conta).
 * - `distribuicao_mensal` é JSONB { 'YYYY-MM-01': '1234.56' } e é a fonte do que vai pra planilha.
 * - Múltiplos lançamentos por (versão, farm, conta) somam → `itens_orcamento.valoresMensais`.
 * - `recalcularItem()` é a operação central: re-soma todos lançamentos ativos do tuplo e atualiza `itens_orcamento`.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import {
  itensOrcamento,
  lancamentoProdutos,
  lancamentosOrcamento,
  planoContas,
} from '../schema.js';

export type Recorrencia = 'mensal' | 'sazonal' | 'unica';
export type StatusLancamento = 'ativo' | 'rascunho';
export type TipoOrigem = 'modal' | 'planilha';

export interface ProdutoInput {
  nome: string;
  quantidade: number;
  unidade: string | null;
  valorUnitario: number;
}

export interface ProdutoRow extends ProdutoInput {
  id: string;
  subtotal: number;
  ordem: number;
}

export interface LancamentoRow {
  id: string;
  versaoId: string;
  farmId: string;
  planoContaId: string;
  recorrencia: Recorrencia;
  valorBase: number;
  distribuicaoMensal: Record<string, number>;
  tipoOrigem: TipoOrigem;
  descricao: string | null;
  observacao: string | null;
  status: StatusLancamento;
  criadoPor: string;
  atualizadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
  produtos: ProdutoRow[];
}

export interface CreateLancamentoInput {
  versaoId: string;
  farmId: string;
  planoContaId: string;
  recorrencia: Recorrencia;
  valorBase: number;
  /** Mapa { 'YYYY-MM-01' → number } com 1-12 entradas dependendo da recorrência. */
  distribuicaoMensal: Record<string, number>;
  tipoOrigem?: TipoOrigem;
  descricao?: string | null;
  observacao?: string | null;
  status?: StatusLancamento;
  criadoPor: string;
  produtos?: ProdutoInput[];
}

export interface UpdateLancamentoInput {
  recorrencia?: Recorrencia;
  valorBase?: number;
  distribuicaoMensal?: Record<string, number>;
  descricao?: string | null;
  observacao?: string | null;
  status?: StatusLancamento;
  atualizadoPor: string;
  /** Quando presente, faz replace-all dos produtos. */
  produtos?: ProdutoInput[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toNumberMap(json: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!json || typeof json !== 'object') return out;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function toStringMap(map: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (Number.isFinite(v)) out[k] = String(v);
  }
  return out;
}

/**
 * Recalcula o `distribuicao_mensal` a partir de produtos quando há produtos.
 * Regra: se produtos existem, o `valorBase` é re-derivado da soma dos subtotais
 * e a distribuição é re-aplicada conforme `recorrencia`/meses ativos.
 *
 * Quando há produtos, ignoramos qualquer `distribuicaoMensal` enviada e
 * derivamos do `valorBase` × meses ativos da entrada original (reusa as chaves).
 */
function aplicarRegraProdutos(
  recorrencia: Recorrencia,
  distribuicaoMensalEntrada: Record<string, number>,
  produtos: ProdutoInput[],
): { valorBase: number; distribuicao: Record<string, number> } {
  const subtotalProdutos = produtos.reduce(
    (acc, p) => acc + Number(p.quantidade) * Number(p.valorUnitario),
    0,
  );

  // Quais meses estão ativos? Quem tem entrada > 0 (ou apenas presente).
  const mesesAtivos = Object.keys(distribuicaoMensalEntrada).filter(
    (m) => Number.isFinite(distribuicaoMensalEntrada[m]),
  );

  if (recorrencia === 'unica') {
    const mes = mesesAtivos[0] ?? Object.keys(distribuicaoMensalEntrada)[0];
    return {
      valorBase: subtotalProdutos,
      distribuicao: mes ? { [mes]: subtotalProdutos } : {},
    };
  }

  // mensal/sazonal: subtotal é o total ANUAL → divide pelos meses ativos
  const qtd = mesesAtivos.length || 1;
  const valorPorMes = subtotalProdutos / qtd;
  const distribuicao: Record<string, number> = {};
  for (const m of mesesAtivos) distribuicao[m] = valorPorMes;
  return { valorBase: valorPorMes, distribuicao };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listLancamentos(opts: {
  versaoId: string;
  farmId: string;
  planoContaId?: string;
  incluirShadow?: boolean;
}): Promise<LancamentoRow[]> {
  const conditions = [
    eq(lancamentosOrcamento.versaoId, opts.versaoId),
    eq(lancamentosOrcamento.farmId, opts.farmId),
  ];
  if (opts.planoContaId) conditions.push(eq(lancamentosOrcamento.planoContaId, opts.planoContaId));
  if (!opts.incluirShadow) conditions.push(eq(lancamentosOrcamento.tipoOrigem, 'modal'));

  const rows = await db
    .select()
    .from(lancamentosOrcamento)
    .where(and(...conditions))
    .orderBy(lancamentosOrcamento.createdAt);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const produtos = await db
    .select()
    .from(lancamentoProdutos)
    .where(sql`${lancamentoProdutos.lancamentoId} = ANY(${ids})`)
    .orderBy(lancamentoProdutos.lancamentoId, lancamentoProdutos.ordem);

  const produtosByLancamento = new Map<string, ProdutoRow[]>();
  for (const p of produtos) {
    const arr = produtosByLancamento.get(p.lancamentoId) ?? [];
    arr.push({
      id: p.id,
      nome: p.nome,
      quantidade: Number(p.quantidade),
      unidade: p.unidade,
      valorUnitario: Number(p.valorUnitario),
      subtotal: Number(p.subtotal),
      ordem: p.ordem,
    });
    produtosByLancamento.set(p.lancamentoId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    versaoId: r.versaoId,
    farmId: r.farmId,
    planoContaId: r.planoContaId,
    recorrencia: r.recorrencia as Recorrencia,
    valorBase: Number(r.valorBase),
    distribuicaoMensal: toNumberMap(r.distribuicaoMensal),
    tipoOrigem: r.tipoOrigem as TipoOrigem,
    descricao: r.descricao,
    observacao: r.observacao,
    status: r.status as StatusLancamento,
    criadoPor: r.criadoPor,
    atualizadoPor: r.atualizadoPor,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    produtos: produtosByLancamento.get(r.id) ?? [],
  }));
}

export async function getLancamentoById(id: string): Promise<LancamentoRow | null> {
  const [row] = await db.select().from(lancamentosOrcamento).where(eq(lancamentosOrcamento.id, id)).limit(1);
  if (!row) return null;
  const produtos = await db
    .select()
    .from(lancamentoProdutos)
    .where(eq(lancamentoProdutos.lancamentoId, id))
    .orderBy(lancamentoProdutos.ordem);
  return {
    id: row.id,
    versaoId: row.versaoId,
    farmId: row.farmId,
    planoContaId: row.planoContaId,
    recorrencia: row.recorrencia as Recorrencia,
    valorBase: Number(row.valorBase),
    distribuicaoMensal: toNumberMap(row.distribuicaoMensal),
    tipoOrigem: row.tipoOrigem as TipoOrigem,
    descricao: row.descricao,
    observacao: row.observacao,
    status: row.status as StatusLancamento,
    criadoPor: row.criadoPor,
    atualizadoPor: row.atualizadoPor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.nome,
      quantidade: Number(p.quantidade),
      unidade: p.unidade,
      valorUnitario: Number(p.valorUnitario),
      subtotal: Number(p.subtotal),
      ordem: p.ordem,
    })),
  };
}

export async function assertContaFolha(planoContaId: string): Promise<boolean> {
  const [row] = await db
    .select({ isFolha: planoContas.isFolha })
    .from(planoContas)
    .where(eq(planoContas.id, planoContaId))
    .limit(1);
  return !!row?.isFolha;
}

// ─── Create / Update / Delete ───────────────────────────────────────────────

export async function createLancamento(input: CreateLancamentoInput): Promise<LancamentoRow> {
  const createdId = await db.transaction(async (tx) => {
    const produtos = input.produtos ?? [];
    const { valorBase, distribuicao } =
      produtos.length > 0
        ? aplicarRegraProdutos(input.recorrencia, input.distribuicaoMensal, produtos)
        : { valorBase: input.valorBase, distribuicao: input.distribuicaoMensal };

    const [created] = await tx
      .insert(lancamentosOrcamento)
      .values({
        versaoId: input.versaoId,
        farmId: input.farmId,
        planoContaId: input.planoContaId,
        recorrencia: input.recorrencia,
        valorBase: String(valorBase),
        distribuicaoMensal: toStringMap(distribuicao),
        tipoOrigem: input.tipoOrigem ?? 'modal',
        descricao: input.descricao ?? null,
        observacao: input.observacao ?? null,
        status: input.status ?? 'ativo',
        criadoPor: input.criadoPor,
        atualizadoPor: input.criadoPor,
      })
      .returning();

    if (produtos.length > 0) {
      await tx.insert(lancamentoProdutos).values(
        produtos.map((p, idx) => ({
          lancamentoId: created.id,
          nome: p.nome,
          quantidade: String(p.quantidade),
          unidade: p.unidade ?? null,
          valorUnitario: String(p.valorUnitario),
          subtotal: String(p.quantidade * p.valorUnitario),
          ordem: idx,
        })),
      );
    }

    await recalcularItemTx(tx, input.versaoId, input.farmId, input.planoContaId, input.criadoPor);
    return created.id;
  });
  const fresh = await getLancamentoById(createdId);
  if (!fresh) throw new Error('Lançamento criado mas não encontrado em re-leitura');
  return fresh;
}

export async function updateLancamento(id: string, input: UpdateLancamentoInput): Promise<LancamentoRow | null> {
  const updatedId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(lancamentosOrcamento)
      .where(eq(lancamentosOrcamento.id, id))
      .limit(1);
    if (!existing) return null as string | null;

    const recorrencia = (input.recorrencia ?? existing.recorrencia) as Recorrencia;
    const distribuicaoEntrada = input.distribuicaoMensal ?? toNumberMap(existing.distribuicaoMensal);
    const valorBaseEntrada = input.valorBase ?? Number(existing.valorBase);

    let valorBase = valorBaseEntrada;
    let distribuicao = distribuicaoEntrada;

    if (input.produtos !== undefined) {
      // Replace-all dos produtos.
      await tx.delete(lancamentoProdutos).where(eq(lancamentoProdutos.lancamentoId, id));
      if (input.produtos.length > 0) {
        await tx.insert(lancamentoProdutos).values(
          input.produtos.map((p, idx) => ({
            lancamentoId: id,
            nome: p.nome,
            quantidade: String(p.quantidade),
            unidade: p.unidade ?? null,
            valorUnitario: String(p.valorUnitario),
            subtotal: String(p.quantidade * p.valorUnitario),
            ordem: idx,
          })),
        );
        const aplicado = aplicarRegraProdutos(recorrencia, distribuicaoEntrada, input.produtos);
        valorBase = aplicado.valorBase;
        distribuicao = aplicado.distribuicao;
      }
    } else {
      // Mantém produtos existentes; se eles existem, derivar a partir deles.
      const produtosExistentes = await tx
        .select()
        .from(lancamentoProdutos)
        .where(eq(lancamentoProdutos.lancamentoId, id));
      if (produtosExistentes.length > 0) {
        const aplicado = aplicarRegraProdutos(
          recorrencia,
          distribuicaoEntrada,
          produtosExistentes.map((p) => ({
            nome: p.nome,
            quantidade: Number(p.quantidade),
            unidade: p.unidade,
            valorUnitario: Number(p.valorUnitario),
          })),
        );
        valorBase = aplicado.valorBase;
        distribuicao = aplicado.distribuicao;
      }
    }

    const [updated] = await tx
      .update(lancamentosOrcamento)
      .set({
        recorrencia,
        valorBase: String(valorBase),
        distribuicaoMensal: toStringMap(distribuicao),
        descricao: input.descricao !== undefined ? input.descricao : existing.descricao,
        observacao: input.observacao !== undefined ? input.observacao : existing.observacao,
        status: input.status ?? existing.status,
        atualizadoPor: input.atualizadoPor,
        updatedAt: new Date(),
      })
      .where(eq(lancamentosOrcamento.id, id))
      .returning();

    await recalcularItemTx(tx, updated.versaoId, updated.farmId, updated.planoContaId, input.atualizadoPor);
    return id;
  });
  if (!updatedId) return null;
  return getLancamentoById(updatedId);
}

export async function deleteLancamento(id: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(lancamentosOrcamento)
      .where(eq(lancamentosOrcamento.id, id))
      .limit(1);
    if (!existing) return false;
    await tx.delete(lancamentosOrcamento).where(eq(lancamentosOrcamento.id, id));
    await recalcularItemTx(tx, existing.versaoId, existing.farmId, existing.planoContaId, userId);
    return true;
  });
}

// ─── Materialização (recalcularItem) ────────────────────────────────────────

/**
 * Lê todos lançamentos ativos do tuplo (versão, farm, conta) e UPSERTA o resultado
 * agregado em `itens_orcamento.valoresMensais`. Se o agregado for vazio (sem
 * lançamentos ou todos com distribuição vazia), DELETA a linha (modelo lazy).
 *
 * Versão fora-de-transação para uso direto.
 */
export async function recalcularItem(
  versaoId: string,
  farmId: string,
  planoContaId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await recalcularItemTx(tx, versaoId, farmId, planoContaId, userId);
  });
}

/** Versão que recebe a transação ativa — chamada pelos CRUDs. */
async function recalcularItemTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  versaoId: string,
  farmId: string,
  planoContaId: string,
  userId: string,
): Promise<void> {
  // Soma o JSONB de todos lançamentos ativos do tuplo, mês a mês.
  // jsonb_each_text expande o JSONB em rows (key, value), agrupamos por key e somamos.
  const rows = await tx.execute<{ mes: string; total: string }>(sql`
    SELECT key AS mes, SUM(value::numeric) AS total
    FROM lancamentos_orcamento l, jsonb_each_text(l.distribuicao_mensal)
    WHERE l.versao_id = ${versaoId}
      AND l.farm_id = ${farmId}
      AND l.plano_conta_id = ${planoContaId}
      AND l.status = 'ativo'
    GROUP BY key
  `);

  const agregado: Record<string, string> = {};
  for (const r of rows.rows) {
    const n = Number(r.total);
    if (Number.isFinite(n) && n !== 0) agregado[r.mes] = String(n);
  }

  const isEmpty = Object.keys(agregado).length === 0;

  if (isEmpty) {
    await tx
      .delete(itensOrcamento)
      .where(
        and(
          eq(itensOrcamento.versaoId, versaoId),
          eq(itensOrcamento.farmId, farmId),
          eq(itensOrcamento.planoContaId, planoContaId),
        ),
      );
    return;
  }

  // UPSERT manual (Drizzle não tem onConflict tão claro com índice composto único).
  const [existing] = await tx
    .select({ id: itensOrcamento.id })
    .from(itensOrcamento)
    .where(
      and(
        eq(itensOrcamento.versaoId, versaoId),
        eq(itensOrcamento.farmId, farmId),
        eq(itensOrcamento.planoContaId, planoContaId),
      ),
    )
    .limit(1);

  if (existing) {
    await tx
      .update(itensOrcamento)
      .set({ valoresMensais: agregado, atualizadoPor: userId, updatedAt: new Date() })
      .where(eq(itensOrcamento.id, existing.id));
  } else {
    await tx.insert(itensOrcamento).values({
      versaoId,
      farmId,
      planoContaId,
      valoresMensais: agregado,
      atualizadoPor: userId,
    });
  }
}

/** Helper para o handler de orcamento-itens (PATCH): cria/atualiza shadow + recalcula. */
export async function upsertShadowFromCelula(input: {
  versaoId: string;
  farmId: string;
  planoContaId: string;
  /** Delta: chaves YYYY-MM-01 → number ou null (remove a chave do shadow). */
  delta: Record<string, number | null>;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(lancamentosOrcamento)
      .where(
        and(
          eq(lancamentosOrcamento.versaoId, input.versaoId),
          eq(lancamentosOrcamento.farmId, input.farmId),
          eq(lancamentosOrcamento.planoContaId, input.planoContaId),
          eq(lancamentosOrcamento.tipoOrigem, 'planilha'),
        ),
      )
      .limit(1);

    const baseAtual = existing ? toNumberMap(existing.distribuicaoMensal) : {};
    const merged: Record<string, number> = { ...baseAtual };
    for (const [mes, valor] of Object.entries(input.delta)) {
      if (valor === null) delete merged[mes];
      else merged[mes] = valor;
    }

    if (existing) {
      if (Object.keys(merged).length === 0) {
        await tx.delete(lancamentosOrcamento).where(eq(lancamentosOrcamento.id, existing.id));
      } else {
        await tx
          .update(lancamentosOrcamento)
          .set({
            distribuicaoMensal: toStringMap(merged),
            atualizadoPor: input.userId,
            updatedAt: new Date(),
          })
          .where(eq(lancamentosOrcamento.id, existing.id));
      }
    } else if (Object.keys(merged).length > 0) {
      await tx.insert(lancamentosOrcamento).values({
        versaoId: input.versaoId,
        farmId: input.farmId,
        planoContaId: input.planoContaId,
        recorrencia: 'mensal',
        valorBase: '0',
        distribuicaoMensal: toStringMap(merged),
        tipoOrigem: 'planilha',
        descricao: 'Lançamento da planilha',
        status: 'ativo',
        criadoPor: input.userId,
        atualizadoPor: input.userId,
      });
    }

    await recalcularItemTx(tx, input.versaoId, input.farmId, input.planoContaId, input.userId);
  });
}

