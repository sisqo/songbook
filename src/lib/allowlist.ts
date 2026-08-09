/**
 * Who may sign in.
 *
 * Having a valid Google account is not enough: the gate exists because the
 * repertoire is copyrighted material, so membership is an explicit list.
 */

export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== '')
}

/**
 * An empty or missing list denies everyone rather than admitting everyone: a
 * forgotten environment variable must fail closed, not publish the site.
 */
export function isAllowed(email: string | null | undefined, raw: string | undefined | null): boolean {
  const allowed = parseAllowlist(raw)
  if (allowed.length === 0) return false
  if (!email) return false

  return allowed.includes(email.trim().toLowerCase())
}
