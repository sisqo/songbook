'use server'

/**
 * A stand-in checkout that writes the same three columns a real Paddle webhook will one day
 * write — `plan`, `planStatus` and `planExpiresAt` — so the entitlement gates, the account
 * menu's plan badge and the freeze path can all be exercised for real before there is an
 * actual payment processor behind any of it. Never touches `paddleCustomerId` or
 * `paddleSubscriptionId`: those two columns are for the real webhook to key on, and seeding
 * them with invented ids would leave rows that look real to a future lookup and resolve to
 * nothing at Paddle. Never touches the `granted*` columns either, for the reason `setGrant`
 * (`accounts/actions.ts`) exists at all: a renewal re-asserting `plan`/`planStatus` would
 * silently erase a gift living in those same columns, which is why the two are kept apart.
 *
 * Deliberately open to any signed-in reader, on whichever account their session currently
 * resolves to — `currentUser().accountOwnerEmail`, which already respects the account
 * switcher, so a global owner testing the free plan's flow buys as whichever account they
 * have switched into. There is no `isOwner` check anywhere in this file, and that is a real,
 * standing decision: while `mockCheckoutEnabled()` answers true, anybody who reaches
 * `/checkout` can give their own account any plan for nothing, because nothing here actually
 * charges a card. `mockCheckoutEnabled` is the only fence, meant to stand for a short test
 * window and come down again — see its own comment in `resolve.ts`.
 */

import { eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { isCheckoutPlan } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'
import { mockCheckoutEnabled } from '@/lib/plans/resolve'
import { readPlan, readPlanStatus } from '@/lib/plans/types'
import type { Plan, PlanStatus } from '@/lib/plans/types'

export type MockCheckoutFailure = 'disabled' | 'no-session' | 'no-database' | 'invalid-plan' | 'failed'

export interface MockSubscriptionState {
  plan: Plan
  status: PlanStatus
  expiresAt: Date | null
}

/**
 * The raw subscription columns for one account — never blended with a grant, since what this
 * screen shows and edits is specifically the half a real webhook would touch. `planStateFor`
 * (`entitlements.ts`) answers a different question, which of the two sides currently wins,
 * and is not what a checkout screen needs to know about itself.
 */
async function rawSubscriptionOf(accountOwnerEmail: string): Promise<MockSubscriptionState | null> {
  const rows = await db()
    .select({ plan: accounts.plan, status: accounts.planStatus, expiresAt: accounts.planExpiresAt })
    .from(accounts)
    .where(eq(accounts.ownerEmail, accountOwnerEmail))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  return { plan: readPlan(row.plan), status: readPlanStatus(row.status), expiresAt: row.expiresAt }
}

/** What the checkout screen needs on arrival: whether it may show at all, and what this account already holds. */
export async function loadCheckoutStatus(): Promise<
  | { ok: false; reason: 'disabled' | 'no-session' | 'no-database' }
  | { ok: true; current: MockSubscriptionState }
> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const current = await rawSubscriptionOf(user.accountOwnerEmail)
  if (current === null) return { ok: false, reason: 'no-session' }

  return { ok: true, current }
}

/** now + one billing period — a calendar month or a calendar year, not a fixed day count. */
function expiryFor(cycle: BillingPeriod, now: Date): Date {
  const until = new Date(now)
  if (cycle === 'year') until.setFullYear(until.getFullYear() + 1)
  else until.setMonth(until.getMonth() + 1)
  return until
}

/**
 * "Buys" a plan for the account this session is on: `plan`, `planStatus: 'active'` and an
 * expiry one billing period out. Lifetime's `planExpiresAt` is null — never, the same value
 * `free` carries — rather than a special-cased date far in the future, matching
 * `StoredPlan.expiresAt`'s own rule that null always means never.
 *
 * `plan` arrives as a bare `string`, not `CheckoutPlan`: it comes from a route param and a
 * form value, neither of which the type system can vouch for, and `isCheckoutPlan` is the
 * actual check — a value this cannot recognise is refused rather than normalised, unlike
 * `readPlan`, which would fall back to `'free'` and write that to a paying account's row
 * with no error for a typo to be seen in.
 */
export async function mockPurchase(
  plan: string,
  cycle: BillingPeriod,
): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({
        plan,
        planStatus: 'active',
        planExpiresAt: plan === 'lifetime' ? null : expiryFor(cycle, new Date()),
      })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })

    if (updated.length === 0) return { ok: false, reason: 'failed' }
  } catch (error) {
    console.error('mockPurchase failed', error)
    return { ok: false, reason: 'failed' }
  }

  // The one trace of a mock sale: nothing is written that a real lookup could mistake for
  // one (see this file's own header), so a log line is the only record that it happened.
  console.warn(`mock checkout: ${user.accountOwnerEmail} => ${plan}${plan === 'lifetime' ? '' : `/${cycle}`}`)
  return { ok: true }
}

/**
 * "Cancels": flips `planStatus` to `expired` and leaves `plan`/`planExpiresAt` exactly as
 * they were — the same shape a real cancellation leaves, where the columns still say what
 * was bought and until when, and `expired` is what actually takes the entitlements away
 * (`liveSubscription` in `entitlements.ts` treats a stored `expired` as authoritative
 * regardless of the date). This is the only way to exercise the freeze path through the
 * subscription columns rather than the grant ones, since nothing has ever written `expired`
 * there before this existed.
 */
export async function mockCancel(): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ planStatus: 'expired' })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })

    if (updated.length === 0) return { ok: false, reason: 'failed' }
  } catch (error) {
    console.error('mockCancel failed', error)
    return { ok: false, reason: 'failed' }
  }

  console.warn(`mock checkout: ${user.accountOwnerEmail} => cancelled`)
  return { ok: true }
}
