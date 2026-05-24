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
