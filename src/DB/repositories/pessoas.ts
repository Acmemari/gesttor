import { eq, and, ilike, or, inArray, exists } from 'drizzle-orm';
import { db } from '../index.js';
import {
  people, perfils, cargoFuncao, personProfiles, personFarms, personPermissions,
  organizations, organizationAnalysts, farms,
} from '../schema.js';

// ── CPF validation ─────────────────────────────────────────────────────────────

export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === parseInt(digits[10]);
}

export function validatePhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

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
};

export type UpdatePessoaInput = Partial<CreatePessoaInput> & {
  inviteToken?: string | null;
  inviteStatus?: string | null;
  inviteExpiresAt?: Date | null;
  inviteSentAt?: Date | null;
};

export async function getPessoa(id: string) {
  const [row] = await db.select().from(people).where(eq(people.id, id as any)).limit(1);
  return row;
}

export async function listPessoas(
  organizationId: string,
  opts: {
    search?: string;
    offset?: number;
    limit?: number;
    ativo?: boolean;
    perfilId?: string;
    farmId?: string;
  } = {},
): Promise<{ rows: typeof people.$inferSelect[]; hasMore: boolean }> {
  const { search, offset = 0, limit = 50, farmId } = opts;
  const ativo = opts.ativo !== undefined ? opts.ativo : true;

  const conditions: ReturnType<typeof eq>[] = [
    eq(people.organizationId, organizationId),
    eq(people.ativo, ativo),
  ];
  if (search) conditions.push(ilike(people.fullName, `%${search}%`));
  // Filtro por fazenda via junction personFarms (sem coluna direta legada)
  if (farmId) {
    conditions.push(
      exists(
        db.select({ _: personFarms.id }).from(personFarms)
          .where(and(eq(personFarms.pessoaId, people.id), eq(personFarms.farmId, farmId))),
      ),
    );
  }

  // If filtering by perfilId, get matching person IDs first via junction table
  if (opts.perfilId) {
    const linked = await db
      .select({ pessoaId: personProfiles.pessoaId })
      .from(personProfiles)
      .where(eq(personProfiles.perfilId, opts.perfilId as any));
    const ids = linked.map((r) => r.pessoaId);
    if (ids.length === 0) return { rows: [], hasMore: false };
    conditions.push(inArray(people.id, ids as any));
  }

  const rows = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .offset(offset)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function listPessoasByFarm(
  farmId: string,
  params: { offset?: number; limit?: number; assumeTarefas?: boolean } = {},
) {
  // Pessoas vinculadas via tabela de junção personFarms
  const fromJunction = await db.select({ pessoa: people }).from(personFarms)
    .innerJoin(people, and(eq(personFarms.pessoaId, people.id), eq(people.ativo, true)))
    .where(eq(personFarms.farmId, farmId));

  let result = fromJunction.map(r => r.pessoa);

  if (params.assumeTarefas !== undefined) {
    // Carrega permissões explícitas para esta fazenda
    const allPerms = await db.select({
      pessoaId: personPermissions.pessoaId,
      assume: personPermissions.assumeTarefasFazenda,
    })
      .from(personPermissions)
      .where(eq(personPermissions.farmId, farmId));

    const explicitAllow = new Set(allPerms.filter(p => p.assume).map(p => p.pessoaId));
    const managed = new Set(allPerms.map(p => p.pessoaId));

    if (params.assumeTarefas) {
      // Inclui pessoas explicitamente autorizadas OU sem registro de permissão (legadas)
      result = result.filter(p => explicitAllow.has(p.id) || !managed.has(p.id));
    }
  }

  return result;
}

export async function getPermsByEmail(email: string) {
  const [person] = await db.select().from(people).where(eq(people.email, email)).limit(1);
  if (!person) return null;
  const perms = await db.select().from(personPermissions).where(eq(personPermissions.pessoaId, person.id));
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
  if (data.inviteToken !== undefined) mapped.inviteToken = data.inviteToken;
  if (data.inviteStatus !== undefined) mapped.inviteStatus = data.inviteStatus;
  if (data.inviteExpiresAt !== undefined) mapped.inviteExpiresAt = data.inviteExpiresAt;
  if (data.inviteSentAt !== undefined) mapped.inviteSentAt = data.inviteSentAt;
  if (data.location_city_uf !== undefined) mapped.locationCityUf = data.location_city_uf;
  if (data.photo_url !== undefined) mapped.photoUrl = data.photo_url;
  if (data.organization_id !== undefined) mapped.organizationId = data.organization_id;
  if (data.cpf !== undefined) mapped.cpf = data.cpf;
  if (data.rg !== undefined) mapped.rg = data.rg;
  if (data.data_nascimento !== undefined) mapped.dataNascimento = data.data_nascimento;
  if (data.data_contratacao !== undefined) mapped.dataContratacao = data.data_contratacao;
  if (data.endereco !== undefined) mapped.endereco = data.endereco;
  if (data.observacoes !== undefined) mapped.observacoes = data.observacoes;
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
  return db
    .select({
      id: personProfiles.id,
      pessoaId: personProfiles.pessoaId,
      perfilId: personProfiles.perfilId,
      cargoFuncaoId: personProfiles.cargoFuncaoId,
      createdAt: personProfiles.createdAt,
      perfilNome: perfils.nome,
      cargoFuncaoNome: cargoFuncao.nome,
    })
    .from(personProfiles)
    .leftJoin(perfils, eq(perfils.id, personProfiles.perfilId as any))
    .leftJoin(cargoFuncao, eq(cargoFuncao.id, personProfiles.cargoFuncaoId as any))
    .where(eq(personProfiles.pessoaId, pessoaId as any));
}

export async function addPessoaPerfil(data: { pessoaId: string; perfilId: string; cargoFuncaoId?: string }) {
  // Enforce single profile: delete existing ones first
  await db.delete(personProfiles).where(eq(personProfiles.pessoaId, data.pessoaId as any));

  const [row] = await db.insert(personProfiles).values({
    pessoaId: data.pessoaId as any,
    perfilId: data.perfilId as any,
    cargoFuncaoId: data.cargoFuncaoId as any ?? null,
  }).returning();
  return row;
}

export async function removePessoaPerfil(id: string) {
  await db.delete(personProfiles).where(eq(personProfiles.id, id as any));
}

// ── Pessoa fazendas ────────────────────────────────────────────────────────────

export async function getPessoaFazendas(pessoaId: string) {
  return db
    .select({
      id: personFarms.id,
      pessoaId: personFarms.pessoaId,
      farmId: personFarms.farmId,
      primaryFarm: personFarms.primaryFarm,
      createdAt: personFarms.createdAt,
      farmName: farms.name,
    })
    .from(personFarms)
    .leftJoin(farms, eq(farms.id, personFarms.farmId))
    .where(eq(personFarms.pessoaId, pessoaId as any));
}

export async function addPessoaFazenda(data: { pessoaId: string; farmId: string }) {
  const [row] = await db.insert(personFarms).values({
    pessoaId: data.pessoaId as any,
    farmId: data.farmId,
    primaryFarm: false,
  }).returning();
  return row;
}

export async function setPrimaryFazenda(pessoaId: string, fazendaId: string) {
  await db.update(personFarms).set({ primaryFarm: false })
    .where(eq(personFarms.pessoaId, pessoaId as any));
  const [row] = await db.update(personFarms).set({ primaryFarm: true })
    .where(and(eq(personFarms.pessoaId, pessoaId as any), eq(personFarms.id, fazendaId as any)))
    .returning();
  return row;
}

export async function removePessoaFazenda(id: string) {
  await db.delete(personFarms).where(eq(personFarms.id, id as any));
}

// ── Pessoa permissoes ──────────────────────────────────────────────────────────

export async function getPessoaPermissoes(pessoaId: string) {
  return db.select().from(personPermissions).where(eq(personPermissions.pessoaId, pessoaId as any));
}

export async function upsertPessoaPermissao(data: {
  pessoaId: string;
  farmId: string;
  assume_tarefas_fazenda?: boolean;
  pode_alterar_semana_fechada?: boolean;
  pode_apagar_semana?: boolean;
}) {
  const [existing] = await db.select().from(personPermissions)
    .where(and(eq(personPermissions.pessoaId, data.pessoaId as any), eq(personPermissions.farmId, data.farmId)))
    .limit(1);

  if (existing) {
    const [row] = await db.update(personPermissions)
      .set({
        assumeTarefasFazenda: data.assume_tarefas_fazenda ?? existing.assumeTarefasFazenda ?? false,
        podeAlterarSemanaFechada: data.pode_alterar_semana_fechada ?? existing.podeAlterarSemanaFechada ?? false,
        podeApagarSemana: data.pode_apagar_semana ?? existing.podeApagarSemana ?? false,
        updatedAt: new Date(),
      })
      .where(eq(personPermissions.id, existing.id))
      .returning();
    return row;
  } else {
    const [row] = await db.insert(personPermissions).values({
      pessoaId: data.pessoaId as any,
      farmId: data.farmId,
      assumeTarefasFazenda: data.assume_tarefas_fazenda ?? false,
      podeAlterarSemanaFechada: data.pode_alterar_semana_fechada ?? false,
      podeApagarSemana: data.pode_apagar_semana ?? false,
    }).returning();
    return row;
  }
}

// ── Existence checks ───────────────────────────────────────────────────────────

export async function perfilExists(perfilId: string): Promise<boolean> {
  const [row] = await db.select({ id: perfils.id }).from(perfils)
    .where(and(eq(perfils.id, perfilId as any), eq(perfils.ativo, true))).limit(1);
  return !!row;
}

export async function cargoFuncaoExists(cargoId: string): Promise<boolean> {
  const [row] = await db.select({ id: cargoFuncao.id }).from(cargoFuncao)
    .where(and(eq(cargoFuncao.id, cargoId as any), eq(cargoFuncao.ativo, true))).limit(1);
  return !!row;
}

export async function farmExists(farmId: string): Promise<boolean> {
  const [row] = await db.select({ id: farms.id }).from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.ativo, true))).limit(1);
  return !!row;
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
  const [person] = await db.select({ organizationId: people.organizationId })
    .from(people).where(eq(people.id, pessoaId as any)).limit(1);
  if (!person) return false;
  if (person.organizationId) return analystCanAccessOrg(analystId, person.organizationId);
  // Fallback: verificar via fazenda(s) vinculadas na junction personFarms
  const [pf] = await db
    .select({ organizationId: farms.organizationId })
    .from(personFarms)
    .innerJoin(farms, eq(farms.id, personFarms.farmId))
    .where(eq(personFarms.pessoaId, pessoaId as any))
    .limit(1);
  if (pf?.organizationId) return analystCanAccessOrg(analystId, pf.organizationId);
  return false;
}
