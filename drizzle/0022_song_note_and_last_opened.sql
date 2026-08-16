-- v3.5 — a personal note per song, and when this reader last opened it. Both
-- additive: every existing row answers "note" with the empty string it already
-- means, and "last opened" with null, which is exactly right — a row born from
-- a saved transposition long ago was never actually a recently-played song.
ALTER TABLE "user_song_prefs" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD COLUMN "last_opened_at" timestamp with time zone;