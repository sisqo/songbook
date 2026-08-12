'use server'

/**
 * Server actions for access: who may sign in.
 *
 * The smallest write surface in the app, and the only one where a mistake is not
 * recoverable from inside the app — which is why the owners are not editable here.
 * Everything else follows from that: adding is a row, removing is a row, and the two
 * cases that would leave nobody in charge are refused rather than confirmed.
 */

import { eq } from 'drizzle-orm'

import { isEmailShape, isOwner, normalizeEmail, parseAllowlist } from '@/lib/allowlist'
import { deletePasswordHash, withPassword } from '@/lib/auth/credentials'
import { asAdmin } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { ROLES, type Role } from '@/lib/roles'

import { listMembers } from './read'
import type { MemberList, MemberResult } from './types'

/**
 * Both halves of the list, or null when it cannot be told.
 *
 * Three ways to get null and they are one answer as far as the screen is concerned:
 * nobody signed in, no database, or a table that did not respond. What must never happen
 * is the fourth thing — reporting an empty list of invitations because the question could
 * not be asked.
 */
export async function loadMembers(): Promise<MemberList | null> {
  const admin = await asAdmin()
  if (!admin.ok) return null

  const invited = await listMembers()
  if (invited === null) return null

  const owners = parseAllowlist(process.env.ALLOWED_EMAILS)

  return {
    owners,
    members: invited,
    you: admin.email,
    yourRole: admin.role,
    // Who can get in without Google. Said, so the screen can offer the right gesture.
    passwords: [...(await withPassword([...owners, ...invited.map((row) => row.email)]))],
  }
}

export async function addMember(email: string, role: Role): Promise<MemberResult> {
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
   * unknown, so an unknown one is a bug worth saying out loud.
   */
  if (!ROLES.includes(role)) return { ok: false, reason: 'invalid-role' }
  // Not an error the user caused, but not a row worth having either: an owner is
  // already admitted, and a row would suggest removing it could take that away.
  if (isOwner(address, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'is-owner' }

  try {
    const inserted = await db()
      .insert(members)
      .values({ email: address, addedBy: you, role })
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
   * Removing yourself is how a member who is not an owner would end their own access with
   * no way back, so it is refused.
   *
   * Removing an **owner's** row, on the other hand, is allowed — and it took a second look
   * to see why. An owner's access comes from the environment, so deleting a row of theirs
   * takes nothing away; what it does take away is a row that grants nothing *today* and
   * would grant something the day their address leaves `ALLOWED_EMAILS`. Refusing here
   * meant that row could never be cleaned up. An owner with no row at all still gets a
   * truthful answer: `not-found`, because that is what it is.
   */
  if (address === you) return { ok: false, reason: 'yourself' }

  try {
    const removed = await db()
      .delete(members)
      .where(eq(members.email, address))
      .returning({ email: members.email })

    if (removed.length === 0) return { ok: false, reason: 'not-found' }

    /*
     * And their password with them. A hash that outlives the access it proved is a secret
     * kept for nobody — and it would let a right guess be told from a wrong one for an
     * address that can no longer enter, which is the one thing the login form must not say.
     */
    await deletePasswordHash(address)
    return { ok: true }
  } catch (error) {
    console.error('removeMember failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Moves an invited member to another role.
 *
 * The two refusals are the same ones removal has, and they are there for the same
 * reasons. An **owner** has no row: an update would touch nothing and report `not-found`,
 * which reads as a bug rather than as the rule that the environment outranks this table.
 * **Yourself** is refused because the screen you would be demoting yourself out of is this
 * one — recoverable through an owner, but not something to do with one tap and no question.
 * An owner asking about their own address meets that refusal first, which is the same
 * answer by a different name: they have no row, so there was never a role here to change.
 */
export async function setMemberRole(email: string, role: Role): Promise<MemberResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }

  const address = normalizeEmail(email)
  if (!ROLES.includes(role)) return { ok: false, reason: 'invalid-role' }
  if (address === admin.email) return { ok: false, reason: 'yourself' }
  if (isOwner(address, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'is-owner' }

  try {
    const updated = await db()
      .update(members)
      .set({ role })
      .where(eq(members.email, address))
      .returning({ email: members.email })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('setMemberRole failed', error)
    return { ok: false, reason: 'failed' }
  }
}
