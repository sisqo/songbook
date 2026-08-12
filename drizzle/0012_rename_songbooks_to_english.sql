-- Renames the Italian identifiers to their English equivalents. A rename has no
-- additive form — the moment this runs, code still expecting "canzonieri" breaks —
-- so it must be applied only immediately before the deploy that expects the new
-- names, not before.
ALTER TABLE "canzonieri" RENAME TO "songbooks";--> statement-breakpoint
ALTER TABLE "sections" RENAME COLUMN "canzoniere_slug" TO "songbook_slug";--> statement-breakpoint
ALTER TABLE "songs" RENAME COLUMN "canzoniere_slug" TO "songbook_slug";--> statement-breakpoint
ALTER TABLE "sections" RENAME CONSTRAINT "sections_canzoniere_slug_canzonieri_slug_fk" TO "sections_songbook_slug_songbooks_slug_fk";--> statement-breakpoint
ALTER TABLE "sections" RENAME CONSTRAINT "sections_canzoniere_name" TO "sections_songbook_name";--> statement-breakpoint
ALTER TABLE "sections" RENAME CONSTRAINT "sections_id_canzoniere" TO "sections_id_songbook";--> statement-breakpoint
ALTER TABLE "songs" RENAME CONSTRAINT "songs_canzoniere_slug_canzonieri_slug_fk" TO "songs_songbook_slug_songbooks_slug_fk";--> statement-breakpoint
ALTER TABLE "songs" RENAME CONSTRAINT "songs_section_canzoniere_fk" TO "songs_section_songbook_fk";--> statement-breakpoint
-- The instrument value was never a translatable word, just this app's own internal
-- tag for "guitar" — unlike the notation column, which is a real choice of
-- chord-naming convention, not an implementation detail.
UPDATE "user_prefs" SET "instrument" = 'guitar' WHERE "instrument" = 'chitarra';--> statement-breakpoint
-- Only changes what a brand-new row defaults to if no value were given, which
-- never happens in practice — the app always writes an explicit notation on
-- every save. Existing rows (both currently 'it') are untouched.
ALTER TABLE "user_prefs" ALTER COLUMN "notation" SET DEFAULT 'int';
