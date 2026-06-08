CREATE TABLE "animal_breeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engorda_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"farm_id" text,
	"farm_name" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"results" jsonb,
	"report_markdown" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapao_headers" (
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
CREATE TABLE "mapao_lancamentos" (
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
CREATE TABLE "nascimento_fichas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimento_id" uuid NOT NULL,
	"categoria_id" uuid,
	"apelido" text NOT NULL,
	"rfid" text,
	"sisbov" text,
	"porte" text,
	"raca" text,
	"peso" numeric(8, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nascimento_field_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nascimento_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"farm_id" text,
	"local_id" uuid,
	"proprietario_id" uuid,
	"data" date NOT NULL,
	"safra" text,
	"retiro" text,
	"qtd" integer DEFAULT 0 NOT NULL,
	"nao_identificados" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"cat_decl" jsonb DEFAULT '[]',
	"sanitario" jsonb DEFAULT '[]',
	"criado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal_categories" ADD COLUMN "raca" text;--> statement-breakpoint
ALTER TABLE "animal_categories" ADD COLUMN "ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "tipo" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "razao_social" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "inscricao_estadual" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "tipo_documento" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "numero_documento" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "endereco_numero" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "estado" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "banco" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "agencia" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "conta" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "tipo_conta" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "titular_conta" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "cpf_cnpj_conta" text;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD CONSTRAINT "animal_breeds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_headers" ADD CONSTRAINT "mapao_headers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_headers" ADD CONSTRAINT "mapao_headers_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_headers" ADD CONSTRAINT "mapao_headers_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_lancamentos" ADD CONSTRAINT "mapao_lancamentos_mapa_header_id_mapao_headers_id_fk" FOREIGN KEY ("mapa_header_id") REFERENCES "public"."mapao_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_lancamentos" ADD CONSTRAINT "mapao_lancamentos_local_id_farm_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."farm_locais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapao_lancamentos" ADD CONSTRAINT "mapao_lancamentos_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_fichas" ADD CONSTRAINT "nascimento_fichas_movimento_id_nascimento_movimentos_id_fk" FOREIGN KEY ("movimento_id") REFERENCES "public"."nascimento_movimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_fichas" ADD CONSTRAINT "nascimento_fichas_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_field_configs" ADD CONSTRAINT "nascimento_field_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_movimentos" ADD CONSTRAINT "nascimento_movimentos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_movimentos" ADD CONSTRAINT "nascimento_movimentos_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_movimentos" ADD CONSTRAINT "nascimento_movimentos_local_id_farm_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."farm_locais"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_movimentos" ADD CONSTRAINT "nascimento_movimentos_proprietario_id_people_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nascimento_movimentos" ADD CONSTRAINT "nascimento_movimentos_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_animal_breeds_org_id" ON "animal_breeds" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mapao_headers_farm_data_uidx" ON "mapao_headers" USING btree ("farm_id","data_referencia");--> statement-breakpoint
CREATE INDEX "idx_mapao_headers_org" ON "mapao_headers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_mapao_headers_farm" ON "mapao_headers" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mapao_lanc_header_local_cat_uidx" ON "mapao_lancamentos" USING btree ("mapa_header_id","local_id","categoria_id");--> statement-breakpoint
CREATE INDEX "idx_mapao_lanc_header" ON "mapao_lancamentos" USING btree ("mapa_header_id");--> statement-breakpoint
CREATE INDEX "idx_nascimento_fichas_mov" ON "nascimento_fichas" USING btree ("movimento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nascimento_field_config_org_uidx" ON "nascimento_field_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_nascimento_mov_org" ON "nascimento_movimentos" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_nascimento_mov_farm" ON "nascimento_movimentos" USING btree ("farm_id");