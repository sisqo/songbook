-- v3.0 — account. The contracting half of 0015, applied only once the deploy that
-- expects it is Ready — same rule as 0011/0012 before it. Everything here either
-- removes a transition crutch 0015 left in place, or restructures a table the old
-- code still writes to in its pre-account shape; both break the code currently
-- running, which is exactly why they wait.

-- The transitional default served only to keep the old `createSongbook` (which never
-- mentions this column) inserting successfully across the deploy window. The new code
-- always supplies it, so the default is now dead weight — dropped to match the
-- column as it is declared in schema.ts, not because leaving it would misbehave.
ALTER TABLE "songbooks" ALTER COLUMN "account_owner_email" DROP DEFAULT;--> statement-breakpoint

-- Repeats 0015's backfill for anything the old `startBroadcast` wrote in the window
-- between the two migrations (it does not set `broadcast_account_email`, so such a
-- row would still be null here). What backfilling from `owner_email` cannot resolve —
-- a broadcast started by someone whose personal account does not exist yet — is
-- dropped rather than left to violate the constraint below, same reasoning as 0015's
-- own delete: an idle broadcast is not repertoire.
UPDATE "sing_along_sessions" SET "broadcast_account_email" = "owner_email"
WHERE "broadcast_account_email" IS NULL AND "owner_email" IN (SELECT "owner_email" FROM "accounts");--> statement-breakpoint
DELETE FROM "sing_along_sessions" WHERE "broadcast_account_email" IS NULL;--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ALTER COLUMN "broadcast_account_email" SET NOT NULL;--> statement-breakpoint

-- members becomes per-account: the same email may now hold one row per account it
-- collaborates on, instead of exactly one row in the whole installation. This cannot
-- be additive — the old code inserts by `email` alone, with no `account_owner_email`
-- to give it — so it waits here, after the new code (which always supplies it) is the
-- only code writing this table.
ALTER TABLE "members" ADD COLUMN "account_owner_email" text;--> statement-breakpoint
UPDATE "members" SET "account_owner_email" = 'f.limberti@gmail.com' WHERE "account_owner_email" IS NULL;--> statement-breakpoint
-- An account's own owner is never a row in its own `members` — see that table's own
-- comment on why — so if migrating as-is ever left one, it would silently take away
-- the very "admin, not rimovibile" guarantee this version introduces. None does today,
-- but the guard costs nothing and this is not a statement worth being wrong about.
DELETE FROM "members" WHERE "account_owner_email" = 'f.limberti@gmail.com' AND "email" = 'f.limberti@gmail.com';--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "account_owner_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_pkey";--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_account_owner_email_email_pk" PRIMARY KEY("account_owner_email","email");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_account_owner_email_accounts_owner_email_fk" FOREIGN KEY ("account_owner_email") REFERENCES "accounts"("owner_email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- The "waiting to be published" stamp has no meaning once every page is dynamic — a
-- save is live the instant it happens. The old code still reads and writes this table
-- until its own deploy lands, which is the whole reason this line is here and not in
-- 0015.
DROP TABLE "builds";
