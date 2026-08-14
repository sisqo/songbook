'use server'

/**
 * Reads about accounts as a whole, for the one screen that shows more than the reader's
 * own: `/accounts`, restricted to global owners now that nobody else has more than one
 * account to see — and for `mayShowAccountSwitcher`, called directly from the client
 * (`RoleProvider`), which is why this needs the directive: without it, that call could
 * not cross the server/client boundary as a server action.
 */

import { asc } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { listSignIns } from '@/lib/auth/signIns'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

export interface AccountSummary {
  ownerEmail: string
  createdAt: string
  signInCount: number
  lastSignInAt: string | null
}

/**
 * Every account in the installation — a **global owner** question, deliberately checked
 * with `isOwner` directly rather than `asAdmin()`. An account's own owner also resolves
 * to `admin` on that one account (see `lib/roles.ts`'s own comment on why), and this is
 * the one place that distinction has to hold: `asAdmin()` would let every account's owner
 * see every other account in the installation, which "admin of your own account" was
 * never meant to grant.
 */
export async function listAllAccounts(): Promise<AccountSummary[] | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const rows = await db().select().from(accounts).orderBy(asc(accounts.ownerEmail))
    const signIns = await listSignIns()

    return rows.map((row) => {
      const stats = signIns?.get(row.ownerEmail) ?? null
      return {
        ownerEmail: row.ownerEmail,
        createdAt: row.createdAt.toISOString(),
        signInCount: stats?.signInCount ?? 0,
        lastSignInAt: stats?.lastSignInAt ?? null,
      }
    })
  } catch (error) {
    console.error('listAllAccounts failed', error)
    return null
  }
}

/**
 * Whether the account switcher is worth showing at all: only a global owner, who can
 * enter every account in the installation. Nobody else ever has more than their own
 * account to switch to (v3.1) — a menu item offering to switch to the only place you can
 * already be is not a choice.
 */
export async function mayShowAccountSwitcher(): Promise<boolean> {
  if (!hasDatabase) return false

  const session = await auth()
  return isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)
}
