'use server'

/**
 * Server actions for access: who may enter the reader's **current account**.
 *
 * The smallest write surface in the app, and the only one where a mistake is not
 * recoverable from inside the app — which is why the owners are not editable here.
 * Everything else follows from that: adding is a row, removing is a row, and the two
 * cases that would leave nobody in charge are refused rather than confirmed.
 *
 * Scoped to one account throughout (v3.0): every row this file touches carries
 * `accountOwnerEmail`, and `asAdmin()` already resolves to *this* account's admin — the
 * account's own owner, or a global owner — never someone else's.
 */

import { eq, and } from 'drizzle-orm'

import { isEmailShape, isOwner, normalizeEmail } from '@/lib/allowlist'
import { deletePasswordHash, withPassword } from '@/lib/auth/credentials'
import { asAdmin } from '@/lib/auth/session'
import { listSignIns, type SignInStats } from '@/lib/auth/signIns'
import { db, hasDatabase } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { isAdmitted, MEMBER_ROLES, type MemberRole } from '@/lib/roles'

import { listMembersOf, listMembershipsFor } from './read'
import type { MemberList, MemberResult, SignInSummary } from './types'

/** The default for an address `listSignIns` has no row for: not yet, not never allowed. */
const NEVER_SIGNED_IN: SignInSummary = { signInCount: 0, lastSignInAt: null }

function signInSummary(email: string, signIns: Map<string, SignInStats> | null): SignInSummary {
  return signIns?.get(email) ?? NEVER_SIGNED_IN
}

/**
 * The current account's owner and collaborators, or null when it cannot be told.
 *
 * Three ways to get null and they are one answer as far as the screen is concerned:
 * nobody signed in, no database, or a table that did not respond. What must never happen
 * is the fourth thing — reporting an empty list of invitations because the question could
 * not be asked.
 */
export async function loadMembers(): Promise<MemberList | null> {
  const admin = await asAdmin()
  if (!admin.ok) return null

  const invited = await listMembersOf(admin.accountOwnerEmail)
  if (invited === null) return null

  // Unreadable answers "never" for everyone rather than failing this whole screen — see
  // `listSignIns`'s own comment for why that footnote must not block the real question.
  const signIns = await listSignIns()

  return {
    accountOwnerEmail: admin.accountOwnerEmail,
    owner: { email: admin.accountOwnerEmail, ...signInSummary(admin.accountOwnerEmail, signIns) },
    members: invited.map((row) => ({
      ...row,
      ...signInSummary(row.email, signIns),
      overridden: isOwner(row.email, process.env.ALLOWED_EMAILS),
    })),
    you: admin.email,
    yourRole: admin.role,
    // Who can get in without Google. Said, so the screen can offer the right gesture.
    passwords: [...(await withPassword([admin.accountOwnerEmail, ...invited.map((row) => row.email)]))],
  }
}

export async function addMember(email: string, role: MemberRole): Promise<MemberResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }
  const you = admin.email

  const address = normalizeEmail(email)
  if (!isEmailShape(address)) return { ok: false, reason: 'invalid-email' }
  /*
   * The role is checked rather than coerced. `readRole` quietly turns anything it does
   * not know into a viewer, which is the right reading for a value coming *out* of the
   * database; a value coming *in* from a form that the app itself drew should not be
   * unknown, so an unknown one is a bug worth saying out loud. `admin` is not in
   * `MEMBER_ROLES` at all — see `lib/roles.ts` on why no account can grant it.
   */
  if (!MEMBER_ROLES.includes(role)) return { ok: false, reason: 'invalid-role' }
  // Not an error the user caused, but not a row worth having either: an owner — global,
  // or of this very account — is already admitted, and a row would suggest removing it
  // could take that away.
  if (isOwner(address, process.env.ALLOWED_EMAILS) || address === admin.accountOwnerEmail) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    const inserted = await db()
      .insert(members)
      .values({ accountOwnerEmail: admin.accountOwnerEmail, email: address, addedBy: you, role })
      /*
       * Nothing on conflict rather than an existence check first: the primary key is
       * the only place two people adding the same address at once can be settled, and
       * an empty `returning` is exactly the "was already there" answer.
       */
      .onConflictDoNothing()
      .returning({ email: members.email })

    return inserted.length === 0 ? { ok: false, reason: 'already-allowed' } : { ok: true }
  } catch (error) {
    console.error('addMember failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export async function removeMember(email: string): Promise<MemberResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }
  const you = admin.email

  const address = normalizeEmail(email)
  /*
   * Removing yourself is how a collaborator who is not an owner would end their own
   * access with no way back, so it is refused.
   *
   * Removing an **owner's** row, on the other hand, is allowed — and it took a second
   * look to see why. An owner's access comes from the environment or from owning this
   * very account, so deleting a row of theirs takes nothing away; what it does take
   * away is a row that grants nothing *today* and would grant something the day their
   * address leaves `ALLOWED_EMAILS`. Refusing here meant that row could never be
   * cleaned up. An owner with no row at all still gets a truthful answer: `not-found`,
   * because that is what it is.
   */
  if (address === you) return { ok: false, reason: 'yourself' }

  try {
    const removed = await db()
      .delete(members)
      .where(and(eq(members.accountOwnerEmail, admin.accountOwnerEmail), eq(members.email, address)))
      .returning({ email: members.email })

    if (removed.length === 0) return { ok: false, reason: 'not-found' }

    /*
     * And their password with them — but only if this was their last way in anywhere.
     * A password proves *which address you are*, a person-level fact that this one
     * account's row never owned; removing them here must not delete a password they
     * still need for an account of their own, or for another one they collaborate on.
     * `isAdmitted` is the same question the sign-in gate asks, asked again now that
     * this row is gone.
     */
    const stillAdmitted = isAdmitted(
      address,
      process.env.ALLOWED_EMAILS,
      await listMembershipsFor(address),
    )
    if (!stillAdmitted) await deletePasswordHash(address)
    return { ok: true }
  } catch (error) {
    console.error('removeMember failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Moves a collaborator to another role on this account.
 *
 * The two refusals are the same ones removal has, and they are there for the same
 * reasons. An **owner** — global, or of this account — has no row: an update would
 * touch nothing and report `not-found`, which reads as a bug rather than as the rule
 * that ownership outranks this table. **Yourself** is refused because the screen you
 * would be demoting yourself out of is this one — recoverable through the account's
 * owner, but not something to do with one tap and no question. The account's own owner
 * asking about their own address meets that refusal first, which is the same answer by
 * a different name: they have no row, so there was never a role here to change.
 */
export async function setMemberRole(email: string, role: MemberRole): Promise<MemberResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }

  const address = normalizeEmail(email)
  if (!MEMBER_ROLES.includes(role)) return { ok: false, reason: 'invalid-role' }
  if (address === admin.email) return { ok: false, reason: 'yourself' }
  if (isOwner(address, process.env.ALLOWED_EMAILS) || address === admin.accountOwnerEmail) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    const updated = await db()
      .update(members)
      .set({ role })
      .where(and(eq(members.accountOwnerEmail, admin.accountOwnerEmail), eq(members.email, address)))
      .returning({ email: members.email })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('setMemberRole failed', error)
    return { ok: false, reason: 'failed' }
  }
}
