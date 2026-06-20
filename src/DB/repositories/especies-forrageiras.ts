import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { especiesForrageiras } from '../schema.js';

/**
 * Espécies Forrageiras: cadastro (nível organização) das forrageiras dos
 * pastos. Cada registro guarda nome popular, nome científico, as alturas-alvo
 * de pastejo por regime de manejo, fotos e uma descrição livre.
 *
 * Como Pelagens/Reprodutores, é um cadastro org-level (sem vínculo a fazenda)
 * e começa vazio — preenchido pelo usuário.
 */

/** Alturas-alvo de pastejo (cm) por regime de manejo. Qualquer ponta é opcional. */
export interface AlturasPastejo {
  /** Pastejo contínuo: altura ideal a manter no pasto (campo único). idealMin/idealMax são legados. */
  continuo?: { ideal?: number | null; idealMin?: number | null; idealMax?: number | null };
  /** Pastejo rotacionado: altura de entrada e de saída. */
  rotacionado?: { entrada?: number | null; saida?: number | null };
  /** Pastejo rotatínuo (rotacionado contínuo): altura de entrada e de saída. */
  rotatinuo?: { entrada?: number | null; saida?: number | null };
}

export async function listByOrganization(organizationId: string) {
  return db.select().from(especiesForrageiras)
    .where(eq(especiesForrageiras.organizationId, organizationId))
    .orderBy(asc(especiesForrageiras.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  nomeCientifico?: string | null;
  alturas?: AlturasPastejo;
  imagens?: string[];
  descricao?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(especiesForrageiras.ordem) })
    .from(especiesForrageiras)
    .where(eq(especiesForrageiras.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(especiesForrageiras).values({
    organizationId: data.organizationId,
    nome: data.nome,
    nomeCientifico: data.nomeCientifico ?? null,
    alturas: data.alturas ?? {},
    imagens: data.imagens ?? [],
    descricao: data.descricao ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  nomeCientifico?: string | null;
  alturas?: AlturasPastejo;
  imagens?: string[];
  descricao?: string | null;
}) {
  const [row] = await db.update(especiesForrageiras)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(especiesForrageiras.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(especiesForrageiras).where(eq(especiesForrageiras.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(especiesForrageiras)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(especiesForrageiras.id, item.id as any));
    }
  });
}
