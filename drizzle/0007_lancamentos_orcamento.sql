-- Lançamentos de despesa (modelo rico) + produtos detalhados.
-- itens_orcamento.valores_mensais passa a ser a soma agregada destes lançamentos.

CREATE TABLE IF NOT EXISTS "lancamentos_orcamento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "versao_id" uuid NOT NULL,
  "farm_id" text NOT NULL,
  "plano_conta_id" uuid NOT NULL,
  "recorrencia" text DEFAULT 'mensal' NOT NULL,
  "valor_base" numeric(18, 2) DEFAULT '0' NOT NULL,
  "distribuicao_mensal" jsonb DEFAULT '{}' NOT NULL,
  "tipo_origem" text DEFAULT 'modal' NOT NULL,
  "descricao" text,
  "observacao" text,
  "status" text DEFAULT 'ativo' NOT NULL,
  "criado_por" text NOT NULL,
  "atualizado_por" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lancamento_produtos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lancamento_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "quantidade" numeric(18, 4) NOT NULL,
  "unidade" text,
  "valor_unitario" numeric(18, 6) NOT NULL,
  "subtotal" numeric(18, 2) NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "lancamentos_orcamento" ADD CONSTRAINT "lancamentos_orcamento_versao_id_orcamento_versoes_id_fk"
  FOREIGN KEY ("versao_id") REFERENCES "public"."orcamento_versoes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamentos_orcamento" ADD CONSTRAINT "lancamentos_orcamento_farm_id_farms_id_fk"
  FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamentos_orcamento" ADD CONSTRAINT "lancamentos_orcamento_plano_conta_id_plano_contas_id_fk"
  FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamentos_orcamento" ADD CONSTRAINT "lancamentos_orcamento_criado_por_user_profiles_id_fk"
  FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamentos_orcamento" ADD CONSTRAINT "lancamentos_orcamento_atualizado_por_user_profiles_id_fk"
  FOREIGN KEY ("atualizado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamento_produtos" ADD CONSTRAINT "lancamento_produtos_lancamento_id_lancamentos_orcamento_id_fk"
  FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos_orcamento"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_lancamentos_versao_farm_conta"
  ON "lancamentos_orcamento" USING btree ("versao_id","farm_id","plano_conta_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lancamentos_versao_status"
  ON "lancamentos_orcamento" USING btree ("versao_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lancamentos_shadow_uidx"
  ON "lancamentos_orcamento" USING btree ("versao_id","farm_id","plano_conta_id")
  WHERE tipo_origem = 'planilha';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lancamento_produtos_lancamento"
  ON "lancamento_produtos" USING btree ("lancamento_id","ordem");
