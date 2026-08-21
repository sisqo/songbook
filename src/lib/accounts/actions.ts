'use server'

/**
 * Switching which account a signed-in reader is looking at, and — for a global owner
 * only — creating one, deleting one, or hand-assigning it a plan on another address's
 * behalf.
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
import { validateGrant } from './grant'
import { provisionAccount } from './provision'
import type { AccountResult, GrantInput, GrantResult, SelfDeleteResult } from './types'

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
 * code. `paddle_events` is deliberately never touched either, and for the opposite reason:
 * it is the ledger of what somebody actually paid, and a record of a payment that outlives
 * neither the account nor the dispute is no record at all — which is exactly why that table
 * carries no foreign key to `accounts` (see its own comment in `db/schema.ts`) rather than
 * a cascade that would have deleted it here. Two consequences to know, because they are not
 * guessable from the code: a deleted account's address stays in
 * `paddle_events.account_owner_email` with no path in the app that can remove it, and if
 * that same address ever registers again it inherits those rows. Should erasure have to win
 * over the ledger one day, the middle this leaves open is
 * `tx.update(paddleEvents).set({ accountOwnerEmail: null })` for the target inside this same
 * transaction — the absent foreign key already permits it, the payload keeps the event
 * intact, and it belongs here rather than in the webhook. Not done today: which of the two
 * wins is a product decision, not a tidying one.
 *
 * This list is the checklist a new table has to be added to. Migration 0021 exists because
 * `user_prefs` and `user_song_prefs` were once missing from it.
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
 * Gives an account a plan by hand, or takes the gift away — `grant: null` is the clear.
 *
 * Writes **only** the five grant columns, and never `plan`/`planStatus`/`planExpiresAt`. Those
 * three belong to the (future) Paddle webhook, which re-asserts them at every renewal, so a
 * gift parked there would be erased by the next `subscription.updated` — that is, by a
 * *successful payment*, silently, with nothing left in the row to say it ever existed. That
 * failure mode is the entire reason the grant columns were added in 0024, so a `set({ plan: … })`
 * here would undo the migration's design while looking like a shortcut to the same result.
 * `entitlementsFor` reads both sides and takes the more generous per instant, which is what
 * makes writing only this half sufficient.
 *
 * One action for both directions, not a `grantPlan` and a `clearGrant`: both paths write the
 * same five columns, and a second `set({ … })` is a second place to forget one of them and
 * leave a row in a state nothing can explain.
 *
 * Clearing therefore **rewrites all five** rather than nulling them: `grantedPlan` and
 * `grantedUntil` go null — that pair is what `liveGrant` keys on, so the gift is genuinely
 * gone — while `grantedBy`/`grantedAt` record the caller and the moment. Both rejected
 * alternatives are worse in opposite directions. Nulling all five erases the only record that
 * a gift ever existed, since the audit lives on the row and nowhere else, leaving "who took
 * away my year?" permanently unanswerable. Leaving `grantedBy`/`grantedAt` untouched from the
 * *previous* decision attributes the withdrawal to whoever gave the gift. The consequence to
 * know when reading a row: these two columns mean *who last decided about the grant*, gift or
 * withdrawal, and a row with them set and `grantedPlan` null is a withdrawn gift, which is
 * exactly how `/accounts` renders it. `grantedNote` goes null on a clear — see
 * `validateGrant`'s comment on why a withdrawal records who and when but not why.
 *
 * `grantedBy` comes from the session and is deliberately not a parameter: an audit field a
 * caller can set records whatever the caller says, which is not an audit.
 *
 * Authorized with `isOwner` directly, not `asAdmin()`, the same distinction `deleteAccount`
 * and `listAllAccounts` already draw: an account's own owner resolves to `admin` on that one
 * account, so `asAdmin()` here would let every customer gift themselves `lifetime`.
 *
 * Deliberately blind to `SONGBOOK_PLANS`. Preparing the rows that will be enforced the day the
 * switch is flipped is the normal way to work; the flag changes what the screen *says*, never
 * what a row may hold.
 */
export async function setGrant(accountOwnerEmail: string, grant: GrantInput | null): Promise<GrantResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const callerEmail = session?.user?.email
  if (!callerEmail || !isOwner(callerEmail, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  try {
    /*
     * One clock for the validation and for `grantedAt`, so the instant a gift was recorded and
     * the instant its end date was judged against are the same one.
     */
    const now = new Date()

    /*
     * Inside the `try`, not before it, even though nothing here queries. `grant` is typed
     * `GrantInput | null` and arrives from a browser, so the runtime value can be any shape at
     * all — `validateGrant` reads `input.note.trim()`, which throws on an argument that has no
     * `note`. Thrown out of a server action, that reaches the panel as an unexplained failure
     * with no line in this file's log; caught here it is the `failed` this function's return
     * type promises, and the same sentence as every other way a save can go wrong. The typed
     * signature is what the panel obeys, never what a direct call to the action has to send.
     */
    const fields = validateGrant(grant, now)
    if (!fields.ok) return { ok: false, reason: fields.reason }

    /*
     * `.returning(...)` and a length check, not because anything needs the value back: a
     * drizzle `update` against an address with no row *succeeds* and touches nothing, so
     * without this a gift to a deleted or mistyped address reports success. It is also why
     * this action needs no `isEmailShape` of its own — an address that is not an account is
     * caught here whatever it looks like.
     */
    const updated = await db()
      .update(accounts)
      .set({
        grantedPlan: fields.plan,
        grantedUntil: fields.until,
        grantedBy: normalizeEmail(callerEmail),
        grantedAt: now,
        grantedNote: fields.note,
      })
      .where(eq(accounts.ownerEmail, normalizeEmail(accountOwnerEmail)))
      .returning({ ownerEmail: accounts.ownerEmail })

    if (updated.length === 0) return { ok: false, reason: 'unknown-account' }
  } catch (error) {
    console.error('setGrant failed', error)
    return { ok: false, reason: 'failed' }
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
