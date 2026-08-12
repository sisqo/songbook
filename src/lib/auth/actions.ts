'use server'

/**
 * What the browser may know about its own permissions.
 *
 * Only the role, and only the reader's own: this is what lets a screen leave out a
 * button that would refuse, and nothing here is a permission in itself. Every action
 * that changes something asks the database again — see `auth/session.ts` — so a
 * tampered answer here buys nothing but a button that fails.
 */

import { currentUser } from '@/lib/auth/session'
import type { Role } from '@/lib/roles'

/** The signed-in reader's role, or null when there is nobody or nobody allowed. */
export async function loadRole(): Promise<Role | null> {
  return (await currentUser())?.role ?? null
}
