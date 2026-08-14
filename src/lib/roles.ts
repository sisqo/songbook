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
 * Whether this email would still be let in today, with no account of its own to check
 * against — a question `roleOf` cannot answer, since it always needs one. A global owner
 * always passes; anyone else needs `hasAccount` true.
 *
 * No longer a gate in front of a sign-in (v3.2): registration is open, so
 * `recordSignIn`/`provisionAccount` in `auth.ts` run for anyone a provider has already
 * authenticated, without asking this function first. What is left is a real, separate
 * question — `deleteAccount` (`accounts/actions.ts`) calls this *after* removing an
 * address's account, to decide whether a stray `credentials` row for it should be purged
 * too: `false` here means the address has no other way back in, so the leftover password
 * hash is dead weight rather than an account nobody remembers exists.
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
