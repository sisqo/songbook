'use server'

/**
 * A stand-in checkout that writes the same columns a real Paddle webhook will one day write —
 * `plan`, `planStatus`, `planExpiresAt`, and now `pendingPlan`/`pendingCycle` for a change
 * scheduled ahead of time — so the entitlement gates, the account menu's plan badge, the
 * freeze path and now a payment history can all be exercised for real before there is an
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
 * `/checkout` or `/billing` can give their own account any plan for nothing, because nothing
 * here actually charges a card. `mockCheckoutEnabled` is the only fence, meant to stand for a
 * short test window and come down again — see its own comment in `resolve.ts`.
 *
 * Upgrade timing versus downgrade/cancellation timing, decided once here rather than at every
 * call site: buying a plan that outranks what is currently live applies immediately, the same
 * way Paddle, Stripe and every other subscription seller does it — nobody who just paid more
 * waits for a renewal to see the benefit. Buying a plan that ranks *below* what is currently
 * live, or cancelling outright, is scheduled for the date the account has already paid
 * through instead: `pendingPlan`/`pendingCycle` record what it becomes, and
 * `resolveSubscription` (`entitlements.ts`) is what makes that date self-enforcing with no
 * cron and no further write — see that function's own comment, and PLAN-pagamenti.md for the
 * whole design.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { notifyTelegram } from '@/lib/telegram/notify'

import { liveSubscription, resolveSubscription } from './entitlements'
import type { SubscriptionColumns } from './entitlements'
import { logMockEvent, paymentHistoryFor } from './history'
import type { PaymentHistoryLine } from './history'
import { mockCheckoutEnabled } from './resolve'
import { isCheckoutPlan, readPendingCycle } from './prices'
import type { BillingPeriod } from './prices'
import { PLAN_RANK, readPendingPlan, readPlan, readPlanStatus } from './types'
import type { Plan, PlanStatus } from './types'

export type MockCheckoutFailure =
  | 'disabled'
  | 'no-session'
  | 'no-database'
  | 'invalid-plan'
  /** Nothing live to cancel/expire/downgrade, or the live plan is `lifetime`, which never is. */
  | 'not-applicable'
  | 'failed'

export interface MockSubscriptionState {
  plan: Plan
  status: PlanStatus
  expiresAt: Date | null
  /** A downgrade or cancellation (`'free'`) already scheduled, ahead of `expiresAt`. */
  pendingPlan: Plan | null
}

/**
 * The raw subscription columns for one account, read as `SubscriptionColumns` — the narrow
 * shape `liveSubscription`/`resolveSubscription` actually need, with no grant fields to fill
 * with filler values this file never uses (see that interface's own comment).
 */
async function subscriptionColumnsOf(accountOwnerEmail: string): Promise<SubscriptionColumns | null> {
  const rows = await db()
    .select({
      plan: accounts.plan,
      status: accounts.planStatus,
      expiresAt: accounts.planExpiresAt,
      pendingPlan: accounts.pendingPlan,
      pendingCycle: accounts.pendingCycle,
    })
    .from(accounts)
    .where(eq(accounts.ownerEmail, accountOwnerEmail))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  return {
    plan: readPlan(row.plan),
    status: readPlanStatus(row.status),
    expiresAt: row.expiresAt,
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingCycle: readPendingCycle(row.pendingCycle),
  }
}

/** now + one billing period — a calendar month or a calendar year, not a fixed day count. */
function expiryFor(cycle: BillingPeriod, now: Date): Date {
  const until = new Date(now)
  if (cycle === 'year') until.setFullYear(until.getFullYear() + 1)
  else until.setMonth(until.getMonth() + 1)
  return until
}

/** What the checkout/billing screen needs on arrival: whether it may show at all, and what this account already holds. */
export async function loadCheckoutStatus(): Promise<
  | { ok: false; reason: 'disabled' | 'no-session' | 'no-database' }
  | { ok: true; current: MockSubscriptionState }
> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
  if (raw === null) return { ok: false, reason: 'no-session' }

  const resolved = resolveSubscription(raw, new Date())
  return {
    ok: true,
    current: { plan: resolved.plan, status: resolved.status, expiresAt: resolved.expiresAt, pendingPlan: resolved.pendingPlan },
  }
}

/**
 * One account's payment history, self-scoped — the reader's own, whichever account their
 * session currently resolves to, the same rule every write in this file already follows.
 */
export async function loadMyPaymentHistory(): Promise<
  { ok: true; history: PaymentHistoryLine[] } | { ok: false; reason: 'no-session' | 'no-database' }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  return { ok: true, history: await paymentHistoryFor(user.accountOwnerEmail) }
}

/**
 * Marks the mandatory plan-choice step (PLAN-attivazione.md) complete when a reader picks
 * Free — the one plan `mockPurchase` does not sell at all (`CHECKOUT_PLANS` is
 * `PAID_PLANS + lifetime`; `isCheckoutPlan('free')` is false). Choosing Free is not a
 * purchase: `plan`/`planStatus` are already `'free'`/`'active'` from the column defaults, so
 * this writes nothing there, and it logs nothing to `paddle_events` either — that table is a
 * list of real transactions, and a zero-euro row nobody actually bought does not belong in it.
 *
 * Deliberately does **not** check `mockCheckoutEnabled()`, unlike every other write in this
 * file. That flag governs the *paid* checkout only; the Free exit from the mandatory-choice
 * gate in `(home)/page.tsx` has to keep working even while the paid flow is switched off — the
 * alternative is a deployment with `SONGBOOK_PLANS=on` and `SONGBOOK_MOCK_CHECKOUT=off` where a
 * brand-new account has no way through the gate at all.
 *
 * `sql\`coalesce(...)\`` rather than a bare `now()`: calling this twice — a reader who taps
 * "Start free" again, or lands back on `/pricing` after already choosing — must never overwrite
 * a genuine first-activation date with a later one. `mockPurchase` writes the identical
 * expression for the same reason, on the other exit from the same gate.
 */
export async function activatePlanChoice(): Promise<{ ok: true } | { ok: false; reason: 'no-session' | 'no-database' | 'failed' }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ planChosenAt: sql`coalesce(${accounts.planChosenAt}, now())` })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }
  } catch (error) {
    console.error('activatePlanChoice failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * "Buys" a plan for the account this session is on. An upgrade (or a first purchase, or
 * re-buying the plan already live) applies at once: `plan`, `planStatus: 'active'`, an expiry
 * one billing period out, and any previously scheduled downgrade/cancellation is dropped —
 * changing your mind about leaving is expressed by buying back in, not by a separate control.
 * A genuine downgrade — a lower-ranked plan than what is currently live — leaves
 * `plan`/`planStatus`/`planExpiresAt` untouched and only schedules `pendingPlan`/
 * `pendingCycle`, so the account keeps what it already paid for until that date arrives.
 *
 * `lifetime`'s `planExpiresAt` is null — never, the same value `free` carries — rather than a
 * special-cased date far in the future. And once `lifetime` is the live plan, no further
 * purchase through this function is offered: there is no date on that row for a downgrade to
 * fire on, and nothing higher-ranked exists to upgrade to, so this refuses with
 * `not-applicable` rather than silently doing nothing useful with either branch.
 *
 * The rank comparison is against `liveSubscription` — the subscription side alone — never
 * against a blended `effectivePlan` that could include a manual grant: an account gifted
 * `lifetime` while paying for `standard` must still read a `plus` purchase as an upgrade of
 * the subscription, not as a downgrade against the gift sitting beside it.
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
): Promise<{ ok: true; effect: 'immediate' | 'scheduled' } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === 'lifetime') return { ok: false, reason: 'not-applicable' }

    const isUpgradeOrSame = plan === 'lifetime' || currentLive === null || PLAN_RANK[plan] >= PLAN_RANK[currentLive]

    if (isUpgradeOrSame) {
      const updated = await db()
        .update(accounts)
        .set({
          plan,
          planStatus: 'active',
          planExpiresAt: plan === 'lifetime' ? null : expiryFor(cycle, now),
          pendingPlan: null,
          pendingCycle: null,
          /*
           * See `activatePlanChoice`'s own comment on the `coalesce`: a plan bought directly,
           * with no Free step first, still has to satisfy the mandatory-choice gate
           * (PLAN-attivazione.md) on its own — but never by overwriting a real first-activation
           * date already sitting on a later upgrade or re-purchase.
           *
           * `now.toISOString()`, never the `Date` itself. Interpolating a JS `Date` into a raw
           * `sql` template makes it a bind parameter, and postgres.js refuses one: «The "string"
           * argument must be of type string or an instance of Buffer or ArrayBuffer. Received an
           * instance of Date». The whole UPDATE then throws, the `catch` below turns it into
           * `failed`, and the checkout screen says «That didn't go through. Try again.» on every
           * single purchase — which is exactly what shipped, and what this line is fixing.
           * Verified against the real database, all three forms: the `Date` throws, `now()` and
           * this one both work. (Drizzle converts a `Date` fine in a plain `.set({ col: date })`
           * — as `planExpiresAt` two lines up does — because that path knows the column's type.
           * Inside `sql` there is no column to infer from, so the driver sees a bare object.)
           *
           * A string rather than SQL's own `now()`: this way the stamp is the same instant as
           * `planExpiresAt` above and as the logged event below, instead of the database's clock
           * a few milliseconds later. `activatePlanChoice` uses `now()` because it has no JS
           * clock of its own to share — don't "unify" the two into one form without that in mind.
           */
          planChosenAt: sql`coalesce(${accounts.planChosenAt}, ${now.toISOString()})`,
        })
        .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
        .returning({ ownerEmail: accounts.ownerEmail })
      if (updated.length === 0) return { ok: false, reason: 'failed' }

      await logMockEvent({
        accountOwnerEmail: user.accountOwnerEmail,
        action: 'purchase',
        plan,
        cycle: plan === 'lifetime' ? null : cycle,
      })
      const label = `${plan}${plan === 'lifetime' ? '' : `/${cycle}`}`
      console.warn(`mock checkout: ${user.accountOwnerEmail} => ${label}`)
      await notifyTelegram(`💰 Acquisto: ${user.accountOwnerEmail} → ${label}`)
      return { ok: true, effect: 'immediate' }
    }

    // A genuine downgrade: scheduled for `raw.expiresAt`, which is left untouched here.
    const updated = await db()
      .update(accounts)
      .set({ pendingPlan: plan, pendingCycle: cycle })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({ accountOwnerEmail: user.accountOwnerEmail, action: 'scheduled_change', plan, cycle })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => ${plan}/${cycle} scheduled`)
    await notifyTelegram(`📉 Downgrade programmato: ${user.accountOwnerEmail} → ${plan}/${cycle}`)
    return { ok: true, effect: 'scheduled' }
  } catch (error) {
    console.error('mockPurchase failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * "Cancels" — schedules the account to lapse to free once its already-paid-for period ends,
 * by writing `pendingPlan: 'free'` and leaving `plan`/`planStatus`/`planExpiresAt` exactly as
 * they are. Nothing further has to happen on that date: `resolveSubscription` reads a
 * `pendingPlan` of `'free'` past `expiresAt` exactly the way it would read no pending change
 * at all having ever been written — a lapsed subscription is a lapsed subscription either
 * way. Refuses `not-applicable` when there is nothing live to cancel (already free, already
 * expired) or when the live plan is `lifetime`, which has no period to cancel at the end of —
 * see `mockPurchase`'s own comment on why lifetime refuses both directions.
 *
 * For a way to end a plan's entitlements *right now* rather than at the paid-until date, see
 * `forceExpireNow` — kept as a distinct, explicitly test-only action, because the freeze path
 * has to stay exercisable without waiting out a real calendar date.
 */
export async function mockCancel(): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === null || currentLive === 'free' || currentLive === 'lifetime') {
      return { ok: false, reason: 'not-applicable' }
    }

    const updated = await db()
      .update(accounts)
      .set({ pendingPlan: 'free', pendingCycle: null })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({ accountOwnerEmail: user.accountOwnerEmail, action: 'scheduled_change', plan: 'free', cycle: null })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => cancel scheduled`)
    await notifyTelegram(`🚫 Cancellazione programmata: ${user.accountOwnerEmail} (era ${currentLive})`)
  } catch (error) {
    console.error('mockCancel failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * "I changed my mind" — drops a scheduled downgrade/cancellation without touching anything
 * else, the free/instant counterpart to re-buying the current plan through `mockPurchase`
 * (which also clears it, but re-asserts fresh dates and logs a purchase). Refuses
 * `not-applicable` when nothing is actually scheduled, checked with the same `UPDATE …
 * WHERE … RETURNING` idiom `setGrant` uses for its own "does this address even have a row"
 * question — a plain `set()` against nothing pending would report success for a no-op.
 */
export async function clearPendingChange(): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ pendingPlan: null, pendingCycle: null })
      .where(and(eq(accounts.ownerEmail, user.accountOwnerEmail), isNotNull(accounts.pendingPlan)))
      .returning({ ownerEmail: accounts.ownerEmail, plan: accounts.plan })
    if (updated.length === 0) return { ok: false, reason: 'not-applicable' }

    await logMockEvent({
      accountOwnerEmail: user.accountOwnerEmail,
      action: 'kept_current',
      plan: readPlan(updated[0].plan),
      cycle: null,
    })
  } catch (error) {
    console.error('clearPendingChange failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * Test-only: ends the live plan's entitlements **right now** instead of at its paid-until
 * date, by writing `planStatus: 'expired'` directly — the one way left, after `mockCancel`
 * started deferring to period end, to exercise the freeze path without waiting out a real
 * calendar date. Clears any scheduled change too: there is nothing left for it to fire into.
 * Refuses `not-applicable` under the same two conditions `mockCancel` does.
 */
export async function forceExpireNow(): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === null || currentLive === 'free' || currentLive === 'lifetime') {
      return { ok: false, reason: 'not-applicable' }
    }

    const updated = await db()
      .update(accounts)
      .set({ planStatus: 'expired', pendingPlan: null, pendingCycle: null })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({ accountOwnerEmail: user.accountOwnerEmail, action: 'force_expired', plan: currentLive, cycle: null })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => forced expiry (test)`)
  } catch (error) {
    console.error('forceExpireNow failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}
