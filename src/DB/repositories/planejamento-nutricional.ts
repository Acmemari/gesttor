import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { planejamentoNutricional } from '../schema.js';

// Plano de terminação de um lote (metas de abate + fases). 1 linha por lote —
// upsert por lote_id. Colunas numeric do Postgres são gravadas/lidas como string;
// o coerce numérico fica no front (client/calc).

/** Coerce number|null → string|null p/ colunas numeric. */
function numOrNull(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

export async function getByLote(loteId: string) {
  const [row] = await db.select().from(planejamentoNutricional)
    .where(eq(planejamentoNutricional.loteId, loteId as any));
  return row ?? null;
}

export interface UpsertPlanejamentoInput {
  organizationId: string;
  loteId: string;
  pesoInicial?: number | null;
  pesoVivoAbate?: number | null;
  rendimentoCarcaca?: number | null;
  metaValorVenda?: number | null;
  fases?: unknown[];
  criadoPor?: string | null;
}

/** Insere ou atualiza o plano do lote (select-then-insert/update). */
export async function upsert(data: UpsertPlanejamentoInput) {
  const campos = {
    pesoInicial: numOrNull(data.pesoInicial),
    pesoVivoAbate: numOrNull(data.pesoVivoAbate),
    rendimentoCarcaca: numOrNull(data.rendimentoCarcaca),
    metaValorVenda: numOrNull(data.metaValorVenda),
    fases: Array.isArray(data.fases) ? data.fases : [],
  };

  const [existing] = await db.select().from(planejamentoNutricional)
    .where(eq(planejamentoNutricional.loteId, data.loteId as any));

  if (existing) {
    const [row] = await db.update(planejamentoNutricional)
      .set({ ...campos, updatedAt: new Date() })
      .where(eq(planejamentoNutricional.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db.insert(planejamentoNutricional).values({
    organizationId: data.organizationId as any,
    loteId: data.loteId as any,
    criadoPor: data.criadoPor ?? null,
    ...campos,
  }).returning();
  return row;
}
