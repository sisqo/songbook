-- v3.5 — user_prefs and user_song_prefs had no cascade tied to the account
-- they belong to: removeAccountAndContent (lib/accounts/actions.ts) never
-- touched either table, so every account ever deleted through the app — the
-- self-service path and the global-owner one alike — left a stray row behind
-- for good, keyed by an address `accounts` no longer had a row for. Found as
-- orphaned rows in production on 2026-08-16 while investigating "extra users"
-- showing up outside the accounts list. See schema.ts's own comments on
-- userPrefs/userSongPrefs for the two different reasons each table escaped
-- cleanup until now.
--
-- Cleans up the existing orphans and adds the missing foreign keys in the same
-- migration, so a fresh deploy is never left with the gap this closes still
-- open even briefly. Guarded against the one way this could go wrong instead
-- of silently: a `user_email` that differs from some `accounts.owner_email` by
-- case only would (a) make the DELETE below drop a still-live row that just
-- happens not to match byte-for-byte, and (b) make the ADD CONSTRAINT below
-- fail outright once real orphans are gone but a case-only mismatch remains.
-- Exactly the vintage of data the Paolo account bug (fixed 2026-08-16 by
-- delete+recreate, PLAN.md/session notes) came from, so it is worth refusing
-- loudly rather than assuming today's data is clean.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "user_prefs" u
    WHERE lower(u."user_email") IN (SELECT lower(owner_email) FROM "accounts")
      AND u."user_email" NOT IN (SELECT owner_email FROM "accounts")
  ) OR EXISTS (
    SELECT 1 FROM "user_song_prefs" u
    WHERE lower(u."user_email") IN (SELECT lower(owner_email) FROM "accounts")
      AND u."user_email" NOT IN (SELECT owner_email FROM "accounts")
  ) THEN
    RAISE EXCEPTION 'user_prefs/user_song_prefs has a case-mismatched user_email — normalize it before this migration runs';
  END IF;
END $$;--> statement-breakpoint

DELETE FROM "user_prefs" WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" a WHERE a."owner_email" = "user_prefs"."user_email"
);--> statement-breakpoint

DELETE FROM "user_song_prefs" WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" a WHERE a."owner_email" = "user_song_prefs"."user_email"
);--> statement-breakpoint

ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_email_accounts_owner_email_fk" FOREIGN KEY ("user_email") REFERENCES "accounts"("owner_email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_user_email_accounts_owner_email_fk" FOREIGN KEY ("user_email") REFERENCES "accounts"("owner_email") ON DELETE cascade ON UPDATE no action;
