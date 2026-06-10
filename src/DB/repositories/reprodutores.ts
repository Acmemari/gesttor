import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { reprodutores } from '../schema.js';

/**
 * Reprodutores (Sêmen e Embriões): touros / material genético usados na
 * inseminação da fazenda. Cada registro guarda dados de identificação, fotos
 * e a genealogia (pai, mãe e avós) em formato estruturado.
 *
 * Diferente de Pelagens/Motivos de Morte, NÃO há auto-seed — a lista começa
 * vazia e é preenchida pelo usuário (manualmente ou via "Localizar das centrais").
 */

export interface GenealogiaNo {
  nome: string;
  registro: string;
}

export interface Genealogia {
  pai?: GenealogiaNo;
  mae?: GenealogiaNo;
  avoPaternoPai?: GenealogiaNo;
  avoPaternoMae?: GenealogiaNo;
  avoMaternoPai?: GenealogiaNo;
  avoMaternoMae?: GenealogiaNo;
}

export async function listByOrganization(organizationId: string) {
  return db.select().from(reprodutores)
    .where(eq(reprodutores.organizationId, organizationId))
    .orderBy(asc(reprodutores.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  registro?: string | null;
  dataNascimento?: string | null;
  tipo: string;
  raca?: string | null;
  central?: string | null;
  imagens?: string[];
  genealogia?: Genealogia;
  observacao?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(reprodutores.ordem) })
    .from(reprodutores)
    .where(eq(reprodutores.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(reprodutores).values({
    organizationId: data.organizationId,
    nome: data.nome,
    registro: data.registro ?? null,
    dataNascimento: data.dataNascimento ?? null,
    tipo: data.tipo,
    raca: data.raca ?? null,
    central: data.central ?? null,
    imagens: data.imagens ?? [],
    genealogia: data.genealogia ?? {},
    observacao: data.observacao ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  registro?: string | null;
  dataNascimento?: string | null;
  tipo?: string;
  raca?: string | null;
  central?: string | null;
  imagens?: string[];
  genealogia?: Genealogia;
  observacao?: string | null;
}) {
  const [row] = await db.update(reprodutores)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(reprodutores.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(reprodutores).where(eq(reprodutores.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(reprodutores)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(reprodutores.id, item.id as any));
    }
  });
}
