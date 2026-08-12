/**
 * What a password action can answer, and what a password has to be.
 *
 * Separate from `password.ts` because that module imports `node:crypto`: the rules a form
 * needs to state — how long a password must be — have to be readable from the browser, and
 * the machine that hashes it must not be.
 */

export const MIN_PASSWORD = 10
export const MAX_PASSWORD = 200

export type PasswordFailure =
  | 'no-session'
  | 'no-database'
  /** Signed in, but not an admin: somebody else's password is not theirs to set. */
  | 'not-allowed'
  /** An owner other than yourself: their identity is Google's to vouch for, not ours. */
  | 'is-owner'
  | 'weak-password'
  /** Changing your own, and the current one given does not match. */
  | 'wrong-password'
  /** Asked to remove a password that was not there. */
  | 'no-password'
  | 'failed'

export type PasswordResult = { ok: true } | { ok: false; reason: PasswordFailure }

export const PASSWORD_MESSAGE: Record<PasswordFailure, string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'no-database': 'No database configured: passwords cannot be saved.',
  'not-allowed': 'The Admin role is required to set someone else’s password.',
  'is-owner':
    'Another owner’s password is not set from here: their access follows the server configuration.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'wrong-password': 'The current password is not correct.',
  'no-password': 'This address has no password.',
  failed: 'Save failed. Please try again.',
}
