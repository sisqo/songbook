'use server'

/**
 * Switching which account a signed-in reader is looking at, and — for a global owner
 * only — creating or deleting one on another address's behalf.
 */

import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth, signOut } from '@/auth'
import { isEmailShape, isOwner, normalizeEmail } from '@/lib/allowlist'
import { deletePasswordHash } from '@/lib/auth/credentials'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, sections, singAlongSessions, songbooks, songs } from '@/lib/db/schema'
import { isAdmitted } from '@/lib/roles'

import { mayAccess, readAccountCookie, writeAccountCookie } from './current'
import { provisionAccount } from './provision'
import type { AccountResult, SelfDeleteResult } from './types'

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
  if (!mayAccess(normalized, accountOwnerEmail, process.env.ALLOWED_EMAILS)) {
    return { ok: false }
  }

  await writeAccountCookie(accountOwnerEmail)
  redirect('/')
}

/**
 * Gives an address its own account ahead of its first sign-in — the admission channel
 * `PLAN.md`'s *Niente più ospiti* opens in place of inviting a collaborator. Existence is
 * checked explicitly rather than trusted to `provisionAccount`'s own idempotency, so an
 * admin re-creating an address they forgot already has one gets an honest answer instead
 * of a silent no-op that looks like success either way.
 */
export async function createAccount(email: string): Promise<AccountResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const address = normalizeEmail(email)
  if (!isEmailShape(address)) return { ok: false, reason: 'invalid-email' }

  try {
    const existing = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, address))
      .limit(1)
    if (existing.length > 0) return { ok: false, reason: 'already-exists' }

    await provisionAccount(address)

    const created = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, address))
      .limit(1)
    if (created.length === 0) return { ok: false, reason: 'failed' }

    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    console.error('createAccount failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * The cascade itself, shared by `deleteAccount` (a global owner, on any account) and
 * `deleteMyAccount` (a reader, on their own) — what differs between the two is who may
 * call it and what happens once it is done, never this part.
 *
 * Deletion order follows the `restrict` foreign keys already on `songs` and `sections`
 * rather than requiring them to be relaxed: songs first, then the sections they pointed
 * at, then the now-empty songbooks, then any broadcast reading this account's repertoire,
 * and only then the account row itself. `userSongPrefs` needs nothing here — its foreign
 * key to `songs` is already `on delete cascade`. `members` is deliberately never touched:
 * the table is on its way out entirely in a later step and must not be referenced by new
 * code.
 */
async function removeAccountAndContent(target: string): Promise<void> {
  await db().transaction(async (tx) => {
    const owned = await tx
      .select({ slug: songbooks.slug })
      .from(songbooks)
      .where(eq(songbooks.accountOwnerEmail, target))
    const slugs = owned.map((row) => row.slug)

    if (slugs.length > 0) {
      await tx.delete(songs).where(inArray(songs.songbookSlug, slugs))
      await tx.delete(sections).where(inArray(sections.songbookSlug, slugs))
      await tx.delete(songbooks).where(inArray(songbooks.slug, slugs))
    }

    await tx.delete(singAlongSessions).where(eq(singAlongSessions.broadcastAccountEmail, target))
    await tx.delete(accounts).where(eq(accounts.ownerEmail, target))
  })

  /*
   * `accounts.ownerEmail` is a primary key, so the row just deleted was the only one this
   * address could ever have owned — `hasAccount` is `false` here by construction, with
   * nothing left to re-query.
   */
  const stillAdmitted = isAdmitted(target, process.env.ALLOWED_EMAILS, false)
  if (!stillAdmitted) {
    try {
      await deletePasswordHash(target)
    } catch (error) {
      // The account itself is already gone either way; a stray credential row left
      // behind proves nothing on its own and is not worth failing this action over.
      console.error('removeAccountAndContent: deletePasswordHash failed', error)
    }
  }
}

/**
 * Deletes an account and everything in it — immediately, with no check for "is it
 * empty", by design (see `PLAN.md`, *Niente più ospiti*, point 7): the only safety net
 * wanted is retyping the address, and this action enforces that net itself rather than
 * trusting the screen that calls it to have done so.
 *
 * Authorized with `isOwner` directly, not `asAdmin()`: an account's own owner is `admin`
 * on that one account, which would let anyone delete their own — this is a global-owner
 * power over every account, the same distinction `listAllAccounts` already draws. A
 * reader deleting their own account is `deleteMyAccount`, below.
 */
export async function deleteAccount(accountOwnerEmail: string, confirmEmail: string): Promise<AccountResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const callerEmail = session?.user?.email
  if (!isOwner(callerEmail, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const target = normalizeEmail(accountOwnerEmail)
  if (normalizeEmail(confirmEmail) !== target) {
    return { ok: false, reason: 'confirm-mismatch' }
  }

  try {
    await removeAccountAndContent(target)
  } catch (error) {
    console.error('deleteAccount failed', error)
    return { ok: false, reason: 'failed' }
  }

  /*
   * A global owner can be looking at the very account they just deleted — they switched
   * into it earlier from this same screen. The cookie would otherwise keep pointing at an
   * address `accounts` no longer has a row for; `currentAccountFor` falls back safely, but
   * only to the caller's own account, so it is put back explicitly rather than left stale.
   */
  const requested = await readAccountCookie()
  if (requested !== null && normalizeEmail(requested) === target && callerEmail) {
    await writeAccountCookie(callerEmail)
  }

  revalidatePath('/accounts')
  return { ok: true }
}

/**
 * A reader deleting their own account — the self-service half `deleteAccount`'s own
 * comment says is deliberately not there: that action is a global-owner power over
 * *every* account, and this is the ordinary one every reader already has over their
 * own, with the same retype-to-confirm safety net checked here as well as by the
 * screen that calls it.
 *
 * Ends in `signOut`, not a plain return: the session cookie is a ninety-day JWT that
 * nothing short of signing out actually ends (`lib/auth/session.ts`'s own comment) —
 * every write path re-checking access on every call is what stops it from doing harm
 * in the meantime, but the account behind this session is now gone, and leaving the
 * reader signed in to it would strand them on a page with nothing left to show.
 */
export async function deleteMyAccount(confirmEmail: string): Promise<SelfDeleteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'failed' }

  const target = normalizeEmail(email)
  if (normalizeEmail(confirmEmail) !== target) {
    return { ok: false, reason: 'confirm-mismatch' }
  }

  try {
    await removeAccountAndContent(target)
  } catch (error) {
    console.error('deleteMyAccount failed', error)
    return { ok: false, reason: 'failed' }
  }

  await signOut({ redirectTo: '/login' })
  // Unreachable: signOut with a redirectTo always throws to get there.
  return { ok: true }
}
