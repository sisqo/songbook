-- The contracting half of v2.3, applied only after the deploy that fills this column
-- was Ready. The backfill is repeated first, and not out of caution: between the
-- additive migration and that deploy, the code in production knew nothing about
-- `section_id`, so anything imported in that window has none. Filing it in the first
-- section of its canzoniere is the same answer the additive migration gave.
UPDATE "songs" SET "section_id" = "s"."id"
FROM "sections" "s"
WHERE "s"."canzoniere_slug" = "songs"."canzoniere_slug"
  AND "s"."position" = 1
  AND "songs"."section_id" IS NULL;--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "section_id" SET NOT NULL;
