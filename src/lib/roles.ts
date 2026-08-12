/**
 * What someone may do, once they are allowed in at all.
 *
 * Three roles, and the line between them is what they can change:
 *
 * - **admin** — everything, including who else may enter.
 * - **editor** — the repertoire: import, edit, delete, publish, and the shape of the
 *   songbooks. Not the list of people.
 * - **viewer** — reads, and nothing shared. Their own transposition, capo, speed, zoom
 *   and notation are *not* modifications: they are how this reader reads, they touch
 *   nobody else's screen, and a viewer who could not transpose would be no use on stage.
 *
 * The owners from `ALLOWED_EMAILS` are admin, always, and that is not a shortcut: the
 * same fact that makes them impossible to remove — the app cannot write the environment
 * — makes them impossible to demote. So there is never a deployment with nobody in
 * charge of it, and the roles below apply to the people the owners have let in.
 *
 * One function decides all of it. Membership and role are the same question asked to two
 * depths, and asking them in two places is how the answers drift apart.
 */

import { isOwner, normalizeEmail } from './allowlist'

export const ROLES = ['admin', 'editor', 'viewer'] as const

export type Role = (typeof ROLES)[number]

/**
 * A stored role as a role, defaulting to the least it could be.
 *
 * Anything unrecognised reads as `viewer` rather than throwing: the column is text, and
 * a value nobody expected must not become a way in — the same reason an unreadable table
 * admits nobody.
 */
export function readRole(raw: string | null | undefined): Role {
  return ROLES.includes(raw as Role) ? (raw as Role) : 'viewer'
}

/** One row of the members table, as this decision needs it. */
export interface Membership {
  email: string
  role: Role
}

/**
 * The role this address has, or null when it has no business being here at all.
 *
 * `members` may be null, meaning the table could not be read: then only the owners are
 * anybody, which is the same fail-closed rule the gate has always had.
 */
export function roleOf(
  email: string | null | undefined,
  raw: string | undefined | null,
  members: readonly Membership[] | null,
): Role | null {
  if (!email) return null
  if (isOwner(email, raw)) return 'admin'

  const wanted = normalizeEmail(email)
  const found = (members ?? []).find((member) => normalizeEmail(member.email) === wanted)

  return found === undefined ? null : readRole(found.role)
}

/** May change the repertoire: songs, songbooks, their order, publishing. */
export function canEdit(role: Role | null): boolean {
  return role === 'admin' || role === 'editor'
}

/** May change who enters, and with which role. */
export function canManageUsers(role: Role | null): boolean {
  return role === 'admin'
}
