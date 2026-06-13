import { and, eq, desc, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import { mudancaCategoriaMovimentos, mudancaCategoriaFichas, fichasAnimal } from '../schema.js';

/**
 * Repositório de Movimentação › Mudança de Categoria.
 *
 * Como o Desmame, opera sobre o rebanho que JÁ existe: move animais de uma
 * categoria de SAÍDA (origem) para uma de ENTRADA (destino). Há dois caminhos:
 *   • por animal — muda a categoria atual do animal (upsert em fichas_animal) e
 *     registra o evento numa ficha filha (qtd 1);
 *   • coletivo  — declara uma quantidade (apelido NULL, qtd N) com peso/valor por
 *     cabeça, SEM identificar animais (não toca fichas_animal).
 * As mudanças de uma mesma sessão (mesma data + fazenda + retiro + proprietário)
 * são agrupadas num único movimento, cujo catDecl é o tally por categoria de
 * DESTINO somando as quantidades das fichas.
 */

export interface ChangeAnimalInput {
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
  // Peso/cabeça (kg) e valor/cabeça (R$), já normalizados (string numérica) ou null.
  peso?: string | null;
  valor?: string | null;
  // Sexo derivado da categoria de destino (opcional; só usado ao criar a ficha).
  sexo?: string | null;
  // Vínculo com a ficha de nascimento de origem, quando a ficha for criada agora.
  nascimentoFichaId?: string | null;
  obs?: string | null;
  criadoPor?: string | null;
}

export interface DeclareChangeInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string; // 'AAAA-MM-DD'
  safra?: string | null;
  retiro?: string | null;
  categoriaOrigemId?: string | null;
  categoriaDestinoId: string;
  qtd: number;
  peso?: string | null;
  valor?: string | null;
  obs?: string | null;
  criadoPor?: string | null;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listMovimentosByOrg(organizationId: string) {
  const movs = await db.select().from(mudancaCategoriaMovimentos)
    .where(eq(mudancaCategoriaMovimentos.organizationId, organizationId as any))
    .orderBy(desc(mudancaCategoriaMovimentos.data), desc(mudancaCategoriaMovimentos.createdAt));
  if (movs.length === 0) return [];

  const ids = movs.map((m) => m.id);
  const fichas = await db.select().from(mudancaCategoriaFichas);
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
  const [row] = await db.select().from(mudancaCategoriaMovimentos)
    .where(eq(mudancaCategoriaMovimentos.id, id as any));
  if (!row) return null;
  const fichas = await db.select().from(mudancaCategoriaFichas)
    .where(eq(mudancaCategoriaFichas.movimentoId, id as any));
  return { ...row, fichas };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/** Condição de igualdade null-safe (null/'' → IS NULL). */
function eqOrNull(col: any, val: string | null | undefined) {
  return val == null || val === '' ? isNull(col) : eq(col, val as any);
}

/** Encontra (ou cria) o movimento da sessão dentro de uma transação. */
async function findOrCreateMovimento(tx: any, input: {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  criadoPor?: string | null;
}): Promise<string> {
  const [existing] = await tx.select().from(mudancaCategoriaMovimentos).where(
    and(
      eq(mudancaCategoriaMovimentos.organizationId, input.organizationId as any),
      eq(mudancaCategoriaMovimentos.data, input.data as any),
      eqOrNull(mudancaCategoriaMovimentos.farmId, input.farmId),
      eqOrNull(mudancaCategoriaMovimentos.retiro, input.retiro),
      eqOrNull(mudancaCategoriaMovimentos.proprietarioId, input.proprietarioId),
    ),
  );
  if (existing) return existing.id;

  const [created] = await tx.insert(mudancaCategoriaMovimentos).values({
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
  return created.id;
}

/** Recalcula catDecl (tally por destino) e qtd (soma das quantidades) do movimento. */
async function recalcMovimento(tx: any, movimentoId: string) {
  const fichas = await tx.select().from(mudancaCategoriaFichas)
    .where(eq(mudancaCategoriaFichas.movimentoId, movimentoId as any));
  const tally = new Map<string, number>();
  let total = 0;
  for (const f of fichas) {
    const n = f.qtd ?? 1;
    total += n;
    const key = f.categoriaDestinoId ?? '—';
    tally.set(key, (tally.get(key) ?? 0) + n);
  }
  const catDecl = [...tally.entries()].map(([catId, qtd]) => ({ catId, qtd }));
  await tx.update(mudancaCategoriaMovimentos).set({
    catDecl: catDecl as any,
    qtd: total,
    updatedAt: new Date(),
  }).where(eq(mudancaCategoriaMovimentos.id, movimentoId as any));
}

/**
 * Muda a categoria de UM animal (salvar na hora):
 *   1. encontra ou cria o movimento da sessão;
 *   2. faz upsert na ficha do animal (resolvida por organizationId+apelido) mudando
 *      a categoria atual para a de destino e gravando o peso (situação = ativo);
 *   3. registra a ficha de mudança (origem→destino, peso, valor, qtd 1);
 *   4. recalcula catDecl/qtd do movimento.
 * Tudo numa transação. Retorna o movimento atualizado com suas fichas.
 */
export async function changeCategoryAnimal(input: ChangeAnimalInput) {
  const apelido = input.apelido ? String(input.apelido).trim() : null;
  const rfid = input.rfid ? String(input.rfid).trim() : null;

  const movId = await db.transaction(async (tx) => {
    const movimentoId = await findOrCreateMovimento(tx, input);

    // Upsert na ficha do animal (categoria atual = destino). Resolve por
    // organizationId+apelido para não depender da origem (db/nascimento) e
    // evitar violar o unique (apelido por org).
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
          ...(input.peso != null ? { peso: input.peso } : {}),
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

    // Ficha da mudança (histórico).
    await tx.insert(mudancaCategoriaFichas).values({
      movimentoId: movimentoId as any,
      apelido,
      rfid,
      categoriaOrigemId: (input.categoriaOrigemId ?? null) as any,
      categoriaDestinoId: input.categoriaDestinoId as any,
      qtd: 1,
      peso: input.peso ?? null,
      valor: input.valor ?? null,
      obs: input.obs ?? null,
    });

    await recalcMovimento(tx, movimentoId);
    return movimentoId;
  });

  return getMovimentoById(movId);
}

/**
 * Declara uma mudança COLETIVA (por quantidade, sem identificar animais):
 *   1. encontra ou cria o movimento da sessão;
 *   2. registra UMA ficha coletiva (apelido NULL, qtd N, origem→destino, peso/valor);
 *   3. recalcula catDecl/qtd. NÃO altera fichas_animal.
 * Retorna o movimento atualizado com suas fichas.
 */
export async function declareCategoryChange(input: DeclareChangeInput) {
  const qtd = Math.max(1, Math.trunc(Number(input.qtd) || 0));

  const movId = await db.transaction(async (tx) => {
    const movimentoId = await findOrCreateMovimento(tx, input);

    await tx.insert(mudancaCategoriaFichas).values({
      movimentoId: movimentoId as any,
      apelido: null,
      rfid: null,
      categoriaOrigemId: (input.categoriaOrigemId ?? null) as any,
      categoriaDestinoId: input.categoriaDestinoId as any,
      qtd,
      peso: input.peso ?? null,
      valor: input.valor ?? null,
      obs: input.obs ?? null,
    });

    await recalcMovimento(tx, movimentoId);
    return movimentoId;
  });

  return getMovimentoById(movId);
}

export async function deleteMovimento(id: string) {
  // Nota: excluir o histórico NÃO reverte a categoria atual dos animais.
  await db.delete(mudancaCategoriaMovimentos).where(eq(mudancaCategoriaMovimentos.id, id as any));
}
