ALTER TABLE "people" DROP CONSTRAINT "people_farm_id_farms_id_fk";
--> statement-breakpoint
DROP INDEX "idx_people_farm_id";--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN "farm_id";--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_slug_unique" UNIQUE("slug");