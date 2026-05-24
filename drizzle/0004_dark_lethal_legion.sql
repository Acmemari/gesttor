CREATE TABLE "animal_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"complemento" text,
	"sexo" text NOT NULL,
	"grupo" text NOT NULL,
	"idade_faixa" text,
	"peso_kg" numeric(8, 2),
	"ordem" integer DEFAULT 0 NOT NULL,
	"percentual" numeric(5, 2),
	"unidade_peso" text,
	"valor_kg_arroba" numeric(10, 2),
	"valor_cabeca" numeric(10, 2),
	"quantidade" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semana_fechada_id" uuid,
	"semana_aberta_id" uuid,
	"farm_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" text,
	"data_reuniao" date NOT NULL,
	"conteudo" jsonb NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_locais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retiro_id" uuid NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"area" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_retiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"total_area" numeric,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_transformations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"evidence" jsonb DEFAULT '[]',
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semana_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"presenca" boolean DEFAULT false NOT NULL,
	"modalidade" text DEFAULT 'presencial' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semana_transcricoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semana_id" uuid NOT NULL,
	"farm_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"uploaded_by" text,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"descricao" text,
	"texto" text,
	"processed_result" jsonb,
	"processed_at" timestamp,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_tasks" ALTER COLUMN "kanban_status" SET DEFAULT 'a fazer';--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "prioridade" text DEFAULT 'média' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "week_history" ADD COLUMN "reopened_at" timestamp;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_status" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_role" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_type" text DEFAULT 'new_account';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "animal_categories" ADD CONSTRAINT "animal_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atas" ADD CONSTRAINT "atas_semana_fechada_id_work_weeks_id_fk" FOREIGN KEY ("semana_fechada_id") REFERENCES "public"."work_weeks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atas" ADD CONSTRAINT "atas_semana_aberta_id_work_weeks_id_fk" FOREIGN KEY ("semana_aberta_id") REFERENCES "public"."work_weeks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atas" ADD CONSTRAINT "atas_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atas" ADD CONSTRAINT "atas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atas" ADD CONSTRAINT "atas_created_by_ba_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."ba_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_locais" ADD CONSTRAINT "farm_locais_retiro_id_farm_retiros_id_fk" FOREIGN KEY ("retiro_id") REFERENCES "public"."farm_retiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_locais" ADD CONSTRAINT "farm_locais_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_retiros" ADD CONSTRAINT "farm_retiros_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_transformations" ADD CONSTRAINT "project_transformations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_meeting_participants" ADD CONSTRAINT "week_meeting_participants_semana_id_work_weeks_id_fk" FOREIGN KEY ("semana_id") REFERENCES "public"."work_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_meeting_participants" ADD CONSTRAINT "week_meeting_participants_pessoa_id_people_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semana_transcricoes" ADD CONSTRAINT "semana_transcricoes_semana_id_work_weeks_id_fk" FOREIGN KEY ("semana_id") REFERENCES "public"."work_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semana_transcricoes" ADD CONSTRAINT "semana_transcricoes_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semana_transcricoes" ADD CONSTRAINT "semana_transcricoes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semana_transcricoes" ADD CONSTRAINT "semana_transcricoes_uploaded_by_ba_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."ba_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_animal_categories_org_id" ON "animal_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_atas_farm_id" ON "atas" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "idx_atas_semana_fechada" ON "atas" USING btree ("semana_fechada_id");--> statement-breakpoint
CREATE INDEX "idx_farm_locais_retiro_id" ON "farm_locais" USING btree ("retiro_id");--> statement-breakpoint
CREATE INDEX "idx_farm_locais_farm_id" ON "farm_locais" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "idx_farm_retiros_farm_id" ON "farm_retiros" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "week_participants_semana_pessoa_uidx" ON "week_meeting_participants" USING btree ("semana_id","pessoa_id");--> statement-breakpoint
CREATE INDEX "idx_week_participants_semana_id" ON "week_meeting_participants" USING btree ("semana_id");--> statement-breakpoint
CREATE INDEX "idx_semana_transcricoes_semana_id" ON "semana_transcricoes" USING btree ("semana_id");--> statement-breakpoint
CREATE INDEX "idx_semana_transcricoes_farm_id" ON "semana_transcricoes" USING btree ("farm_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_parent_id_activities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_parent_id" ON "activities" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_week_history_farm_id" ON "week_history" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "idx_week_history_closed_at" ON "week_history" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "idx_people_user_id" ON "people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_people_invite_token" ON "people" USING btree ("invite_token");