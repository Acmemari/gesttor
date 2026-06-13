import { and, eq, desc, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import { desmameMovimentos, desmameFichas, fichasAnimal } from '../schema.js';

/**
 * Repositório de Movimentação › Desmame.
 *
 * Diferente das outras movimentações, o desmame opera sobre animais que já
 * existem no rebanho: cada "desmamar" muda a categoria atual do animal (upsert
 * em fichas_animal) E registra o evento numa ficha filha. Os desmames de uma
 * mesma sessão (mesma data + fazenda + retiro + proprietário) são agrupados num
 * único movimento, cujo catDecl é o tally por categoria de destino.
 */

export interface WeanInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string; // 'AAAA-MM-DD'
  safra?: string | null;
  retiro?: string | null;
  // Identificação do animal (apelido sempre presente; rfid opcional).
  apelido?: string | null;
  rfid?: string | null;
  // Categoria de onde saiu e categoria de destino escolhida.
  categoriaOrigemId?: string | null;
  categoriaDestinoId: string;
  // Peso de desmama, já normalizado (string numérica) ou null.
  peso?: string | null;
  // Sexo derivado da categoria de destino (opcional; só usado ao criar a ficha).
  sexo?: string | null;
  // Vínculo com a ficha de nascimento de origem, quando a ficha for criada agora.
  nascimentoFichaId?: string | null;
  obs?: string | null;
  criadoPor?: string | null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(desmameMovimentos)
    .where(eq(desmameMovimentos.organizationId, organizationId as any))
    .orderBy(desc(desmameMovimentos.data), desc(desmameMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const fichas = await db.select().from(desmameFichas);
  const byMov = new Map<string, typeof fichas>();
  for (const f of fichas) {
    if (!ids.includes(f.movimentoId)) continue;
    const arr = byMov.get(f.movimentoId) ?? [];
    arr.push(f);
    byMov.set(f.movimentoId, arr);
  }
  return movs.map((m) => ({ ...m, fichas: byMov.get(m.id) ?? [] }));
}

export async function getMovimentoById(id: string) {
  const [row] = await db.select().from(desmameMovimentos)
    .where(eq(desmameMovimentos.id, id as any));
  if (!row) return null;
  const fichas = await db.select().from(desmameFichas)
    .where(eq(desmameFichas.movimentoId, id as any));
  return { ...row, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/** Condição de igualdade null-safe (null/'' → IS NULL). */
function eqOrNull(col: any, val: string | null | undefined) {
  return val == null || val === '' ? isNull(col) : eq(col, val as any);
}

/**
 * Desmama um animal (salvar na hora):
 *   1. encontra ou cria o movimento da sessão (org+data+fazenda+retiro+proprietário);
 *   2. faz upsert na ficha do animal (resolvida por organizationId+apelido) mudando
 *      a categoria atual para a de destino e gravando o peso (situação = ativo);
 *   3. registra a ficha de desmame (origem→destino, peso);
 *   4. recalcula catDecl/qtd do movimento a partir das fichas.
 * Tudo numa transação. Retorna o movimento atualizado com suas fichas.
 */
export async function weanAnimal(input: WeanInput) {
  const apelido = input.apelido ? String(input.apelido).trim() : null;
  const rfid = input.rfid ? String(input.rfid).trim() : null;

  const movId = await db.transaction(async (tx) => {
    // 1. Movimento da sessão (find-or-create).
    const [existingMov] = await tx.select().from(desmameMovimentos).where(
      and(
        eq(desmameMovimentos.organizationId, input.organizationId as any),
        eq(desmameMovimentos.data, input.data as any),
        eqOrNull(desmameMovimentos.farmId, input.farmId),
        eqOrNull(desmameMovimentos.retiro, input.retiro),
        eqOrNull(desmameMovimentos.proprietarioId, input.proprietarioId),
      ),
    );

    let movimentoId: string;
    if (existingMov) {
      movimentoId = existingMov.id;
    } else {
      const [created] = await tx.insert(desmameMovimentos).values({
        organizationId: input.organizationId as any,
        farmId: input.farmId ?? null,
        localId: (input.localId ?? null) as any,
        proprietarioId: (input.proprietarioId ?? null) as any,
        data: input.data,
        safra: input.safra ?? null,
        retiro: input.retiro ?? null,
        qtd: 0,
        catDecl: [] as any,
        obs: null,
        criadoPor: input.criadoPor ?? null,
      }).returning();
      movimentoId = created.id;
    }

    // 2. Upsert na ficha do animal (categoria atual = destino). Resolve por
    //    organizationId+apelido para não depender da origem (db/nascimento) e
    //    evitar violar o unique (apelido por org).
    if (apelido) {
      const [ficha] = await tx.select().from(fichasAnimal).where(
        and(
          eq(fichasAnimal.organizationId, input.organizationId as any),
          eq(fichasAnimal.apelido, apelido),
        ),
      );
      if (ficha) {
        await tx.update(fichasAnimal).set({
          categoriaId: input.categoriaDestinoId as any,
          peso: input.peso ?? null,
          situacao: 'ativo',
          ...(input.farmId ? { farmId: input.farmId } : {}),
          updatedAt: new Date(),
        }).where(eq(fichasAnimal.id, ficha.id));
      } else {
        await tx.insert(fichasAnimal).values({
          organizationId: input.organizationId as any,
          farmId: input.farmId ?? null,
          nascimentoFichaId: (input.nascimentoFichaId ?? null) as any,
          apelido,
          categoriaId: input.categoriaDestinoId as any,
          sexo: input.sexo ?? null,
          rfid,
          peso: input.peso ?? null,
          situacao: 'ativo',
          criadoPor: input.criadoPor ?? null,
        });
      }
    }

    // 3. Ficha do desmame (histórico).
    await tx.insert(desmameFichas).values({
      movimentoId: movimentoId as any,
      apelido,
      rfid,
      categoriaOrigemId: (input.categoriaOrigemId ?? null) as any,
      categoriaDestinoId: input.categoriaDestinoId as any,
      peso: input.peso ?? null,
      obs: input.obs ?? null,
    });

    // 4. Recalcula catDecl/qtd a partir das fichas (idempotente em retry).
    const fichas = await tx.select().from(desmameFichas)
      .where(eq(desmameFichas.movimentoId, movimentoId as any));
    const tally = new Map<string, number>();
    for (const f of fichas) {
      const key = f.categoriaDestinoId ?? '—';
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const catDecl = [...tally.entries()].map(([catId, qtd]) => ({ catId, qtd }));
    await tx.update(desmameMovimentos).set({
      catDecl: catDecl as any,
      qtd: fichas.length,
      updatedAt: new Date(),
    }).where(eq(desmameMovimentos.id, movimentoId as any));

    return movimentoId;
  });

  return getMovimentoById(movId);
}

export async function deleteMovimento(id: string) {
  // Nota: excluir o histórico NÃO reverte a categoria atual dos animais.
  await db.delete(desmameMovimentos).where(eq(desmameMovimentos.id, id as any));
}
