/**
 * Who is asking, and what they are allowed to ask for.
 *
 * Every write path once went through its own copy of "is there a session with an email
 * on it", which was the right question while everyone who could get in could do
 * everything. Now the question has three depths — is there a session, is this address
 * still on the list, and what may it change — and the answer has to be the same one the
 * sign-in callback gives, or taking someone's access away would lock the front door and
 * leave the writes open behind it.
 *
 * What this cannot do is end a session that already exists. The cookie is a ninety-day
 * JWT and the pages are precached, so a reader who has been removed, or moved down to
 * viewer, keeps whatever their browser already holds until they sign in again. These
 * guards are what stop them changing anything shared in the meantime; `/utenti` says so
 * in as many words.
 *
 * The table is read on every call, and that is the point rather than an oversight: it is
 * what makes a change of role take effect on the next action instead of the next
 * sign-in. The cost is one indexed lookup on a table with a handful of rows, on paths
 * that were already talking to the same database.
 */

import { auth } from '@/auth'
import { normalizeEmail } from '@/lib/allowlist'
import { hasDatabase } from '@/lib/db/client'
import { listMemberships } from '@/lib/members/read'
import { type Role, canEdit, canManageUsers, roleOf } from '@/lib/roles'

export interface CurrentUser {
  email: string
  role: Role
}

/**
 * The signed-in reader and their role, or null when there is nobody, no database, or
 * somebody whose access has been taken away.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null

  const role = roleOf(email, process.env.ALLOWED_EMAILS, await listMemberships())
  return role === null ? null : { email: normalizeEmail(email), role }
}

/**
 * Permission to do something, and the reason when there is none.
 *
 * Two reasons, kept apart because they are two different things to be told: `no-session`
 * is "your session ended, sign in again", which is a thing the reader can fix, and
 * `not-allowed` is "this is not yours to change", which is not. Collapsing them would
 * have a viewer sent round the login loop for a button that will never work for them.
 */
export type Permission =
  | { ok: true; email: string; role: Role }
  | { ok: false; reason: 'no-session' | 'not-allowed' }

async function permit(allows: (role: Role) => boolean): Promise<Permission> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }
  if (!allows(user.role)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, email: user.email, role: user.role }
}

/** Permission to change the repertoire: songs, canzonieri, order, publishing. */
export function asEditor(): Promise<Permission> {
  return permit(canEdit)
}

/** Permission to change who enters, and with which role. */
export function asAdmin(): Promise<Permission> {
  return permit(canManageUsers)
}
