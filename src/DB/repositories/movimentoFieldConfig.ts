import { and, eq } from 'drizzle-orm';
import { db } from '../index.js';
import { movimentoFieldConfigs } from '../schema.js';

/** Configuração dos campos do "Defina seus campos" (blob por organização + tipo de movimento). */
export interface MovimentoFieldConfigBlob {
  places: Record<string, string>;
  order: string[];
  autonum: boolean;
}

/** Tipos de movimento que persistem configuração de campos nesta tabela. */
export type MovimentoTipo = 'compra' | 'venda' | 'morte';

export async function getByOrgAndTipo(organizationId: string, tipo: MovimentoTipo) {
  const [row] = await db
    .select()
    .from(movimentoFieldConfigs)
    .where(
      and(
        eq(movimentoFieldConfigs.organizationId, organizationId as any),
        eq(movimentoFieldConfigs.tipo, tipo),
      ),
    );
  return row ?? null;
}

export async function save(organizationId: string, tipo: MovimentoTipo, config: MovimentoFieldConfigBlob) {
  const [row] = await db
    .insert(movimentoFieldConfigs)
    .values({ organizationId: organizationId as any, tipo, config })
    .onConflictDoUpdate({
      target: [movimentoFieldConfigs.organizationId, movimentoFieldConfigs.tipo],
      set: { config, updatedAt: new Date() },
    })
    .returning();
  return row;
}
