CREATE TABLE "mapa_rebanho_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"farm_id" text NOT NULL,
	"data_referencia" date NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"observacao" text,
	"criado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapa_rebanho_lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mapa_header_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"peso_kg_cabeca" numeric(8, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mapa_rebanho_headers" ADD CONSTRAINT "mapa_rebanho_headers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_rebanho_headers" ADD CONSTRAINT "mapa_rebanho_headers_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_rebanho_headers" ADD CONSTRAINT "mapa_rebanho_headers_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_rebanho_lancamentos" ADD CONSTRAINT "mapa_rebanho_lancamentos_mapa_header_id_mapa_rebanho_headers_id_fk" FOREIGN KEY ("mapa_header_id") REFERENCES "public"."mapa_rebanho_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_rebanho_lancamentos" ADD CONSTRAINT "mapa_rebanho_lancamentos_local_id_farm_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."farm_locais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_rebanho_lancamentos" ADD CONSTRAINT "mapa_rebanho_lancamentos_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mapa_rebanho_headers_farm_data_uidx" ON "mapa_rebanho_headers" USING btree ("farm_id","data_referencia");--> statement-breakpoint
CREATE INDEX "idx_mapa_rebanho_headers_org" ON "mapa_rebanho_headers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_mapa_rebanho_headers_farm" ON "mapa_rebanho_headers" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mapa_rebanho_lanc_header_local_cat_uidx" ON "mapa_rebanho_lancamentos" USING btree ("mapa_header_id","local_id","categoria_id");--> statement-breakpoint
CREATE INDEX "idx_mapa_rebanho_lanc_header" ON "mapa_rebanho_lancamentos" USING btree ("mapa_header_id");