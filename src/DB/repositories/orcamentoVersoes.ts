/**
 * Repositório de versões de orçamento.
 *
 * Phase 1 expõe apenas leitura — criação inicial vem de `createOrcamentoCompleto`.
 * Phase 2 adicionará: criar Forecast com mes_corte, aprovar (vira baseline imutável).
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '../index.js';
import { orcamentoVersoes, userProfiles } from '../schema.js';

export async function listVersoesByOrcamento(orcamentoId: string) {
  const rows = await db
    .select({
      id: orcamentoVersoes.id,
      orcamentoId: orcamentoVersoes.orcamentoId,
      parentId: orcamentoVersoes.parentId,
      tipo: orcamentoVersoes.tipo,
      nome: orcamentoVersoes.nome,
      criadoPor: orcamentoVersoes.criadoPor,
      aprovadoPor: orcamentoVersoes.aprovadoPor,
      aprovadoEm: orcamentoVersoes.aprovadoEm,
      mesCorte: orcamentoVersoes.mesCorte,
      imutavel: orcamentoVersoes.imutavel,
      createdAt: orcamentoVersoes.createdAt,
      updatedAt: orcamentoVersoes.updatedAt,
      autorName: userProfiles.name,
      autorEmail: userProfiles.email,
    })
    .from(orcamentoVersoes)
    .leftJoin(userProfiles, eq(userProfiles.id, orcamentoVersoes.criadoPor))
    .where(eq(orcamentoVersoes.orcamentoId, orcamentoId))
    .orderBy(desc(orcamentoVersoes.createdAt));

  return rows.map((r) => ({
    id: r.id,
    orcamentoId: r.orcamentoId,
    parentId: r.parentId,
    tipo: r.tipo,
    nome: r.nome,
    criadoPor: r.criadoPor,
    aprovadoPor: r.aprovadoPor,
    aprovadoEm: r.aprovadoEm,
    mesCorte: r.mesCorte,
    imutavel: r.imutavel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    autor: r.autorEmail
      ? { id: r.criadoPor, name: r.autorName, email: r.autorEmail }
      : null,
  }));
}

export async function getVersaoById(id: string) {
  const [row] = await db.select().from(orcamentoVersoes).where(eq(orcamentoVersoes.id, id)).limit(1);
  return row ?? null;
}

export async function renameVersao(id: string, nome: string) {
  const [row] = await db
    .update(orcamentoVersoes)
    .set({ nome, updatedAt: new Date() })
    .where(eq(orcamentoVersoes.id, id))
    .returning();
  return row ?? null;
}
