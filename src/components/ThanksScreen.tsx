'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconBooks, IconCheck, IconReceipt } from '@/components/icons'
import { loadPurchaseSummary, loadThanksPreview, type MockSubscriptionState } from '@/lib/plans/checkout'
import { PLAN_LABEL, PLAN_VALUES, readPlan } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; current: MockSubscriptionState }

/** The renewal date as a reader would write it — «22 September 2026», the same form the thank-you email uses. */
function dayOf(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Where a purchase lands: what is now active, and the one thing worth doing next.
 *
 * Asked from the client on mount, like `BillingScreen` and `CheckoutScreen` beside it — the page
 * around this is a static shell that cannot know who is looking. Through
 * `loadPurchaseSummary`, deliberately, and not `loadCheckoutStatus`: see that function's own
 * comment on why a thank-you must not depend on the mock checkout still being switched on.
 *
 * **It reads the account's live plan rather than trusting a query parameter**, which is what
 * keeps it honest. There is nothing in the URL to forge, so the page cannot be made to
 * congratulate somebody for a plan they do not hold; and an account that really is on `free`
 * gets the plain "nothing bought yet" state below instead of a thank-you for nothing. The cost
 * of that choice, stated rather than hidden: opening this page again a month later still reads
 * as a thank-you, because "is on Premium" is the only question it asks. Pinning it to the
 * *moment* of purchase would mean reading `paddle_events` for a recent row, which is a lot of
 * machinery to stop a page from being warm twice.
 *
 * `?preview=<plan>` is the one exception, and it does not weaken the paragraph above: the query
 * param never becomes account data by itself, it only picks *which* fabricated plan
 * `loadThanksPreview` (`lib/plans/checkout.ts`) hands back, and that function re-checks
 * `isOwner` on the server before handing back anything at all — the same gate `/emails` sits
 * behind. Read with a plain `URLSearchParams(window.location.search)` rather than Next's
 * `useSearchParams()`, which would force this page into a Suspense boundary to stay statically
 * generated, for a query param this page's own real visitors never carry.
 */
export function ThanksScreen() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [previewPlan, setPreviewPlan] = useState<Plan | null>(null)

  const runPreview = (plan: Plan) => {
    setPreviewPlan(plan)
    setStatus({ state: 'loading' })
    void loadThanksPreview(plan).then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason: result.reason === 'no-session' ? 'Sign in to see this.' : 'Only a global owner can preview this page.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('preview')
    if (requested !== null) {
      runPreview(readPlan(requested))
      return
    }

    void loadPurchaseSummary().then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason:
            result.reason === 'no-session'
              ? 'Sign in to see this.'
              : 'No database is configured, so there is no plan to report.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
    // Read once, on mount, from whatever URL this page happened to load with — the same rule
    // this effect followed before `?preview=` existed.
  }, [])

  /** The plan switcher, shown only once a `?preview=` has put this screen into preview mode. */
  const previewBar =
    previewPlan === null ? null : (
      <div className="segment mb-4 w-fit" role="tablist" aria-label="Preview plan">
        {PLAN_VALUES.map((plan) => (
          <button
            key={plan}
            type="button"
            role="tab"
            aria-selected={plan === previewPlan}
            className={plan === previewPlan ? 'segment-button is-on px-3' : 'segment-button px-3'}
            onClick={() => runPreview(plan)}
          >
            {PLAN_LABEL[plan]}
          </button>
        ))}
      </div>
    )

  if (status.state === 'loading') {
    return (
      <>
        {previewBar}
        <p className="mt-4 text-sm text-muted">One moment…</p>
      </>
    )
  }

  if (status.state === 'unavailable') {
    return (
      <>
        {previewBar}
        <p className="notice notice-error mt-4" role="alert">
          {status.reason}
        </p>
      </>
    )
  }

  const { current } = status

  /*
   * Nothing was bought — somebody typed the URL, or is looking at an account that never
   * purchased. Said plainly rather than dressed up as a thank-you: the whole reason this reads
   * the live plan is so that this branch exists.
   */
  if (current.plan === 'free') {
    return (
      <>
        {previewBar}
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Nothing bought yet</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            This account is on Free. Have a look at what the paid plans add.
          </p>
        </header>

        <Link href="/pricing" className="btn btn-primary">
          See the plans
        </Link>
      </>
    )
  }

  const label = PLAN_LABEL[current.plan]

  return (
    <>
      {previewBar}
      <header className="mb-[1.125rem]">
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <IconCheck size={15} />
          Payment received
        </p>
        <h1 className="screen-title mt-1.5">Thanks — you&apos;re on {label}</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          {label} is active on this account right now.{' '}
          {current.expiresAt === null
            ? 'There is nothing to renew — it stays yours.'
            : `It renews on ${dayOf(current.expiresAt)}, and you can change or cancel it any time before then.`}
        </p>
      </header>

      {/*
        * The one thing worth doing next, and the reason this page exists rather than a line of
        * text on the checkout: a plan on its own does nothing for a musician until there is a
        * songbook with their songs in it. Home is where that starts — there is no deeper link
        * to give, because creating a songbook is a control on that screen.
        */}
      <div className="card card-lead p-4 sm:p-5">
        <h2 className="section-title">Start your songbook</h2>
        <p className="mt-1.5 text-sm leading-[1.45] text-muted">
          Make a songbook, put your first songs in it, and take it with you — on stage, in
          rehearsal, even with no signal.
        </p>
        <Link href="/" className="btn btn-primary mt-3.5">
          <IconBooks size={16} />
          Go to my songbooks
        </Link>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <Link href="/billing" className="flex items-center gap-1.5 text-accent hover:underline">
          <IconReceipt size={15} />
          Manage this plan, or see the payment history
        </Link>
        <Link href="/help" className="text-accent hover:underline">
          How the editor works
        </Link>
      </p>

      <p className="mt-6 text-sm text-muted">A confirmation is on its way to your inbox.</p>
    </>
  )
}
