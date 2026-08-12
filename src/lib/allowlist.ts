/**
 * Who may sign in.
 *
 * Having a valid Google account is not enough: the gate exists because the
 * repertoire is copyrighted material, so membership is an explicit list.
 *
 * The list has two halves and they are not the same kind of thing. `ALLOWED_EMAILS`
 * holds the **owners**: set in the environment, readable only by the server, and not
 * removable from inside the app — which is what makes locking yourself out
 * impossible, and what keeps a database the app cannot reach from shutting the owner
 * out of it. The `members` table holds everyone the owners have since let in, added
 * and removed from the app itself and taking effect on the next sign-in with no
 * deploy.
 *
 * Both halves meet in one function, called from both places that ask the question —
 * the sign-in callback and the guard in front of every write. Two separate answers
 * to "may this person be here" is how one of them ends up wrong.
 */

/** One address as it is compared: trimmed and lowercased, since nobody types it twice the same. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter((email) => email !== '')
}

/**
 * Enough of an address to be worth storing.
 *
 * Deliberately loose: the real check is Google's, which will not hand us a profile
 * for an address that does not exist. This only catches the slip — a name, a missing
 * domain, a pasted line of text — before it becomes a row that silently admits nobody.
 */
export function isEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

/**
 * An empty list on both sides denies everyone rather than admitting everyone: a
 * forgotten environment variable and an empty table must fail closed, not publish
 * the site.
 *
 * `members` may be null, meaning the table could not be read. It counts as nobody, for
 * the same reason: an unreachable database is not permission.
 */
export function isAllowed(
  email: string | null | undefined,
  raw: string | undefined | null,
  members: readonly string[] | null = null,
): boolean {
  if (!email) return false

  const allowed = [...parseAllowlist(raw), ...(members ?? []).map(normalizeEmail)]
  if (allowed.length === 0) return false

  return allowed.includes(normalizeEmail(email))
}

/**
 * Whether this address may be here: the whole policy, in one testable place.
 *
 * The order is the policy. An owner is admitted on the strength of the environment alone,
 * so a table that answered null — unreadable, or absent — cannot lock out the people who
 * cannot be removed either. Everyone else needs a table that answered, and answered with
 * their name in it.
 */
export function mayEnter(
  email: string | null | undefined,
  raw: string | undefined | null,
  members: readonly string[] | null,
): boolean {
  if (isOwner(email, raw)) return true
  return isAllowed(email, raw, members)
}

/** Whether this address is one of the owners, who cannot be removed from inside the app. */
export function isOwner(email: string | null | undefined, raw: string | undefined | null): boolean {
  if (!email) return false
  return parseAllowlist(raw).includes(normalizeEmail(email))
}
