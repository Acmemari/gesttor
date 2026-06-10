CREATE TABLE "padrao_racial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"classificacao" text,
	"ceip" boolean DEFAULT false NOT NULL,
	"grau_sangue" text,
	"observacao" text,
	"sistema" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venda_fichas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimento_id" uuid NOT NULL,
	"categoria_id" uuid,
	"apelido" text,
	"rfid" text,
	"peso_vivo_kg" numeric,
	"peso_morto_kg" numeric,
	"valor_arroba" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venda_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimento_id" uuid NOT NULL,
	"categoria_id" uuid,
	"qtd" integer DEFAULT 0 NOT NULL,
	"idade_meses" integer,
	"peso_vivo_kg" numeric,
	"valor_arroba" numeric,
	"peso_morto_total" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venda_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"farm_id" text,
	"local_id" uuid,
	"proprietario_id" uuid,
	"cliente_id" uuid,
	"data" date NOT NULL,
	"safra" text,
	"retiro" text,
	"tipo_venda" text DEFAULT 'abate' NOT NULL,
	"tipo_peso" text DEFAULT 'arroba' NOT NULL,
	"valor_arroba" numeric,
	"peso_morto_total" numeric,
	"qtd" integer DEFAULT 0 NOT NULL,
	"valor_total" numeric,
	"peso_morto_arroba" numeric,
	"rendimento" numeric,
	"status" text DEFAULT 'conciliado' NOT NULL,
	"obs" text,
	"desconto" numeric,
	"criado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pelagens" ADD COLUMN "imagens" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "padrao_racial" ADD CONSTRAINT "padrao_racial_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_fichas" ADD CONSTRAINT "venda_fichas_movimento_id_venda_movimentos_id_fk" FOREIGN KEY ("movimento_id") REFERENCES "public"."venda_movimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_fichas" ADD CONSTRAINT "venda_fichas_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_movimento_id_venda_movimentos_id_fk" FOREIGN KEY ("movimento_id") REFERENCES "public"."venda_movimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_local_id_farm_locais_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."farm_locais"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_proprietario_id_people_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_cliente_id_people_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_movimentos" ADD CONSTRAINT "venda_movimentos_criado_por_user_profiles_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_padrao_racial_org_id" ON "padrao_racial" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_venda_fichas_mov" ON "venda_fichas" USING btree ("movimento_id");--> statement-breakpoint
CREATE INDEX "idx_venda_itens_mov" ON "venda_itens" USING btree ("movimento_id");--> statement-breakpoint
CREATE INDEX "idx_venda_mov_org" ON "venda_movimentos" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_venda_mov_farm" ON "venda_movimentos" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "idx_venda_mov_cliente" ON "venda_movimentos" USING btree ("cliente_id");