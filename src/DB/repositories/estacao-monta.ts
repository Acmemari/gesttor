import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { estacaoMonta } from '../schema.js';

/**
 * Repositório de Estação de Monta.
 *
 * O usuário informa apenas o Período da Monta (início/fim). O Período de
 * Nascimento e a Safra de nascimento do bezerro são DERIVADOS aqui (fonte de
 * verdade no servidor) para garantir consistência independente do cliente.
 */

/** Dias de gestação somados ao Período da Monta para obter o Período de Nascimento. */
export const GESTACAO_DIAS = 281;

/** Soma `days` a uma data 'YYYY-MM-DD' sem efeitos de fuso (cálculo em UTC). */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Safra (ciclo julho→julho) a que pertence a data 'YYYY-MM-DD'. Ex.: "2026/2027". */
function safraFromISO(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

/** Calcula os campos derivados a partir do Período da Monta. */
export function deriveFromMonta(montaInicio: string, montaFim: string) {
  const nascimentoInicio = addDaysISO(montaInicio, GESTACAO_DIAS);
  const nascimentoFim = addDaysISO(montaFim, GESTACAO_DIAS);
  return {
    nascimentoInicio,
    nascimentoFim,
    safra: safraFromISO(nascimentoInicio),
  };
}

export async function listByOrganization(organizationId: string) {
  return db.select().from(estacaoMonta)
    .where(eq(estacaoMonta.organizationId, organizationId))
    .orderBy(asc(estacaoMonta.ordem));
}

export async function create(data: {
  organizationId: string;
  farmId?: string | null;
  retiro?: string | null;
  montaInicio: string;
  montaFim: string;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(estacaoMonta.ordem) })
    .from(estacaoMonta)
    .where(eq(estacaoMonta.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const derived = deriveFromMonta(data.montaInicio, data.montaFim);

  const [row] = await db.insert(estacaoMonta).values({
    organizationId: data.organizationId,
    farmId: data.farmId ?? null,
    retiro: data.retiro ?? null,
    montaInicio: data.montaInicio,
    montaFim: data.montaFim,
    nascimentoInicio: derived.nascimentoInicio,
    nascimentoFim: derived.nascimentoFim,
    safra: derived.safra,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  farmId?: string | null;
  retiro?: string | null;
  montaInicio?: string;
  montaFim?: string;
}) {
  const payload: Record<string, any> = { updatedAt: new Date() };
  if (data.farmId !== undefined) payload.farmId = data.farmId;
  if (data.retiro !== undefined) payload.retiro = data.retiro;
  if (data.montaInicio !== undefined) payload.montaInicio = data.montaInicio;
  if (data.montaFim !== undefined) payload.montaFim = data.montaFim;

  // Recalcula os derivados quando qualquer ponta do Período da Monta muda.
  if (data.montaInicio !== undefined || data.montaFim !== undefined) {
    const [current] = await db.select().from(estacaoMonta)
      .where(eq(estacaoMonta.id, id as any));
    if (current) {
      const montaInicio = data.montaInicio ?? current.montaInicio;
      const montaFim = data.montaFim ?? current.montaFim;
      const derived = deriveFromMonta(montaInicio, montaFim);
      payload.nascimentoInicio = derived.nascimentoInicio;
      payload.nascimentoFim = derived.nascimentoFim;
      payload.safra = derived.safra;
    }
  }

  const [row] = await db.update(estacaoMonta)
    .set(payload)
    .where(eq(estacaoMonta.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(estacaoMonta).where(eq(estacaoMonta.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(estacaoMonta)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(estacaoMonta.id, item.id as any));
    }
  });
}
