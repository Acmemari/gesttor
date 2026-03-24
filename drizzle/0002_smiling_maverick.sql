CREATE TABLE "support_ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"message_id" uuid,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" text,
	"author_type" text DEFAULT 'user' NOT NULL,
	"message" text NOT NULL,
	"reply_to_id" uuid,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_reads" (
	"ticket_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_reads_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"ticket_type" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"current_url" text,
	"location_area" text,
	"specific_screen" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_pessoa_id_assignees_id_fk";
--> statement-breakpoint
ALTER TABLE "initiatives" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_analysts" ALTER COLUMN "analyst_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "owner_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "analyst_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "analyst_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "program_type" text DEFAULT 'assessoria';--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_message_id_support_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_ticket_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_id_user_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_reads" ADD CONSTRAINT "support_ticket_reads_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_reads" ADD CONSTRAINT "support_ticket_reads_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_support_ticket_attachments_ticket_id" ON "support_ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_support_ticket_messages_ticket_id" ON "support_ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_created_by" ON "support_tickets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_last_message_at" ON "support_tickets" USING btree ("last_message_at");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_pessoa_id_people_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_analysts" ADD CONSTRAINT "organization_analysts_analyst_id_user_profiles_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_analyst_id_user_profiles_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."user_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_semana_id" ON "activities" USING btree ("semana_id");--> statement-breakpoint
CREATE INDEX "idx_activities_status" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_farms_organization_id" ON "farms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_farms_ativo" ON "farms" USING btree ("ativo");--> statement-breakpoint
CREATE UNIQUE INDEX "org_analysts_org_analyst_uidx" ON "organization_analysts" USING btree ("organization_id","analyst_id");--> statement-breakpoint
CREATE INDEX "idx_org_analysts_analyst_id" ON "organization_analysts" USING btree ("analyst_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_analyst_id" ON "organizations" USING btree ("analyst_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_ativo" ON "organizations" USING btree ("ativo");--> statement-breakpoint
CREATE UNIQUE INDEX "person_farms_pessoa_farm_uidx" ON "person_farms" USING btree ("pessoa_id","farm_id");--> statement-breakpoint
CREATE INDEX "idx_work_weeks_farm_modo_aberta" ON "work_weeks" USING btree ("farm_id","modo","aberta");--> statement-breakpoint
CREATE INDEX "idx_work_weeks_numero_modo_farm" ON "work_weeks" USING btree ("numero","modo","farm_id");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_organization_id" ON "user_profiles" USING btree ("organization_id");