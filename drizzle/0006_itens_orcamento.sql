-- Migração filtrada — Itens de orçamento (planilha de despesas).

CREATE TABLE IF NOT EXISTS "itens_orcamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao_id" uuid NOT NULL,
	"farm_id" text NOT NULL,
	"plano_conta_id" uuid NOT NULL,
	"valores_mensais" jsonb DEFAULT '{}' NOT NULL,
	"observacao" text,
	"atualizado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "itens_orcamento"
    ADD CONSTRAINT "itens_orcamento_versao_id_orcamento_versoes_id_fk"
    FOREIGN KEY ("versao_id") REFERENCES "public"."orcamento_versoes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "itens_orcamento"
    ADD CONSTRAINT "itens_orcamento_farm_id_farms_id_fk"
    FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "itens_orcamento"
    ADD CONSTRAINT "itens_orcamento_plano_conta_id_plano_contas_id_fk"
    FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "itens_orcamento"
    ADD CONSTRAINT "itens_orcamento_atualizado_por_user_profiles_id_fk"
    FOREIGN KEY ("atualizado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "itens_orcamento_versao_farm_conta_uidx"
  ON "itens_orcamento" USING btree ("versao_id","farm_id","plano_conta_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_itens_versao" ON "itens_orcamento" USING btree ("versao_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_itens_conta" ON "itens_orcamento" USING btree ("plano_conta_id");
