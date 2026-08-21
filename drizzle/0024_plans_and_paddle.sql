-- v3.3 — plans, the Paddle columns and the ledger they write into.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT READS IT. Not after, and not in the
-- same breath: this repo has no CI and no staging, and a push to main is a push to
-- production, so the two halves land minutes apart in whichever order they are done.
-- One of those orders is safe and the other is not.
--
-- Migration first, then deploy: the eleven new columns sit unread and the new table
-- sits empty, because the old code names neither. Inert in both directions — a
-- rollback of the deploy after this has run breaks nothing.
--
-- Deploy first, then migration: every write to `accounts` fails with 42703 for as
-- long as the gap lasts, and it fails *quietly*. Drizzle names every column of the
-- table in an insert and passes `default` for the ones not supplied, so
-- `provisionAccount`'s `values({ ownerEmail })` is not the narrow insert it reads as;
-- `listAllAccounts`' `select()` expands the same way, and so does `scripts/seed.ts`'s
-- own `insert(accounts).values({ ownerEmail })`. What that costs, concretely: a
-- Google sign-in still succeeds but leaves the person with no `accounts` row (no
-- welcome email, and their first songbook fails the foreign key), a registration is
-- worse still — `verifyEmail` has already committed the credentials and deleted the
-- `pending_registrations` row, so there is nothing left to retry from — and the
-- global owner's /accounts screen comes back empty. The `SONGBOOK_PLANS` off switch
-- does not cover any of it: that flag is read in `entitlementsOf`, which returns
-- UNGATED before touching the database, while this breakage is schema-shaped.
--
-- Single-shot, like the twenty-four migrations before it: plain ADD COLUMN /
-- CREATE TABLE / CREATE INDEX with no IF NOT EXISTS, so run it once, in full, on the
-- unpooled endpoint, and record it in `__drizzle_migrations` — a second run errors
-- rather than no-ops.
--
-- One thing this file cannot express, to be done by hand right after it: the
-- installation's own owner gets `plan = 'lifetime'`. Who the global owners are lives
-- in ALLOWED_EMAILS, an environment variable, not in any table.
CREATE TABLE "paddle_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"account_owner_email" text,
	"paddle_subscription_id" text,
	"payload" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "paddle_customer_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "paddle_subscription_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "granted_plan" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "granted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "granted_by" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "granted_note" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "gclid" text;--> statement-breakpoint
CREATE INDEX "songbooks_account_owner_email_idx" ON "songbooks" USING btree ("account_owner_email");--> statement-breakpoint
CREATE INDEX "songs_songbook_slug_idx" ON "songs" USING btree ("songbook_slug");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_paddle_subscription_id" UNIQUE("paddle_subscription_id");