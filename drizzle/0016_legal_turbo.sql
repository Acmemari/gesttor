CREATE TABLE "regimes_alimentares_gmd" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regime_alimentar_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"estacao" text NOT NULL,
	"gmd" numeric(6, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regimes_alimentares" ADD COLUMN "produto_formulado" text;--> statement-breakpoint
ALTER TABLE "regimes_alimentares_gmd" ADD CONSTRAINT "regimes_alimentares_gmd_regime_alimentar_id_regimes_alimentares_id_fk" FOREIGN KEY ("regime_alimentar_id") REFERENCES "public"."regimes_alimentares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regimes_alimentares_gmd" ADD CONSTRAINT "regimes_alimentares_gmd_categoria_id_animal_categories_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."animal_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_regimes_alimentares_gmd_regime_id" ON "regimes_alimentares_gmd" USING btree ("regime_alimentar_id");