/**
 * Tokens for a link sent by email — verifying a registration, resetting a password.
 *
 * Unlike a password (`lib/auth/password.ts`), a token is not something a person chose:
 * it is 32 random bytes, already at the entropy a brute-force attacker cannot search
 * either way. scrypt's cost exists to slow down guessing a *human-chosen* secret; there
 * is nothing to guess here, so a fast hash is enough to keep the raw token out of the
 * database in cleartext — the only thing that hash needs to survive is a database leak,
 * not an offline attack on the token itself.
 */

import { createHash, randomBytes } from 'node:crypto'

function digest(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** A fresh token: `raw` goes in the link, `hash` is what gets stored. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: digest(raw) }
}

/** Recomputes the same hash from a token received back in a link, to compare against it. */
export function hashToken(raw: string): string {
  return digest(raw)
}
