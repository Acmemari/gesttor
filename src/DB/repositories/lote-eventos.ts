import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { loteEventos, lotes, fichasAnimal } from '../schema.js';

/**
 * Repositório do ledger de eventos da Gestão de Lotes (lote_eventos).
 *
 * Os eventos são IMUTÁVEIS — a única fonte de verdade dos estados do lote
 * (composição, localização, regime, fase reprodutiva). Os estados são derivados
 * no front por selectors puros sobre estes eventos.
 *
 * Alocação entre lotes: o evento é gravado no lote em foco e, quando há um
 * `outroLoteId`, um EVENTO ESPELHO (sentido invertido) é gravado no outro lote,
 * de modo que o `saldo` de cada lote derive apenas de eventos com `loteId = lote`.
 */

export type LoteEventoTipo = 'alocacao' | 'transferencia' | 'manejo' | 'repro';

export interface LoteEventoInput {
  organizationId: string;
  loteId: string;
  tipo: LoteEventoTipo;
  data: string;                       // 'AAAA-MM-DD'
  resp?: string | null;
  dados: Record<string, any>;
  criadoPor?: string | null;
  /** Quando true e houver `dados.animais`, sincroniza fichas_animal.lote. */
  syncFichas?: boolean;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listByOrganization(organizationId: string) {
  return db.select().from(loteEventos)
    .where(eq(loteEventos.organizationId, organizationId as any))
    .orderBy(desc(loteEventos.data), desc(loteEventos.createdAt));
}

export async function listByLote(loteId: string) {
  return db.select().from(loteEventos)
    .where(eq(loteEventos.loteId, loteId as any))
    .orderBy(desc(loteEventos.data), desc(loteEventos.createdAt));
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function create(input: LoteEventoInput) {
  const { organizationId, loteId, tipo, data, resp, dados, criadoPor } = input;

  const sentido: string | undefined = dados?.sentido;
  const outroLoteId: string | null = dados?.outroLoteId ?? null;
  const animais: string[] = Array.isArray(dados?.animais) ? dados.animais : [];

  // Lote de DESTINO dos animais (para sincronizar a ficha): entrada → este lote;
  // saída → o outro lote.
  const destinoLoteId =
    tipo === 'alocacao'
      ? sentido === 'saida'
        ? outroLoteId
        : loteId
      : null;

  return db.transaction(async (tx) => {
    // 1) Evento principal (no lote em foco).
    const [evento] = await tx.insert(loteEventos).values({
      organizationId: organizationId as any,
      loteId: loteId as any,
      tipo,
      data,
      resp: resp ?? null,
      dados,
      criadoPor: criadoPor ?? null,
    }).returning();

    // 2) Evento espelho no outro lote (sentido invertido) — só p/ alocação entre lotes.
    if (tipo === 'alocacao' && outroLoteId) {
      const sentidoEspelho = sentido === 'saida' ? 'entrada' : 'saida';
      await tx.insert(loteEventos).values({
        organizationId: organizationId as any,
        loteId: outroLoteId as any,
        tipo,
        data,
        resp: resp ?? null,
        dados: { ...dados, sentido: sentidoEspelho, outroLoteId: loteId },
        criadoPor: criadoPor ?? null,
      });
    }

    // 3) Sincroniza o vínculo do animal na ficha (campo texto `lote` = nome do lote destino).
    if (input.syncFichas && destinoLoteId && animais.length > 0) {
      const [dest] = await tx.select({ nome: lotes.nome })
        .from(lotes)
        .where(eq(lotes.id, destinoLoteId as any));
      const destNome = dest?.nome ?? null;
      if (destNome) {
        await tx.update(fichasAnimal)
          .set({ lote: destNome, updatedAt: new Date() })
          .where(and(
            eq(fichasAnimal.organizationId, organizationId as any),
            inArray(fichasAnimal.id, animais as any),
          ));
      }
    }

    return evento;
  });
}
