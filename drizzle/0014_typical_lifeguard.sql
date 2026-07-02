CREATE TABLE "regimes_alimentares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"codigo_curto" text NOT NULL,
	"tipo" text NOT NULL,
	"nivel_ingestao_valor" numeric(8, 2),
	"nivel_ingestao_tipo" text,
	"custo_quilo" numeric(10, 2),
	"anexo_url" text,
	"anexo_nome" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm_maps" ADD COLUMN "corrected_storage_path" text;--> statement-breakpoint
ALTER TABLE "farm_maps" ADD COLUMN "corrected_file_name" text;--> statement-breakpoint
ALTER TABLE "farm_maps" ADD COLUMN "corrected_file_size" integer;--> statement-breakpoint
ALTER TABLE "farm_maps" ADD COLUMN "correcao_report" jsonb;--> statement-breakpoint
ALTER TABLE "regimes_alimentares" ADD CONSTRAINT "regimes_alimentares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_regimes_alimentares_org_id" ON "regimes_alimentares" USING btree ("organization_id");