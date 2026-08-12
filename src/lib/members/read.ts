/**
 * The members table, read.
 *
 * Not a server action: it is read by the sign-in callback and by the guards in front of
 * every write, neither of which is called from a browser. Both go through here so there
 * is one query and one failure behaviour rather than two that could differ.
 */

import { asc } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { type Membership, type Role, readRole } from '@/lib/roles'

export interface MemberRow extends Membership {
  email: string
  role: Role
  addedBy: string | null
  createdAt: string
}

/**
 * The rows, or **null** when the table could not be read.
 *
 * The two are not the same answer and the difference matters twice over. To the gate,
 * both mean "nobody from this table gets in" — a database the app cannot reach must not
 * become a door that opens. To the screen, they are opposites: "nessuno, per ora" is a
 * fact about who has access, and saying it when the question could not even be asked
 * would be the app inventing an answer.
 */
export async function listMembers(): Promise<MemberRow[] | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({
        email: members.email,
        addedBy: members.addedBy,
        role: members.role,
        createdAt: members.createdAt,
      })
      .from(members)
      .orderBy(asc(members.email))

    return rows.map((row) => ({
      ...row,
      // The column is text; `readRole` is where an unexpected value stops being a role.
      role: readRole(row.role),
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    console.error('listMembers failed', error)
    return null
  }
}

/** For the gate: address and role, which is all the decision takes. */
export async function listMemberships(): Promise<Membership[] | null> {
  const rows = await listMembers()
  return rows === null ? null : rows.map(({ email, role }) => ({ email, role }))
}
