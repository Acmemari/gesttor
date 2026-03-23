CREATE TABLE "organization_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"uploaded_by" text,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"category" text DEFAULT 'geral',
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyst_farms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_owners" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "analyst_farms" CASCADE;--> statement-breakpoint
DROP TABLE "client_documents" CASCADE;--> statement-breakpoint
DROP TABLE "client_owners" CASCADE;--> statement-breakpoint
DROP TABLE "clients" CASCADE;--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "farms" DROP CONSTRAINT "farms_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "farms" DROP CONSTRAINT "farms_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_analysts" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_analysts" ALTER COLUMN "analyst_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_owners" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "owner_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "analyst_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "client_id";