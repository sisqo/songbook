/**
 * Who may enter, as the screen that manages it sees the question.
 *
 * The two halves travel together and stay distinguishable, because the difference is
 * the whole point: an owner cannot be removed here, a member can. A payload of plain
 * addresses would make them look like one list with an arbitrary rule attached.
 */

import type { Role } from '@/lib/roles'

import type { MemberRow } from './read'

export type { MemberRow }

/** How often, and when last, an address has signed in — see `signIns` in `db/schema.ts`. */
export interface SignInSummary {
  signInCount: number
  /** `null` for an address that has never actually signed in. */
  lastSignInAt: string | null
}

export interface OwnerRow extends SignInSummary {
  email: string
}

export interface MemberListRow extends MemberRow, SignInSummary {}

export interface MemberList {
  /**
   * From `ALLOWED_EMAILS`, which only the server can read. Not removable from here, and
   * admin by definition — see `lib/roles.ts` for why those two facts are the same one.
   */
  owners: OwnerRow[]
  members: MemberListRow[]
  /** The address asking, so the screen can mark it and refuse to remove it. */
  you: string
  /** And their role, so it can refuse to let them change their own. */
  yourRole: Role
  /**
   * Which addresses — owners included — can sign in with a password.
   *
   * Not whether they have used it, and certainly not the hash: only that a password
   * exists, which is what decides whether the screen offers to set one or to replace it.
   */
  passwords: string[]
}

export type MemberFailure =
  | 'no-session'
  /** Signed in, but not an admin: who enters is not theirs to decide. */
  | 'not-allowed'
  | 'no-database'
  /** A role the app does not have. */
  | 'invalid-role'
  | 'invalid-email'
  /** Already a member: adding again would do nothing. */
  | 'already-allowed'
  /** An owner: allowed by the environment, and not ours to add or remove. */
  | 'is-owner'
  /** Removing, or demoting, the address you are signed in as. */
  | 'yourself'
  | 'not-found'
  | 'failed'

export type MemberResult = { ok: true } | { ok: false; reason: MemberFailure }

export const MEMBER_MESSAGE: Record<MemberFailure, string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'not-allowed': 'The Admin role is required to change who may enter.',
  'invalid-role': 'Unknown role.',
  'no-database': 'No database configured: access cannot be changed.',
  'invalid-email': 'An email address is required.',
  'already-allowed': 'This address can already enter.',
  'is-owner': 'This address is an owner: it is changed in the server configuration.',
  yourself: 'You cannot remove or change the role of your own account.',
  'not-found': 'This address is not on the list.',
  failed: 'Save failed. Please try again.',
}
