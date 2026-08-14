'use server'

/** Switching which account a signed-in reader is looking at. */

import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { normalizeEmail } from '@/lib/allowlist'
import { listMembershipsFor } from '@/lib/members/read'

import { mayAccess, writeAccountCookie } from './current'

/**
 * Validates access, then switches. Lands on the home page rather than wherever the
 * reader was: the song or songbook on screen belongs to the account being left, and has
 * no reason to exist — or to mean the same thing — on the one being entered.
 */
export async function switchAccount(accountOwnerEmail: string): Promise<{ ok: boolean }> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false }

  const normalized = normalizeEmail(email)
  const memberships = await listMembershipsFor(normalized)
  if (!mayAccess(normalized, accountOwnerEmail, process.env.ALLOWED_EMAILS, memberships)) {
    return { ok: false }
  }

  await writeAccountCookie(accountOwnerEmail)
  redirect('/')
}
