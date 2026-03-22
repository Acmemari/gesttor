import { eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../index.js';
import {
  people, perfils, cargoFuncao, personPerfils, personFazendas, personPermissoes,
  organizations, analystFarms, organizationAnalysts,
} from '../schema.js';

export type CreatePessoaInput = {
  full_name: string;
  preferred_name?: string;
  phone_whatsapp?: string;
  email?: string;
  location_city_uf?: string;
  photo_url?: string;
  organization_id?: string;
  user_id?: string;
  cpf?: string;
  rg?: string;
  data_nascimento?: string;
  data_contratacao?: string;
  endereco?: string;
  observacoes?: string;
  created_by?: string;
  farm_id?: string;
};

export type UpdatePessoaInput = Partial<CreatePessoaInput>;

export async function getPessoa(id: string) {
  const [row] = await db.select().from(people).where(eq(people.id, id as any)).limit(1);
  return row;
}

export async function listPessoas(params: {
  organizationId?: string;
  search?: string;
  offset?: number;
  limit?: number;
  ativo?: boolean;
  perfilId?: string;
  farmId?: string;
} = {}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (params.ativo !== undefined) conditions.push(eq(people.ativo, params.ativo));
  if (params.organizationId) conditions.push(eq(people.organizationId, params.organizationId));
  let query = db.select().from(people).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query;
}

export async function listPessoasByFarm(farmId: string, params: { offset?: number; limit?: number } = {}) {
  let query = db.select({ pessoa: people }).from(personFazendas)
    .innerJoin(people, eq(personFazendas.pessoaId, people.id))
    .where(eq(personFazendas.farmId, farmId))
    .$dynamic();
  if (params.offset) query = query.offset(params.offset);
  if (params.limit) query = query.limit(params.limit);
  return query.then(rows => rows.map(r => r.pessoa));
}

export async function getPermsByEmail(email: string) {
  const [person] = await db.select().from(people).where(eq(people.email, email)).limit(1);
  if (!person) return null;
  const perms = await db.select().from(personPermissoes).where(eq(personPermissoes.pessoaId, person.id));
  return { person, perms };
}

export async function createPessoa(data: CreatePessoaInput) {
  const [row] = await db.insert(people).values({
    fullName: data.full_name,
    preferredName: data.preferred_name ?? null,
    phoneWhatsapp: data.phone_whatsapp ?? null,
    email: data.email ?? null,
    locationCityUf: data.location_city_uf ?? null,
    photoUrl: data.photo_url ?? null,
    organizationId: data.organization_id ?? null,
    userId: data.user_id ?? null,
    cpf: data.cpf ?? null,
    rg: data.rg ?? null,
    dataNascimento: data.data_nascimento ?? null,
    dataContratacao: data.data_contratacao ?? null,
    endereco: data.endereco ?? null,
    observacoes: data.observacoes ?? null,
    createdBy: data.created_by ?? null,
    farmId: data.farm_id ?? null,
    ativo: true,
  }).returning();
  return row;
}

export async function updatePessoa(id: string, data: UpdatePessoaInput) {
  const mapped: Record<string, unknown> = { updatedAt: new Date() };
  if (data.full_name !== undefined) mapped.fullName = data.full_name;
  if (data.preferred_name !== undefined) mapped.preferredName = data.preferred_name;
  if (data.phone_whatsapp !== undefined) mapped.phoneWhatsapp = data.phone_whatsapp;
  if (data.email !== undefined) mapped.email = data.email;
  if (data.location_city_uf !== undefined) mapped.locationCityUf = data.location_city_uf;
  if (data.photo_url !== undefined) mapped.photoUrl = data.photo_url;
  if (data.organization_id !== undefined) mapped.organizationId = data.organization_id;
  if (data.cpf !== undefined) mapped.cpf = data.cpf;
  if (data.rg !== undefined) mapped.rg = data.rg;
  if (data.data_nascimento !== undefined) mapped.dataNascimento = data.data_nascimento;
  if (data.data_contratacao !== undefined) mapped.dataContratacao = data.data_contratacao;
  if (data.endereco !== undefined) mapped.endereco = data.endereco;
  if (data.observacoes !== undefined) mapped.observacoes = data.observacoes;
  if (data.farm_id !== undefined) mapped.farmId = data.farm_id;
  const [row] = await db.update(people).set(mapped).where(eq(people.id, id as any)).returning();
  return row;
}

export async function deactivatePessoa(id: string) {
  const [row] = await db.update(people).set({ ativo: false, updatedAt: new Date() })
    .where(eq(people.id, id as any)).returning();
  return row;
}

// ── Perfis ─────────────────────────────────────────────────────────────────────

export async function listPerfis(params: { ativo?: boolean } = {}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (params.ativo !== undefined) conditions.push(eq(perfils.ativo, params.ativo));
  let query = db.select().from(perfils).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(perfils.sortOrder);
}

export async function listPerfisAll() {
  return db.select().from(perfils).orderBy(perfils.sortOrder);
}

export async function createPerfil(data: { nome: string; descricao?: string; sortOrder?: number }) {
  const [row] = await db.insert(perfils).values({
    nome: data.nome,
    descricao: data.descricao ?? null,
    sortOrder: data.sortOrder ?? 0,
    ativo: true,
  }).returning();
  return row;
}

export async function updatePerfil(id: string, data: { nome?: string; descricao?: string; ativo?: boolean; sortOrder?: number }) {
  const [row] = await db.update(perfils).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(perfils.id, id as any)).returning();
  return row;
}

// ── Cargos ─────────────────────────────────────────────────────────────────────

export async function listCargosFuncoes(params: { ativo?: boolean } = {}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (params.ativo !== undefined) conditions.push(eq(cargoFuncao.ativo, params.ativo));
  let query = db.select().from(cargoFuncao).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(cargoFuncao.sortOrder);
}

export async function listCargosFuncoesAll() {
  return db.select().from(cargoFuncao).orderBy(cargoFuncao.sortOrder);
}

export async function createCargoFuncao(data: { nome: string; sortOrder?: number }) {
  const [row] = await db.insert(cargoFuncao).values({
    nome: data.nome,
    sortOrder: data.sortOrder ?? 0,
    ativo: true,
  }).returning();
  return row;
}

export async function updateCargoFuncao(id: string, data: { nome?: string; ativo?: boolean; sortOrder?: number }) {
  const [row] = await db.update(cargoFuncao).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(cargoFuncao.id, id as any)).returning();
  return row;
}

// ── Pessoa perfis ──────────────────────────────────────────────────────────────

export async function getPessoaPerfis(pessoaId: string) {
  return db.select().from(personPerfils).where(eq(personPerfils.pessoaId, pessoaId as any));
}

export async function addPessoaPerfil(data: { pessoaId: string; perfilId: string; cargoFuncaoId?: string }) {
  const [row] = await db.insert(personPerfils).values({
    pessoaId: data.pessoaId as any,
    perfilId: data.perfilId as any,
    cargoFuncaoId: data.cargoFuncaoId as any ?? null,
  }).returning();
  return row;
}

export async function removePessoaPerfil(id: string) {
  await db.delete(personPerfils).where(eq(personPerfils.id, id as any));
}

// ── Pessoa fazendas ────────────────────────────────────────────────────────────

export async function getPessoaFazendas(pessoaId: string) {
  return db.select().from(personFazendas).where(eq(personFazendas.pessoaId, pessoaId as any));
}

export async function addPessoaFazenda(data: { pessoaId: string; farmId: string }) {
  const [row] = await db.insert(personFazendas).values({
    pessoaId: data.pessoaId as any,
    farmId: data.farmId,
    primaryFarm: false,
  }).returning();
  return row;
}

export async function setPrimaryFazenda(pessoaId: string, fazendaId: string) {
  await db.update(personFazendas).set({ primaryFarm: false })
    .where(eq(personFazendas.pessoaId, pessoaId as any));
  const [row] = await db.update(personFazendas).set({ primaryFarm: true })
    .where(and(eq(personFazendas.pessoaId, pessoaId as any), eq(personFazendas.id, fazendaId as any)))
    .returning();
  return row;
}

export async function removePessoaFazenda(id: string) {
  await db.delete(personFazendas).where(eq(personFazendas.id, id as any));
}

// ── Pessoa permissoes ──────────────────────────────────────────────────────────

export async function getPessoaPermissoes(pessoaId: string) {
  return db.select().from(personPermissoes).where(eq(personPermissoes.pessoaId, pessoaId as any));
}

export async function upsertPessoaPermissao(data: {
  pessoaId: string;
  farmId: string;
  assume_tarefas_fazenda?: boolean;
  pode_alterar_semana_fechada?: boolean;
  pode_apagar_semana?: boolean;
}) {
  const [existing] = await db.select().from(personPermissoes)
    .where(and(eq(personPermissoes.pessoaId, data.pessoaId as any), eq(personPermissoes.farmId, data.farmId)))
    .limit(1);

  if (existing) {
    const [row] = await db.update(personPermissoes)
      .set({
        assumeTarefasFazenda: data.assume_tarefas_fazenda ?? existing.assumeTarefasFazenda ?? false,
        podeAlterarSemanaFechada: data.pode_alterar_semana_fechada ?? existing.podeAlterarSemanaFechada ?? false,
        podeApagarSemana: data.pode_apagar_semana ?? existing.podeApagarSemana ?? false,
        updatedAt: new Date(),
      })
      .where(eq(personPermissoes.id, existing.id))
      .returning();
    return row;
  } else {
    const [row] = await db.insert(personPermissoes).values({
      pessoaId: data.pessoaId as any,
      farmId: data.farmId,
      assumeTarefasFazenda: data.assume_tarefas_fazenda ?? false,
      podeAlterarSemanaFechada: data.pode_alterar_semana_fechada ?? false,
      podeApagarSemana: data.pode_apagar_semana ?? false,
    }).returning();
    return row;
  }
}

// ── Access checks ──────────────────────────────────────────────────────────────

export async function analystCanAccessOrg(analystId: string, orgId: string): Promise<boolean> {
  const [direct] = await db.select({ id: organizations.id }).from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.analystId, analystId))).limit(1);
  if (direct) return true;
  const [secondary] = await db.select({ id: organizationAnalysts.id }).from(organizationAnalysts)
    .where(and(eq(organizationAnalysts.organizationId, orgId), eq(organizationAnalysts.analystId, analystId))).limit(1);
  return !!secondary;
}

export async function analystCanAccessPessoa(analystId: string, pessoaId: string): Promise<boolean> {
  const [person] = await db.select().from(people).where(eq(people.id, pessoaId as any)).limit(1);
  if (!person) return false;
  if (person.organizationId) return analystCanAccessOrg(analystId, person.organizationId);
  if (person.farmId) {
    const [af] = await db.select().from(analystFarms)
      .where(and(eq(analystFarms.analystId, analystId), eq(analystFarms.farmId, person.farmId))).limit(1);
    return !!af;
  }
  return false;
}
