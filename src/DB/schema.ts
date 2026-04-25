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
  sexo: text('sexo').notNull(),
  grupo: text('grupo').notNull(),
  idadeFaixa: text('idade_faixa'),
  pesoKg: numeric('peso_kg', { precision: 8, scale: 2 }),
  ordem: integer('ordem').notNull().default(0),
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
