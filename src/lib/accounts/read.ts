'use server'

/**
 * Reads about accounts as a whole, for the one screen that shows more than the reader's
 * own: `/accounts` — and for `mayShowAccountSwitcher`, called directly from the client
 * (`RoleProvider`), which is why this needs the directive: without it, `next/headers` in
 * `lib/accounts/current.ts` gets pulled into the client bundle through this file's own
 * import of it, rather than staying behind the server-action boundary.
 */

import { asc } from 'drizzle-orm'

import { auth } from '@/auth'
import { accessibleAccountsFor } from '@/lib/accounts/current'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { listSignIns } from '@/lib/auth/signIns'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { listMembershipsFor } from '@/lib/members/read'
import { type Role, roleOf } from '@/lib/roles'

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

export interface MyAccountSummary {
  ownerEmail: string
  role: Role
}

/** Every account the signed-in reader may open at all: their own, and every collaboration. */
export async function listMyAccounts(): Promise<MyAccountSummary[] | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const memberships = await listMembershipsFor(normalized)
  const mine = accessibleAccountsFor(normalized, memberships)

  return mine.map((ownerEmail) => ({
    ownerEmail,
    role: roleOf(normalized, raw, ownerEmail, memberships) ?? 'viewer',
  }))
}

/**
 * Whether the account switcher is worth showing at all: a global owner, who can enter
 * every account in the installation, or anyone with more than just their own. Someone
 * with exactly one account — the common case — sees no switcher, per PLAN.md's own
 * *Account (v3.0)* decision: a menu item offering to switch to the only place you can
 * already be is not a choice.
 */
export async function mayShowAccountSwitcher(): Promise<boolean> {
  if (!hasDatabase) return false

  const session = await auth()
  if (isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return true

  const mine = await listMyAccounts()
  return (mine?.length ?? 0) > 1
}
