/**
 * Which account a signed-in reader is looking at right now.
 *
 * Deliberately a plain cookie, not the session's JWT: unlike a role, which stays out of
 * the token so a change of access takes effect on the next request rather than the next
 * sign-in (see `lib/auth/session.ts`), which account is on screen is not a security fact
 * at all — it is a navigation preference, no more sensitive than a scroll position. It
 * can live somewhere cheap to read and rewrite, as long as nothing here is ever trusted
 * without checking it against the reader's actual access on every request.
 *
 * That check no longer costs a query (v3.1): with collaborators gone, an email may only
 * ever open the account it owns — its own, or, for a global owner, anyone's — so
 * `mayAccess` is pure, and nothing here needs the database at all.
 *
 * No import of `@/lib/db/client` on purpose: this module is reachable from anywhere
 * `currentUser` is, and keeping it free of the Postgres driver keeps it free of the
 * mistake `node:crypto` already taught this codebase not to make near the edge (v2.2).
 */

import { cookies } from 'next/headers'

import { isOwner, normalizeEmail } from '@/lib/allowlist'

const COOKIE_NAME = 'songbook-account'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Whether `email` may open the account owned by `accountOwnerEmail` at all. */
export function mayAccess(
  email: string,
  accountOwnerEmail: string,
  raw: string | undefined | null,
): boolean {
  if (isOwner(email, raw)) return true
  return normalizeEmail(email) === normalizeEmail(accountOwnerEmail)
}

/**
 * The account this request should show: the cookie's value, if the reader may still open
 * it, and their own account otherwise. That fallback is also what makes "open your own
 * account by default" true with no separate code path — an absent, stale, or
 * no-longer-accessible cookie all collapse to the same safe answer.
 */
export function currentAccountFor(
  email: string,
  raw: string | undefined | null,
  requestedAccount: string | null,
): string {
  if (requestedAccount !== null && mayAccess(email, requestedAccount, raw)) {
    return normalizeEmail(requestedAccount)
  }
  return normalizeEmail(email)
}

/** The account named by the current request's cookie, unvalidated — see `currentAccountFor`. */
export async function readAccountCookie(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}

/** Switches the account this browser sees from now on. The caller must validate access first. */
export async function writeAccountCookie(accountOwnerEmail: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, normalizeEmail(accountOwnerEmail), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
}
