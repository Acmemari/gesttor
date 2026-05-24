/**
 * Helper de auditoria para endpoints do orçamento.
 *
 * Padrão de uso:
 *   const tracker = beginAudit({ orcamentoId, versaoId, usuarioId, entidade, entidadeId, before });
 *   // ... muta a entidade ...
 *   await tracker.commit({ acao: 'editar_premissa', after, justificativa });
 *
 * Em Phase 1, usado apenas implicitamente via `createOrcamentoCompleto` (que já
 * insere o evento dentro da transação). Este helper fica disponível para PATCH/
 * DELETE individuais que vierem em Phase 2 (itens, premissas, versões).
 */
import { appendAudit } from '../../src/DB/repositories/auditoriaOrcamento.js';

export type AuditContext = {
  orcamentoId: string;
  versaoId?: string | null;
  usuarioId: string;
  entidade: string;
  entidadeId?: string | null;
  before?: unknown;
};

export type AuditCommit = {
  acao: string;
  after?: unknown;
  justificativa?: string | null;
};

export function beginAudit(ctx: AuditContext) {
  return {
    async commit(payload: AuditCommit): Promise<void> {
      await appendAudit({
        orcamentoId: ctx.orcamentoId,
        versaoId: ctx.versaoId ?? null,
        usuarioId: ctx.usuarioId,
        acao: payload.acao,
        entidade: ctx.entidade,
        entidadeId: ctx.entidadeId ?? null,
        before: ctx.before,
        after: payload.after,
        justificativa: payload.justificativa ?? null,
      });
    },
  };
}
