/**
 * Repositório do plano de contas global.
 * Read-only via API; populado pelo seed (`seedPlanoContas.ts`).
 */
import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { planoContas } from '../schema.js';

export async function listPlanoContas(includeInativo = false) {
  const rows = await db.select().from(planoContas);
  return includeInativo ? rows : rows.filter((r) => r.ativo);
}

export async function getContaById(id: string) {
  const [row] = await db.select().from(planoContas).where(eq(planoContas.id, id)).limit(1);
  return row ?? null;
}

export async function getContaByNumero(numero: string) {
  const [row] = await db.select().from(planoContas).where(eq(planoContas.numero, numero)).limit(1);
  return row ?? null;
}
