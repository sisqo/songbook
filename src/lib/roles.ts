/**
 * What someone may do on one account, once they are allowed into the app at all.
 *
 * Three roles, and the line between them is what they can change:
 *
 * - **admin** — everything on this account, including who else may enter it.
 * - **editor** — the repertoire: import, edit, delete, publish, and the shape of the
 *   songbooks. Not the list of people.
 * - **viewer** — reads, and nothing shared. Their own transposition, capo, speed, zoom
 *   and notation are *not* modifications: they are how this reader reads, they touch
 *   nobody else's screen, and a viewer who could not transpose would be no use on stage.
 *
 * `admin` on a given account comes from exactly two places, never from a stored row
 * (v3.0). A **global owner** — `ALLOWED_EMAILS`, which the app cannot edit — is admin on
 * *every* account; that fact does not change from before v3.0, and is what keeps a
 * deployment from ever having nobody in charge of it. An account's **own owner** is
 * admin on that one account and no other, for the same structural reason a global owner
 * needs no row: an editor does not manage the list of people, and someone must be able to
 * manage the list of *their own* account's collaborators. The two are easy to conflate —
 * both resolve to the string `'admin'` — but only the global kind may see or enter an
 * account that is not theirs; see whoever lists "every account" for that separate check.
 *
 * One function decides all of it, for one account at a time. Membership and role are the
 * same question asked to two depths, and asking them in two places is how the answers
 * drift apart.
 */

import { isOwner, normalizeEmail } from './allowlist'

export const ROLES = ['admin', 'editor', 'viewer'] as const

export type Role = (typeof ROLES)[number]

/**
 * What an account can actually hand a collaborator — never `admin`, which nobody grants:
 * you are either a global owner or the account's own owner, both structural facts, or you
 * are one of these two. See `roleOf`.
 */
export const MEMBER_ROLES = ['editor', 'viewer'] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

/**
 * A stored role as a role, defaulting to the least it could be.
 *
 * Anything unrecognised reads as `viewer` rather than throwing: the column is text, and
 * a value nobody expected must not become a way in — the same reason an unreadable table
 * admits nobody. Deliberately checked against `MEMBER_ROLES`, not the full `ROLES`: even
 * if `'admin'` somehow ended up in the column, reading it as `admin` here would be
 * granting, from a stored row, the one thing this table can never grant.
 */
export function readRole(raw: string | null | undefined): MemberRole {
  return MEMBER_ROLES.includes(raw as MemberRole) ? (raw as MemberRole) : 'viewer'
}

/** One row of the members table, as this decision needs it. */
export interface Membership {
  /** Which account this membership grants access to — its owner's email. */
  accountOwnerEmail: string
  email: string
  role: MemberRole
}

/**
 * The role this address has *on the given account*, or null when it has no business
 * being there at all.
 *
 * `members` may be null, meaning the table could not be read: then only the owners —
 * global, or of this very account — are anybody, which is the same fail-closed rule the
 * gate has always had.
 */
export function roleOf(
  email: string | null | undefined,
  raw: string | undefined | null,
  accountOwnerEmail: string,
  members: readonly Membership[] | null,
): Role | null {
  if (!email) return null
  if (isOwner(email, raw)) return 'admin'
  if (normalizeEmail(email) === normalizeEmail(accountOwnerEmail)) return 'admin'

  const wanted = normalizeEmail(email)
  const found = (members ?? []).find(
    (member) =>
      normalizeEmail(member.accountOwnerEmail) === normalizeEmail(accountOwnerEmail) &&
      normalizeEmail(member.email) === wanted,
  )

  return found === undefined ? null : readRole(found.role)
}

/**
 * Whether this email is allowed into the app at all — a question with no account of its
 * own, unlike `roleOf`. A global owner always is; anyone else needs a row in `members` for
 * *some* account, any account, invited by whoever already had one. This is deliberately
 * looser than "has a role on the account they are about to open": someone invited only as
 * a collaborator elsewhere is still let in, and receives their own account on this very
 * sign-in (see `provisionAccount`) before they have ever needed one.
 */
export function isAdmitted(
  email: string | null | undefined,
  raw: string | undefined | null,
  members: readonly Membership[] | null,
): boolean {
  if (!email) return false
  if (isOwner(email, raw)) return true

  const wanted = normalizeEmail(email)
  return (members ?? []).some((member) => normalizeEmail(member.email) === wanted)
}

/** May change the repertoire: songs, songbooks, their order, publishing. */
export function canEdit(role: Role | null): boolean {
  return role === 'admin' || role === 'editor'
}

/** May change who enters this account, and with which role. */
export function canManageUsers(role: Role | null): boolean {
  return role === 'admin'
}
