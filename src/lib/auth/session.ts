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
 * guards are what stop them changing anything shared in the meantime; `/users` says so
 * in as many words.
 *
 * The table is read on every call, and that is the point rather than an oversight: it is
 * what makes a change of role take effect on the next action instead of the next
 * sign-in. The cost is one indexed lookup on a table with a handful of rows, on paths
 * that were already talking to the same database.
 */

import { auth } from '@/auth'
import { currentAccountFor, readAccountCookie } from '@/lib/accounts/current'
import { normalizeEmail } from '@/lib/allowlist'
import { listMembershipsFor } from '@/lib/members/read'
import { type Role, canEdit, canManageUsers, roleOf } from '@/lib/roles'

export interface CurrentUser {
  email: string
  /** Which account this role applies to — see `lib/accounts/current.ts`. */
  accountOwnerEmail: string
  role: Role
}

/**
 * The signed-in reader, the account they are currently looking at, and their role on it —
 * or null when there is nobody, or somebody whose access to *that account* has been taken
 * away. Losing access to one account you collaborate on does not sign you out of your
 * own: the account resolved here already falls back to your own when the requested one no
 * longer answers, so "null" means what it always meant — nobody home at all.
 *
 * Deliberately **not** null merely because there is no database. Running from `content/`
 * with no `DATABASE_URL` is the normal way to work locally, and an owner is an owner there
 * too: `listMembershipsFor` answers null, `roleOf` reads the environment, and the owners
 * come out admin — which is the same property that keeps them in when the database is
 * unreachable in production. What refuses in that mode is each write, with `no-database`,
 * which is the true reason. Saying "your role does not allow this" instead would be a lie
 * with a plausible ring to it.
 *
 * One membership query, not two: `currentAccountFor` needs the same list `roleOf` does to
 * validate the requested account, so it is fetched once here and handed to both rather
 * than each reaching for its own copy.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const memberships = await listMembershipsFor(normalized)
  const requested = await readAccountCookie()
  const accountOwnerEmail = currentAccountFor(normalized, raw, memberships, requested)

  const role = roleOf(normalized, raw, accountOwnerEmail, memberships)
  return role === null ? null : { email: normalized, accountOwnerEmail, role }
}

/**
 * Permission to do something on the reader's current account, and the reason when there
 * is none.
 *
 * Two reasons, kept apart because they are two different things to be told: `no-session`
 * is "your session ended, sign in again", which is a thing the reader can fix, and
 * `not-allowed` is "this is not yours to change", which is not. Collapsing them would
 * have a viewer sent round the login loop for a button that will never work for them.
 */
export type Permission =
  | { ok: true; email: string; accountOwnerEmail: string; role: Role }
  | { ok: false; reason: 'no-session' | 'not-allowed' }

async function permit(allows: (role: Role) => boolean): Promise<Permission> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }
  if (!allows(user.role)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, email: user.email, accountOwnerEmail: user.accountOwnerEmail, role: user.role }
}

/**
 * The signed-in reader's role on a **specific** account — not necessarily the one their
 * cookie currently points at.
 *
 * `currentUser` answers "what am I looking at right now", which is the wrong question
 * for a direct link: `/songs/<slug>` names a song, and that song belongs to whichever
 * account its songbook does, regardless of what the visitor happens to have open in the
 * switcher. Every page or action reached by a slug rather than by navigating the current
 * account must resolve access this way, or a signed-in reader of *any* account could open
 * another account's content just by knowing its URL — the actual data is still guarded by
 * the check the caller makes with the result, this only answers what that check should
 * compare against.
 */
export async function accessTo(accountOwnerEmail: string): Promise<CurrentUser | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const memberships = await listMembershipsFor(normalized)
  const target = normalizeEmail(accountOwnerEmail)

  const role = roleOf(normalized, raw, target, memberships)
  return role === null ? null : { email: normalized, accountOwnerEmail: target, role }
}

/**
 * Unlike `permit`, a null from `accessTo` does not always mean "no session" — it can mean
 * a real session with no business on *this* account, which is `not-allowed`, not
 * `no-session`: telling a signed-in reader to sign in again for someone else's account
 * would send them round a login loop that fixes nothing.
 */
async function permitOn(accountOwnerEmail: string, allows: (role: Role) => boolean): Promise<Permission> {
  const session = await auth()
  if (!session?.user?.email) return { ok: false, reason: 'no-session' }

  const user = await accessTo(accountOwnerEmail)
  if (user === null || !allows(user.role)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, email: user.email, accountOwnerEmail: user.accountOwnerEmail, role: user.role }
}

/** Permission to change the current account's repertoire: songs, songbooks, order, publishing. */
export function asEditor(): Promise<Permission> {
  return permit(canEdit)
}

/** Permission to change **a specific account's** repertoire — see `accessTo`. */
export function asEditorOn(accountOwnerEmail: string): Promise<Permission> {
  return permitOn(accountOwnerEmail, canEdit)
}

/**
 * Permission to change who enters the *current account*, and with which role.
 *
 * Not a global check: the account's own owner passes this on their own account, by
 * design (see `roleOf`). Anything that must be restricted to a true, installation-wide
 * owner — the "every account" list chief among them — needs `isOwner(email,
 * process.env.ALLOWED_EMAILS)` directly, not this.
 */
export function asAdmin(): Promise<Permission> {
  return permit(canManageUsers)
}
