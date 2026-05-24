/**
 * Repositório do Orçamento Mestre.
 *
 * Convenção: tudo em uma transação Drizzle quando cria um orçamento — 1 linha em
 * `orcamentos`, N em `orcamento_farms`, N em `orcamento_colaboradores`, 1 em
 * `orcamento_versoes` (V1.0 rascunho), N em `premissas` iniciais, 1 em
 * `log_auditoria_orcamento` (acao='criar_orcamento').
 */
import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../index.js';
import {
  orcamentos,
  orcamentoFarms,
  orcamentoColaboradores,
  orcamentoVersoes,
  premissas,
  logAuditoriaOrcamento,
} from '../schema.js';

export type CreateOrcamentoInput = {
  organizationId: string;
  nome: string;
  safra: string;
  dataInicio: string; // ISO date
  dataFim: string;
  descricao?: string | null;
  fazendas: string[]; // farm IDs
  colaboradores: { userId: string; papel: 'editor' | 'consultor'; eAprovador?: boolean }[];
  premissasIniciais: { chave: string; valor: number; unidade: string; fonte: string }[];
  criadoPor: string;
};

export type ListOrcamentosParams = {
  organizationId: string;
  search?: string | null;
  includeArquivados?: boolean;
  offset?: number;
  limit?: number;
};

export async function createOrcamentoCompleto(input: CreateOrcamentoInput) {
  return db.transaction(async (tx) => {
    const [orc] = await tx
      .insert(orcamentos)
      .values({
        organizationId: input.organizationId,
        nome: input.nome,
        safra: input.safra,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        descricao: input.descricao ?? null,
        criadoPor: input.criadoPor,
      })
      .returning();

    if (input.fazendas.length) {
      await tx.insert(orcamentoFarms).values(
        input.fazendas.map((farmId) => ({ orcamentoId: orc.id, farmId })),
      );
    }

    // Inclui o criador como editor + aprovador automaticamente, se ainda não estiver na lista.
    const colabs = [...input.colaboradores];
    const criadorNaLista = colabs.some((c) => c.userId === input.criadoPor);
    if (!criadorNaLista) {
      colabs.unshift({ userId: input.criadoPor, papel: 'editor', eAprovador: true });
    }
    if (colabs.length) {
      await tx.insert(orcamentoColaboradores).values(
        colabs.map((c) => ({
          orcamentoId: orc.id,
          userId: c.userId,
          papel: c.papel,
          eAprovador: c.eAprovador ?? false,
        })),
      );
    }

    const [versao] = await tx
      .insert(orcamentoVersoes)
      .values({
        orcamentoId: orc.id,
        tipo: 'rascunho',
        nome: 'V1.0',
        criadoPor: input.criadoPor,
      })
      .returning();

    if (input.premissasIniciais.length) {
      await tx.insert(premissas).values(
        input.premissasIniciais.map((p) => ({
          versaoId: versao.id,
          chave: p.chave,
          valor: String(p.valor),
          unidade: p.unidade,
          fonte: p.fonte,
        })),
      );
    }

    await tx.insert(logAuditoriaOrcamento).values({
      orcamentoId: orc.id,
      versaoId: versao.id,
      usuarioId: input.criadoPor,
      acao: 'criar_orcamento',
      entidade: 'orcamentos',
      entidadeId: orc.id,
      after: {
        nome: orc.nome,
        safra: orc.safra,
        fazendas: input.fazendas.length,
        colaboradores: colabs.length,
        premissas: input.premissasIniciais.length,
      },
    });

    return { orcamento: orc, versao };
  });
}

export async function listOrcamentos(params: ListOrcamentosParams) {
  const conditions = [eq(orcamentos.organizationId, params.organizationId)];
  if (!params.includeArquivados) conditions.push(eq(orcamentos.arquivado, false));
  if (params.search) conditions.push(ilike(orcamentos.nome, `%${params.search}%`));

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const rows = await db
    .select()
    .from(orcamentos)
    .where(and(...conditions))
    .orderBy(desc(orcamentos.createdAt))
    .offset(offset)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function getOrcamentoById(id: string) {
  const [row] = await db.select().from(orcamentos).where(eq(orcamentos.id, id)).limit(1);
  return row ?? null;
}

export async function getOrcamentoFarms(orcamentoId: string) {
  return db.select().from(orcamentoFarms).where(eq(orcamentoFarms.orcamentoId, orcamentoId));
}

export async function archiveOrcamento(id: string) {
  const [row] = await db
    .update(orcamentos)
    .set({ arquivado: true, updatedAt: new Date() })
    .where(eq(orcamentos.id, id))
    .returning();
  return row ?? null;
}

export async function updateOrcamento(id: string, data: Partial<{ nome: string; descricao: string | null }>) {
  const [row] = await db
    .update(orcamentos)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orcamentos.id, id))
    .returning();
  return row ?? null;
}
