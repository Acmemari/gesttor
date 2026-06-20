import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import {
  areaMovimentos, farmLocais, farmLocationLevels,
  mapaRebanhoLancamentos, mapaoLancamentos,
} from '../schema.js';
import { createVersao, closeOpenVersao, getOpenVersao } from './area-versoes.js';
import { rebanhoAtualPorLocalTx, resolveHeaderAtual, type RebanhoAtual } from './farm-locations.js';

/** Tolerância de hectares: soma dos destinos pode divergir até 5% da origem. */
export const AREA_TOLERANCIA_PCT = 0.05;

/** Realocação de rebanho: origemLocalId → destinoRef (índice do filho | id do destino). */
export type RealocacaoMap = Record<string, string>;

export interface RebanhoPendenteLocal {
  localId: string;
  name: string;
  total: number;
  porCategoria: { categoriaId: string; quantidade: number; pesoKgCabeca: string }[];
}

/** Há rebanho nos locais de origem e o chamador não informou a realocação. */
export class RebanhoPendenteError extends Error {
  code = 'REBANHO_PENDENTE' as const;
  constructor(public locais: RebanhoPendenteLocal[]) {
    super('Há rebanho alocado nos locais de origem; informe a realocação.');
    this.name = 'RebanhoPendenteError';
  }
}

/** Soma das áreas dos destinos diverge da origem além da tolerância (sem ack). */
export class ToleranciaError extends Error {
  code = 'AREA_TOLERANCIA' as const;
  constructor(public esperado: number, public informado: number, public difPct: number) {
    super(`Soma das áreas (${informado}) diverge ${(difPct * 100).toFixed(1)}% do esperado (${esperado}).`);
    this.name = 'ToleranciaError';
  }
}

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
  | 'unir' | 'unido' | 'nivel' | 'conversao_uso' | 'correcao';

export interface AreaSnapshot {
  name: string;
  area: string | null;
  geometry: Coords | null;
  geometrySource: string | null;
  tipo: string | null;
  uso: string | null;
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
    uso: row.uso ?? null,
    retiroId: row.retiroId ?? null,
    setorId: row.setorId ?? null,
  };
}

/** Lança se o local-alvo já está aposentado (só a nova identidade é editável). */
async function isAposentadoTx(tx: any, areaId: string): Promise<boolean> {
  const [row] = await tx.select({ status: farmLocais.status })
    .from(farmLocais).where(eq(farmLocais.id, areaId as any));
  return row?.status === 'aposentado';
}

/**
 * Abre a versão (area_versoes) de um local a partir do seu snapshot `depois`,
 * ligada ao movimento. Chamado dentro da tx do evento.
 */
async function abrirVersaoLocal(tx: any, base: BaseInput, areaId: string, snap: AreaSnapshot, movimentoId: string | null) {
  await createVersao(tx, {
    areaId,
    nivel: 'local',
    organizationId: base.organizationId,
    farmId: base.farmId,
    validFrom: base.data,
    geometry: snap.geometry,
    geometrySource: snap.geometrySource,
    uso: snap.uso,
    areaHa: snap.area,
    movimentoId,
  });
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
    const nivel = i.nivel ?? 'local';
    const ev = await inserirEvento(tx, { base: i, nivel, tipo: 'abertura', areaId: i.areaId, depois, dados: {} });
    // Abre a versão da linha do tempo se ainda não houver uma aberta (o backfill
    // já semeou as áreas pré-existentes; abertura retroativa pode ser a primeira).
    if (nivel === 'local' && depois && !(await getOpenVersao(tx, i.areaId))) {
      await abrirVersaoLocal(tx, i, i.areaId, depois, ev.id);
    }
    return ev;
  });
}

export async function renomear(i: BaseInput & { areaId: string; name: string }) {
  return db.transaction(async (tx) => {
    if (await isAposentadoTx(tx, i.areaId)) throw new Error('LOCAL_APOSENTADO');
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { name: i.name });
    // Nome é identidade-nível (lido ao vivo na reconstrução) — sem nova versão.
    return inserirEvento(tx, { base: i, nivel: 'local', tipo: 'renomear', areaId: i.areaId, antes, depois, dados: {} });
  });
}

export async function remodelar(i: BaseInput & {
  areaId: string; geometry: Coords | null; geometrySource?: string | null; area?: string | null;
}) {
  return db.transaction(async (tx) => {
    if (await isAposentadoTx(tx, i.areaId)) throw new Error('LOCAL_APOSENTADO');
    if (i.geometry != null && i.geometry.length < 3) throw new Error('GEOMETRY_INVALIDA');
    const { antes, depois } = await patchLocalTx(tx, i.areaId, {
      geometry: i.geometry, geometrySource: i.geometrySource, area: i.area,
    });
    const ev = await inserirEvento(tx, { base: i, nivel: 'local', tipo: 'remodelar', areaId: i.areaId, antes, depois, dados: {} });
    // Redesenho: fecha a versão vigente e abre uma nova com a geometria/área nova.
    await closeOpenVersao(tx, i.areaId, i.data);
    await abrirVersaoLocal(tx, i, i.areaId, depois, ev.id);
    return ev;
  });
}

/** Conversão de uso: mesma identidade/geometria, novo `uso`, nova versão. */
export async function conversaoUso(i: BaseInput & { areaId: string; uso: string }) {
  return db.transaction(async (tx) => {
    if (await isAposentadoTx(tx, i.areaId)) throw new Error('LOCAL_APOSENTADO');
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { uso: i.uso });
    const ev = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'conversao_uso', areaId: i.areaId,
      antes, depois, dados: { de: antes.uso ?? null, para: i.uso },
    });
    await closeOpenVersao(tx, i.areaId, i.data);
    await abrirVersaoLocal(tx, i, i.areaId, depois, ev.id);
    return ev;
  });
}

export async function mover(i: BaseInput & {
  areaId: string; retiroId?: string | null; setorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    if (await isAposentadoTx(tx, i.areaId)) throw new Error('LOCAL_APOSENTADO');
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { retiroId: i.retiroId, setorId: i.setorId });
    // Pai (retiro/setor) é identidade-nível (lido ao vivo) — sem nova versão.
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
    const ev = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'aposentar', areaId: i.areaId,
      antes: snapshotLocal(row), depois: null, dados: { motivo: i.motivo ?? null },
    });
    // Fecha a versão vigente (a área deixa de ter estado corrente).
    await closeOpenVersao(tx, i.areaId, i.data);
    return ev;
  });
}

export async function reativar(i: BaseInput & { areaId: string }) {
  return db.transaction(async (tx) => {
    const { antes, depois } = await patchLocalTx(tx, i.areaId, { status: 'ativo', aposentadoEm: null });
    const ev = await inserirEvento(tx, { base: i, nivel: 'local', tipo: 'reativar', areaId: i.areaId, antes, depois, dados: {} });
    // Abre uma versão nova (o índice parcial permite — aposentar fechou a anterior).
    await abrirVersaoLocal(tx, i, i.areaId, depois, ev.id);
    return ev;
  });
}

export interface FilhoInput {
  name: string;
  tipo?: string | null;
  uso?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
  area?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

/**
 * Valida a conservação de área. Soma dos destinos deve bater com a origem dentro
 * de AREA_TOLERANCIA_PCT. Sem dados completos, não valida. Sem ack e fora da
 * tolerância → lança ToleranciaError. Retorna {esperado,informado,difPct} ou null.
 */
function checkTolerancia(esperado: string | null, destinos: (string | null | undefined)[], ack?: boolean) {
  const exp = esperado != null && esperado !== '' ? Number(esperado) : NaN;
  const vals = destinos.map((d) => (d != null && d !== '' ? Number(d) : NaN));
  if (!Number.isFinite(exp) || exp <= 0 || vals.some((v) => !Number.isFinite(v))) return null;
  const soma = vals.reduce((s, v) => s + v, 0);
  const difPct = Math.round((Math.abs(soma - exp) / exp) * 1000) / 1000;
  if (difPct > AREA_TOLERANCIA_PCT && !ack) throw new ToleranciaError(round2(exp), round2(soma), difPct);
  return { esperado: round2(exp), informado: round2(soma), difPct };
}

/**
 * Re-aponta a alocação ATUAL (lançamentos do header vigente) de um local de
 * origem para um destino, mesclando quando já existe (header, destino, categoria):
 * soma quantidade, média ponderada de peso, remove a linha de origem. Headers
 * antigos não são tocados (histórico append-only).
 */
async function realocarRebanhoTx(
  tx: any, fonte: 'mapao' | 'mapa_rebanho', headerId: string, origemId: string, destinoId: string,
) {
  const lanc = fonte === 'mapao' ? mapaoLancamentos : mapaRebanhoLancamentos;
  const origemRows = await tx.select().from(lanc)
    .where(and(eq(lanc.mapaHeaderId, headerId as any), eq(lanc.localId, origemId as any)));
  for (const o of origemRows) {
    const [dest] = await tx.select().from(lanc).where(and(
      eq(lanc.mapaHeaderId, headerId as any),
      eq(lanc.localId, destinoId as any),
      eq(lanc.categoriaId, o.categoriaId as any),
    ));
    if (!dest) {
      await tx.update(lanc).set({ localId: destinoId as any, updatedAt: new Date() }).where(eq(lanc.id, o.id));
    } else {
      const qO = Number(o.quantidade), qD = Number(dest.quantidade);
      const pO = Number(o.pesoKgCabeca), pD = Number(dest.pesoKgCabeca);
      const qNew = qO + qD;
      const pNew = qNew > 0 ? (pO * qO + pD * qD) / qNew : 0;
      await tx.update(lanc)
        .set({ quantidade: qNew, pesoKgCabeca: pNew.toFixed(2), updatedAt: new Date() })
        .where(eq(lanc.id, dest.id));
      await tx.delete(lanc).where(eq(lanc.id, o.id));
    }
  }
}

/**
 * Divide um local em N filhos: aposenta o pai, cria os filhos, registra a
 * linhagem e abre as versões. Bloqueia se o pai tem rebanho e nenhum destino foi
 * informado (REBANHO_PENDENTE); migra a alocação atual para o filho escolhido.
 */
export async function dividir(i: BaseInput & {
  parentId: string; filhos: FilhoInput[]; realocacao?: RealocacaoMap; ackTolerancia?: boolean;
}) {
  if (!Array.isArray(i.filhos) || i.filhos.length < 2) {
    throw new Error('Dividir exige ao menos 2 áreas-filho.');
  }
  return db.transaction(async (tx) => {
    if (await isAposentadoTx(tx, i.parentId)) throw new Error('LOCAL_APOSENTADO');
    const [pai] = await tx.select().from(farmLocais).where(eq(farmLocais.id, i.parentId as any));
    if (!pai) throw new Error(`Local não encontrado: ${i.parentId}`);

    // Bloqueio de rebanho ANTES de mutar (a transação reverte tudo se faltar destino).
    const reb: RebanhoAtual = await rebanhoAtualPorLocalTx(tx, i.farmId, i.parentId);
    if (reb.total > 0 && !i.realocacao?.[i.parentId]) {
      throw new RebanhoPendenteError([
        { localId: i.parentId, name: pai.name, total: reb.total, porCategoria: reb.porCategoria },
      ]);
    }

    // Conservação de área (avisa/bloqueia sem ack).
    const tol = checkTolerancia(pai.area, i.filhos.map((f) => f.area ?? null), i.ackTolerancia);

    // Cria os filhos (herdam do pai o que não for informado).
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
        uso: f.uso !== undefined ? f.uso : pai.uso,
      }).returning();
      filhosRows.push(novo);
    }

    // Migra o rebanho atual do pai para o filho escolhido (índice na lista de filhos).
    if (reb.total > 0) {
      const idx = Number(i.realocacao![i.parentId]);
      const destino = Number.isInteger(idx) ? filhosRows[idx] : undefined;
      if (!destino) throw new Error('REALOCACAO_DESTINO_INVALIDO');
      const header = await resolveHeaderAtual(tx, i.farmId);
      if (header) await realocarRebanhoTx(tx, header.fonte, header.headerId, i.parentId, destino.id);
    }

    // Aposenta o pai + fecha a versão dele.
    await tx.update(farmLocais)
      .set({ status: 'aposentado', aposentadoEm: new Date(), updatedAt: new Date() })
      .where(eq(farmLocais.id, i.parentId as any));
    await closeOpenVersao(tx, i.parentId, i.data);

    // Evento no pai (lista de filhos) + um evento + versão por filho (linhagem).
    const eventoPai = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'dividir', areaId: i.parentId,
      antes: snapshotLocal(pai), depois: null,
      dados: {
        filhos: filhosRows.map((c) => ({ id: c.id, name: c.name, area: c.area ?? null })),
        ...(reb.total > 0 ? { realocacao: i.realocacao } : {}),
        ...(tol && tol.difPct > AREA_TOLERANCIA_PCT ? { toleranciaAck: tol } : {}),
      },
    });
    for (const c of filhosRows) {
      const evFilho = await inserirEvento(tx, {
        base: i, nivel: 'local', tipo: 'criado_divisao', areaId: c.id,
        antes: null, depois: snapshotLocal(c),
        dados: { divididoDe: i.parentId, divididoDeName: pai.name },
      });
      await abrirVersaoLocal(tx, i, c.id, snapshotLocal(c), evFilho.id);
    }
    return { pai: { id: i.parentId }, filhos: filhosRows, evento: eventoPai };
  });
}

/**
 * Une N locais de origem num destino novo: cria o destino, aposenta as origens,
 * registra a linhagem e abre a versão do destino. Bloqueia se alguma origem tem
 * rebanho sem destino informado; migra a alocação atual de cada origem ao destino.
 */
export async function unir(i: BaseInput & {
  origemIds: string[]; destino: FilhoInput; realocacao?: RealocacaoMap; ackTolerancia?: boolean;
}) {
  if (!Array.isArray(i.origemIds) || i.origemIds.length < 2) {
    throw new Error('Unir exige ao menos 2 áreas de origem.');
  }
  return db.transaction(async (tx) => {
    const origens = await tx.select().from(farmLocais)
      .where(and(eq(farmLocais.farmId, i.farmId), inArray(farmLocais.id, i.origemIds as any)));
    if (origens.length !== i.origemIds.length) {
      throw new Error('Uma ou mais áreas de origem não foram encontradas.');
    }
    if (origens.some((o: any) => o.status === 'aposentado')) throw new Error('LOCAL_APOSENTADO');

    // Bloqueio de rebanho: cada origem com rebanho precisa de destino informado.
    const comRebanho: { o: any; reb: RebanhoAtual }[] = [];
    for (const o of origens) {
      const reb = await rebanhoAtualPorLocalTx(tx, i.farmId, o.id);
      if (reb.total > 0) comRebanho.push({ o, reb });
    }
    const pendentes = comRebanho.filter(({ o }) => !i.realocacao?.[o.id]);
    if (pendentes.length > 0) {
      throw new RebanhoPendenteError(pendentes.map(({ o, reb }) => ({
        localId: o.id, name: o.name, total: reb.total, porCategoria: reb.porCategoria,
      })));
    }

    // Conservação de área: soma das origens ≈ destino.
    const tol = checkTolerancia(i.destino.area ?? null, origens.map((o: any) => o.area ?? null), i.ackTolerancia);

    const [destino] = await tx.insert(farmLocais).values({
      farmId: i.farmId,
      retiroId: (i.destino.retiroId ?? origens[0].retiroId) as any,
      setorId: (i.destino.setorId ?? origens[0].setorId) as any,
      name: i.destino.name,
      area: i.destino.area ?? null,
      geometry: (i.destino.geometry ?? null) as any,
      geometrySource: i.destino.geometrySource ?? null,
      tipo: i.destino.tipo !== undefined ? i.destino.tipo : origens[0].tipo,
      uso: i.destino.uso !== undefined ? i.destino.uso : origens[0].uso,
    }).returning();

    // Migra o rebanho atual de cada origem para o destino único.
    if (comRebanho.length > 0) {
      const header = await resolveHeaderAtual(tx, i.farmId);
      if (header) {
        for (const { o } of comRebanho) {
          await realocarRebanhoTx(tx, header.fonte, header.headerId, o.id, destino.id);
        }
      }
    }

    // Aposenta as origens + fecha as versões.
    for (const o of origens) {
      await tx.update(farmLocais)
        .set({ status: 'aposentado', aposentadoEm: new Date(), updatedAt: new Date() })
        .where(eq(farmLocais.id, o.id as any));
      await closeOpenVersao(tx, o.id, i.data);
    }

    const eventoDestino = await inserirEvento(tx, {
      base: i, nivel: 'local', tipo: 'unir', areaId: destino.id,
      antes: null, depois: snapshotLocal(destino),
      dados: {
        origens: origens.map((o: any) => ({ id: o.id, name: o.name })),
        ...(comRebanho.length > 0 ? { realocacao: i.realocacao } : {}),
        ...(tol && tol.difPct > AREA_TOLERANCIA_PCT ? { toleranciaAck: tol } : {}),
      },
    });
    await abrirVersaoLocal(tx, i, destino.id, snapshotLocal(destino), eventoDestino.id);
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
