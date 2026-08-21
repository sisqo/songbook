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
  /**
   * Raised above the other three, with a "Most popular" ribbon — true for exactly one
   * column, `Plus`. A reversal of what this file's CSS used to say on purpose ("no accent
   * border, no ribbon... not something to fix later"): the v3.4 redesign decided a page
   * that only lets somebody choose still benefits from naming the one most people pick.
   */
  featured?: boolean
  /**
   * A plain, always-on action — `Start free`, pointed wherever registering happens. Free is
   * not something `checkout.ts` sells, so it has no `checkoutPlan` and needs this instead;
   * every other column's button comes from `checkoutPlan` below, never from this.
   */
  cta?: { href: string; label: string }
  /**
   * The route slug for the mock checkout (`lib/plans/checkout.ts`'s `CheckoutPlan`), or
   * absent when there is nothing to buy yet. A bare string rather than that type imported
   * here: this file's own header explains why it must never import `@/lib/plans/types`, and
   * `checkout.ts` sits downstream of that module, so pulling in its type would reopen the
   * exact bundle-size door this file exists to keep shut. The page decides whether this is
   * set at all — see `mockCheckoutEnabled()` in `pricing/page.tsx` — so its mere presence is
   * the only thing this component has to check.
   *
   * When it is absent on a paid column, the card simply ends after `audience` with no
   * button at all — the state that used to be a line of text here ("Not on sale yet") moved
   * to the one notice above the whole grid (`pricing/page.tsx`'s `NO_CHECKOUT`), said once
   * for all three paid columns rather than repeated on each.
   */
  checkoutPlan?: string
}

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

/**
 * The four price columns and the one control on the page that has state.
 *
 * The only client component /pricing loads, and deliberately the smallest thing that could
 * hold the toggle: the headline, the lede, the notice, the comparison table, the lifetime
 * block and the closing block are all server-rendered by the page itself. The page stays
 * statically prerendered either way — a client child is rendered into the HTML with
 * `'month'` already chosen and merely hydrates — so what this boundary costs is one small
 * bundle, and what it buys is a toggle whose selected state a screen reader can actually
 * read.
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
 *
 * Opens on `'month'`, the v3.4 redesign's own choice — a departure from the previous default
 * of `'year'`, which `prices.test.ts`'s "makes a year cheaper than twelve months" test was
 * the reason for. That invariant still holds and still matters: whichever tab opens first,
 * the other one has to still read as the better deal once tapped.
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
  const [period, setPeriod] = useState<BillingPeriod>('month')

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
          <article
            key={column.name}
            className={column.featured ? 'card plan-card is-featured' : 'card plan-card'}
          >
            {column.featured && <span className="plan-badge">Most popular</span>}

            <h3 className="plan-name">{column.name}</h3>
            <p className="plan-price">{column.price[period].amount}</p>
            <p className="plan-price-note">{column.price[period].note}</p>
            <p className="plan-audience">{column.audience}</p>

            {column.checkoutPlan !== undefined && (
              <Link
                href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                className="btn btn-primary btn-sm plan-cta w-full"
              >
                Choose {column.name}
              </Link>
            )}

            {column.cta !== undefined && (
              <Link href={column.cta.href} className="btn btn-sm plan-cta w-full">
                {column.cta.label}
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
