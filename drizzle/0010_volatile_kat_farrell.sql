CREATE TABLE "sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"canzoniere_slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_canzoniere_name" UNIQUE("canzoniere_slug","name"),
	CONSTRAINT "sections_id_canzoniere" UNIQUE("id","canzoniere_slug")
);
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "canzoniere_slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "section_id" integer;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_canzoniere_slug_canzonieri_slug_fk" FOREIGN KEY ("canzoniere_slug") REFERENCES "public"."canzonieri"("slug") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_section_canzoniere_fk" FOREIGN KEY ("section_id","canzoniere_slug") REFERENCES "public"."sections"("id","canzoniere_slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
-- Backfill, written by hand under the generated DDL: every canzoniere gets one
-- section, «Brani», and all of its songs move into it. `position` is untouched, so
-- the order a canzoniere already had becomes the order inside its only section and
-- nothing moves on screen. Empty canzonieri get theirs too, so every canzoniere
-- always offers somewhere to file into.
INSERT INTO "sections" ("canzoniere_slug", "name", "position")
SELECT "slug", 'Brani', 1 FROM "canzonieri"
ON CONFLICT ("canzoniere_slug", "name") DO NOTHING;--> statement-breakpoint
UPDATE "songs" SET "section_id" = "s"."id"
FROM "sections" "s"
WHERE "s"."canzoniere_slug" = "songs"."canzoniere_slug"
  AND "s"."position" = 1
  AND "songs"."section_id" IS NULL;