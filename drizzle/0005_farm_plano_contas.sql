-- Migração filtrada — Configuração de plano de contas POR FAZENDA.
-- Cria a tabela `farm_plano_contas_inativas` (blacklist N:N entre fazendas e contas).

CREATE TABLE IF NOT EXISTS "farm_plano_contas_inativas" (
	"farm_id" text NOT NULL,
	"plano_conta_id" uuid NOT NULL,
	"desativado_por" text,
	"desativado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farm_plano_contas_inativas_farm_id_plano_conta_id_pk" PRIMARY KEY("farm_id","plano_conta_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "farm_plano_contas_inativas"
    ADD CONSTRAINT "farm_plano_contas_inativas_farm_id_farms_id_fk"
    FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "farm_plano_contas_inativas"
    ADD CONSTRAINT "farm_plano_contas_inativas_plano_conta_id_plano_contas_id_fk"
    FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "farm_plano_contas_inativas"
    ADD CONSTRAINT "farm_plano_contas_inativas_desativado_por_user_profiles_id_fk"
    FOREIGN KEY ("desativado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_fpci_farm" ON "farm_plano_contas_inativas" USING btree ("farm_id");
