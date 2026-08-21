'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { BillingPeriod } from '@/lib/plans/prices'

/** One line of a column's price slot: the amount, and the sentence under it. */
export interface ColumnPrice {
  /** «€19 per year», «€2.49 per month», «€0» — the whole amount, already worded. */
  amount: string
  /** «Billed once a year.», «€29.88 over a year.», «No card.» */
  note: string
}

export interface PlanColumn {
  name: string
  /**
   * Both states, always. Free's two are identical rather than absent, so this component
   * never asks whether a column has a monthly form — a column that opted out of the toggle
   * would be the one place the layout could shift under a tap.
   */
  price: Record<BillingPeriod, ColumnPrice>
  /** Who the plan is for, in one sentence. */
  audience: string
  /** What stands where a buy button would: a state of the world, never a disabled control. */
  action: string
  /**
   * The route slug for the mock checkout (`lib/plans/checkout.ts`'s `CheckoutPlan`), or
   * absent when there is nothing to buy yet. A bare string rather than that type imported
   * here: this file's own header explains why it must never import `@/lib/plans/types`, and
   * `checkout.ts` sits downstream of that module, so pulling in its type would reopen the
   * exact bundle-size door this file exists to keep shut. The page decides whether this is
   * set at all — see `mockCheckoutEnabled()` in `pricing/page.tsx` — so its mere presence is
   * the only thing this component has to check.
   */
  checkoutPlan?: string
}

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'year', label: 'Yearly' },
  { value: 'month', label: 'Monthly' },
]

/**
 * The four price columns and the one control on the page that has state.
 *
 * The only client component /pricing loads, and deliberately the smallest thing that could
 * hold the toggle: the headline, the lede, the notice, the guest-link band, the comparison
 * table, the lifetime block and the closing block are all server-rendered by the page
 * itself. The page stays statically prerendered either way — a client child is rendered
 * into the HTML with `'year'` already chosen and merely hydrates — so what this boundary
 * costs is one small bundle, and what it buys is a toggle whose selected state a screen
 * reader can actually read.
 *
 * The words arrive as props and are not written here, `PlanColumn` by `PlanColumn`. Two
 * reasons, and the second is the one that would be missed: the page owns its own copy, so a
 * reader looking for a sentence on /pricing finds every sentence in one file; and this file
 * must never import `@/lib/plans/types`, because importing `PLANS` into a client component
 * ships that whole module to the browser — `LIMIT_MESSAGE`, `limitSentence`,
 * `capWorthNaming` and every paragraph of commentary with them. The numbers are read from
 * `PLANS` on the server and arrive here as strings that have already been made into
 * sentences. `BillingPeriod` is a type import, which erases.
 *
 * Rejected: a CSS-only toggle — two radios and `:has()`, which needs no JavaScript at all
 * and is what the `<details>` FAQ on /login argues for in a comparable spot. It would put
 * both price sets in the DOM at once, which is fine, and leave the *selected* state
 * unspeakable, which is not: a radio that visually swaps other elements' visibility
 * announces itself as a radio and says nothing about the prices that changed. Here one tap
 * changes what four columns say, so the control has to be able to say that it did.
 *
 * `aria-pressed` on two buttons in a `role="group"` rather than a radiogroup with arrow-key
 * semantics: there are two options, both always visible, and the pair reads as two toggles
 * that happen to be exclusive. A radiogroup would promise keyboard behaviour this does not
 * implement.
 */
export function PricingPlans({
  columns,
  children,
}: {
  columns: PlanColumn[]
  /**
   * Rendered between the toggle and the columns, which is the one slot on this page that a
   * server-rendered block cannot reach on its own: the no-checkout notice belongs directly
   * under the control and above every column it is about, and both of those are in here.
   * Passing it in as a child keeps the words in the page — where every other sentence of
   * this page's copy is — and keeps them out of the browser bundle, since a server component
   * handed to a client component arrives already rendered.
   */
  children?: React.ReactNode
}) {
  const [period, setPeriod] = useState<BillingPeriod>('year')

  return (
    <div>
      <div className="segment mx-auto w-fit" role="group" aria-label="Billing period">
        {PERIODS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            /* px-4: `.segment-button` sets a 44px minimum and no horizontal padding, because
             * every other call site in the app puts a glyph or a number in it. A word needs
             * the padding, and a utility is safe here precisely because the class declares
             * none of its own — there is no coin flip over which rule wins. */
            className={entry.value === period ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={entry.value === period}
            onClick={() => setPeriod(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {children}

      <div className="plan-columns mt-6">
        {columns.map((column) => (
          <article key={column.name} className="card plan-card">
            <h3 className="plan-name">{column.name}</h3>
            <p className="plan-price">{column.price[period].amount}</p>
            <p className="plan-price-note">{column.price[period].note}</p>
            <p className="plan-audience">{column.audience}</p>
            <p className="plan-action">{column.action}</p>
            {column.checkoutPlan !== undefined && (
              <Link
                href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                className="btn btn-primary btn-sm mt-2 w-full"
              >
                Choose {column.name}
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
