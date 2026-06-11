import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  jsonb,
  date,
  bigint,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Better Auth tables ─────────────────────────────────────────────────────────

export const baUser = pgTable('ba_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const baSession = pgTable('ba_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => baUser.id, { onDelete: 'cascade' }),
});

export const baAccount = pgTable('ba_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => baUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const baVerification = pgTable('ba_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const baRateLimit = pgTable('ba_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

// ── Organization Owners ────────────────────────────────────────────────────────

export const organizationOwners = pgTable('organization_owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  cpf: text('cpf'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Organizations ──────────────────────────────────────────────────────────────

export const organizationDocuments = pgTable('organization_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by'),
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storagePath: text('storage_path').notNull(),
  category: text('category').default('geral'),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Organizations ──────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cnpj: text('cnpj'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  status: text('status').default('active'),
  plan: text('plan'),
  ativo: boolean('ativo').default(true),
  ownerId: text('owner_id'),
  // Analista responsável — NOT NULL: toda organização deve ter um analista.
  // onDelete: restrict — impede exclusão de analista enquanto houver orgs vinculadas.
  analystId: text('analyst_id').notNull().references(() => userProfiles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_organizations_analyst_id').on(t.analystId),
  index('idx_organizations_ativo').on(t.ativo),
]);

export const organizationAnalysts = pgTable('organization_analysts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  // FK garante que só analistas existentes podem ser vinculados.
  // onDelete: cascade — ao remover um analista, remove seus vínculos secundários.
  analystId: text('analyst_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  permissions: jsonb('permissions').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  // Garante que o mesmo analista não seja vinculado duas vezes à mesma org.
  uniqueIndex('org_analysts_org_analyst_uidx').on(t.organizationId, t.analystId),
  index('idx_org_analysts_analyst_id').on(t.analystId),
]);

// ── User profiles ──────────────────────────────────────────────────────────────

export const userProfiles = pgTable('user_profiles', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').notNull().default('visitante'),
  status: text('status').default('active'),
  ativo: boolean('ativo').default(true),
  avatar: text('avatar'),
  imageUrl: text('image_url'),
  lastLogin: timestamp('last_login'),
  phone: text('phone'),
  plan: text('plan'),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_user_profiles_organization_id').on(t.organizationId),
]);

// ── Farms ──────────────────────────────────────────────────────────────────────

export const farms = pgTable('farms', {
  id: text('id').primaryKey(),
  // Slug para exibição e roteamento amigável. Gerado a partir do nome da fazenda.
  // Novos registros recebem UUID como `id` e o slug fica neste campo.
  slug: text('slug').unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  state: text('state'),
  city: text('city').notNull(),
  // Postgres não cria índice automático em colunas FK — declarado explicitamente abaixo.
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  totalArea: numeric('total_area'),
  pastureArea: numeric('pasture_area'),
  agricultureArea: numeric('agriculture_area'),
  forageProductionArea: numeric('forage_production_area'),
  agricultureAreaOwned: numeric('agriculture_area_owned'),
  agricultureAreaLeased: numeric('agriculture_area_leased'),
  otherCrops: numeric('other_crops'),
  infrastructure: numeric('infrastructure'),
  reserveAndAPP: numeric('reserve_and_app'),
  otherArea: numeric('other_area'),
  propertyValue: numeric('property_value'),
  operationPecuary: numeric('operation_pecuary'),
  operationAgricultural: numeric('operation_agricultural'),
  otherOperations: numeric('other_operations'),
  agricultureVariation: numeric('agriculture_variation').default('0'),
  propertyType: text('property_type').default('Própria'),
  weightMetric: text('weight_metric').default('Arroba (@)'),
  averageHerd: numeric('average_herd'),
  herdValue: numeric('herd_value'),
  commercializesGenetics: boolean('commercializes_genetics').default(false),
  productionSystem: text('production_system'),
  ativo: boolean('ativo').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_farms_organization_id').on(t.organizationId),
  index('idx_farms_ativo').on(t.ativo),
]);


// ── People ─────────────────────────────────────────────────────────────────────

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  preferredName: text('preferred_name'),
  phoneWhatsapp: text('phone_whatsapp'),
  email: text('email'),
  locationCityUf: text('location_city_uf'),
  photoUrl: text('photo_url'),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  userId: text('user_id'),
  cpf: text('cpf'),
  rg: text('rg'),
  dataNascimento: date('data_nascimento'),
  dataContratacao: date('data_contratacao'),
  endereco: text('endereco'),
  observacoes: text('observacoes'),
  // Tipo da pessoa (array: cliente, fornecedor, transportadora, proprietario, funcionario)
  tipo: jsonb('tipo').default('[]'),
  // Dados empresariais
  razaoSocial: text('razao_social'),
  inscricaoEstadual: text('inscricao_estadual'),
  tipoDocumento: text('tipo_documento'),       // 'cpf' | 'cnpj' | 'rg' | 'cnh' | 'passaporte'
  numeroDocumento: text('numero_documento'),
  // Endereço estruturado
  cep: text('cep'),
  logradouro: text('logradouro'),
  enderecoNumero: text('endereco_numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  estado: text('estado'),
  // Dados bancários
  banco: text('banco'),
  agencia: text('agencia'),
  conta: text('conta'),
  tipoConta: text('tipo_conta'),               // 'corrente' | 'poupanca'
  titularConta: text('titular_conta'),
  cpfCnpjConta: text('cpf_cnpj_conta'),
  ativo: boolean('ativo').default(true),
  createdBy: text('created_by'),
  podeAlterarSemanaFechada: boolean('pode_alterar_semana_fechada').default(false),
  podeApagarSemana: boolean('pode_apagar_semana').default(false),
  // Convite
  inviteToken:     text('invite_token'),
  inviteStatus:    text('invite_status').default('none'),  // 'none' | 'pending' | 'accepted' | 'expired'
  inviteRole:      text('invite_role'),                    // 'analista' | 'cliente'
  inviteType:      text('invite_type').default('new_account'), // 'new_account' | 'upgrade'
  inviteExpiresAt: timestamp('invite_expires_at'),
  inviteSentAt:    timestamp('invite_sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_people_organization_id').on(t.organizationId),
  index('idx_people_ativo').on(t.ativo),
  index('idx_people_user_id').on(t.userId),
  index('idx_people_invite_token').on(t.inviteToken),
  // Partial unique index on CPF (nulls allowed, but non-null CPF must be unique)
  // Note: Drizzle doesn't support partial indexes natively; enforced via SQL migration
]);

export const perfils = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  ativo: boolean('ativo').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const cargoFuncao = pgTable('job_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  ativo: boolean('ativo').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const personProfiles = pgTable('person_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  perfilId: uuid('perfil_id').notNull().references(() => perfils.id, { onDelete: 'cascade' }),
  cargoFuncaoId: uuid('cargo_funcao_id').references(() => cargoFuncao.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const personFarms = pgTable('person_farms', {
  id: uuid('id').primaryKey().defaultRandom(),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  primaryFarm: boolean('primary_farm').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('person_farms_pessoa_farm_uidx').on(t.pessoaId, t.farmId)]);

export const personPermissions = pgTable('person_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  assumeTarefasFazenda: boolean('assume_tarefas_fazenda').default(false),
  podeAlterarSemanaFechada: boolean('pode_alterar_semana_fechada').default(false),
  podeApagarSemana: boolean('pode_apagar_semana').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Gestão Semanal ─────────────────────────────────────────────────────────────

export const pessoas = pgTable('assignees', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
});

export const semanas = pgTable('work_weeks', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull(),
  modo: text('modo').notNull(),
  aberta: boolean('aberta').notNull().default(true),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_work_weeks_farm_modo_aberta').on(t.farmId, t.modo, t.aberta),
  index('idx_work_weeks_numero_modo_farm').on(t.numero, t.modo, t.farmId),
]);

export const atividades = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  semanaId: uuid('semana_id').notNull().references(() => semanas.id, { onDelete: 'cascade' }),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').default(''),
  pessoaId: uuid('pessoa_id').references(() => people.id, { onDelete: 'set null' }),
  dataTermino: date('data_termino'),
  tag: text('tag').default('#planejamento'),
  status: text('status').notNull().default('a fazer'),
  prioridade: text('prioridade').notNull().default('média'),
  parentId: uuid('parent_id').references((): any => atividades.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_activities_semana_id').on(t.semanaId),
  index('idx_activities_status').on(t.status),
  index('idx_activities_parent_id').on(t.parentId),
]);

export const semanaParticipantes = pgTable('week_meeting_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  semanaId: uuid('semana_id').notNull().references(() => semanas.id, { onDelete: 'cascade' }),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  presenca: boolean('presenca').notNull().default(false),
  modalidade: text('modalidade').notNull().default('presencial'), // 'online' | 'presencial'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('week_participants_semana_pessoa_uidx').on(t.semanaId, t.pessoaId),
  index('idx_week_participants_semana_id').on(t.semanaId),
]);

export const historicoSemanas = pgTable('week_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  semanaNumero: integer('semana_numero').notNull(),
  total: integer('total').notNull().default(0),
  concluidas: integer('concluidas').notNull().default(0),
  pendentes: integer('pendentes').notNull().default(0),
  closedAt: timestamp('closed_at').notNull().defaultNow(),
  reopenedAt: timestamp('reopened_at'),
  semanaId: uuid('semana_id').references(() => semanas.id, { onDelete: 'set null' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'cascade' }),
}, (t) => [
  index('idx_week_history_farm_id').on(t.farmId),
  index('idx_week_history_closed_at').on(t.closedAt),
]);

export const semanaTranscricoes = pgTable('semana_transcricoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  semanaId: uuid('semana_id').notNull().references(() => semanas.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').references(() => baUser.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storagePath: text('storage_path').notNull(),
  descricao: text('descricao'),
  texto: text('texto'),
  processedResult: jsonb('processed_result'),
  processedAt: timestamp('processed_at'),
  tipo: text('tipo').notNull().default('manual'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_semana_transcricoes_semana_id').on(t.semanaId),
  index('idx_semana_transcricoes_farm_id').on(t.farmId),
]);

// ── Meeting Minutes (Atas) ───────────────────────────────────────────────────

export const atas = pgTable('atas', {
  id: uuid('id').primaryKey().defaultRandom(),
  semanaFechadaId: uuid('semana_fechada_id').references(() => semanas.id, { onDelete: 'set null' }),
  semanaAbertaId: uuid('semana_aberta_id').references(() => semanas.id, { onDelete: 'set null' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => baUser.id, { onDelete: 'set null' }),
  dataReuniao: date('data_reuniao').notNull(),
  conteudo: jsonb('conteudo').notNull(),
  versao: integer('versao').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_atas_farm_id').on(t.farmId),
  index('idx_atas_semana_fechada').on(t.semanaFechadaId),
]);

// ── Projects / Deliveries hierarchy ───────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: text('created_by'),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  transformationsAchievements: text('transformations_achievements'),
  successEvidence: jsonb('success_evidence').default('[]'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  stakeholderMatrix: jsonb('stakeholder_matrix').default('[]'),
  programType: text('program_type').default('assessoria'),
  sortOrder: integer('sort_order').default(0),
  percent: integer('percent').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const projectTransformations = pgTable('project_transformations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  evidence: jsonb('evidence').default('[]'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: text('created_by'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  transformationsAchievements: text('transformations_achievements'),
  dueDate: date('due_date'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  sortOrder: integer('sort_order').default(0),
  stakeholderMatrix: jsonb('stakeholder_matrix').default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const initiatives = pgTable('initiatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: text('created_by'),
  deliveryId: uuid('delivery_id').references(() => deliveries.id, { onDelete: 'restrict' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  leader: text('leader'),
  internalLeader: text('internal_leader'),
  weight: text('weight'),
  status: text('status'),
  tags: jsonb('tags').default('[]'),
  sortOrder: integer('sort_order').default(0),
  percent: integer('percent').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const initiativeMilestones = pgTable('initiative_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueDate: date('due_date'),
  sortOrder: integer('sort_order').default(0),
  percent: integer('percent').default(0),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const initiativeTasks = pgTable('initiative_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  milestoneId: uuid('milestone_id').notNull().references(() => initiativeMilestones.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
  dueDate: date('due_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  kanbanStatus: text('kanban_status').notNull().default('a fazer'),
  kanbanOrder: integer('kanban_order').notNull().default(0),
  responsiblePersonId: uuid('responsible_person_id').references(() => people.id, { onDelete: 'set null' }),
  activityDate: date('activity_date'),
  durationDays: integer('duration_days'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const initiativeTeam = pgTable('initiative_team', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
  name: text('name'),
  role: text('role'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const initiativeParticipants = pgTable('initiative_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
});

export const deliveryAiSummaries = pgTable('delivery_ai_summaries', {
  deliveryId: uuid('delivery_id').primaryKey().references(() => deliveries.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  sourceHash: text('source_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Evidence & Farm Maps ───────────────────────────────────────────────────────

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  milestoneId: uuid('milestone_id').notNull().references(() => initiativeMilestones.id, { onDelete: 'cascade' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const evidenceFiles = pgTable('evidence_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const farmMaps = pgTable('farm_maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storagePath: text('storage_path').notNull(),
  geojson: jsonb('geojson'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Farm Retiros & Locais ─────────────────────────────────────────────────────

export const farmRetiros = pgTable('farm_retiros', {
  id: uuid('id').primaryKey().defaultRandom(),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  totalArea: numeric('total_area'),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_farm_retiros_farm_id').on(t.farmId),
]);

export const farmLocais = pgTable('farm_locais', {
  id: uuid('id').primaryKey().defaultRandom(),
  retiroId: uuid('retiro_id').notNull().references(() => farmRetiros.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  area: numeric('area'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_farm_locais_retiro_id').on(t.retiroId),
  index('idx_farm_locais_farm_id').on(t.farmId),
]);

// ── AI / Agents ────────────────────────────────────────────────────────────────

export const agentRegistry = pgTable('agent_registry', {
  id: text('id').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  inputSchema: jsonb('input_schema').default('{}'),
  outputSchema: jsonb('output_schema').default('{}'),
  defaultProvider: text('default_provider').notNull(),
  defaultModel: text('default_model').notNull(),
  estimatedTokensPerCall: integer('estimated_tokens_per_call').default(0),
  systemPrompt: text('system_prompt'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.version] }),
]);

export const agentTrainingDocuments = pgTable('agent_training_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  fileType: text('file_type'),
  fileUrl: text('file_url'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const agentTrainingImages = pgTable('agent_training_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  imageUrl: text('image_url').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id'),
  userId: text('user_id'),
  agentId: text('agent_id').notNull(),
  agentVersion: text('agent_version').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).default(0),
  outputTokens: bigint('output_tokens', { mode: 'number' }).default(0),
  totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).default('0'),
  latencyMs: integer('latency_ms').default(0),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const planLimits = pgTable('plan_limits', {
  planId: text('plan_id').primaryKey(),
  monthlyTokenLimit: bigint('monthly_token_limit', { mode: 'number' }).notNull(),
  monthlyCostLimitUsd: numeric('monthly_cost_limit_usd', { precision: 12, scale: 6 }).notNull(),
  maxRequestsPerMinuteOrg: integer('max_requests_per_minute_org').notNull(),
  maxRequestsPerMinuteUser: integer('max_requests_per_minute_user').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tokenBudgets = pgTable('token_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  period: text('period').notNull(),
  tokensUsed: bigint('tokens_used', { mode: 'number' }).notNull().default(0),
  tokensReserved: bigint('tokens_reserved', { mode: 'number' }).notNull().default(0),
  costUsedUsd: numeric('cost_used_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tokenLedger = pgTable('token_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: text('user_id'),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  tokens: bigint('tokens', { mode: 'number' }).notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  windowStart: timestamp('window_start').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const aiTokenUsage = pgTable('ai_token_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  tokensInput: integer('tokens_input').notNull().default(0),
  tokensOutput: integer('tokens_output').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Scenarios & Questionnaires ─────────────────────────────────────────────────

export const cattleScenarios = pgTable('cattle_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id'),
  farmId: text('farm_id'),
  farmName: text('farm_name'),
  name: text('name').notNull(),
  inputs: jsonb('inputs').notNull(),
  results: jsonb('results'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const engordaSimulations = pgTable('engorda_simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id'),
  farmId: text('farm_id'),
  farmName: text('farm_name'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  inputs: jsonb('inputs').notNull(),
  results: jsonb('results'),
  reportMarkdown: text('report_markdown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const savedQuestionnaires = pgTable('saved_questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  organizationId: text('organization_id'),
  farmId: text('farm_id'),
  farmName: text('farm_name'),
  productionSystem: text('production_system'),
  questionnaireId: text('questionnaire_id'),
  answers: jsonb('answers').notNull().default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const questionnaireQuestions = pgTable('questionnaire_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pergNumber: integer('perg_number'),
  category: text('category').notNull(),
  group: text('group').notNull(),
  question: text('question').notNull(),
  positiveAnswer: text('positive_answer').notNull(),
  applicableTypes: jsonb('applicable_types').notNull().default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const savedFeedbacks = pgTable('saved_feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: text('created_by').notNull(),
  recipientPersonId: uuid('recipient_person_id').references(() => people.id, { onDelete: 'set null' }),
  recipientName: text('recipient_name').notNull(),
  recipientEmail: text('recipient_email'),
  context: text('context').notNull(),
  feedbackType: text('feedback_type').notNull(),
  objective: text('objective').notNull(),
  whatHappened: text('what_happened'),
  eventDate: date('event_date'),
  eventMoment: text('event_moment'),
  damages: text('damages'),
  tone: text('tone').notNull(),
  format: text('format').notNull(),
  structure: text('structure').notNull(),
  lengthPreference: text('length_preference').notNull(),
  generatedFeedback: text('generated_feedback').notNull(),
  generatedStructure: text('generated_structure').notNull(),
  tips: jsonb('tips').notNull().default('[]'),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Support Tickets ────────────────────────────────────────────────────────────

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: text('created_by').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  ticketType: text('ticket_type').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'),
  currentUrl: text('current_url'),
  locationArea: text('location_area'),
  specificScreen: text('specific_screen'),
  lastMessageAt: timestamp('last_message_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_support_tickets_created_by').on(t.createdBy),
  index('idx_support_tickets_status').on(t.status),
  index('idx_support_tickets_last_message_at').on(t.lastMessageAt),
]);

export const supportTicketMessages = pgTable('support_ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => userProfiles.id, { onDelete: 'set null' }),
  authorType: text('author_type').notNull().default('user'),
  message: text('message').notNull(),
  replyToId: uuid('reply_to_id'),
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_support_ticket_messages_ticket_id').on(t.ticketId),
]);

export const supportTicketReads = pgTable('support_ticket_reads', {
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.ticketId, t.userId] }),
]);

export const supportTicketAttachments = pgTable('support_ticket_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => supportTicketMessages.id, { onDelete: 'set null' }),
  storagePath: text('storage_path').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  createdBy: text('created_by').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_support_ticket_attachments_ticket_id').on(t.ticketId),
]);

// ── Animal Categories ─────────────────────────────────────────────────────────

export const animalCategories = pgTable('animal_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  complemento: text('complemento'),
  raca: text('raca'),
  sexo: text('sexo').notNull(),
  grupo: text('grupo').notNull(),
  idadeFaixa: text('idade_faixa'),
  pesoKg: numeric('peso_kg', { precision: 8, scale: 2 }),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  percentual: numeric('percentual', { precision: 5, scale: 2 }),
  unidadePeso: text('unidade_peso'),
  valorKgArroba: numeric('valor_kg_arroba', { precision: 10, scale: 2 }),
  valorCabeca: numeric('valor_cabeca', { precision: 10, scale: 2 }),
  quantidade: integer('quantidade'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_animal_categories_org_id').on(t.organizationId),
]);

// ── Animal Breeds (Raças) ───────────────────────────────────────────────────────

export const animalBreeds = pgTable('animal_breeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  // Tipo de registro genealógico exclusivo: PO | PC | LA (null = sem classificação).
  classificacaoRegistro: text('classificacao_registro'),
  // Código ASBIA/INTERBULL (2 letras maiúsculas).
  codigoAsbia: text('codigo_asbia'),
  // CEIP é combinável com qualquer classificacaoRegistro.
  ceip: boolean('ceip').notNull().default(false),
  // Marca raças sem cadastro na ASBIA (exibe aviso "Sem referência na ASBIA").
  semCadastroAsbia: boolean('sem_cadastro_asbia').notNull().default(false),
  // Composição racial: raças que compõem esta raça com seu percentual.
  // Soma dos percentuais = 100%, exatamente um componente `principal`.
  // Ex.: Brangus = [{Angus, 62.5, principal}, {Nelore, 37.5}]; Nelore = [{Nelore, 100, principal}].
  composicaoRacial: jsonb('composicao_racial')
    .$type<{ breedId: string | null; nome: string; percentual: number; principal: boolean }[]>()
    .default([]),
  // Observação livre da raça.
  observacao: text('observacao'),
  // Raça padrão do sistema: só pode ser ativada/inativada, nunca alterada/excluída.
  sistema: boolean('sistema').notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_animal_breeds_org_id').on(t.organizationId),
]);

// ── Padrão Racial e Grau de Sangue ──────────────────────────────────────────────
// Classificação genealógica do rebanho. `classificacao` é o Padrão Racial
// exclusivo (PO | PC | LA | Comercial); `ceip` é combinável apenas com PO/PC/LA;
// `grauSangue` é o Grau de Sangue (Puro, 1/2 sangue, 3/4 sangue, ...).
export const padraoRacial = pgTable('padrao_racial', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  // Padrão Racial exclusivo: 'PO' | 'PC' | 'LA' | 'Comercial' (null = não definido).
  classificacao: text('classificacao'),
  // CEIP é combinável apenas com PO/PC/LA.
  ceip: boolean('ceip').notNull().default(false),
  // Grau de Sangue: 'Puro' | '1/2 sangue' | '3/4 sangue' | '5/8 sangue' | '3/8 sangue' | '7/8 sangue' | '15/16 sangue'.
  grauSangue: text('grau_sangue'),
  // Observação livre.
  observacao: text('observacao'),
  // Registro padrão do sistema: só pode ser ativado/inativado, nunca alterado/excluído.
  sistema: boolean('sistema').notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_padrao_racial_org_id').on(t.organizationId),
]);

// ── Motivos de Morte ──────────────────────────────────────────────────────────

export const motivosMorte = pgTable('motivos_morte', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_motivos_morte_org_id').on(t.organizationId),
]);

// ── Tipo de Chifre / Aspas (Pecuário › Cadastros) ───────────────────────────────
// Cadastro de referência dos tipos de chifre (aspas) do rebanho. Espelha o modelo
// de Motivos de Morte: lista simples por organização, ordenável, com status
// ativo/inativo ("Situações") para sair das listas de seleção sem perder histórico.
export const tiposChifre = pgTable('tipos_chifre', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  // "Tipo de Chifre" exibido nas listas (campo Descrição no lançamento).
  nome: text('nome').notNull(),
  // Observação do tipo de chifre.
  descricao: text('descricao'),
  // "Situações": ativo aparece nas seleções; inativo é arquivado sem perder histórico.
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_tipos_chifre_org_id').on(t.organizationId),
]);

// ── Other ──────────────────────────────────────────────────────────────────────

export const empAss = pgTable('consulting_firms', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  analistas: jsonb('analistas').default('[]'),
  ativo: boolean('ativo').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default('true'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

// ── Gestão Orçamentária ────────────────────────────────────────────────────────
// Workspace de planejamento orçamentário. Tabelas adicionadas no Phase 1 (MVP M1):
// shell + cadastro de orçamento. Tabelas de itens/realizados/comentários ficam para Phase 2+.

export const planoContas = pgTable('plano_contas', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Código hierárquico tipo "4.1.3"; único globalmente.
  numero: text('numero').notNull().unique(),
  numeroPaiId: uuid('numero_pai_id').references((): any => planoContas.id, { onDelete: 'restrict' }),
  nome: text('nome').notNull(),
  // 'Mão de Obra Permanente' | 'Insumos do Rebanho' | 'Pastagem...' | etc.
  perfilDesembolso: text('perfil_desembolso'),
  // Ex.: ['AGRICULTURA','PECUÁRIA','OUTROS']. Postgres text[].
  areasNegocio: text('areas_negocio').array(),
  nivel: integer('nivel').notNull(),
  isFolha: boolean('is_folha').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_plano_contas_pai').on(t.numeroPaiId),
  index('idx_plano_contas_ativo').on(t.ativo),
]);

export const orcamentos = pgTable('orcamentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  // Safra "25/26", "26/27" etc.
  safra: text('safra').notNull(),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  descricao: text('descricao'),
  criadoPor: text('criado_por').notNull().references(() => userProfiles.id, { onDelete: 'restrict' }),
  arquivado: boolean('arquivado').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_orcamentos_org_safra').on(t.organizationId, t.safra),
  index('idx_orcamentos_arquivado').on(t.arquivado),
]);

export const orcamentoFarms = pgTable('orcamento_farms', {
  orcamentoId: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.orcamentoId, t.farmId] }),
  index('idx_orcamento_farms_farm').on(t.farmId),
]);

export const orcamentoColaboradores = pgTable('orcamento_colaboradores', {
  id: uuid('id').primaryKey().defaultRandom(),
  orcamentoId: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  // 'gerente' | 'consultor' | 'readonly'
  papel: text('papel').notNull().default('consultor'),
  eAprovador: boolean('e_aprovador').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('orcamento_colab_orc_user_uidx').on(t.orcamentoId, t.userId),
  index('idx_orcamento_colab_user').on(t.userId),
]);

export const orcamentoVersoes = pgTable('orcamento_versoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orcamentoId: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => orcamentoVersoes.id, { onDelete: 'set null' }),
  // 'rascunho' | 'em_aprovacao' | 'baseline' | 'forecast' | 'arquivado'
  tipo: text('tipo').notNull().default('rascunho'),
  nome: text('nome').notNull(),
  criadoPor: text('criado_por').notNull().references(() => userProfiles.id, { onDelete: 'restrict' }),
  aprovadoPor: text('aprovado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  aprovadoEm: timestamp('aprovado_em'),
  // Em Forecast, último mês fechado; meses ≤ corte ficam read-only.
  mesCorte: date('mes_corte'),
  imutavel: boolean('imutavel').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_versoes_orcamento').on(t.orcamentoId),
  index('idx_versoes_parent').on(t.parentId),
]);

export const premissas = pgTable('premissas', {
  id: uuid('id').primaryKey().defaultRandom(),
  versaoId: uuid('versao_id').notNull().references(() => orcamentoVersoes.id, { onDelete: 'cascade' }),
  // Ex: 'preco_arroba_boi_gordo', 'dolar_projetado', 'ipca_projetado_anual'
  chave: text('chave').notNull(),
  valor: numeric('valor', { precision: 18, scale: 6 }),
  unidade: text('unidade'),
  // 'manual' | 'cepea' | 'b3' | 'usda' | 'bcb' | 'ibge' | 'anp'
  fonte: text('fonte').notNull().default('manual'),
  // NULL = anual; data específica = mensal.
  mes: date('mes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_premissas_versao').on(t.versaoId),
  index('idx_premissas_chave').on(t.chave),
]);

/**
 * Itens de orçamento — uma linha por (versão, fazenda, conta-folha).
 *
 * Modelo "lazy": linha só existe se houver pelo menos um valor mensal preenchido.
 * `valores_mensais` é JSONB com chaves no formato 'YYYY-MM-DD' (primeiro dia do mês).
 *   Ex.: { "2026-07-01": "12000.00", "2026-08-01": "11500.00" }
 */
export const itensOrcamento = pgTable('itens_orcamento', {
  id: uuid('id').primaryKey().defaultRandom(),
  versaoId: uuid('versao_id').notNull().references(() => orcamentoVersoes.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  planoContaId: uuid('plano_conta_id').notNull().references(() => planoContas.id, { onDelete: 'restrict' }),
  valoresMensais: jsonb('valores_mensais').notNull().default('{}'),
  observacao: text('observacao'),
  atualizadoPor: text('atualizado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('itens_orcamento_versao_farm_conta_uidx').on(t.versaoId, t.farmId, t.planoContaId),
  index('idx_itens_versao').on(t.versaoId),
  index('idx_itens_conta').on(t.planoContaId),
]);

/**
 * Lançamentos de despesa (modelo rico).
 *
 * Cada lançamento representa UM compromisso de despesa numa conta-folha, com
 * recorrência (mensal/sazonal/única), distribuição mensal materializada e,
 * opcionalmente, detalhamento em produtos.
 *
 * `itens_orcamento.valores_mensais` deixa de ser editado direto: passa a ser
 * a soma agregada de todos lançamentos `status='ativo'` da mesma (versão, farm,
 * conta-folha). Mantida via `recalcularItem()` em código TS após cada CRUD.
 *
 * `tipoOrigem`:
 *   - 'modal'    → criado pela UI rica (form completo). Mostrado por padrão na aba.
 *   - 'planilha' → shadow gerado por edição direta de célula no Fluxo. Oculto por padrão.
 */
export const lancamentosOrcamento = pgTable('lancamentos_orcamento', {
  id: uuid('id').primaryKey().defaultRandom(),
  versaoId: uuid('versao_id').notNull().references(() => orcamentoVersoes.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  planoContaId: uuid('plano_conta_id').notNull().references(() => planoContas.id, { onDelete: 'restrict' }),
  // 'mensal' | 'sazonal' | 'unica'
  recorrencia: text('recorrencia').notNull().default('mensal'),
  // Valor padrão por mês (mensal) ou base usada para preencher distribuição (sazonal/única).
  // Quando há produtos, é recalculado como soma dos subtotais ÷ qtd-meses-ativos.
  valorBase: numeric('valor_base', { precision: 18, scale: 2 }).notNull().default('0'),
  // Materializado: { 'YYYY-MM-01': '1234.56' }. Fonte do que vai pra planilha.
  distribuicaoMensal: jsonb('distribuicao_mensal').notNull().default('{}'),
  // 'modal' | 'planilha'
  tipoOrigem: text('tipo_origem').notNull().default('modal'),
  descricao: text('descricao'),
  observacao: text('observacao'),
  // 'ativo' | 'rascunho'. Só 'ativo' soma na materialização.
  status: text('status').notNull().default('ativo'),
  criadoPor: text('criado_por').notNull().references(() => userProfiles.id, { onDelete: 'restrict' }),
  atualizadoPor: text('atualizado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_lancamentos_versao_farm_conta').on(t.versaoId, t.farmId, t.planoContaId),
  index('idx_lancamentos_versao_status').on(t.versaoId, t.status),
  // Garante apenas 1 shadow por (versão, farm, conta-folha) — múltiplos modais permitidos.
  uniqueIndex('lancamentos_shadow_uidx')
    .on(t.versaoId, t.farmId, t.planoContaId)
    .where(sql`tipo_origem = 'planilha'`),
]);

/**
 * Produtos detalhados de um lançamento (opcionais).
 *
 * Quando há produtos, a soma dos subtotais sobrescreve `valorBase` do lançamento.
 * Subtotal é calculado e persistido pelo backend (não confiamos no cliente).
 */
export const lancamentoProdutos = pgTable('lancamento_produtos', {
  id: uuid('id').primaryKey().defaultRandom(),
  lancamentoId: uuid('lancamento_id').notNull().references(() => lancamentosOrcamento.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  quantidade: numeric('quantidade', { precision: 18, scale: 4 }).notNull(),
  unidade: text('unidade'),
  valorUnitario: numeric('valor_unitario', { precision: 18, scale: 6 }).notNull(),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_lancamento_produtos_lancamento').on(t.lancamentoId, t.ordem),
]);

/**
 * Lista negra (blacklist) de contas do plano de contas POR FAZENDA.
 *
 * Modelo: tudo é ativo por default. Esta tabela só guarda exceções desativadas.
 * `effective_active = NOT EXISTS (SELECT 1 FROM farm_plano_contas_inativas WHERE ...)`.
 */
export const farmPlanoContasInativas = pgTable('farm_plano_contas_inativas', {
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  planoContaId: uuid('plano_conta_id').notNull().references(() => planoContas.id, { onDelete: 'cascade' }),
  desativadoPor: text('desativado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  desativadoEm: timestamp('desativado_em').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.farmId, t.planoContaId] }),
  index('idx_fpci_farm').on(t.farmId),
]);

export const logAuditoriaOrcamento = pgTable('log_auditoria_orcamento', {
  id: uuid('id').primaryKey().defaultRandom(),
  orcamentoId: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
  versaoId: uuid('versao_id').references(() => orcamentoVersoes.id, { onDelete: 'set null' }),
  usuarioId: text('usuario_id').notNull().references(() => userProfiles.id, { onDelete: 'restrict' }),
  // 'criar_orcamento' | 'editar_premissa' | 'editar_item' | 'aprovar' | 'criar_forecast' | etc.
  acao: text('acao').notNull(),
  entidade: text('entidade').notNull(),
  entidadeId: uuid('entidade_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  justificativa: text('justificativa'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_audit_orcamento_data').on(t.orcamentoId, t.createdAt),
  index('idx_audit_versao').on(t.versaoId),
]);

// ── Mapa de Rebanho (Estoque de Partida) ──────────────────────────────────────
// Inventário do rebanho em uma data de referência. Cada header representa uma
// "fotografia" do rebanho de uma fazenda em uma data; os lançamentos formam a
// matriz Local × Categoria com quantidade e peso médio por cabeça.

export const mapaRebanhoHeaders = pgTable('mapa_rebanho_headers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  dataReferencia: date('data_referencia').notNull(),
  // 'rascunho' | 'salvo'
  status: text('status').notNull().default('rascunho'),
  observacao: text('observacao'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  // Um único mapa por (fazenda, data de referência).
  uniqueIndex('mapa_rebanho_headers_farm_data_uidx').on(t.farmId, t.dataReferencia),
  index('idx_mapa_rebanho_headers_org').on(t.organizationId),
  index('idx_mapa_rebanho_headers_farm').on(t.farmId),
]);

export const mapaRebanhoLancamentos = pgTable('mapa_rebanho_lancamentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  mapaHeaderId: uuid('mapa_header_id').notNull().references(() => mapaRebanhoHeaders.id, { onDelete: 'cascade' }),
  localId: uuid('local_id').notNull().references(() => farmLocais.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').notNull().references(() => animalCategories.id, { onDelete: 'cascade' }),
  quantidade: integer('quantidade').notNull().default(0),
  pesoKgCabeca: numeric('peso_kg_cabeca', { precision: 8, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('mapa_rebanho_lanc_header_local_cat_uidx').on(t.mapaHeaderId, t.localId, t.categoriaId),
  index('idx_mapa_rebanho_lanc_header').on(t.mapaHeaderId),
]);

// ── Mapa Rebanho - Mapão (lançamento periódico) ───────────────────────────────
// Mesma estrutura do Estoque de Partida (matriz Local × Categoria), porém o
// usuário lança o mapa periodicamente: vários headers por fazenda, um por data.
// Tabelas isoladas do Estoque de Partida para que as duas features evoluam
// de forma independente.

export const mapaoHeaders = pgTable('mapao_headers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  dataReferencia: date('data_referencia').notNull(),
  // 'rascunho' | 'salvo'
  status: text('status').notNull().default('rascunho'),
  observacao: text('observacao'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  // Um único mapa por (fazenda, data de referência) — mas N datas por fazenda.
  uniqueIndex('mapao_headers_farm_data_uidx').on(t.farmId, t.dataReferencia),
  index('idx_mapao_headers_org').on(t.organizationId),
  index('idx_mapao_headers_farm').on(t.farmId),
]);

export const mapaoLancamentos = pgTable('mapao_lancamentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  mapaHeaderId: uuid('mapa_header_id').notNull().references(() => mapaoHeaders.id, { onDelete: 'cascade' }),
  localId: uuid('local_id').notNull().references(() => farmLocais.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').notNull().references(() => animalCategories.id, { onDelete: 'cascade' }),
  quantidade: integer('quantidade').notNull().default(0),
  pesoKgCabeca: numeric('peso_kg_cabeca', { precision: 8, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('mapao_lanc_header_local_cat_uidx').on(t.mapaHeaderId, t.localId, t.categoriaId),
  index('idx_mapao_lanc_header').on(t.mapaHeaderId),
]);

// ── Nascimento (Movimentação › Nascimento) ──────────────────────────────────────
// Cada movimento é um lançamento de nascimento. catDecl/sanitario são snapshots
// (jsonb) do que a tela monta; as fichas individuais ficam em tabela filha pois
// podem ser adicionadas depois (Atribuir ID).
export const nascimentoMovimentos = pgTable('nascimento_movimentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  localId: uuid('local_id').references(() => farmLocais.id, { onDelete: 'set null' }),
  proprietarioId: uuid('proprietario_id').references(() => people.id, { onDelete: 'set null' }),
  data: date('data').notNull(),
  safra: text('safra'),
  retiro: text('retiro'),
  qtd: integer('qtd').notNull().default(0),
  naoIdentificados: integer('nao_identificados').notNull().default(0),
  // 'pendente' | 'conciliado'
  status: text('status').notNull().default('pendente'),
  // [{ catId, qtd }]
  catDecl: jsonb('cat_decl').default('[]'),
  // SanItem[]
  sanitario: jsonb('sanitario').default('[]'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_nascimento_mov_org').on(t.organizationId),
  index('idx_nascimento_mov_farm').on(t.farmId),
]);

export const nascimentoFichas = pgTable('nascimento_fichas', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => nascimentoMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  apelido: text('apelido').notNull(),
  rfid: text('rfid'),
  sisbov: text('sisbov'),
  porte: text('porte'),
  raca: text('raca'),
  peso: numeric('peso', { precision: 8, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_nascimento_fichas_mov').on(t.movimentoId),
]);

// Configuração dos campos do Lançamento Rápido por organização (1 linha por org).
// `config` é o blob { places, order, autonum } definido no modal "Configurar campos".
export const nascimentoFieldConfigs = pgTable('nascimento_field_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  // { places: Record<fieldId, place>, order: string[], autonum: boolean }
  config: jsonb('config').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('nascimento_field_config_org_uidx').on(t.organizationId),
]);

// ── Morte (Movimentação › Mortes) ───────────────────────────────────────────────
// Espelha o modelo de Nascimento: cada movimento é uma baixa por morte. catDecl
// (jsonb) guarda as linhas coletivas declaradas por categoria (com motivo); as
// fichas individuais ficam em tabela filha (animal identificado por ID Manejo ou
// Eletrônico). A busca automática de categoria pelo ID será ligada depois.
export const morteMovimentos = pgTable('morte_movimentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  localId: uuid('local_id').references(() => farmLocais.id, { onDelete: 'set null' }),
  proprietarioId: uuid('proprietario_id').references(() => people.id, { onDelete: 'set null' }),
  data: date('data').notNull(),
  safra: text('safra'),
  retiro: text('retiro'),
  qtd: integer('qtd').notNull().default(0),
  naoIdentificados: integer('nao_identificados').notNull().default(0),
  // 'pendente' | 'conciliado'
  status: text('status').notNull().default('pendente'),
  // [{ catId, qtd, motivoId }] — linhas coletivas declaradas (sem detalhe).
  catDecl: jsonb('cat_decl').default('[]'),
  // observação do movimento.
  obs: text('obs'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_morte_mov_org').on(t.organizationId),
  index('idx_morte_mov_farm').on(t.farmId),
]);

export const morteFichas = pgTable('morte_fichas', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => morteMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  motivoId: uuid('motivo_id').references(() => motivosMorte.id, { onDelete: 'set null' }),
  // Identificação do animal: ID Manejo (apelido) ou ID Eletrônico (rfid). Pelo
  // menos um preenchido; mantidos separados para a futura busca no cadastro de animais.
  apelido: text('apelido'),
  rfid: text('rfid'),
  obs: text('obs'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_morte_fichas_mov').on(t.movimentoId),
]);

// ── Venda (Movimentação › Vendas) ───────────────────────────────────────────────
// Venda Abate (peso morto), versão "Lote de animais". Valor por arroba e peso
// morto total são informados POR CATEGORIA em venda_itens (junto com quantidade,
// idade média e peso vivo/cabeça). No cabeçalho (venda_movimentos) ficam apenas
// os snapshots consolidados: valor_arroba é o valor/@ médio ponderado, e
// peso_morto_total/valor_total/peso_morto_arroba/rendimento são os agregados —
// persistidos para estabilidade dos Registros/relatórios (rendimento é NULL
// quando faltam pesos vivos em alguma linha).
export const vendaMovimentos = pgTable('venda_movimentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  localId: uuid('local_id').references(() => farmLocais.id, { onDelete: 'set null' }),
  proprietarioId: uuid('proprietario_id').references(() => people.id, { onDelete: 'set null' }),
  clienteId: uuid('cliente_id').references(() => people.id, { onDelete: 'set null' }),
  data: date('data').notNull(),
  safra: text('safra'),
  retiro: text('retiro'),
  // 'abate' (peso morto) | 'pe' (peso vivo — futuro)
  tipoVenda: text('tipo_venda').notNull().default('abate'),
  // 'arroba' (@) | 'kg' (futuro)
  tipoPeso: text('tipo_peso').notNull().default('arroba'),
  valorArroba: numeric('valor_arroba'),
  pesoMortoTotal: numeric('peso_morto_total'),
  qtd: integer('qtd').notNull().default(0),
  valorTotal: numeric('valor_total'),
  pesoMortoArroba: numeric('peso_morto_arroba'),
  rendimento: numeric('rendimento'),
  // 'conciliado' | 'pendente' (sempre 'conciliado' na Venda Abate global)
  status: text('status').notNull().default('conciliado'),
  obs: text('obs'),
  desconto: numeric('desconto'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_venda_mov_org').on(t.organizationId),
  index('idx_venda_mov_farm').on(t.farmId),
  index('idx_venda_mov_cliente').on(t.clienteId),
]);

export const vendaItens = pgTable('venda_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => vendaMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  qtd: integer('qtd').notNull().default(0),
  idadeMeses: integer('idade_meses'),
  pesoVivoKg: numeric('peso_vivo_kg'),
  // Valores comerciais por categoria (Venda Abate).
  valorArroba: numeric('valor_arroba'),
  pesoMortoTotal: numeric('peso_morto_total'),
  desconto: numeric('desconto'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_venda_itens_mov').on(t.movimentoId),
]);

// Animais detalhados por ID na Venda Abate (modo individual / "Com ID"). Cada
// linha é um animal identificado (ID Manejo e/ou Eletrônico), com categoria,
// pesos e o valor/@ do animal (padrão = valor/@ do lote, editável por animal).
export const vendaFichas = pgTable('venda_fichas', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => vendaMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  apelido: text('apelido'),
  rfid: text('rfid'),
  pesoVivoKg: numeric('peso_vivo_kg'),
  pesoMortoKg: numeric('peso_morto_kg'),
  valorArroba: numeric('valor_arroba'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_venda_fichas_mov').on(t.movimentoId),
]);

// ── Compra (Movimentação › Compras) ─────────────────────────────────────────────
export const compraMovimentos = pgTable('compra_movimentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  localId: uuid('local_id').references(() => farmLocais.id, { onDelete: 'set null' }),
  proprietarioId: uuid('proprietario_id').references(() => people.id, { onDelete: 'set null' }),
  clienteId: uuid('cliente_id').references(() => people.id, { onDelete: 'set null' }),
  data: date('data').notNull(),
  safra: text('safra'),
  retiro: text('retiro'),
  tipoVenda: text('tipo_venda').notNull().default('pe'),
  tipoPeso: text('tipo_peso').notNull().default('kg'),
  valorArroba: numeric('valor_arroba'),
  pesoMortoTotal: numeric('peso_morto_total'),
  qtd: integer('qtd').notNull().default(0),
  valorTotal: numeric('valor_total'),
  pesoMortoArroba: numeric('peso_morto_arroba'),
  rendimento: numeric('rendimento'),
  status: text('status').notNull().default('conciliado'),
  obs: text('obs'),
  desconto: numeric('desconto'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_compra_mov_org').on(t.organizationId),
  index('idx_compra_mov_farm').on(t.farmId),
  index('idx_compra_mov_cliente').on(t.clienteId),
]);

export const compraItens = pgTable('compra_itens', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => compraMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  qtd: integer('qtd').notNull().default(0),
  idadeMeses: integer('idade_meses'),
  pesoVivoKg: numeric('peso_vivo_kg'),
  valorArroba: numeric('valor_arroba'),
  pesoMortoTotal: numeric('peso_morto_total'),
  desconto: numeric('desconto'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_compra_itens_mov').on(t.movimentoId),
]);

export const compraFichas = pgTable('compra_fichas', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimentoId: uuid('movimento_id').notNull().references(() => compraMovimentos.id, { onDelete: 'cascade' }),
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  apelido: text('apelido'),
  rfid: text('rfid'),
  pesoVivoKg: numeric('peso_vivo_kg'),
  pesoMortoKg: numeric('peso_morto_kg'),
  valorArroba: numeric('valor_arroba'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_compra_fichas_mov').on(t.movimentoId),
]);

// ── Ficha Animal (Pecuário › Cadastros › Ficha Animal) ──────────────────────────
// Cadastro individual e persistente de cada animal do rebanho. Uma linha por
// animal, identificado pelo ID Manejo (apelido) único dentro da organização.
// As colunas espelham os campos hoje listados na Ficha Animal, agrupados pelas
// abas do formulário (Identificação, Origem, Genealogia). As abas ainda sem
// campos definidos (Progênies, Pesagens, Reprodutivo, Sanitário, Nutricional,
// Melhoramento, Fotos) entram em `extras` (jsonb) até ganharem estrutura própria
// — assim novos campos são acomodados sem migração a cada inclusão.
export const fichasAnimal = pgTable('fichas_animal', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
  // Vínculo opcional com o nascimento que originou esta ficha (geração automática).
  nascimentoFichaId: uuid('nascimento_ficha_id').references(() => nascimentoFichas.id, { onDelete: 'set null' }),

  // ── Identificação (LR_REGISTRY) ──────────────────────────────────────────────
  apelido: text('apelido').notNull(),                 // ID Manejo — chave da ficha
  nome: text('nome'),                                 // Nome completo
  categoriaId: uuid('categoria_id').references(() => animalCategories.id, { onDelete: 'set null' }),
  sexo: text('sexo'),                                 // derivado da categoria
  raca: text('raca'),
  grau: text('grau'),                                 // Grau de sangue
  pelagem: text('pelagem'),
  chifre: text('chifre'),                             // Tipo de chifre
  frame: text('frame'),                               // Frame 1 a 9
  categoriaGenealogica: text('categoria_genealogica'), // Comercial | PO | PC | LA
  ceip: text('ceip'),                                 // Sim | Não
  porte: text('porte'),
  lote: text('lote'),                                 // lotes ainda estáticos (sem tabela)
  rfid: text('rfid'),                                 // ID Eletrônica
  sisbov: text('sisbov'),                             // Nº SISBOV
  rgn: text('rgn'),                                   // RGN/Tatuagem
  rgd: text('rgd'),
  serie: text('serie'),                               // Série Alfa
  peso: numeric('peso', { precision: 8, scale: 2 }),  // Peso (pesagem atual)
  pesagem: text('pesagem'),                           // Manual | Balança
  obs: text('obs'),

  // ── Entrada (Cadastro Essencial) ─────────────────────────────────────────────
  eventoEntrada: text('evento_entrada'),              // Nascimento | Compra | Transferência | ...
  dataEntrada: date('data_entrada'),                  // Data de entrada no rebanho

  // ── Origem / Nascimento (ORIGEM_NASC_FIELDS) ─────────────────────────────────
  data: date('data'),                                 // Data de nascimento/registro
  pesoNascer: numeric('peso_nascer', { precision: 8, scale: 2 }),
  colostro: text('colostro'),                         // Sim | Não
  parto: text('parto'),                               // Normal | Distócico | Assistido | Cesárea
  fazendaNascimento: text('fazenda_nascimento'),

  // ── Genealogia (GENEALOGIA_FIELDS) ───────────────────────────────────────────
  pai: text('pai'),
  mae: text('mae'),
  avoPaterno: text('avo_paterno'),
  avoMaterno: text('avo_materno'),

  // ── Situação / status (Ativo | Morte | Venda) ───────────────────────────────
  situacao: text('situacao').notNull().default('ativo'),

  // Campos das abas ainda não estruturadas + qualquer campo futuro da ficha.
  extras: jsonb('extras').notNull().default('{}'),

  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_fichas_animal_org').on(t.organizationId),
  index('idx_fichas_animal_farm').on(t.farmId),
  // ID Manejo único por organização.
  uniqueIndex('fichas_animal_org_apelido_uidx').on(t.organizationId, t.apelido),
]);

// ── Pelagens ──────────────────────────────────────────────────────────────────
export const pelagens = pgTable('pelagens', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  descricao: text('descricao').notNull(),
  bovino: boolean('bovino').notNull().default(false),
  equideo: boolean('equideo').notNull().default(false),
  observacao: text('observacao'),
  imagens: jsonb('imagens').notNull().default('[]'),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_pelagens_org_id').on(t.organizationId),
]);

// ── Reprodutores (Sêmen e Embriões) ─────────────────────────────────────────────
export const reprodutores = pgTable('reprodutores', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  registro: text('registro'),
  dataNascimento: text('data_nascimento'),
  tipo: text('tipo').notNull().default('semen'),
  raca: text('raca'),
  central: text('central'),
  imagens: jsonb('imagens').notNull().default('[]'),
  genealogia: jsonb('genealogia').notNull().default('{}'),
  observacao: text('observacao'),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_reprodutores_org_id').on(t.organizationId),
]);

// ── Lotes ───────────────────────────────────────────────────────────────────────
export const lotes = pgTable('lotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  // Identidade do lote (Gestão de Lotes): codigo (ex.: "RC-01") e finalidade
  // (Cria | Recria | Terminação | Outra Finalidade) — a finalidade não muda
  // enquanto o lote existir e habilita o 4º card (Processo Reprodutivo) só p/ Cria.
  codigo: text('codigo'),
  finalidade: text('finalidade'),
  sistema: text('sistema'),                           // ex.: "Pasto + suplemento"
  dataInicio: date('data_inicio').notNull(),
  finalizado: boolean('finalizado').notNull().default(false),
  descricao: text('descricao'),
  ordem: integer('ordem').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_lotes_org_id').on(t.organizationId),
]);

// ── Lote Eventos ────────────────────────────────────────────────────────────────
// Ledger imutável: a ÚNICA fonte de verdade dos estados do lote (composição,
// localização, regime, fase reprodutiva). O usuário nunca edita o estado — ele
// empilha um evento e os estados são derivados por selectors puros no front.
export const loteEventos = pgTable('lote_eventos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  loteId: uuid('lote_id').notNull()
    .references(() => lotes.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),     // 'alocacao' | 'transferencia' | 'manejo' | 'repro'
  data: date('data').notNull(),
  resp: text('resp'),               // responsável (texto livre)
  // Payload específico do tipo:
  //  alocacao:      { sentido: 'entrada'|'saida', outroLoteId: string|null, qtd, categoriaId|null, categoriaNome?, naoIdent, animais: string[] }
  //  transferencia: { de: string, para: string, tipoLocal: 'Retiro'|'Pasto'|'Setor'|'Confinamento'|'Curral' }
  //  manejo:        { dim: 'nutricional'|'reprodutivo', plano: string }
  //  repro:         { fase: string, detalhe: string }
  dados: jsonb('dados').notNull().default('{}'),
  criadoPor: text('criado_por').references(() => userProfiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_lote_eventos_org').on(t.organizationId),
  index('idx_lote_eventos_lote').on(t.loteId),
]);

