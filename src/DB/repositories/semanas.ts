import { eq, desc, and, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import { semanas, atividades, historicoSemanas } from '../schema.js';

// ── Semanas ────────────────────────────────────────────────────────────────────

export async function getCurrentSemana(modo: string, farmId?: string | null) {
  const conditions = farmId
    ? and(eq(semanas.aberta, true), eq(semanas.modo, modo), eq(semanas.farmId, farmId))
    : and(eq(semanas.aberta, true), eq(semanas.modo, modo), isNull(semanas.farmId));
  const [row] = await db.select().from(semanas).where(conditions).orderBy(desc(semanas.numero)).limit(1);
  return row;
}

export async function getSemanaById(id: string) {
  const [row] = await db.select().from(semanas).where(eq(semanas.id, id)).limit(1);
  return row;
}

export async function getSemanaByNumero(numero: number, modo: string, farmId?: string | null) {
  const conditions = farmId
    ? and(eq(semanas.numero, numero), eq(semanas.modo, modo), eq(semanas.farmId, farmId))
    : and(eq(semanas.numero, numero), eq(semanas.modo, modo), isNull(semanas.farmId));
  const [row] = await db.select().from(semanas).where(conditions).limit(1);
  return row;
}

export async function createSemana(data: {
  numero: number;
  modo: string;
  aberta?: boolean;
  dataInicio: string;
  dataFim: string;
  farmId?: string;
}) {
  const [row] = await db.insert(semanas).values({
    numero: data.numero,
    modo: data.modo,
    aberta: data.aberta ?? true,
    dataInicio: data.dataInicio,
    dataFim: data.dataFim,
    farmId: data.farmId ?? null,
  }).returning();
  return row;
}

export async function updateSemana(id: string, data: Partial<{
  numero: number;
  modo: string;
  aberta: boolean;
  dataInicio: string;
  dataFim: string;
  farmId: string | null;
}>) {
  const [row] = await db.update(semanas).set(data).where(eq(semanas.id, id)).returning();
  return row;
}

export async function deleteSemana(id: string) {
  await db.delete(semanas).where(eq(semanas.id, id));
}

// ── Atividades ─────────────────────────────────────────────────────────────────

export async function listAtividadesBySemana(semanaId: string) {
  return db.select().from(atividades).where(eq(atividades.semanaId, semanaId));
}

export async function getAtividadeById(id: string) {
  const [row] = await db.select().from(atividades).where(eq(atividades.id, id)).limit(1);
  return row;
}

export async function createAtividade(data: {
  semana_id: string;
  titulo: string;
  descricao?: string;
  pessoa_id?: string;
  data_termino?: string;
  tag?: string;
  status?: string;
}) {
  const [row] = await db.insert(atividades).values({
    semanaId: data.semana_id,
    titulo: data.titulo,
    descricao: data.descricao ?? '',
    pessoaId: data.pessoa_id ?? null,
    dataTermino: data.data_termino ?? null,
    tag: data.tag ?? '#planejamento',
    status: data.status ?? 'a fazer',
  }).returning();
  return row;
}

export async function createAtividadesBulk(items: Array<{
  semana_id: string;
  titulo: string;
  descricao?: string;
  pessoa_id?: string | null;
  data_termino?: string | null;
  tag?: string;
  status?: string;
}>) {
  if (items.length === 0) return [];
  return db.insert(atividades).values(items.map(item => ({
    semanaId: item.semana_id,
    titulo: item.titulo,
    descricao: item.descricao ?? '',
    pessoaId: item.pessoa_id ?? null,
    dataTermino: item.data_termino ?? null,
    tag: item.tag ?? '#planejamento',
    status: item.status ?? 'a fazer',
  }))).returning();
}

export async function updateAtividade(id: string, data: Partial<{
  titulo: string;
  descricao: string;
  pessoa_id: string | null;
  data_termino: string | null;
  tag: string;
  status: string;
}>) {
  const mapped: Record<string, unknown> = {};
  if (data.titulo !== undefined) mapped.titulo = data.titulo;
  if (data.descricao !== undefined) mapped.descricao = data.descricao;
  if ('pessoa_id' in data) mapped.pessoaId = data.pessoa_id;
  if ('data_termino' in data) mapped.dataTermino = data.data_termino;
  if (data.tag !== undefined) mapped.tag = data.tag;
  if (data.status !== undefined) mapped.status = data.status;
  const [row] = await db.update(atividades).set(mapped).where(eq(atividades.id, id)).returning();
  return row;
}

export async function deleteAtividade(id: string) {
  await db.delete(atividades).where(eq(atividades.id, id));
}

export async function deleteAtividadesBySemana(semanaId: string) {
  await db.delete(atividades).where(eq(atividades.semanaId, semanaId));
}

// ── Historico ──────────────────────────────────────────────────────────────────

export async function listHistoricoByFarm(farmId: string | null) {
  const condition = farmId
    ? eq(historicoSemanas.farmId, farmId)
    : isNull(historicoSemanas.farmId);
  return db.select().from(historicoSemanas)
    .where(condition)
    .orderBy(desc(historicoSemanas.closedAt));
}

export async function createHistorico(data: {
  semana_id?: string;
  farm_id?: string;
  semana_numero: number;
  total: number;
  concluidas: number;
  pendentes: number;
}) {
  const [row] = await db.insert(historicoSemanas).values({
    semanaId: data.semana_id ?? null,
    farmId: data.farm_id ?? null,
    semanaNumero: data.semana_numero,
    total: data.total,
    concluidas: data.concluidas,
    pendentes: data.pendentes,
  }).returning();
  return row;
}

export async function getHistoricoById(id: string) {
  const [row] = await db.select().from(historicoSemanas).where(eq(historicoSemanas.id, id)).limit(1);
  return row;
}

export async function deleteHistorico(id: string) {
  await db.delete(historicoSemanas).where(eq(historicoSemanas.id, id));
}
