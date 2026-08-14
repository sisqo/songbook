/**
 * How often, and when last, each address has actually signed in.
 *
 * `recordSignIn` is called from the `signIn` callback in `auth.ts`, once admission is
 * already decided — never a gate itself, only a record of one having just been passed.
 * `listSignIns` is read back by `listAllAccounts`, for the one screen that lists every
 * account; see `signIns`' own comment in `db/schema.ts` for why it cannot be joined to
 * either table.
 */

import { sql } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { signIns } from '@/lib/db/schema'

export interface SignInStats {
  signInCount: number
  lastSignInAt: string
}

/**
 * Called once per successful sign-in, after `auth.ts` has already decided to admit it.
 *
 * Failure here must never fail the sign-in it is merely counting, so it is caught and
 * logged rather than thrown — a person who just proved who they are does not lose entry
 * over a row this app failed to write about them.
 */
export async function recordSignIn(email: string): Promise<void> {
  if (!hasDatabase) return

  try {
    await db()
      .insert(signIns)
      .values({ email, signInCount: 1 })
      .onConflictDoUpdate({
        target: signIns.email,
        set: { signInCount: sql`${signIns.signInCount} + 1`, lastSignInAt: sql`now()` },
      })
  } catch (error) {
    console.error('recordSignIn failed', error)
  }
}

/**
 * Every address that has ever signed in, for `listAllAccounts` to look up by email.
 *
 * **null** only when the table could not be read at all — offline, or a database that
 * did not respond — which `listAllAccounts` treats as "unknown for everyone" rather than
 * failing the whole screen: who has an account is the question that must stay answerable,
 * and this is only ever a footnote to it.
 */
export async function listSignIns(): Promise<Map<string, SignInStats> | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db().select().from(signIns)
    return new Map(
      rows.map((row) => [
        row.email,
        { signInCount: row.signInCount, lastSignInAt: row.lastSignInAt.toISOString() },
      ]),
    )
  } catch (error) {
    console.error('listSignIns failed', error)
    return null
  }
}
