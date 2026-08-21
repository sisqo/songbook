-- Two columns, both nullable, no default: a downgrade or a cancellation scheduled for
-- when the account's already-paid-for period ends, instead of applying right away. See
-- `db/schema.ts` (accounts.pendingPlan/pendingCycle) and PLAN-pagamenti.md for the whole
-- design. No existing row has anything to backfill — "nothing scheduled" is exactly what
-- a column nobody has written yet already means.
--
-- Single-shot, like every migration before it: no IF NOT EXISTS, run it once, record it.
--
-- Snapshot warning (PLAN.md, Domande aperte #19): every `drizzle-kit` snapshot from 0015
-- on is a byte-for-byte copy of the v2.4 one, not a real incremental diff. The next
-- `db:generate` run will propose recreating `accounts` from scratch, the columns v3.0+
-- added to `songbooks`, and even the `members` table 0017 already dropped. Discard that
-- diff — this file and its journal/snapshot entries were written by hand, the same way
-- 0024 and 0025 were.
ALTER TABLE "accounts" ADD COLUMN "pending_plan" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "pending_cycle" text;
