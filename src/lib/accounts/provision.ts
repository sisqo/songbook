/**
 * Giving a newly-admitted email its own account.
 *
 * Called from `signIn` in `auth.ts`, next to `recordSignIn` — the one place a new session
 * is created, and so the one place a first sign-in can be told apart from every one after
 * it. Idempotent by checking existence rather than by distinguishing "the first" call:
 * that is what lets it run on every sign-in with no cost once the account already exists,
 * the same shape as `recordSignIn` itself.
 *
 * This runs for **every** email a provider has authenticated, not only global owners: an
 * address a global owner has already given its own account through `createAccount`
 * reaches this same function again on its own first sign-in — a no-op by then, since
 * `createAccount` already called it once (see PLAN.md, *Niente più ospiti*, point 2).
 *
 * Returns whether it actually created the account (true) or found one already there —
 * or failed (false). That bit is not for this function's own use: it is how a caller
 * tells a brand-new arrival from a no-op repeat, which is what decides whether a welcome
 * email goes out (v3.2, PLAN.md point 7). The email itself is not sent here — sending it
 * is the caller's job, so this function does not need to know Resend exists.
 */

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

/**
 * Creates the account if it does not exist yet — one row, and nothing in it.
 *
 * It used to clone the songbook flagged `isExampleTemplate`, its sections and its songs,
 * into every new account. That is gone deliberately: a new account starts **empty**. The
 * clone spent the account's first songbook — and, on a plan with a songbook cap, its only
 * one — on content nobody asked for, and it made every first impression a tidying job.
 * The template row itself, the `isExampleTemplate` column and the partial unique index
 * that keeps it singular all stay: `copySongbook` still copies a songbook into another
 * account on demand, which is what that row is for now.
 *
 * Silent no-op with no database, same as `recordSignIn`: local work from `content/` has
 * no accounts table to write. Failures are logged, not thrown — a sign-in must still
 * succeed even if provisioning trips, the same reasoning `recordSignIn` already applies.
 * Both of those paths report `false`: nothing was created, so there is nothing to send
 * a welcome email about.
 */
export async function provisionAccount(email: string): Promise<boolean> {
  if (!hasDatabase) return false

  const ownerEmail = normalizeEmail(email)

  try {
    return await db().transaction(async (tx) => {
      const existing = await tx
        .select({ ownerEmail: accounts.ownerEmail })
        .from(accounts)
        .where(eq(accounts.ownerEmail, ownerEmail))
        .limit(1)
      if (existing.length > 0) return false

      await tx.insert(accounts).values({ ownerEmail })
      return true
    })
  } catch (error) {
    console.error('provisionAccount failed', error)
    return false
  }
}
