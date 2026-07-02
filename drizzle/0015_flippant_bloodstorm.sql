CREATE TABLE "regimes_alimentares_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regime_alimentar_id" uuid NOT NULL,
	"data_vigencia" date NOT NULL,
	"custo_quilo" numeric(10, 2) NOT NULL,
	"formulacao" text,
	"anexo_url" text,
	"anexo_nome" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regimes_alimentares_historico" ADD CONSTRAINT "regimes_alimentares_historico_regime_alimentar_id_regimes_alimentares_id_fk" FOREIGN KEY ("regime_alimentar_id") REFERENCES "public"."regimes_alimentares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_regimes_alimentares_hist_regime_id" ON "regimes_alimentares_historico" USING btree ("regime_alimentar_id");