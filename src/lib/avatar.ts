/**
 * Turning an email into the two letters and the colour a monogram avatar shows —
 * deterministic, so the same address always draws the same avatar on every device,
 * with no name field this app has never stored (a credentials account has none at
 * all, and a Google one is not asked for — see `UserMenu`'s own comment on why the
 * avatar reads the address, not the profile).
 */

const PALETTE_SIZE = 6

/**
 * "f.limberti@…" → "FL": the first letter of the first two dot/underscore/hyphen/
 * plus-separated parts of the local part, the closest an email gets to a first and
 * last initial. An address with only one part — "someuser@…" — falls back to its
 * own first two letters, so there is always something to show.
 */
export function avatarInitials(email: string): string {
  const local = email.split('@')[0] ?? email
  const parts = local.split(/[._+-]/).filter((part) => part.length > 0)

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }

  return local.slice(0, 2).toUpperCase() || '?'
}

/**
 * Which of the `--avatar-N` colours (`globals.css`) this address draws. A plain sum
 * of character codes, not a cryptographic hash — nothing here is a security
 * boundary, only a way to spread addresses across the palette without every one
 * landing on the same couple of colours the way `.charCodeAt(0) % N` alone would.
 */
export function avatarColorIndex(email: string): number {
  let hash = 0
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  }
  return hash % PALETTE_SIZE
}
