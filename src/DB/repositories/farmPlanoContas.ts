/**
 * Repositório da configuração de plano de contas POR FAZENDA.
 *
 * Modelo blacklist: `plano_contas` é global; `farm_plano_contas_inativas` lista
 * apenas as contas DESATIVADAS para uma fazenda específica. `ativoNaFazenda` é
 * derivado por LEFT JOIN.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { planoContas, farmPlanoContasInativas } from '../schema.js';

export interface PlanoContaComFlag {
  id: string;
  numero: string;
  numeroPaiId: string | null;
  nome: string;
  perfilDesembolso: string | null;
  areasNegocio: string[] | null;
  nivel: number;
  isFolha: boolean;
  ativo: boolean;
  /** false sse existir linha em farm_plano_contas_inativas para (farmId, this.id). */
  ativoNaFazenda: boolean;
}

export async function listPlanoContasComFlag(farmId: string): Promise<PlanoContaComFlag[]> {
  const rows = await db
    .select({
      id: planoContas.id,
      numero: planoContas.numero,
      numeroPaiId: planoContas.numeroPaiId,
      nome: planoContas.nome,
      perfilDesembolso: planoContas.perfilDesembolso,
      areasNegocio: planoContas.areasNegocio,
      nivel: planoContas.nivel,
      isFolha: planoContas.isFolha,
      ativo: planoContas.ativo,
      inativaNaFazenda: farmPlanoContasInativas.farmId,
    })
    .from(planoContas)
    .leftJoin(
      farmPlanoContasInativas,
      and(
        eq(farmPlanoContasInativas.planoContaId, planoContas.id),
        eq(farmPlanoContasInativas.farmId, farmId),
      ),
    )
    .where(eq(planoContas.ativo, true))
    .orderBy(planoContas.numero);

  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    numeroPaiId: r.numeroPaiId,
    nome: r.nome,
    perfilDesembolso: r.perfilDesembolso,
    areasNegocio: r.areasNegocio,
    nivel: r.nivel,
    isFolha: r.isFolha,
    ativo: r.ativo,
    ativoNaFazenda: r.inativaNaFazenda === null,
  }));
}

export interface AtivacaoInput {
  planoContaId: string;
  ativo: boolean;
}

/**
 * Aplica em batch as ativações para uma fazenda, em uma única transação.
 * - ativo=true → DELETE da blacklist (se existir)
 * - ativo=false → INSERT na blacklist (idempotente via ON CONFLICT)
 *
 * Retorna o snapshot do que estava ativo antes (para o log de auditoria).
 */
export async function setAtivacoes(
  farmId: string,
  ativacoes: AtivacaoInput[],
  userId: string,
): Promise<{ atualizadas: number; before: string[]; after: string[] }> {
  if (ativacoes.length === 0) return { atualizadas: 0, before: [], after: [] };

  return db.transaction(async (tx) => {
    // Snapshot antes: ids inativos da fazenda.
    const beforeRows = await tx
      .select({ id: farmPlanoContasInativas.planoContaId })
      .from(farmPlanoContasInativas)
      .where(eq(farmPlanoContasInativas.farmId, farmId));
    const before = beforeRows.map((r) => r.id);

    const desativar = ativacoes.filter((a) => !a.ativo).map((a) => a.planoContaId);
    const ativar = ativacoes.filter((a) => a.ativo).map((a) => a.planoContaId);

    if (ativar.length > 0) {
      await tx
        .delete(farmPlanoContasInativas)
        .where(
          and(
            eq(farmPlanoContasInativas.farmId, farmId),
            inArray(farmPlanoContasInativas.planoContaId, ativar),
          ),
        );
    }

    if (desativar.length > 0) {
      await tx
        .insert(farmPlanoContasInativas)
        .values(
          desativar.map((planoContaId) => ({
            farmId,
            planoContaId,
            desativadoPor: userId,
          })),
        )
        .onConflictDoNothing({
          target: [farmPlanoContasInativas.farmId, farmPlanoContasInativas.planoContaId],
        });
    }

    const afterRows = await tx
      .select({ id: farmPlanoContasInativas.planoContaId })
      .from(farmPlanoContasInativas)
      .where(eq(farmPlanoContasInativas.farmId, farmId));
    const after = afterRows.map((r) => r.id);

    return { atualizadas: ativacoes.length, before, after };
  });
}

/**
 * Remove TODOS os registros de blacklist de uma fazenda (reset = tudo ativo).
 * Útil para testes ou para um botão "restaurar padrões".
 */
export async function resetBlacklist(farmId: string): Promise<number> {
  const removidos = await db
    .delete(farmPlanoContasInativas)
    .where(eq(farmPlanoContasInativas.farmId, farmId))
    .returning({ id: farmPlanoContasInativas.planoContaId });
  return removidos.length;
}

/**
 * Lookup direto: `plano_contas` ativo por (farmId), retornando só os IDs ativos.
 * Útil em consumidores que precisam só filtrar (ex: planilha de despesas).
 */
export async function listIdsAtivos(farmId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT pc.id::text AS id
    FROM plano_contas pc
    WHERE pc.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM farm_plano_contas_inativas fpci
        WHERE fpci.farm_id = ${farmId} AND fpci.plano_conta_id = pc.id
      )
  `);
  return (rows as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
}
