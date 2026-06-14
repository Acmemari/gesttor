import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { areaMovimentos, farmLocais, farmLocationLevels } from '../schema.js';

/**
 * Repositório do ledger de eventos da Movimentação de Áreas (area_movimentos).
 *
 * Os eventos são IMUTÁVEIS — a fonte da verdade de COMO as áreas chegaram ao
 * estado atual. As tabelas de cadastro (farm_retiros/setores/locais) são a
 * PROJEÇÃO (a foto atual). Cada operação grava o(s) evento(s) E muta a projeção
 * na MESMA transação, de modo que evento e fato nunca se descolam.
 *
 * Linhagem (espelhada do lote_eventos): split/merge gravam um evento no alvo +
 * um evento por área relacionada, para que `WHERE area_id = X` traga toda a
 * história da área sem joins.
 *
 * Foco v1: nível Local. Retiro/Setor seguem no CRUD atual.
 */

type Coords = [number, number][];

export type AreaMovimentoTipo =
  | 'abertura' | 'renomear' | 'remodelar' | 'mover'
  | 'aposentar' | 'reativar' | 'dividir' | 'criado_divisao'
  | 'unir' | 'unido' | 'nivel' | 'correcao';

export interface AreaSnapshot {
  name: string;
  area: string | null;
  geometry: Coords | null;
  geometrySource: string | null;
  tipo: string | null;
  retiroId: string | null;
  setorId: string | null;
}

/** Campos comuns a todo lançamento de movimento. */
interface BaseInput {
  organizationId: string;
  farmId: string;
  data: string;                 // 'AAAA-MM-DD' (data efetiva)
  nota?: string | null;
  classe?: 'movimento' | 'correcao';
  criadoPor?: string | null;
}

function snapshotLocal(row: any): AreaSnapshot {
  return {
    name: row.name,
    area: row.area ?? null,
    geometry: (row.geometry ?? null) as Coords | null,
    geometrySource: row.geometrySource ?? null,
    tipo: row.tipo ?? null,
    retiroId: row.retiroId ?? null,
    setorId: row.setorId ?? null,
  };
}

async function inserirEvento(tx: any, e: {
  base: BaseInput;
  nivel: string;
  tipo: AreaMovimentoTipo;
  areaId: string | null;
  antes?: AreaSnapshot | null;
  depois?: AreaSnapshot | null;
  dados?: Record<string, any>;
}) {
  const [row] = await tx.insert(areaMovimentos).values({
    organizationId: e.base.organizationId as any,
    farmId: e.base.farmId,
    nivel: e.nivel,
    tipo: e.tipo,
    classe: e.base.classe ?? 'movimento',
    data: e.base.data,
    areaId: (e.areaId ?? null) as any,
    antes: (e.antes ?? null) as any,
    depois: (e.depois ?? null) as any,
    dados: (e.dados ?? {}) as any,
    nota: e.base.nota != null && String(e.base.nota).trim() ? String(e.base.nota).trim() : null,
    criadoPor: e.base.criadoPor ?? null,
  }).returning();
  return row;
}

/** Aplica um patch ao local e devolve os snapshots antes/depois. */
async function patchLocalTx(tx: any, areaId: string, patch: Record<string, unknown>) {
  const [antesRow] = await tx.select().from(farmLocais).where(eq(farmLocais.id, areaId as any));
  if (!antesRow) throw new Error(`Local não encontrado: ${areaId}`);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of Object.keys(patch)) if (patch[k] !== undefined) set[k] = patch[k];
  const [depoisRow] = await tx.update(farmLocais).set(set).where(eq(farmLocais.id, areaId as any)).returning();
  return { antes: snapshotLocal(antesRow), depois: snapshotLocal(depoisRow) };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listByOrganization(organizationId: string) {
  return db.select().from(areaMovimentos)
    .where(eq(areaMovimentos.organizationId, organizationId as any))
    .orderBy(desc(areaMovimentos.data), desc(areaMovimentos.createdAt));
}

export async function listByFarm(farmId: string) {
  return db.select().from(areaMovimentos)
    .where(eq(areaMovimentos.farmId, farmId))
    .orderBy(desc(areaMovimentos.data), desc(areaMovimentos.createdAt));
}

export async function listByArea(areaId: string) {
  return db.select().from(areaMovimentos)
    .where(eq(areaMovimentos.areaId, areaId as any))
    .orderBy(desc(areaMovimentos.data), desc(areaMovimentos.createdAt));
}

// ── Escrita ────────────────────────────────────────────────────────────────────

/** Abertura: registra um marco inicial sem alterar a projeção (a área já existe). */
export async function abrir(i: BaseInput & {
  areaId: string;
  nivel?: string;
  depois?: AreaSnapshot | null;
}) {
  return db.transaction(async (tx) => {
    let depois = i.depois ?? null;
    if (depois == null) {
      const [row] = await tx.select().from(farmLocais).where(eq(farmLocais.id, i.areaId as any));
      if (row) depois = snapshotLocal(row);
    }
    return inserirEvento(tx, { base: i, nivel: i.nivel ?? 'local', tipo: 'abertura', areaId: i.areaId, depois, dados: {} });
  });
}

export async function renomear(i: BaseInput & { areaId: string; name: string }) {
  return db.transaction(async (tx) => {
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { name: i.name });
    return inserirEvento(tx, { base: i, nivel: 'local', tipo: 'renomear', areaId: i.areaId, antes, depois, dados: {} });
  });
}

export async function remodelar(i: BaseInput & {
  areaId: string; geometry: Coords | null; geometrySource?: string | null; area?: string | null;
}) {
  return db.transaction(async (tx) => {
    const { antes, depois } = await patchLocalTx(tx, i.areaId, {
      geometry: i.geometry, geometrySource: i.geometrySource, area: i.area,
    });
    return inserirEvento(tx, { base: i, nivel: 'local', tipo: 'remodelar', areaId: i.areaId, antes, depois, dados: {} });
  });
}

export async function mover(i: BaseInput & {
  areaId: string; retiroId?: string | null; setorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { retiroId: i.retiroId, setorId: i.setorId });
    return inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'mover', areaId: i.areaId, antes, depois,
      dados: {
        de: { retiroId: antes.retiroId, setorId: antes.setorId },
        para: { retiroId: depois.retiroId, setorId: depois.setorId },
      },
    });
  });
}

export async function aposentar(i: BaseInput & { areaId: string; motivo?: string | null }) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(farmLocais).where(eq(farmLocais.id, i.areaId as any));
    if (!row) throw new Error(`Local não encontrado: ${i.areaId}`);
    await tx.update(farmLocais)
      .set({ status: 'aposentado', aposentadoEm: new Date(), updatedAt: new Date() })
      .where(eq(farmLocais.id, i.areaId as any));
    return inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'aposentar', areaId: i.areaId,
      antes: snapshotLocal(row), depois: null, dados: { motivo: i.motivo ?? null },
    });
  });
}

export async function reativar(i: BaseInput & { areaId: string }) {
  return db.transaction(async (tx) => {
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { status: 'ativo', aposentadoEm: null });
    return inserirEvento(tx, { base: i, nivel: 'local', tipo: 'reativar', areaId: i.areaId, antes, depois, dados: {} });
  });
}

export interface FilhoInput {
  name: string;
  tipo?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
  area?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}

/** Divide um local em N filhos: aposenta o pai, cria os filhos, registra a linhagem. */
export async function dividir(i: BaseInput & { parentId: string; filhos: FilhoInput[] }) {
  if (!Array.isArray(i.filhos) || i.filhos.length < 2) {
    throw new Error('Dividir exige ao menos 2 áreas-filho.');
  }
  return db.transaction(async (tx) => {
    const [pai] = await tx.select().from(farmLocais).where(eq(farmLocais.id, i.parentId as any));
    if (!pai) throw new Error(`Local não encontrado: ${i.parentId}`);

    // Cria os filhos (herdam do pai o que não for informado, exceto geometria/área).
    const filhosRows: any[] = [];
    for (const f of i.filhos) {
      const [novo] = await tx.insert(farmLocais).values({
        farmId: i.farmId,
        retiroId: (f.retiroId !== undefined ? f.retiroId : pai.retiroId) as any,
        setorId: (f.setorId !== undefined ? f.setorId : pai.setorId) as any,
        name: f.name,
        area: f.area ?? null,
        geometry: (f.geometry ?? null) as any,
        geometrySource: f.geometrySource ?? null,
        tipo: f.tipo !== undefined ? f.tipo : pai.tipo,
      }).returning();
      filhosRows.push(novo);
    }

    // Aposenta o pai.
    await tx.update(farmLocais)
      .set({ status: 'aposentado', aposentadoEm: new Date(), updatedAt: new Date() })
      .where(eq(farmLocais.id, i.parentId as any));

    // Evento no pai (com a lista de filhos) + um evento por filho (linhagem).
    const eventoPai = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'dividir', areaId: i.parentId,
      antes: snapshotLocal(pai), depois: null,
      dados: { filhos: filhosRows.map((c) => ({ id: c.id, name: c.name, area: c.area ?? null })) },
    });
    for (const c of filhosRows) {
      await inserirEvento(tx, {
        base: i, nivel: 'local', tipo: 'criado_divisao', areaId: c.id,
        antes: null, depois: snapshotLocal(c),
        dados: { divididoDe: i.parentId, divididoDeName: pai.name },
      });
    }
    return { pai: { id: i.parentId }, filhos: filhosRows, evento: eventoPai };
  });
}

/** Une N locais de origem em um destino (novo): cria o destino e aposenta as origens. */
export async function unir(i: BaseInput & { origemIds: string[]; destino: FilhoInput }) {
  if (!Array.isArray(i.origemIds) || i.origemIds.length < 2) {
    throw new Error('Unir exige ao menos 2 áreas de origem.');
  }
  return db.transaction(async (tx) => {
    const origens = await tx.select().from(farmLocais)
      .where(and(eq(farmLocais.farmId, i.farmId), inArray(farmLocais.id, i.origemIds as any)));
    if (origens.length !== i.origemIds.length) {
      throw new Error('Uma ou mais áreas de origem não foram encontradas.');
    }

    const [destino] = await tx.insert(farmLocais).values({
      farmId: i.farmId,
      retiroId: (i.destino.retiroId ?? origens[0].retiroId) as any,
      setorId: (i.destino.setorId ?? origens[0].setorId) as any,
      name: i.destino.name,
      area: i.destino.area ?? null,
      geometry: (i.destino.geometry ?? null) as any,
      geometrySource: i.destino.geometrySource ?? null,
      tipo: i.destino.tipo !== undefined ? i.destino.tipo : origens[0].tipo,
    }).returning();

    for (const o of origens) {
      await tx.update(farmLocais)
        .set({ status: 'aposentado', aposentadoEm: new Date(), updatedAt: new Date() })
        .where(eq(farmLocais.id, o.id as any));
    }

    const eventoDestino = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'unir', areaId: destino.id,
      antes: null, depois: snapshotLocal(destino),
      dados: { origens: origens.map((o) => ({ id: o.id, name: o.name })) },
    });
    for (const o of origens) {
      await inserirEvento(tx, {
        base: i, nivel: 'local', tipo: 'unido', areaId: o.id,
        antes: snapshotLocal(o), depois: null,
        dados: { unidoEm: destino.id, unidoEmName: destino.name },
      });
    }
    return { destino, origens, evento: eventoDestino };
  });
}

/** Ativa/desativa um nível da hierarquia (registra a mudança e atualiza a projeção). */
export async function mudarNivel(i: BaseInput & {
  nivel: 'retiro' | 'setor' | 'local';
  retiro: boolean; setor: boolean; local: boolean;
}) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(farmLocationLevels).where(eq(farmLocationLevels.farmId, i.farmId));
    const antes = cur
      ? { retiro: cur.retiro, setor: cur.setor, local: cur.local }
      : { retiro: true, setor: false, local: true };
    const para = { retiro: i.retiro, setor: i.setor, local: i.local };

    await tx.insert(farmLocationLevels)
      .values({ farmId: i.farmId, retiro: para.retiro, setor: para.setor, local: para.local })
      .onConflictDoUpdate({
        target: farmLocationLevels.farmId,
        set: { retiro: para.retiro, setor: para.setor, local: para.local, updatedAt: new Date() },
      });

    return inserirEvento(tx, {
      base: i, nivel: i.nivel, tipo: 'nivel', areaId: null,
      dados: { de: antes, para, nivelAlterado: i.nivel },
    });
  });
}
