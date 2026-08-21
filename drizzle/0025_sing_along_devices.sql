-- v3.3 — who is following a Sing Together broadcast, and the most who ever have.
--
-- THE SECOND UN-APPLIED MIGRATION IN THIS TREE. 0024 is applied first, this one
-- second, both by hand on the unpooled endpoint, and both BEFORE the code that reads
-- them is deployed. The order between the two is bookkeeping rather than dependency:
-- `sing_along_sessions` has existed since 0013, so the foreign key below has its target
-- either way, and the two files add different columns to `accounts`. What forces the
-- order is `__drizzle_migrations`, which records a sequence — a 0025 recorded before
-- 0024 leaves the tree claiming a state it is not in, and the next `db:migrate` believes
-- it.
--
-- What is new here, and what 0024 has no reason to say: deploying before running this
-- file breaks Sing Together entirely, and it does so without announcing itself to anyone.
-- There is no loud half. Do not count on being told.
--
-- Without `sing_along_devices`, every guest poll raises 42P01 inside a server action —
-- and the follow screen does not die, it hangs. `FollowSession` moves only on an explicit
-- `{ ok: false }` and treats a throw as «not an answer», so it sleeps four seconds and
-- asks again: the guest sits on «Loading…» for as long as they are willing to, with
-- nothing said and nothing logged on their side. The leader's side looks worse than it
-- reads: starting still succeeds, because `startBroadcast` names no device row (a restart
-- deletes the session row and lets `ON DELETE cascade` release the followers), so they get
-- a link and a QR code for a broadcast nobody can follow, and the «2 of 3» line simply
-- does not appear, because `broadcastAudience` catches its own failed read and answers
-- null. The only trace of any of it is in the server log.
--
-- The other half is `accounts.sing_along_peak_devices`, and it re-arms exactly the
-- breakage 0024's header dissects, for exactly the reason given there: drizzle names
-- every column of `accounts` in an insert and every column in a star-expanded select, so
-- `provisionAccount`'s `values({ ownerEmail })`, `listAllAccounts`' `select()` and
-- `scripts/seed.ts` all fail with 42703 on a column that is not there yet. That is a
-- Google sign-in that succeeds and leaves no `accounts` row, a registration with nothing
-- left to retry from, and an empty /accounts — see 0024 for why the registration case is
-- the unrecoverable one. `SONGBOOK_PLANS` does not cover any of it: that flag is read
-- before any query, while this breakage is schema-shaped.
--
-- Migration first, then deploy, is inert in both directions: the table sits empty and the
-- new column reads 0, because the old code names neither.
--
-- Single-shot, like the twenty-five before it: no IF NOT EXISTS, so run it once, in full,
-- and record it. A second run errors rather than no-ops. Unlike 0024 there is nothing to
-- do by hand afterwards — no row needs editing, and 0 is already true of every account.
--
-- Two things in the DDL below are decisions rather than defaults, both explained in
-- `db/schema.ts` where the table is declared. The primary key is composite, `(token,
-- device_id)`, and it is the table's only index — an index on `last_seen_at` would make
-- every heartbeat a non-HOT update, on the highest-frequency write in the feature. And the
-- foreign key is `ON DELETE cascade ON UPDATE no action`: the cascade is what releases an
-- old link's followers, since a restart deletes the session row rather than rewriting its
-- token, and `no action` is what would turn any future attempt to rotate a token in place
-- into a loud 23503 instead of silently carrying a dead link's audience onto the fresh one.
CREATE TABLE "sing_along_devices" (
	"token" text NOT NULL,
	"device_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sing_along_devices_token_device_id_pk" PRIMARY KEY("token","device_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sing_along_peak_devices" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sing_along_devices" ADD CONSTRAINT "sing_along_devices_token_sing_along_sessions_token_fk" FOREIGN KEY ("token") REFERENCES "public"."sing_along_sessions"("token") ON DELETE cascade ON UPDATE no action;