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
import { currentMember } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { members } from '@/lib/db/schema'

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
  const you = await currentMember()
  if (you === null) return null

  const invited = await listMembers()
  if (invited === null) return null

  return {
    owners: parseAllowlist(process.env.ALLOWED_EMAILS),
    members: invited,
    you,
  }
}

export async function addMember(email: string): Promise<MemberResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const you = await currentMember()
  if (you === null) return { ok: false, reason: 'no-session' }

  const address = normalizeEmail(email)
  if (!isEmailShape(address)) return { ok: false, reason: 'invalid-email' }
  // Not an error the user caused, but not a row worth having either: an owner is
  // already admitted, and a row would suggest removing it could take that away.
  if (isOwner(address, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'is-owner' }

  try {
    const inserted = await db()
      .insert(members)
      .values({ email: address, addedBy: you })
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

  const you = await currentMember()
  if (you === null) return { ok: false, reason: 'no-session' }

  const address = normalizeEmail(email)
  /*
   * Two refusals that are not defensiveness. Removing yourself is how a member who is
   * not an owner would end their own access with no way back; removing an owner is
   * asking this table to override the environment, which it cannot do — the row does
   * not exist, so the delete would report success and change nothing.
   */
  if (address === you) return { ok: false, reason: 'yourself' }
  if (isOwner(address, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'is-owner' }

  try {
    const removed = await db()
      .delete(members)
      .where(eq(members.email, address))
      .returning({ email: members.email })

    return removed.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('removeMember failed', error)
    return { ok: false, reason: 'failed' }
  }
}
