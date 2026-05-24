/**
 * Repositório do log de auditoria do orçamento (event sourcing).
 * Feed para a aba "Linha do Tempo" da Gaveta de Governança.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../index.js';
import { logAuditoriaOrcamento, userProfiles } from '../schema.js';

export type AuditEvent = {
  id: string;
  orcamentoId: string;
  versaoId: string | null;
  usuarioId: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  before: unknown;
  after: unknown;
  justificativa: string | null;
  createdAt: Date;
  usuario: { id: string; name: string | null; email: string } | null;
};

export async function listAuditoria(params: {
  orcamentoId: string;
  versaoId?: string | null;
  limit?: number;
}): Promise<AuditEvent[]> {
  const conditions = [eq(logAuditoriaOrcamento.orcamentoId, params.orcamentoId)];
  if (params.versaoId) conditions.push(eq(logAuditoriaOrcamento.versaoId, params.versaoId));

  const rows = await db
    .select({
      id: logAuditoriaOrcamento.id,
      orcamentoId: logAuditoriaOrcamento.orcamentoId,
      versaoId: logAuditoriaOrcamento.versaoId,
      usuarioId: logAuditoriaOrcamento.usuarioId,
      acao: logAuditoriaOrcamento.acao,
      entidade: logAuditoriaOrcamento.entidade,
      entidadeId: logAuditoriaOrcamento.entidadeId,
      before: logAuditoriaOrcamento.before,
      after: logAuditoriaOrcamento.after,
      justificativa: logAuditoriaOrcamento.justificativa,
      createdAt: logAuditoriaOrcamento.createdAt,
      usuarioName: userProfiles.name,
      usuarioEmail: userProfiles.email,
    })
    .from(logAuditoriaOrcamento)
    .leftJoin(userProfiles, eq(userProfiles.id, logAuditoriaOrcamento.usuarioId))
    .where(and(...conditions))
    .orderBy(desc(logAuditoriaOrcamento.createdAt))
    .limit(params.limit ?? 50);

  return rows.map((r) => ({
    id: r.id,
    orcamentoId: r.orcamentoId,
    versaoId: r.versaoId,
    usuarioId: r.usuarioId,
    acao: r.acao,
    entidade: r.entidade,
    entidadeId: r.entidadeId,
    before: r.before,
    after: r.after,
    justificativa: r.justificativa,
    createdAt: r.createdAt,
    usuario: r.usuarioName !== undefined && r.usuarioEmail
      ? { id: r.usuarioId, name: r.usuarioName, email: r.usuarioEmail }
      : null,
  }));
}

export async function appendAudit(input: {
  orcamentoId: string;
  versaoId?: string | null;
  usuarioId: string;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  before?: unknown;
  after?: unknown;
  justificativa?: string | null;
}) {
  await db.insert(logAuditoriaOrcamento).values({
    orcamentoId: input.orcamentoId,
    versaoId: input.versaoId ?? null,
    usuarioId: input.usuarioId,
    acao: input.acao,
    entidade: input.entidade,
    entidadeId: input.entidadeId ?? null,
    before: input.before as any,
    after: input.after as any,
    justificativa: input.justificativa ?? null,
  });
}
