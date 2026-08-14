-- v3.0 — account. The additive half: safe to apply before the deploy that expects
-- these columns, because everything a currently-running insert does not know about
-- either has a default or stays nullable until 0016. Applying this early, rather than
-- alongside 0016, is what keeps "create a songbook" and "start a broadcast" working on
-- the old code while this runs.

-- One account exists so far: f.limberti@gmail.com. It takes on today's single shared
-- repertoire and its members (below); the other global owner, f.limberti@3nd.it, gets
-- its own personal account at its next sign-in, same as anyone newly admitted (v3.0,
-- step 8) — not here, because nothing about "the migration" is special about it.
CREATE TABLE "accounts" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "accounts" ("owner_email") VALUES ('f.limberti@gmail.com') ON CONFLICT DO NOTHING;--> statement-breakpoint

-- An idle Sing Together broadcast belonging to f.limberti@3nd.it, never actually
-- shown a song (`current_song_slug` is null). It cannot be backfilled to a real
-- account below — that account does not exist until its owner's next sign-in — and
-- it is not repertoire, so it is dropped rather than carried forward.
DELETE FROM "sing_along_sessions" WHERE "owner_email" NOT IN (SELECT "owner_email" FROM "accounts");--> statement-breakpoint

-- songbooks: every songbook now belongs to an account. The default is transitional —
-- the currently-deployed `createSongbook` does not supply this column, and with only
-- one account in the installation, defaulting a songbook to it is simply correct
-- while both versions of the code are alive at once. 0016 drops the default once the
-- new code (which always supplies it) is the only code running.
ALTER TABLE "songbooks" ADD COLUMN "account_owner_email" text DEFAULT 'f.limberti@gmail.com';--> statement-breakpoint
UPDATE "songbooks" SET "account_owner_email" = 'f.limberti@gmail.com' WHERE "account_owner_email" IS NULL;--> statement-breakpoint
ALTER TABLE "songbooks" ALTER COLUMN "account_owner_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_account_owner_email_accounts_owner_email_fk" FOREIGN KEY ("account_owner_email") REFERENCES "accounts"("owner_email") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- The Example template flag: `not null default false` needs no transition window of
-- its own — a currently-deployed insert that never mentions it gets the default, same
-- as always. The "example" songbook (created earlier, still empty) is flagged now, and
-- a single placeholder song joins it so the clone that provisioning performs at every
-- new sign-in has something real to copy, not an empty section.
ALTER TABLE "songbooks" ADD COLUMN "is_example_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "songbooks_one_example_template" ON "songbooks" USING btree ("is_example_template") WHERE "is_example_template";--> statement-breakpoint
UPDATE "songbooks" SET "is_example_template" = true WHERE "slug" = 'example';--> statement-breakpoint
INSERT INTO "songs" ("slug", "title", "artist", "body", "songbook_slug", "section_id", "position")
SELECT 'example-song', 'Example Song', 'Songbook',
       E'{title: Example Song}\n{artist: Songbook}\n\n[C]This is just an [G]example, so you can [Am]see how a song [F]looks\n[C]Add your own repertoire [G]here — this one is only a [C]placeholder',
       "songbooks"."slug", "sections"."id", 1
FROM "songbooks"
JOIN "sections" ON "sections"."songbook_slug" = "songbooks"."slug" AND "sections"."name" = 'Songs'
WHERE "songbooks"."slug" = 'example'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- sing_along_sessions: which account's repertoire a broadcast is showing. Backfilled
-- from `owner_email` — the only account that could exist yet, for whoever is
-- broadcasting today — but left nullable: the currently-deployed `startBroadcast`
-- does not supply it either, and 0016 is where it becomes required, once the new
-- code is the only code writing this table.
ALTER TABLE "sing_along_sessions" ADD COLUMN "broadcast_account_email" text;--> statement-breakpoint
UPDATE "sing_along_sessions" SET "broadcast_account_email" = "owner_email" WHERE "broadcast_account_email" IS NULL;--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_broadcast_account_email_accounts_owner_email_fk" FOREIGN KEY ("broadcast_account_email") REFERENCES "accounts"("owner_email") ON DELETE no action ON UPDATE no action;
