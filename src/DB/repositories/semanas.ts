import { eq, desc, and, isNull, asc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../index.js';
import { semanas, atividades, historicoSemanas, semanaParticipantes, people } from '../schema.js';

// ── Semanas ────────────────────────────────────────────────────────────────────

/**
 * Busca semana por data de início (ignora modo), mesclando duplicatas civil/safra.
 * Quando existem dois registros para a mesma data (um 'ano' e um 'safra'),
 * reatribui todas as atividades ao mais antigo e exclui os duplicados.
 */
export async function getSemanaByDataInicio(dataInicio: string, farmId?: string | null) {
  const conditions = farmId
    ? and(eq(semanas.dataInicio, dataInicio), eq(semanas.farmId, farmId))
    : and(eq(semanas.dataInicio, dataInicio), isNull(semanas.farmId));
  const rows = await db.select().from(semanas).where(conditions).orderBy(semanas.createdAt);
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0];
  // Mesclar: manter o mais antigo e reatribuir atividades dos duplicados
  const [keeper, ...duplicates] = rows;
  for (const dup of duplicates) {
    await db.update(atividades).set({ semanaId: keeper.id }).where(eq(atividades.semanaId, dup.id));
    await db.delete(semanas).where(eq(semanas.id, dup.id));
  }
  return keeper;
}

export async function getCurrentSemana(farmId?: string | null) {
  const conditions = farmId
    ? and(eq(semanas.aberta, true), eq(semanas.farmId, farmId))
    : and(eq(semanas.aberta, true), isNull(semanas.farmId));
  const [row] = await db.select().from(semanas).where(conditions).orderBy(desc(semanas.dataInicio)).limit(1);
  if (!row) return undefined;
  // Disparar mesclagem caso haja duplicatas civil/safra para essa data
  return getSemanaByDataInicio(row.dataInicio, farmId);
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
  pessoa_id?: string | null;
  data_termino?: string | null;
  tag?: string;
  status?: string;
  parent_id?: string | null;
}) {
  const [row] = await db.insert(atividades).values({
    semanaId: data.semana_id,
    titulo: data.titulo,
    descricao: data.descricao ?? '',
    pessoaId: data.pessoa_id ?? null,
    dataTermino: data.data_termino ?? null,
    tag: data.tag ?? '#planejamento',
    status: data.status ?? 'a fazer',
    parentId: data.parent_id ?? null,
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
  parent_id?: string | null;
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
    parentId: item.parent_id ?? null,
  }))).returning();
}

export async function updateAtividade(id: string, data: Partial<{
  titulo: string;
  descricao: string;
  pessoa_id: string | null;
  data_termino: string | null;
  tag: string;
  status: string;
  parent_id: string | null;
}>) {
  const mapped: Record<string, unknown> = {};
  if (data.titulo !== undefined) mapped.titulo = data.titulo;
  if (data.descricao !== undefined) mapped.descricao = data.descricao;
  if ('pessoa_id' in data) mapped.pessoaId = data.pessoa_id;
  if ('data_termino' in data) mapped.dataTermino = data.data_termino;
  if (data.tag !== undefined) mapped.tag = data.tag;
  if (data.status !== undefined) mapped.status = data.status;
  if ('parent_id' in data) mapped.parentId = data.parent_id;
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

// ── Semana Participantes ───────────────────────────────────────────────────────

export async function listSemanaParticipantes(semanaId: string) {
  return db
    .select({
      id: semanaParticipantes.id,
      semanaId: semanaParticipantes.semanaId,
      pessoaId: semanaParticipantes.pessoaId,
      presenca: semanaParticipantes.presenca,
      modalidade: semanaParticipantes.modalidade,
      createdAt: semanaParticipantes.createdAt,
      fullName: people.fullName,
      preferredName: people.preferredName,
      photoUrl: people.photoUrl,
    })
    .from(semanaParticipantes)
    .innerJoin(people, eq(semanaParticipantes.pessoaId, people.id))
    .where(eq(semanaParticipantes.semanaId, semanaId))
    .orderBy(asc(people.fullName));
}

// ── Desempenho por período ─────────────────────────────────────────────────────

export async function getDesempenhoByPeriod(
  farmId: string,
  dataInicio: string,
  dataFim: string,
) {
  // Busca todas as atividades (tarefas + subtarefas) de semanas no período
  const rows = await db
    .select({
      pessoaId: atividades.pessoaId,
      status: atividades.status,
      fullName: people.fullName,
      preferredName: people.preferredName,
    })
    .from(atividades)
    .innerJoin(semanas, eq(atividades.semanaId, semanas.id))
    .leftJoin(people, eq(atividades.pessoaId, people.id))
    .where(
      and(
        eq(semanas.farmId, farmId),
        gte(semanas.dataInicio, dataInicio),
        lte(semanas.dataInicio, dataFim),
      ),
    );

  // Agrupa por pessoa
  const map = new Map<string, { nome: string; concluidas: number; pendentes: number }>();

  for (const row of rows) {
    if (!row.pessoaId) continue;
    const nome = row.preferredName || row.fullName || 'Desconhecido';
    const existing = map.get(row.pessoaId) ?? { nome, concluidas: 0, pendentes: 0 };
    if (row.status === 'concluída') {
      existing.concluidas += 1;
    } else {
      existing.pendentes += 1;
    }
    map.set(row.pessoaId, existing);
  }

  const colaboradores = Array.from(map.entries()).map(([pessoaId, data]) => {
    const total = data.concluidas + data.pendentes;
    const eficiencia = total > 0 ? Math.round((data.concluidas / total) * 100) : 0;
    const iniciais = data.nome
      .split(' ')
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? '')
      .join('');
    return {
      pessoaId,
      nome: data.nome,
      iniciais,
      concluidas: data.concluidas,
      pendentes: data.pendentes,
      total,
      eficiencia,
      status: eficiencia >= 80 ? 'Excelente' : eficiencia >= 60 ? 'Bom' : 'Regular',
    };
  }).sort((a, b) => b.eficiencia - a.eficiencia);

  const totalConcluidas = colaboradores.reduce((s, c) => s + c.concluidas, 0);
  const totalPendentes = colaboradores.reduce((s, c) => s + c.pendentes, 0);
  const eficienciaMedia = colaboradores.length > 0
    ? Math.round(colaboradores.reduce((s, c) => s + c.eficiencia, 0) / colaboradores.length)
    : 0;

  return {
    colaboradores,
    totalGlobal: { concluidas: totalConcluidas, pendentes: totalPendentes, eficienciaMedia },
  };
}

export async function bulkUpsertSemanaParticipantes(
  semanaId: string,
  participantes: Array<{ pessoaId: string; presenca: boolean; modalidade: string }>,
) {
  if (participantes.length === 0) return [];
  const values = participantes.map(p => ({
    semanaId,
    pessoaId: p.pessoaId,
    presenca: p.presenca,
    modalidade: p.modalidade,
  }));
  return db
    .insert(semanaParticipantes)
    .values(values)
    .onConflictDoUpdate({
      target: [semanaParticipantes.semanaId, semanaParticipantes.pessoaId],
      set: { presenca: sql`excluded.presenca`, modalidade: sql`excluded.modalidade` },
    })
    .returning();
}
