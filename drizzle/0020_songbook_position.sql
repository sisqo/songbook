-- Songbooks join sections and songs in having an order: the reader's own list of
-- them, drag-and-drop like the other two. Every existing songbook gets its
-- alphabetical rank, within its own account — this column is not globally unique,
-- the same way a section's position is only unique within its songbook — so a
-- reorder in one account can never step on another's.
ALTER TABLE "songbooks" ADD COLUMN "position" integer;--> statement-breakpoint

UPDATE "songbooks" AS s SET "position" = ranked.rn
FROM (
  SELECT "slug", ROW_NUMBER() OVER (PARTITION BY "account_owner_email" ORDER BY "name") AS rn
  FROM "songbooks"
) AS ranked
WHERE s."slug" = ranked."slug";--> statement-breakpoint

ALTER TABLE "songbooks" ALTER COLUMN "position" SET NOT NULL;
