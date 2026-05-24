/**
 * Repositório de itens de orçamento (planilha de despesas).
 *
 * Modelo lazy: linha em `itens_orcamento` só existe se houver pelo menos um
 * valor mensal. GET sempre retorna a hierarquia completa do ramo via plano de
 * contas filtrada pela config da fazenda — itens vazios voltam como `{}`.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../index.js';
import {
  itensOrcamento,
  orcamentoVersoes,
  orcamentos,
  planoContas,
  farmPlanoContasInativas,
} from '../schema.js';

export interface ContaPlanilha {
  id: string;
  numero: string;
  numeroPaiId: string | null;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
  isFolha: boolean;
}

export interface PlanilhaResult {
  contas: ContaPlanilha[];
  /** Map planoContaId -> { 'YYYY-MM-DD': numero } — só itens existentes. */
  itens: Record<string, Record<string, number>>;
  versao: {
    id: string;
    orcamentoId: string;
    tipo: string;
    imutavel: boolean;
    mesCorte: string | null;
    nome: string;
  };
  orcamento: {
    id: string;
    nome: string;
    safra: string;
    dataInicio: string;
    dataFim: string;
  };
}

export async function listarPlanilha(input: {
  versaoId: string;
  farmId: string;
  /** Lista de raízes do plano de contas a incluir (ex.: ['5'] ou ['2','3','4','5','6','8']). */
  numerosRaizes: string[];
}): Promise<PlanilhaResult | null> {
  if (input.numerosRaizes.length === 0) return null;

  const [versao] = await db
    .select({
      id: orcamentoVersoes.id,
      orcamentoId: orcamentoVersoes.orcamentoId,
      tipo: orcamentoVersoes.tipo,
      imutavel: orcamentoVersoes.imutavel,
      mesCorte: orcamentoVersoes.mesCorte,
      nome: orcamentoVersoes.nome,
    })
    .from(orcamentoVersoes)
    .where(eq(orcamentoVersoes.id, input.versaoId))
    .limit(1);
  if (!versao) return null;

  const [orcamento] = await db
    .select({
      id: orcamentos.id,
      nome: orcamentos.nome,
      safra: orcamentos.safra,
      dataInicio: orcamentos.dataInicio,
      dataFim: orcamentos.dataFim,
    })
    .from(orcamentos)
    .where(eq(orcamentos.id, versao.orcamentoId))
    .limit(1);
  if (!orcamento) return null;

  // Filtro: para cada raiz r, casa numero='r' OU numero LIKE 'r.%'.
  const filtroRaizes = or(
    ...input.numerosRaizes.flatMap((r) => [
      eq(planoContas.numero, r),
      sql`${planoContas.numero} LIKE ${`${r}.%`}`,
    ]),
  );

  const rows = await db
    .select({
      conta_id: planoContas.id,
      conta_numero: planoContas.numero,
      conta_paiId: planoContas.numeroPaiId,
      conta_nome: planoContas.nome,
      conta_perfil: planoContas.perfilDesembolso,
      conta_areas: planoContas.areasNegocio,
      conta_nivel: planoContas.nivel,
      conta_folha: planoContas.isFolha,
      item_valores: itensOrcamento.valoresMensais,
    })
    .from(planoContas)
    .leftJoin(
      itensOrcamento,
      and(
        eq(itensOrcamento.planoContaId, planoContas.id),
        eq(itensOrcamento.versaoId, input.versaoId),
        eq(itensOrcamento.farmId, input.farmId),
      ),
    )
    .where(
      and(
        eq(planoContas.ativo, true),
        filtroRaizes,
        sql`NOT EXISTS (SELECT 1 FROM ${farmPlanoContasInativas} fpci WHERE fpci.farm_id = ${input.farmId} AND fpci.plano_conta_id = ${planoContas.id})`,
      ),
    )
    .orderBy(planoContas.numero);

  const contas: ContaPlanilha[] = [];
  const itens: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    contas.push({
      id: r.conta_id,
      numero: r.conta_numero,
      numeroPaiId: r.conta_paiId,
      nome: r.conta_nome,
      perfilDesembolso: r.conta_perfil,
      areasNegocio: r.conta_areas,
      nivel: r.conta_nivel,
      isFolha: r.conta_folha,
    });
    const v = r.item_valores as Record<string, string | number> | null;
    if (v && Object.keys(v).length > 0) {
      const parsed: Record<string, number> = {};
      for (const [k, val] of Object.entries(v)) {
        const num = typeof val === 'string' ? Number(val) : val;
        if (Number.isFinite(num)) parsed[k] = num;
      }
      itens[r.conta_id] = parsed;
    }
  }

  // Ordenação numérica natural (1, 2, 10, 11) via split por ponto
  contas.sort((a, b) => {
    const pa = a.numero.split('.').map(Number);
    const pb = b.numero.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  });

  return { contas, itens, versao, orcamento };
}

export interface EdicaoInput {
  planoContaId: string;
  /** Valores delta: ausentes não mexem; null remove a chave; número grava. */
  valoresMensais: Record<string, number | null>;
}

export interface EdicaoResult {
  atualizadas: number;
  criadas: number;
  removidas: number;
}

/**
 * Aplica edições em batch numa transação.
 * Para cada (versaoId, farmId, planoContaId), faz upsert do JSONB:
 *   - chaves com valor numérico → setadas
 *   - chaves com null → removidas
 *   - se o JSON ficar vazio após merge → DELETE da linha
 */
export async function upsertValores(input: {
  versaoId: string;
  farmId: string;
  edicoes: EdicaoInput[];
  userId: string;
}): Promise<EdicaoResult> {
  if (input.edicoes.length === 0) {
    return { atualizadas: 0, criadas: 0, removidas: 0 };
  }

  return db.transaction(async (tx) => {
    let atualizadas = 0;
    let criadas = 0;
    let removidas = 0;

    for (const e of input.edicoes) {
      const [existing] = await tx
        .select({ id: itensOrcamento.id, valores: itensOrcamento.valoresMensais })
        .from(itensOrcamento)
        .where(
          and(
            eq(itensOrcamento.versaoId, input.versaoId),
            eq(itensOrcamento.farmId, input.farmId),
            eq(itensOrcamento.planoContaId, e.planoContaId),
          ),
        )
        .limit(1);

      // Aplica delta sobre o JSON existente (ou {} se novo).
      const merged: Record<string, string> = {};
      const baseAtual = (existing?.valores as Record<string, string | number> | undefined) ?? {};
      for (const [k, v] of Object.entries(baseAtual)) {
        merged[k] = typeof v === 'string' ? v : String(v);
      }
      for (const [k, v] of Object.entries(e.valoresMensais)) {
        if (v === null) {
          delete merged[k];
        } else {
          merged[k] = String(v);
        }
      }

      const isEmpty = Object.keys(merged).length === 0;

      if (existing && isEmpty) {
        await tx.delete(itensOrcamento).where(eq(itensOrcamento.id, existing.id));
        removidas++;
      } else if (existing) {
        await tx
          .update(itensOrcamento)
          .set({
            valoresMensais: merged,
            atualizadoPor: input.userId,
            updatedAt: new Date(),
          })
          .where(eq(itensOrcamento.id, existing.id));
        atualizadas++;
      } else if (!isEmpty) {
        await tx.insert(itensOrcamento).values({
          versaoId: input.versaoId,
          farmId: input.farmId,
          planoContaId: e.planoContaId,
          valoresMensais: merged,
          atualizadoPor: input.userId,
        });
        criadas++;
      }
      // existing=null && isEmpty → no-op (alguma edição que zerou tudo numa folha que não tinha valor)
    }

    return { atualizadas, criadas, removidas };
  });
}

/** Lookup do orçamentoId pela versão (auxiliar para auditoria/access). */
export async function getOrcamentoIdByVersao(versaoId: string): Promise<string | null> {
  const [row] = await db
    .select({ orcamentoId: orcamentoVersoes.orcamentoId })
    .from(orcamentoVersoes)
    .where(eq(orcamentoVersoes.id, versaoId))
    .limit(1);
  return row?.orcamentoId ?? null;
}
