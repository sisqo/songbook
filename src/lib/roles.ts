/**
 * What someone may do on an account, once they are allowed into the app at all.
 *
 * Exactly one role is ever granted — **admin**, full control of an account's repertoire —
 * and it comes from exactly two places, never from a stored row. A **global owner**
 * (`ALLOWED_EMAILS`, which the app cannot edit) is admin on *every* account, which is what
 * keeps a deployment from ever having nobody in charge of it. An account's **own owner** is
 * admin on that one account and no other. Everyone else is `null`: there is no lesser role
 * to fall into, because an account is no longer something a third party can be invited into
 * (v3.1) — an email and an account are now the same thing.
 */

import { isOwner, normalizeEmail } from './allowlist'

export type Role = 'admin'

/**
 * The role this address has *on the given account*, or null when it has no business
 * being there at all.
 */
export function roleOf(
  email: string | null | undefined,
  raw: string | undefined | null,
  accountOwnerEmail: string,
): Role | null {
  if (!email) return null
  if (isOwner(email, raw)) return 'admin'
  if (normalizeEmail(email) === normalizeEmail(accountOwnerEmail)) return 'admin'
  return null
}

/**
 * Whether this email is allowed into the app at all — a question with no account of its
 * own, unlike `roleOf`. A global owner always is; anyone else needs their own row in
 * `accounts` already, which `hasAccount` is the caller's answer to (v3.1) — put there for
 * them by a global owner, or by a one-off migration, never earned by the sign-in attempt
 * itself: an address with no row yet cannot bootstrap one by trying, since `provisionAccount`
 * only ever runs *after* this check passes. There is no longer a separate table an outsider
 * could appear in without one — an invited collaborator with no account of their own does
 * not exist any more.
 */
export function isAdmitted(
  email: string | null | undefined,
  raw: string | undefined | null,
  hasAccount: boolean,
): boolean {
  if (!email) return false
  return isOwner(email, raw) || hasAccount
}

/** May change the repertoire: songs, songbooks, their order, publishing — the one permission left. */
export function canEdit(role: Role | null): boolean {
  return role === 'admin'
}
