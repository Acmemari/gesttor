import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { nascimentoFieldConfigs } from '../schema.js';

/** Configuração dos campos do Lançamento Rápido (blob por organização). */
export interface NascimentoFieldConfigBlob {
  places: Record<string, string>;
  order: string[];
  autonum: boolean;
}

export async function getByOrg(organizationId: string) {
  const [row] = await db
    .select()
    .from(nascimentoFieldConfigs)
    .where(eq(nascimentoFieldConfigs.organizationId, organizationId as any));
  return row ?? null;
}

export async function save(organizationId: string, config: NascimentoFieldConfigBlob) {
  const [row] = await db
    .insert(nascimentoFieldConfigs)
    .values({ organizationId: organizationId as any, config })
    .onConflictDoUpdate({
      target: nascimentoFieldConfigs.organizationId,
      set: { config, updatedAt: new Date() },
    })
    .returning();
  return row;
}
