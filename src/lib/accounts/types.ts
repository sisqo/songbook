/**
 * Results for the two actions only a global owner may take on an account other than
 * their own: creating one, and deleting one.
 *
 * A separate file from `actions.ts` because that file carries `'use server'`, where every
 * export must be an async function — a plain union or a `Record` would break the
 * directive's contract.
 */

export type AccountFailure =
  | 'not-allowed'
  | 'no-database'
  | 'invalid-email'
  /** Creating: a row for this address already exists. */
  | 'already-exists'
  /** Deleting: the retyped address did not match the one being deleted. */
  | 'confirm-mismatch'
  | 'failed'

export type AccountResult = { ok: true } | { ok: false; reason: AccountFailure }

export const ACCOUNT_MESSAGE: Record<AccountFailure, string> = {
  'not-allowed': 'Only a global owner may create or delete accounts.',
  'no-database': 'No database configured: accounts cannot be created or deleted.',
  'invalid-email': 'An email address is required.',
  'already-exists': 'An account already exists for this address.',
  'confirm-mismatch': 'Type the account’s email exactly to confirm.',
  failed: 'Save failed. Please try again.',
}
