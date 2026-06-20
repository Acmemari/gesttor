import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../index.js';
import {
  farmRetiros, farmSetores, farmLocais, farmLocationLevels,
  mapaRebanhoLancamentos, mapaoLancamentos,
  mapaRebanhoHeaders, mapaoHeaders,
} from '../schema.js';
import { getFarm } from './hierarchy.js';

// Geometria do mapa de áreas: anel [lat,lng][] cru (jsonb).
type Coords = [number, number][];

// ── Retiros ──────────────────────────────────────────────────────────────────

export async function getRetiros(farmId: string) {
  return db.select().from(farmRetiros).where(eq(farmRetiros.farmId, farmId));
}

export async function createRetiro(data: {
  farmId: string;
  name: string;
  totalArea?: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const [row] = await db.insert(farmRetiros).values({
    farmId: data.farmId,
    name: data.name,
    totalArea: data.totalArea ?? null,
    isDefault: data.isDefault ?? false,
    dataInicial: data.dataInicial ?? null,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
  }).returning();
  return row;
}

export async function updateRetiro(id: string, data: {
  name?: string;
  totalArea?: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.totalArea !== undefined) set.totalArea = data.totalArea;
  if (data.isDefault !== undefined) set.isDefault = data.isDefault;
  if (data.dataInicial !== undefined) set.dataInicial = data.dataInicial;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
  const [row] = await db.update(farmRetiros)
    .set(set)
    .where(eq(farmRetiros.id, id as any))
    .returning();
  return row;
}

export async function deleteRetiro(id: string) {
  const [row] = await db.select({ isDefault: farmRetiros.isDefault })
    .from(farmRetiros).where(eq(farmRetiros.id, id as any));
  if (row?.isDefault) throw new Error('DEFAULT_RECORD_PROTECTED');
  await db.delete(farmRetiros).where(eq(farmRetiros.id, id as any));
}

// ── Setores ──────────────────────────────────────────────────────────────────
// Nível opcional entre Retiro e Local. `retiroId` é nulo quando o nível Retiro
// está desativado (o setor ancora direto na fazenda).

export async function getSetores(farmId: string) {
  return db.select().from(farmSetores).where(eq(farmSetores.farmId, farmId));
}

export async function getSetoresByRetiro(retiroId: string) {
  return db.select().from(farmSetores).where(eq(farmSetores.retiroId, retiroId as any));
}

export async function createSetor(data: {
  farmId: string;
  retiroId?: string | null;
  name: string;
  area?: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const [row] = await db.insert(farmSetores).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
    isDefault: data.isDefault ?? false,
    dataInicial: data.dataInicial ?? null,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
  }).returning();
  return row;
}

export async function updateSetor(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  if (data.dataInicial !== undefined) set.dataInicial = data.dataInicial;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
  const [row] = await db.update(farmSetores)
    .set(set)
    .where(eq(farmSetores.id, id as any))
    .returning();
  return row;
}

export async function deleteSetor(id: string) {
  const [row] = await db.select({ isDefault: farmSetores.isDefault })
    .from(farmSetores).where(eq(farmSetores.id, id as any));
  if (row?.isDefault) throw new Error('DEFAULT_RECORD_PROTECTED');
  await db.delete(farmSetores).where(eq(farmSetores.id, id as any));
}

// ── Locais ───────────────────────────────────────────────────────────────────

// Por padrão as leituras retornam apenas locais ATIVOS (não aposentados). A
// Movimentação de Áreas pode pedir `incluirAposentados` para exibir o histórico.

export async function getLocais(retiroId: string, incluirAposentados = false) {
  const cond = incluirAposentados
    ? eq(farmLocais.retiroId, retiroId as any)
    : and(eq(farmLocais.retiroId, retiroId as any), eq(farmLocais.status, 'ativo'));
  return db.select().from(farmLocais).where(cond);
}

export async function getLocaisBySetor(setorId: string, incluirAposentados = false) {
  const cond = incluirAposentados
    ? eq(farmLocais.setorId, setorId as any)
    : and(eq(farmLocais.setorId, setorId as any), eq(farmLocais.status, 'ativo'));
  return db.select().from(farmLocais).where(cond);
}

export async function getLocaisByFarm(farmId: string, incluirAposentados = false) {
  const cond = incluirAposentados
    ? eq(farmLocais.farmId, farmId)
    : and(eq(farmLocais.farmId, farmId), eq(farmLocais.status, 'ativo'));
  return db.select({
    id: farmLocais.id,
    retiroId: farmLocais.retiroId,
    setorId: farmLocais.setorId,
    farmId: farmLocais.farmId,
    name: farmLocais.name,
    area: farmLocais.area,
    isDefault: farmLocais.isDefault,
    dataInicial: farmLocais.dataInicial,
    geometry: farmLocais.geometry,
    geometrySource: farmLocais.geometrySource,
    tipo: farmLocais.tipo,
    uso: farmLocais.uso,
    status: farmLocais.status,
    aposentadoEm: farmLocais.aposentadoEm,
    createdAt: farmLocais.createdAt,
    updatedAt: farmLocais.updatedAt,
    retiroName: farmRetiros.name,
    setorName: farmSetores.name,
  })
  .from(farmLocais)
  .leftJoin(farmRetiros, eq(farmLocais.retiroId, farmRetiros.id))
  .leftJoin(farmSetores, eq(farmLocais.setorId, farmSetores.id))
  .where(cond);
}

export async function createLocal(data: {
  farmId: string;
  retiroId?: string | null;
  setorId?: string | null;
  name: string;
  area?: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
  tipo?: string | null;
}) {
  const [row] = await db.insert(farmLocais).values({
    farmId: data.farmId,
    retiroId: (data.retiroId ?? null) as any,
    setorId: (data.setorId ?? null) as any,
    name: data.name,
    area: data.area ?? null,
    isDefault: data.isDefault ?? false,
    dataInicial: data.dataInicial ?? null,
    geometry: data.geometry ?? null,
    geometrySource: data.geometrySource ?? null,
    tipo: data.tipo ?? null,
  }).returning();
  return row;
}

export async function updateLocal(id: string, data: {
  name?: string;
  area?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
  dataInicial?: string | null;
  geometry?: Coords | null;
  geometrySource?: string | null;
  tipo?: string | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.area !== undefined) set.area = data.area;
  if (data.retiroId !== undefined) set.retiroId = data.retiroId;
  if (data.setorId !== undefined) set.setorId = data.setorId;
  if (data.dataInicial !== undefined) set.dataInicial = data.dataInicial;
  if (data.geometry !== undefined) set.geometry = data.geometry;
  if (data.geometrySource !== undefined) set.geometrySource = data.geometrySource;
  if (data.tipo !== undefined) set.tipo = data.tipo;
  const [row] = await db.update(farmLocais)
    .set(set)
    .where(eq(farmLocais.id, id as any))
    .returning();
  return row;
}

export async function deleteLocal(id: string) {
  const [row] = await db.select({ isDefault: farmLocais.isDefault })
    .from(farmLocais).where(eq(farmLocais.id, id as any));
  if (row?.isDefault) throw new Error('DEFAULT_RECORD_PROTECTED');
  await db.delete(farmLocais).where(eq(farmLocais.id, id as any));
}

/**
 * Conta lançamentos de mapa_rebanho/mapão que referenciam o local. Com a FK em
 * ON DELETE RESTRICT, esses lançamentos BLOQUEIAM a exclusão definitiva — por
 * isso o caminho padrão é APOSENTAR (farm_locais.status), que preserva tudo.
 * As demais referências (nascimento/morte/desmame/mudança/venda/compra) são
 * `set null`. Usado para explicar ao usuário por que aposentar em vez de excluir.
 */
export async function countLocalDependents(localId: string): Promise<{ mapaRebanho: number; mapao: number; total: number }> {
  const [mr] = await db.select({ c: sql<number>`count(*)::int` })
    .from(mapaRebanhoLancamentos).where(eq(mapaRebanhoLancamentos.localId, localId as any));
  const [mp] = await db.select({ c: sql<number>`count(*)::int` })
    .from(mapaoLancamentos).where(eq(mapaoLancamentos.localId, localId as any));
  const mapaRebanho = Number(mr?.c ?? 0);
  const mapao = Number(mp?.c ?? 0);
  return { mapaRebanho, mapao, total: mapaRebanho + mapao };
}

// ── Rebanho atual alocado a um Local (para realocação em dividir/unir) ──────────
// "Rebanho atual num Local" = lançamentos do header mais recente por
// data_referencia da fazenda — Mapão se existir, senão Estoque de Partida
// (mapa_rebanho). NUNCA soma os dois. Prefere header status='salvo' (rascunho é
// WIP). Só a alocação atual migra no split/merge; headers antigos são histórico.

export interface AlocacaoCategoria { categoriaId: string; quantidade: number; pesoKgCabeca: string; }
export interface RebanhoAtual {
  fonte: 'mapao' | 'mapa_rebanho' | 'nenhuma';
  headerId: string | null;
  dataReferencia: string | null;
  porCategoria: AlocacaoCategoria[];
  total: number;
}

/** Header vigente da fazenda (Mapão preferido; salvo preferido sobre rascunho). */
export async function resolveHeaderAtual(exec: any, farmId: string):
  Promise<{ fonte: 'mapao' | 'mapa_rebanho'; headerId: string; dataReferencia: string } | null> {
  const pick = async (table: any) => {
    const salvo = await exec.select().from(table)
      .where(and(eq(table.farmId, farmId), eq(table.status, 'salvo')))
      .orderBy(desc(table.dataReferencia)).limit(1);
    if (salvo[0]) return salvo[0];
    const qualquer = await exec.select().from(table)
      .where(eq(table.farmId, farmId)).orderBy(desc(table.dataReferencia)).limit(1);
    return qualquer[0] ?? null;
  };
  const mp = await pick(mapaoHeaders);
  if (mp) return { fonte: 'mapao', headerId: mp.id, dataReferencia: mp.dataReferencia };
  const mr = await pick(mapaRebanhoHeaders);
  if (mr) return { fonte: 'mapa_rebanho', headerId: mr.id, dataReferencia: mr.dataReferencia };
  return null;
}

async function rebanhoAtual(exec: any, farmId: string, localId: string): Promise<RebanhoAtual> {
  const h = await resolveHeaderAtual(exec, farmId);
  if (!h) return { fonte: 'nenhuma', headerId: null, dataReferencia: null, porCategoria: [], total: 0 };
  const lanc = h.fonte === 'mapao' ? mapaoLancamentos : mapaRebanhoLancamentos;
  const rows = await exec.select({
    categoriaId: lanc.categoriaId, quantidade: lanc.quantidade, pesoKgCabeca: lanc.pesoKgCabeca,
  }).from(lanc).where(and(eq(lanc.mapaHeaderId, h.headerId as any), eq(lanc.localId, localId as any)));
  const porCategoria: AlocacaoCategoria[] = rows
    .map((r: any) => ({ categoriaId: r.categoriaId, quantidade: Number(r.quantidade), pesoKgCabeca: String(r.pesoKgCabeca) }))
    .filter((c: AlocacaoCategoria) => c.quantidade > 0);
  return {
    fonte: h.fonte, headerId: h.headerId, dataReferencia: h.dataReferencia,
    porCategoria, total: porCategoria.reduce((s, c) => s + c.quantidade, 0),
  };
}

export const rebanhoAtualPorLocal = (farmId: string, localId: string) => rebanhoAtual(db, farmId, localId);
export const rebanhoAtualPorLocalTx = (tx: any, farmId: string, localId: string) => rebanhoAtual(tx, farmId, localId);

// ── Níveis ativos por fazenda ─────────────────────────────────────────────────
// A Fazenda é sempre a raiz; aqui guardamos apenas quais níveis intermediários/
// folha estão ativos. Sem linha ⇒ default sensato (retiro on, setor off, local on),
// com a exceção: se a fazenda só tem um retiro padrão (legado "sem retiro"),
// o nível Retiro começa desativado para refletir a UX anterior.

export interface LocationLevels {
  retiro: boolean;
  setor: boolean;
  local: boolean;
  // O usuário já escolheu explicitamente a combinação de níveis? (gate da aba Locais)
  configured?: boolean;
  // A fazenda controla os locais com mapa (colunas + mapa) ou sem mapa (só colunas)?
  usarMapa?: boolean;
}

export async function getLevels(farmId: string): Promise<LocationLevels> {
  const [row] = await db.select().from(farmLocationLevels).where(eq(farmLocationLevels.farmId, farmId));
  if (row) return { retiro: row.retiro, setor: row.setor, local: row.local, configured: row.configured, usarMapa: row.usarMapa };

  // Sem config explícita: deriva um default a partir dos dados existentes.
  const retiros = await db.select().from(farmRetiros).where(eq(farmRetiros.farmId, farmId));
  const soPadrao = retiros.length === 1 && retiros[0].isDefault === true;
  const semRetiros = retiros.length === 0;
  return { retiro: !(soPadrao || semRetiros), setor: false, local: true, configured: false, usarMapa: true };
}

// Nome do registro automático de cada nível desligado. A aba "Locais" envia o
// nome do nível anterior (o pai ativo) ao desativar um nível, para que o registro
// gravado herde esse nome em vez de cair no nome da fazenda.
export interface DefaultNames {
  retiro?: string | null;
  setor?: string | null;
  local?: string | null;
}

export async function setLevels(
  farmId: string,
  levels: LocationLevels,
  autoNames?: DefaultNames,
  // Quando definido, grava o flag de "combinação escolhida". Omitido ⇒ preserva o
  // valor atual (toggles/auto-ativação não devem rebaixar uma fazenda já configurada).
  configured?: boolean,
  // Idem: quando definido grava "controlar locais com mapa". Omitido ⇒ preserva o
  // valor atual — assim os toggles de nível (que não enviam usarMapa) não o zeram.
  usarMapa?: boolean,
): Promise<LocationLevels> {
  const [row] = await db.insert(farmLocationLevels)
    .values({ farmId, retiro: levels.retiro, setor: levels.setor, local: levels.local, configured: configured ?? false, usarMapa: usarMapa ?? true })
    .onConflictDoUpdate({
      target: farmLocationLevels.farmId,
      set: {
        retiro: levels.retiro, setor: levels.setor, local: levels.local, updatedAt: new Date(),
        ...(configured !== undefined ? { configured } : {}),
        ...(usarMapa !== undefined ? { usarMapa } : {}),
      },
    })
    .returning();
  // Ao desligar um nível, garante o registro padrão (âncora) daquele nível —
  // nomeado com o nível anterior quando a UI manda `autoNames`. Idempotente
  // (find-or-create + sincroniza o nome), seguro chamar sempre.
  const farm = await getFarm(farmId);
  await ensureDefaultSpine(
    farmId,
    farm?.name ?? 'Padrão',
    { retiro: row.retiro, setor: row.setor, local: row.local },
    autoNames,
  );
  return { retiro: row.retiro, setor: row.setor, local: row.local, configured: row.configured, usarMapa: row.usarMapa };
}

// ── Registros padrão (âncora) por nível ───────────────────────────────────────
// Generaliza o farm_retiros.is_default para setor e local. Quando um nível está
// desligado, o usuário não escolhe aquele nível, então as movimentações precisam
// de uma folha real onde ancorar: um registro padrão (is_default=true, nome = nome
// da fazenda), oculto da UI. Índices parciais únicos (uq_farm_*_default) garantem
// no máximo um padrão por fazenda em cada nível.

async function findDefaultRetiro(farmId: string) {
  const [row] = await db.select().from(farmRetiros)
    .where(and(eq(farmRetiros.farmId, farmId), eq(farmRetiros.isDefault, true))).limit(1);
  return row ?? null;
}
async function findDefaultSetor(farmId: string) {
  const [row] = await db.select().from(farmSetores)
    .where(and(eq(farmSetores.farmId, farmId), eq(farmSetores.isDefault, true))).limit(1);
  return row ?? null;
}
async function findDefaultLocal(farmId: string) {
  const [row] = await db.select().from(farmLocais)
    .where(and(eq(farmLocais.farmId, farmId), eq(farmLocais.isDefault, true))).limit(1);
  return row ?? null;
}

// `syncName`: quando true, renomeia o registro padrão existente se o nome mudou
// (a UI desativou o nível e mandou o nome do nível anterior). Sem isso é só
// find-or-create — usado pelos caminhos que só precisam da âncora (movimentos).
async function ensureDefaultRetiro(farmId: string, name: string, syncName = false): Promise<string> {
  const found = await findDefaultRetiro(farmId);
  if (found) {
    if (syncName && name && found.name !== name) {
      await db.update(farmRetiros).set({ name, updatedAt: new Date() }).where(eq(farmRetiros.id, found.id as any));
    }
    return found.id;
  }
  const [row] = await db.insert(farmRetiros)
    .values({ farmId, name, isDefault: true }).onConflictDoNothing().returning();
  return row?.id ?? (await findDefaultRetiro(farmId))!.id;
}
async function ensureDefaultSetor(farmId: string, name: string, retiroId: string | null, syncName = false): Promise<string> {
  const found = await findDefaultSetor(farmId);
  if (found) {
    if (syncName && name && found.name !== name) {
      await db.update(farmSetores).set({ name, updatedAt: new Date() }).where(eq(farmSetores.id, found.id as any));
    }
    return found.id;
  }
  const [row] = await db.insert(farmSetores)
    .values({ farmId, retiroId: retiroId as any, name, isDefault: true }).onConflictDoNothing().returning();
  return row?.id ?? (await findDefaultSetor(farmId))!.id;
}
async function ensureDefaultLocal(
  farmId: string, name: string, retiroId: string | null, setorId: string | null, syncName = false,
): Promise<string> {
  const found = await findDefaultLocal(farmId);
  if (found) {
    if (syncName && name && found.name !== name) {
      await db.update(farmLocais).set({ name, updatedAt: new Date() }).where(eq(farmLocais.id, found.id as any));
    }
    return found.id;
  }
  const [row] = await db.insert(farmLocais)
    .values({ farmId, retiroId: retiroId as any, setorId: setorId as any, name, isDefault: true })
    .onConflictDoNothing().returning();
  return row?.id ?? (await findDefaultLocal(farmId))!.id;
}

/**
 * Garante o registro padrão de cada nível DESLIGADO, parentado ao padrão do nível
 * acima quando este também está desligado. Quando o nível Local está desligado,
 * materializa a folha-âncora (local padrão). Idempotente. `autoNames` (vindo da
 * UI ao desativar) nomeia cada padrão com o nível anterior; sem ele cai no nome
 * da fazenda e os nomes existentes não são tocados.
 */
export async function ensureDefaultSpine(
  farmId: string,
  farmName: string,
  levels: LocationLevels,
  autoNames?: DefaultNames,
) {
  const sync = !!autoNames;
  const pick = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : farmName);
  const retiroId = !levels.retiro ? await ensureDefaultRetiro(farmId, pick(autoNames?.retiro), sync) : null;
  const setorId = !levels.setor ? await ensureDefaultSetor(farmId, pick(autoNames?.setor), retiroId, sync) : null;
  const localId = !levels.local ? await ensureDefaultLocal(farmId, pick(autoNames?.local), retiroId, setorId, sync) : null;
  return { retiroId, setorId, localId };
}

/**
 * Id do local padrão (folha-âncora) da fazenda, criando a spine sob demanda se
 * preciso. Usado pelos repositórios de movimento para nunca gravar local_id nulo
 * quando há fazenda. O pai do local padrão usa os padrões dos níveis desligados
 * (ou nulo/fazenda para níveis ligados).
 */
export async function resolveDefaultLocalId(farmId: string): Promise<string | null> {
  const existing = await findDefaultLocal(farmId);
  if (existing) return existing.id;
  const farm = await getFarm(farmId);
  if (!farm) return null;
  const levels = await getLevels(farmId);
  const retiroId = !levels.retiro ? await ensureDefaultRetiro(farmId, farm.name) : null;
  const setorId = !levels.setor ? await ensureDefaultSetor(farmId, farm.name, retiroId) : null;
  return ensureDefaultLocal(farmId, farm.name, retiroId, setorId);
}

// ── Bundle: tudo o que a aba "Locais" precisa numa chamada ─────────────────────

export async function getFarmLocationBundle(farmId: string, incluirAposentados = false) {
  const [retiros, setores, locais, levels, farm] = await Promise.all([
    getRetiros(farmId),
    getSetores(farmId),
    getLocaisByFarm(farmId, incluirAposentados),
    getLevels(farmId),
    getFarm(farmId),
  ]);
  const perimeter = farm
    ? { geometry: (farm as any).perimeterGeometry ?? null, source: (farm as any).perimeterSource ?? null }
    : { geometry: null, source: null };
  // Fazendas que já têm áreas do usuário foram, na prática, configuradas — mesmo
  // sem o flag explícito (config derivada). Assim não voltam a cair no gate.
  const hasUserAreas =
    retiros.some((r: any) => !r.isDefault) ||
    setores.some((s: any) => !s.isDefault) ||
    locais.some((l: any) => !l.isDefault);
  const effLevels = { ...levels, configured: !!levels.configured || hasUserAreas };
  return { retiros, setores, locais, levels: effLevels, perimeter };
}
