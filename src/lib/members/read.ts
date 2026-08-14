/**
 * The members table, read.
 *
 * Not a server action: it is read by the sign-in callback and by the guards in front of
 * every write, neither of which is called from a browser. Both go through here so there
 * is one query and one failure behaviour rather than two that could differ.
 *
 * Two shapes of the same table, for two different questions (v3.0). "Who may collaborate
 * on *this* account" (`listMembersOf`) is what `/users` shows. "Which accounts does *this
 * address* collaborate on" (`listMembershipsFor`) is what the sign-in gate and the account
 * switcher need — an address can hold a row under more than one account now, so neither
 * question can be answered by reading the whole table unfiltered the way a single global
 * list once could be.
 */

import { asc, eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { type Membership, type MemberRole, readRole } from '@/lib/roles'

export interface MemberRow extends Membership {
  addedBy: string | null
  createdAt: string
}

/**
 * Every collaborator of one account, or **null** when the table could not be read.
 *
 * The two are not the same answer and the difference matters twice over. To the gate,
 * both mean "nobody from this table gets in" — a database the app cannot reach must not
 * become a door that opens. To the screen, they are opposites: "nessuno, per ora" is a
 * fact about who has access, and saying it when the question could not even be asked
 * would be the app inventing an answer.
 */
export async function listMembersOf(accountOwnerEmail: string): Promise<MemberRow[] | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({
        accountOwnerEmail: members.accountOwnerEmail,
        email: members.email,
        addedBy: members.addedBy,
        role: members.role,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(eq(members.accountOwnerEmail, normalizeEmail(accountOwnerEmail)))
      .orderBy(asc(members.email))

    return rows.map((row) => ({
      ...row,
      // The column is text; `readRole` is where an unexpected value stops being a role.
      role: readRole(row.role),
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    console.error('listMembersOf failed', error)
    return null
  }
}

/**
 * Every account this address collaborates on — not its own, which needs no row. For the
 * gate (`isAdmitted` cares only whether this is non-empty) and for the account switcher
 * (each row names one more account to offer, besides the reader's own).
 */
export async function listMembershipsFor(email: string): Promise<Membership[] | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({
        accountOwnerEmail: members.accountOwnerEmail,
        email: members.email,
        role: members.role,
      })
      .from(members)
      .where(eq(members.email, normalizeEmail(email)))

    return rows.map((row) => ({ ...row, role: readRole(row.role) }))
  } catch (error) {
    console.error('listMembershipsFor failed', error)
    return null
  }
}

export type { MemberRole }
