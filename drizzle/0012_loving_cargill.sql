CREATE TABLE "fichas_animal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"farm_id" text,
	"nascimento_ficha_id" uuid,
	"apelido" text NOT NULL,
	"nome" text,
	"categoria_id" uuid,
	"sexo" text,
	"raca" text,
	"grau" text,
	"pelagem" text,
	"chifre" text,
	"frame" text,
	"categoria_genealogica" text,
	"ceip" text,
	"porte" text,
	"lote" text,
	"rfid" text,
	"sisbov" text,
	"rgn" text,
	"rgd" text,
	"serie" text,
	"peso" numeric(8, 2),
	"pesagem" text,
	"obs" text,
	"evento_entrada" text,
	"data_entrada" date,
	"data" date,
	"peso_nascer" numeric(8, 2),
	"colostro" text,
	"parto" text,
	"fazenda_nascimento" text,
	"pai" text,
	"mae" text,
	"avo_paterno" text,
	"avo_materno" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"extras" jsonb DEFAULT '{}' NOT NULL,
	"criado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morte_fichas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimento_id" uuid NOT NULL,
	"categoria_id" uuid,
	"motivo_id" uuid,
	"apelido" text,
	"rfid" text,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morte_movimentos" (
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
	"obs" text,
	"criado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motivos_morte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pelagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"bovino" boolean DEFAULT false NOT NULL,
	"equideo" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos_chifre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "classificacao_registro" text;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "codigo_asbia" text;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "ceip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "sem_cadastro_asbia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "animal_breeds" ADD COLUMN "sistema" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fichas_animal" ADD CONSTRAINT "fichas_animal_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_animal" ADD CONSTRAINT "fichas_animal_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_animal" ADD CONSTRAINT "fichas_animal_nascimento_ficha_id_nascimento_fichas_id_fk" FOREIGN KEY ("nascimento_ficha_id") REFERENCES "public"."nascimento_fichas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_animal" ADD CONSTRAINT "fichas_animal_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_animal" ADD CONSTRAINT "fichas_animal_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_fichas" ADD CONSTRAINT "morte_fichas_movimento_id_morte_movimentos_id_fk" FOREIGN KEY ("movimento_id") REFERENCES "public"."morte_movimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_fichas" ADD CONSTRAINT "morte_fichas_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_fichas" ADD CONSTRAINT "morte_fichas_motivo_id_motivos_morte_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos_morte"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_movimentos" ADD CONSTRAINT "morte_movimentos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_movimentos" ADD CONSTRAINT "morte_movimentos_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_movimentos" ADD CONSTRAINT "morte_movimentos_local_id_farm_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."farm_locais"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_movimentos" ADD CONSTRAINT "morte_movimentos_proprietario_id_people_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morte_movimentos" ADD CONSTRAINT "morte_movimentos_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos_morte" ADD CONSTRAINT "motivos_morte_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pelagens" ADD CONSTRAINT "pelagens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_chifre" ADD CONSTRAINT "tipos_chifre_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fichas_animal_org" ON "fichas_animal" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_fichas_animal_farm" ON "fichas_animal" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fichas_animal_org_apelido_uidx" ON "fichas_animal" USING btree ("organization_id","apelido");--> statement-breakpoint
CREATE INDEX "idx_morte_fichas_mov" ON "morte_fichas" USING btree ("movimento_id");--> statement-breakpoint
CREATE INDEX "idx_morte_mov_org" ON "morte_movimentos" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_morte_mov_farm" ON "morte_movimentos" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "idx_motivos_morte_org_id" ON "motivos_morte" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_pelagens_org_id" ON "pelagens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tipos_chifre_org_id" ON "tipos_chifre" USING btree ("organization_id");