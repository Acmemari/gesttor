-- Migração filtrada — Phase 1 da Gestão Orçamentária.
-- Extrai APENAS as 7 tabelas orçamentárias do drizzle/0004_lying_mandarin.sql,
-- evitando drift acumulado em outras tabelas do schema.
--
-- Tabelas: plano_contas, orcamentos, orcamento_farms, orcamento_colaboradores,
--          orcamento_versoes, premissas, log_auditoria_orcamento.

CREATE TABLE IF NOT EXISTS "plano_contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"numero_pai_id" uuid,
	"nome" text NOT NULL,
	"perfil_desembolso" text,
	"areas_negocio" text[],
	"nivel" integer NOT NULL,
	"is_folha" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plano_contas_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"safra" text NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"descricao" text,
	"criado_por" text NOT NULL,
	"arquivado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orcamento_farms" (
	"orcamento_id" uuid NOT NULL,
	"farm_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orcamento_farms_orcamento_id_farm_id_pk" PRIMARY KEY("orcamento_id","farm_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orcamento_colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"papel" text DEFAULT 'consultor' NOT NULL,
	"e_aprovador" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orcamento_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"parent_id" uuid,
	"tipo" text DEFAULT 'rascunho' NOT NULL,
	"nome" text NOT NULL,
	"criado_por" text NOT NULL,
	"aprovado_por" text,
	"aprovado_em" timestamp,
	"mes_corte" date,
	"imutavel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "premissas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"valor" numeric(18, 6),
	"unidade" text,
	"fonte" text DEFAULT 'manual' NOT NULL,
	"mes" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_auditoria_orcamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"versao_id" uuid,
	"usuario_id" text NOT NULL,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"justificativa" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── Foreign Keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "plano_contas"
    ADD CONSTRAINT "plano_contas_numero_pai_id_plano_contas_id_fk"
    FOREIGN KEY ("numero_pai_id") REFERENCES "public"."plano_contas"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamentos"
    ADD CONSTRAINT "orcamentos_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamentos"
    ADD CONSTRAINT "orcamentos_criado_por_user_profiles_id_fk"
    FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_farms"
    ADD CONSTRAINT "orcamento_farms_orcamento_id_orcamentos_id_fk"
    FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_farms"
    ADD CONSTRAINT "orcamento_farms_farm_id_farms_id_fk"
    FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_colaboradores"
    ADD CONSTRAINT "orcamento_colaboradores_orcamento_id_orcamentos_id_fk"
    FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_colaboradores"
    ADD CONSTRAINT "orcamento_colaboradores_user_id_user_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_versoes"
    ADD CONSTRAINT "orcamento_versoes_orcamento_id_orcamentos_id_fk"
    FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_versoes"
    ADD CONSTRAINT "orcamento_versoes_parent_id_orcamento_versoes_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."orcamento_versoes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_versoes"
    ADD CONSTRAINT "orcamento_versoes_criado_por_user_profiles_id_fk"
    FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orcamento_versoes"
    ADD CONSTRAINT "orcamento_versoes_aprovado_por_user_profiles_id_fk"
    FOREIGN KEY ("aprovado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "premissas"
    ADD CONSTRAINT "premissas_versao_id_orcamento_versoes_id_fk"
    FOREIGN KEY ("versao_id") REFERENCES "public"."orcamento_versoes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "log_auditoria_orcamento"
    ADD CONSTRAINT "log_auditoria_orcamento_orcamento_id_orcamentos_id_fk"
    FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "log_auditoria_orcamento"
    ADD CONSTRAINT "log_auditoria_orcamento_versao_id_orcamento_versoes_id_fk"
    FOREIGN KEY ("versao_id") REFERENCES "public"."orcamento_versoes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "log_auditoria_orcamento"
    ADD CONSTRAINT "log_auditoria_orcamento_usuario_id_user_profiles_id_fk"
    FOREIGN KEY ("usuario_id") REFERENCES "public"."user_profiles"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_plano_contas_pai" ON "plano_contas" USING btree ("numero_pai_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plano_contas_ativo" ON "plano_contas" USING btree ("ativo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orcamentos_org_safra" ON "orcamentos" USING btree ("organization_id","safra");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orcamentos_arquivado" ON "orcamentos" USING btree ("arquivado");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orcamento_farms_farm" ON "orcamento_farms" USING btree ("farm_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orcamento_colab_orc_user_uidx" ON "orcamento_colaboradores" USING btree ("orcamento_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orcamento_colab_user" ON "orcamento_colaboradores" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_versoes_orcamento" ON "orcamento_versoes" USING btree ("orcamento_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_versoes_parent" ON "orcamento_versoes" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_premissas_versao" ON "premissas" USING btree ("versao_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_premissas_chave" ON "premissas" USING btree ("chave");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_orcamento_data" ON "log_auditoria_orcamento" USING btree ("orcamento_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_versao" ON "log_auditoria_orcamento" USING btree ("versao_id");
