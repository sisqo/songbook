'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconInfo } from '@/components/icons'
import { loadCheckoutStatus, mockPurchase, type MockSubscriptionState } from '@/lib/plans/checkout'
import { euro, LIFETIME, PRICES, yearlyTotalOfMonthly } from '@/lib/plans/prices'
import type { BillingPeriod, CheckoutPlan, PaidPlan } from '@/lib/plans/prices'
import { PLAN_LABEL } from '@/lib/plans/types'

/**
 * Fake, and never read past this component: a real card was never going to reach this
 * database, and `mockPurchase` takes no card fields at all — these exist only so trying the
 * flow feels like a checkout rather than a bare button, and they are prefilled with the usual
 * test-suite numbers so trying it needs no typing.
 */
const FAKE_CARD = { name: '', number: '4242 4242 4242 4242', expiry: '12 / 30', cvc: '123' }

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; current: MockSubscriptionState }

/**
 * The mock checkout's actual screen — see `lib/plans/checkout.ts`'s own header for what this
 * is standing in for and why it is open to anybody signed in. Everything that depends on who
 * is asking is asked from here, on mount, the same `/password` and `/accounts` already do:
 * the page around this is a static shell with no idea who is looking.
 *
 * Buying only — no cancel button lives here any more. Managing a plan already bought
 * (cancelling, undoing a scheduled change, the payment history) moved to `/billing`
 * (`BillingScreen`), the once place for both; this screen's own job is narrower than that
 * and stays narrow, with a link across for anyone who arrived here already holding a plan.
 */
export function CheckoutScreen({
  plan,
  initialCycle = 'year',
}: {
  plan: CheckoutPlan
  /** Carried over from /pricing's own toggle by the page, so arriving from Monthly there
      does not land on Yearly here. */
  initialCycle?: BillingPeriod
}) {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [cycle, setCycle] = useState<BillingPeriod>(initialCycle)
  const [card, setCard] = useState(FAKE_CARD)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const refresh = () => {
    void loadCheckoutStatus().then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason:
            result.reason === 'disabled'
              ? 'The test checkout is not switched on right now.'
              : result.reason === 'no-session'
                ? 'Sign in to try the test checkout.'
                : 'No database is configured, so there is nothing to write to.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const buy = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await mockPurchase(plan, cycle)
      if (!result.ok) {
        setError(
          result.reason === 'not-applicable'
            ? 'This account is already on Lifetime — there is nothing left to buy.'
            : "That didn't go through. Try again.",
        )
        return
      }
      setDone(
        result.effect === 'immediate'
          ? plan === 'lifetime'
            ? 'Done — this account is now on Lifetime (test), for good.'
            : `Done — this account is now on ${PLAN_LABEL[plan]} (test), renewing ${cycle === 'year' ? 'yearly' : 'monthly'}.`
          : `Scheduled — this account moves to ${PLAN_LABEL[plan]} (test) once the plan it already paid for ends.`,
      )
      refresh()
    } catch {
      setError("That didn't go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Test checkout — {PLAN_LABEL[plan]}</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          A stand-in for the real checkout, wired to this account for real: buying here sets
          what this account&apos;s plan actually is — the same columns a real payment will one
          day set.
        </p>
      </header>

      <p className="notice notice-accent">
        <IconInfo />
        This is a test checkout. No card is charged, no payment detail leaves this page, and
        nothing here talks to a real payment processor — that part is not built yet.
      </p>

      {status.state === 'loading' && <p className="mt-4 text-sm text-muted">One moment…</p>}

      {status.state === 'unavailable' && (
        <p className="notice notice-error mt-4" role="alert">
          {status.reason}
        </p>
      )}

      {status.state === 'ready' && (
        <>
          {done !== null && <p className="notice mt-4">{done}</p>}
          {error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">This account right now</h2>
            <p className="mt-1.5 text-sm text-muted">
              {status.current.plan === 'free'
                ? 'Free — nothing bought yet.'
                : `${PLAN_LABEL[status.current.plan]}, ${status.current.status}` +
                  (status.current.expiresAt !== null
                    ? `, until ${status.current.expiresAt.toISOString().slice(0, 10)}`
                    : '') +
                  (status.current.pendingPlan !== null ? `, then ${PLAN_LABEL[status.current.pendingPlan]}` : '')}
            </p>
            {status.current.plan !== 'free' && (
              <p className="mt-1.5 text-sm">
                <Link href="/billing" className="text-accent hover:underline">
                  Manage this plan, or see the payment history
                </Link>
              </p>
            )}
          </div>

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">Pay (test)</h2>

            {plan === 'lifetime' ? (
              <p className="mt-3 text-2xl font-medium">{euro(LIFETIME.amount)}, once</p>
            ) : (
              <PaidCheckoutFields plan={plan} cycle={cycle} onCycle={setCycle} />
            )}

            {/*
              * Decorative only — see this file's own comment on `FAKE_CARD`. Kept as real
              * controlled inputs rather than static text so the flow feels like a checkout,
              * not to collect anything: `buy` above never reads `card` at all.
              */}
            <div className="mt-4 grid gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[0.84375rem] text-muted">Name on card</span>
                <input
                  value={card.name}
                  onChange={(event) => setCard({ ...card, name: event.target.value })}
                  placeholder="Not a real card"
                  className="form-field"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.84375rem] text-muted">Card number</span>
                <input
                  value={card.number}
                  onChange={(event) => setCard({ ...card, number: event.target.value })}
                  inputMode="numeric"
                  className="form-field"
                />
              </label>
              <div className="flex gap-2.5">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[0.84375rem] text-muted">Expiry</span>
                  <input
                    value={card.expiry}
                    onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                    className="form-field"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[0.84375rem] text-muted">CVC</span>
                  <input
                    value={card.cvc}
                    onChange={(event) => setCard({ ...card, cvc: event.target.value })}
                    inputMode="numeric"
                    className="form-field"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              disabled={busy}
              onClick={() => void buy()}
            >
              Complete purchase (test)
            </button>
          </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/pricing" className="text-accent hover:underline">
          Back to plans
        </Link>
      </p>
    </>
  )
}

/** The billing-period toggle and the price under it — split out so `plan` narrows to `PaidPlan` here, off the `plan === 'lifetime'` branch at the one call site. */
function PaidCheckoutFields({
  plan,
  cycle,
  onCycle,
}: {
  plan: PaidPlan
  cycle: BillingPeriod
  onCycle: (value: BillingPeriod) => void
}) {
  const price = PRICES[plan][cycle]

  return (
    <>
      <div className="segment mt-3 w-fit" role="group" aria-label="Billing period">
        {(['year', 'month'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === cycle ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={value === cycle}
            onClick={() => onCycle(value)}
          >
            {value === 'year' ? 'Yearly' : 'Monthly'}
          </button>
        ))}
      </div>

      <p className="mt-3 text-2xl font-medium">
        {euro(price.amount)} per {cycle}
      </p>
      {cycle === 'month' && (
        <p className="mt-1 text-sm text-muted">{yearlyTotalOfMonthly(price.amount)} over a year.</p>
      )}
    </>
  )
}
