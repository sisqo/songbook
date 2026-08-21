import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconCheck } from '@/components/icons'
import { PricingPlans } from '@/components/PricingPlans'
import type { PlanColumn } from '@/components/PricingPlans'
import { APP_NAME } from '@/lib/brand'
import { euro, LIFETIME, PRICES, yearlyTotalOfMonthly } from '@/lib/plans/prices'
import type { PaidPlan } from '@/lib/plans/prices'
import { mockCheckoutEnabled, plansEnforced } from '@/lib/plans/resolve'
import { PLANS } from '@/lib/plans/types'
import type { BookletTier } from '@/lib/plans/types'

const SHARE_TITLE = `${APP_NAME} — Plans and pricing`

/*
 * The one address on this page, spelled once. Same shape — a file-local `CONTACT` — as all
 * four legal pages, rather than a shared constant in `lib/brand`: those four have lived with
 * their own copies since they were written, and a fifth copy is a smaller change than moving
 * five call sites for a string that has never changed.
 */
const CONTACT = 'info@songbook.sisqo.dev'

/*
 * Whether the lifetime offer is still in the catalogue — the comparison `LIFETIME.closesOn`
 * was created for and, until now, the one nothing performed.
 *
 * **Read when the page is built, not when it is read.** This page is statically generated
 * (see the page's own comment below), so `new Date()` freezes at build time: the block does
 * not vanish at midnight on the closing day, it vanishes on the first build after it. That is
 * the trade taken deliberately over `export const revalidate`, which would give the one page
 * in this app whose content is a constant a cache lifetime, and would do it for a date known
 * months in advance. What the comparison buys even frozen is that no deploy can ship the
 * closed offer — today a deploy in 2027 would still print it, date and all. The remaining
 * duty is a human one and is written beside `closesOn`: take the block out on that day.
 *
 * A string comparison, not `Date` arithmetic: `closesOn` is stored ISO precisely so that a
 * comparison is a comparison and not a parse of prose, and `<=` keeps the closing day itself
 * open, which is what "in the catalogue until" says. UTC on both sides, which for a date that
 * matters to the day and not to the hour is the only reading that does not depend on where
 * the build ran.
 */
const LIFETIME_OPEN = new Date().toISOString().slice(0, 10) <= LIFETIME.closesOn

/*
 * Every number in this sentence is interpolated, like every number on the page below it:
 * a meta description is the one place a stale price is invisible to whoever changed the
 * real one, because nothing on the screen shows it.
 *
 * "free to start" is deliberately not the wording. It reads as a trial, and the first
 * thing this page says is that there is no trial — the free plan has no end date. That
 * distinction is the same one `DESCRIPTION` on /login now makes.
 *
 * The lifetime clause is gated on `LIFETIME_OPEN` for the same reason the block itself is,
 * and this is the half that is easy to miss: a meta description is the one place a closed
 * offer would keep being advertised with nothing on the screen to show it. This sentence is
 * what a shared link renders as a card, so leaving it ungated would put "€149 once, until 31
 * December 2026" in front of readers who cannot buy it, in the place nobody thinks to look.
 */
const DESCRIPTION =
  `Four plans, priced in euro with tax included: a free plan with no end date, then ` +
  `${euro(PRICES.standard.year.amount)}, ${euro(PRICES.plus.year.amount)} or ` +
  `${euro(PRICES.premium.year.amount)} a year` +
  (LIFETIME_OPEN
    ? ` — or ${euro(LIFETIME.amount)} once for Premium for life, until ${LIFETIME.closesOnLabel}.`
    : `.`)

/*
 * `title: 'Pricing'` through the root layout's `%s · Songbook` template, so a shared link
 * reads "Pricing · Songbook" and names the app without naming it twice. /login opts out of
 * the template with `absolute` only because its own title already contains the name; this
 * page has no such reason.
 *
 * `openGraph.title` and `twitter.title` still spell the app name out, and that is not a
 * duplication to tidy away: Next applies the title template to `title` alone, never to
 * either of these, so a bare 'Pricing' here would be exactly the meaningless card the
 * template is what saves us from. No OG image: there is no `metadataBase` in this repo, so
 * a relative image URL would resolve against localhost in development and warn at build —
 * /login, whose block this copies, has none either.
 */
export const metadata: Metadata = {
  title: 'Pricing',
  description: DESCRIPTION,
  openGraph: { title: SHARE_TITLE, description: DESCRIPTION, locale: 'en_US', type: 'website' },
  twitter: { card: 'summary', title: SHARE_TITLE, description: DESCRIPTION },
}

/*
 * The v3.4 redesign's own hero line, replacing the longer disclosure-heavy `LEDE` this used
 * to be — the tax/currency/no-trial facts it carried still matter and are not gone, only
 * moved: see `BILLING_NOTE`, below, in the smaller print beside the prices themselves rather
 * than in the first sentence a visitor reads.
 */
const HERO_SUBTITLE =
  'One account, every device, nothing to install — your chords, in your key, with your capo — ' +
  'even offline, and on every screen in the room.'

/*
 * The three facts `LEDE` used to open the page with, kept but demoted: a tax claim and a
 * currency disclaimer are terms, not a pitch, and belong beside the prices they qualify
 * rather than in the first sentence a visitor reads. Two sentences rather than three — «There
 * is no free trial» folds into the second, since the free plan already earns that fact by
 * having no end date rather than needing a separate claim about trials.
 *
 * Tax-inclusive is a claim this page can make. Currency-invariant is not, and the rejected
 * wording — «the number you see is the number you pay, wherever you are» — asserted the
 * second while only the first was decided. A card issued in sterling or in francs is
 * converted by the reader's own bank, at a rate this page never sees and often with a
 * non-sterling fee on top, so for that reader the number here is demonstrably not the number
 * they pay. Naming the bank's cut costs one clause and keeps the sentence true in every
 * country the page is readable in; the alternative is a price claim that omits a charge we
 * know the reader will incur, which is the definition of a misleading one.
 */
const BILLING_NOTE =
  'Every price on this page is in euro, tax included: nothing is added at checkout. If your card ' +
  'is not in euro, your bank converts at its own rate. There is no free trial — the free plan has ' +
  'no end date, and you can stay on it for as long as you like.'

/*
 * Two clauses, and it used to be three: «the prices on this page are final» is gone. Nothing
 * in this repository can make that promise — `prices.ts` says in its own header that its table
 * and Paddle's catalogue "are two things that must agree, and nothing in this repository can
 * check that they do", and every `paddleId` is still empty. It was also doing no work, since
 * `BILLING_NOTE` already says the tax is included and nothing is added at checkout, which is
 * the only thing a reader was reading "final" for.
 *
 * The second clause now reads `plansEnforced()` rather than assuming it is always off. This
 * page is prerendered at build time (see `PricingPage`'s own comment below on why it must stay
 * that way), so the sentence a visitor reads is baked in at the moment of that build — exactly
 * the moment `SONGBOOK_PLANS` is actually on or off for the deployment being built. /login's
 * `PLAN_HOLD` reads the same function, so the two public pages flip together the day this
 * changes rather than one of them being left saying the limits aren't real.
 */
const NO_CHECKOUT = plansEnforced()
  ? 'The paid plans are not on sale yet: the checkout is not open. The limits below, though, are ' +
    'already in effect for every account.'
  : 'The paid plans are not on sale yet: the checkout is not open, and no account is being held to the ' +
    'limits below until it opens.'

/*
 * The v3.4 redesign's own line for the lifetime block, replacing `LIFETIME_WHAT` and
 * `LIFETIME_WHEN` — the closing date moves out of this sentence entirely and into
 * `LIFETIME_PILL` below, the small badge beside the price, which is where the mock puts it.
 * What survives from the two constants this replaces: Lifetime is still Premium, exactly,
 * with no renewal to ever come due, and it still inherits whatever Premium becomes later —
 * both true regardless of how the sentence describing them is worded.
 */
const LIFETIME_WHAT =
  'Premium with no renewal date, ever — pay once and keep it, including everything Premium ' +
  'becomes later.'

const LIFETIME_PILL = `Price valid until ${LIFETIME.closesOnLabel}`

/*
 * What replaces the whole of "If a plan ends" — the section heading, the cancelling
 * mechanics, and the fourteen-day refund promise that used to close it. This is the v3.4
 * redesign's own call: the fuller rule is not written anywhere else on the site, and going
 * with only this shorter reassurance is a deliberate trade of that explanatory prose for the
 * lighter page the redesign asks for, made once and knowingly rather than lost by accident.
 */
const TRUST_NOTE =
  'Nothing you put in here is ever deleted. If a subscription ends, your songs stay readable, ' +
  'printable and exportable.'

const FOOTNOTE =
  `Premium's ${PLANS.premium.devices} is a real technical ceiling rather than a figure of speech, ` +
  `which is why it is written as a number. Where this page says unlimited — songbooks and songs from ` +
  `Plus up — it means there is no limit in the software at all, rather than a ceiling nobody expects ` +
  `to reach.`

/**
 * Read once and reused by every column and by the Lifetime block below, rather than called
 * separately in each: it is a build-time env read (see its own comment in `resolve.ts`), so
 * every call in one build agrees regardless, but one name for "is the mock live" is one fewer
 * thing to keep saying the same way.
 */
const CHECKOUT_LIVE = mockCheckoutEnabled()

/** A paid column, worded once for the three that differ only in their amounts and their audience. */
function paidColumn(name: string, plan: PaidPlan, audience: string): PlanColumn {
  const { year, month } = PRICES[plan]

  return {
    name,
    price: {
      /*
       * Both notes carry the renewal, and neither may stop carrying it. «Billed once a year.»
       * alone was the whole of this page's billing disclosure, and it reads — correctly, on its
       * own words — as buying one year of Songbook: the reader is told when the card is charged
       * and never that it is charged again. On the monthly side it was worse, because the note
       * was a comparison rather than a billing sentence, so tapping Monthly removed the word
       * "billed" from the page altogether. How long the contract runs, that it renews by
       * itself, and how to stop it are the three facts a subscription has to state before it
       * takes money — and these two notes are now the only place any of the three is stated at
       * all, since v3.4 folded the fuller "If a plan ends" section into `TRUST_NOTE`, which
       * says none of them.
       */
      year: {
        amount: `${euro(year.amount)} per year`,
        note: 'Billed once a year, and renews each year until you cancel.',
      },
      /*
       * The annualized total stays, one number, rather than a sentence about savings: the reader
       * compares it against the yearly amount unaided, and no line has to editorialize about
       * which of the two is the better deal. It now follows the renewal rather than standing in
       * for it — a total over a year says what twelve payments come to, not that there will be
       * twelve of them.
       */
      month: {
        amount: `${euro(month.amount)} per month`,
        note: `Renews every month until you cancel — ${yearlyTotalOfMonthly(month.amount)} over a year.`,
      },
    },
    audience,
    checkoutPlan: CHECKOUT_LIVE ? plan : undefined,
  }
}

const COLUMNS: PlanColumn[] = [
  {
    name: 'Free',
    /*
     * Both states are the same two lines, so the free column does not move under a toggle
     * that has nothing to say about it. "No card." rather than a blank slot: the absence of
     * a payment detail is the fact somebody on this column is looking for.
     */
    price: {
      year: { amount: euro('0'), note: 'No card.' },
      month: { amount: euro('0'), note: 'No card.' },
    },
    /*
     * Not «to find out whether this is your app», which framed the free plan as an evaluation
     * period — the trial reading the lede spends a sentence denying and /login's own repair
     * rejects by name. The numbers are named here now (they used to live only in the table two
     * sections down) because the v3.4 cards say what living on the plan is actually like, not
     * only that it does not run out.
     */
    audience: `Just you and the instrument. ${PLANS.free.songbooks} songbook, ${PLANS.free.songs} songs — ` +
      'no card, no end date, no trial to run out.',
    /* Free is not sold through `checkout.ts` — it is what an account already is — so it gets
       the one card button that is never conditional on `CHECKOUT_LIVE`. */
    cta: { href: '/register', label: 'Start free' },
  },
  paidColumn(
    'Standard',
    'standard',
    `You lead, one screen follows. ${PLANS.standard.songbooks} songbooks, ${PLANS.standard.songs} songs, ` +
      'a printed booklet.',
  ),
  {
    ...paidColumn(
      'Plus',
      'plus',
      `Unlimited songbooks and songs, up to ${PLANS.plus.devices} other screens, printed booklet with no ` +
        'credit line.',
    ),
    /*
     * The one column raised above the rest — see `.plan-card.is-featured`'s own comment on
     * why this is a reversal and not an oversight. Plus, and never more than one: two ribbons
     * on the same row would each cancel the other's claim to be the one to pick.
     */
    featured: true,
  },
  /*
   * Not «with your name» — the phrase the mock uses for premium's booklet — because that
   * claims a feature `bookletCell`'s own comment says does not exist yet: premium's `custom`
   * tier behaves exactly like plus' `plain` today, credit line dropped and nothing more
   * personalised than that. «No credit line», Plus' own phrase, is the sentence that stays
   * true; what actually sets Premium apart in this card is the device count, not the booklet.
   */
  paidColumn(
    'Premium',
    'premium',
    'The whole room follows — unlimited devices, unlimited songs, printed booklet with no credit line.',
  ),
]

interface ComparisonRow {
  label: string
  /** One small sentence saying what living without this row is like. See the table's comment. */
  note: string
  /** Free, Standard, Plus, Premium — in `COLUMNS` order. `null` is "no part of this plan". */
  cells: (string | null)[]
}

const INCLUDED = 'Included'

/** A cap as a table cell. `null` is genuinely unlimited — no limit in the software at all. */
function capCell(limit: number | null): string {
  return limit === null ? 'Unlimited' : String(limit)
}

/**
 * What a booklet tier is called in a table cell.
 *
 * `plain` and `custom` return the identical string, and this map is the code-level guard that
 * keeps a customizable booklet off this page: `bookletBrandLine` asks only whether the tier is
 * `branded`, so premium's `custom` behaves exactly like plus' `plain` today and listing a
 * customizable booklet would be selling something that does not exist. A `switch` over the
 * union rather than an `=== 'branded'` test, so the day a fifth tier is added this stops
 * compiling instead of quietly describing it as "without that line" — and so that whoever
 * starts gating on `custom` has to come here and split these two cases apart deliberately.
 * `prices.test.ts` pins the same fact from the other side, next to the numbers.
 */
function bookletCell(tier: BookletTier): string | null {
  switch (tier) {
    case 'no':
      return null
    case 'branded':
      return 'With a «Printed with Songbook» line'
    case 'plain':
    case 'custom':
      return 'Without that line'
  }
}

/**
 * The device ceiling as a table cell, with free's 0 written as no cell at all.
 *
 * Never "0", for the reason `capWorthNaming` exists in `types.ts`: "0 of 0" reads as a fault in
 * the software, and so does a 0 in a table. Free cannot lead a session at all, so this row is
 * simply not part of that plan.
 */
function deviceCell(devices: number): string | null {
  return devices === 0 ? null : String(devices)
}

/**
 * The comparison, one row per thing a reader is choosing between — every number read from
 * `PLANS`, never typed here, so this table and the gates cannot drift.
 *
 * The consequence of going without lives in the row label, not in the cells: three cells
 * cannot each carry a clause without the table growing wider than a laptop, and it would be
 * the same sentence said three times. So each row header is two lines — the label, then what
 * living without it is like — and the cells stay bare values, "Included", or nothing.
 *
 * Two things are deliberately absent, and both would be easy to "complete" later. There is no
 * customizable-booklet row (see `bookletCell`). And there is no smart-capo row, although
 * `PLANS.free.smartCapo === false` says free does not have it: `Entitlements.refused` has six
 * fields and `smartCapo` is not one of them, and `PlanLimits` says out loud that no call site
 * reads the field and that no gate may be invented for it. So the free plan gets the smart capo
 * suggestion today and would still get it the day `SONGBOOK_PLANS` is switched on — a row here
 * would sell Standard for something Free already delivers, which is the customizable booklet
 * pointing the other way and taking money for it. The row goes in the day the gate exists, and
 * not before.
 */
const ROWS: ComparisonRow[] = [
  {
    label: 'Songbooks',
    note: 'The most songbooks one account may hold.',
    cells: [
      capCell(PLANS.free.songbooks),
      capCell(PLANS.standard.songbooks),
      capCell(PLANS.plus.songbooks),
      capCell(PLANS.premium.songbooks),
    ],
  },
  {
    label: 'Songs',
    note: 'The most songs across the whole account, not per songbook.',
    cells: [
      capCell(PLANS.free.songs),
      capCell(PLANS.standard.songs),
      capCell(PLANS.plus.songs),
      capCell(PLANS.premium.songs),
    ],
  },
  /*
   * One row, where the previous design had three — "Import and export ChordPro", "Transpose,
   * capo, auto-scroll, text size" and "Offline, and synced across your own devices" — because
   * all three answered `[INCLUDED, INCLUDED, INCLUDED, INCLUDED]` and a table that says the
   * same four-way tie three times in a row says it once too many. The v3.4 redesign's own
   * "Reading, offline & sync" row folds the three claims into one sentence without dropping
   * any of them.
   */
  {
    label: 'Reading, offline & sync',
    note:
      'Transpose, capo conversion, auto-scroll, and export as ChordPro — offline, and on every ' +
      'plan including the free one.',
    cells: [INCLUDED, INCLUDED, INCLUDED, INCLUDED],
  },
  {
    label: 'Chord shapes',
    /*
     * The row that claimed a gate the code does not have. `saveGlobalPrefs` is the one control
     * point, and its own comment says why it can only be a soft one: the diagrams are drawn in
     * the browser from a table that ships with the app, so nothing server-side can stop a reader
     * seeing ukulele shapes. What it refuses is *storing* the choice — the row is written back
     * with `guitar` and the answer is `not-in-plan`, which `prefs/queue.ts` treats as finished
     * rather than surfacing. So the free reader who taps Ukulele gets ukulele shapes until the
     * next reload, and the old note («the instrument stays set to guitar, so a ukulele player
     * reads guitar shapes») sold Standard for something Free already delivers and told a reader
     * their own screen was lying. What the paid plans buy is that the choice sticks: across a
     * reload, and across their other devices. That is true today and stays true the day the
     * client-side half of the gate lands.
     */
    note: 'Tap any chord for the fingering, on every plan. From Standard up, the choice sticks across reloads and other devices.',
    /*
     * All four cells name both instruments, and the free cell used to say just «Guitar» — which
     * was the same false gate the old note claimed, in the one place a reader comparing columns
     * actually looks. What differs between the columns is the four words after the comma, and a
     * near-identical row is the honest shape here: `PLANS[plan].ukulele` is still what decides,
     * so the cells cannot drift from the gate, and what the gate really withholds is the memory
     * of the choice rather than the drawing.
     */
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].ukulele ? 'Guitar and ukulele, choice saved' : 'Guitar and ukulele',
    ),
  },
  {
    label: 'Printed booklet',
    note: 'A PDF ready to print: a cover, an index, one song a page.',
    cells: [
      bookletCell(PLANS.free.booklet),
      bookletCell(PLANS.standard.booklet),
      bookletCell(PLANS.plus.booklet),
      bookletCell(PLANS.premium.booklet),
    ],
  },
  {
    label: 'Starting a Sing Together session',
    /*
     * "Following one never does, on any plan" is the whole of `GUEST_LINK`'s own claim, kept
     * here in one clause now that the feature-spotlight band that used to say it at length is
     * gone (v3.4) — a guest reads the same song, in the same key, on their own phone, with no
     * account and nothing installed, on every plan on this page. Leading is the part a plan
     * decides.
     */
    note: 'Leading needs a paid plan. Following one never does, on any plan, with no account and nothing installed.',
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].mayLead ? INCLUDED : null,
    ),
  },
  {
    label: 'Other devices following at once',
    note: 'The device you play from is never one of them — Standard is a duo, Plus a quartet.',
    cells: [
      deviceCell(PLANS.free.devices),
      deviceCell(PLANS.standard.devices),
      deviceCell(PLANS.plus.devices),
      deviceCell(PLANS.premium.devices),
    ],
  },
  {
    label: 'Feature requests',
    note: `Anybody can write to ${CONTACT}, on any plan — Premium's are read first.`,
    /*
     * "Read first" says what happens, and deliberately not how fast: a response time on a static
     * page is a promise made on one developer's behalf, and this page must not grow into an SLA.
     */
    cells: ['By email', 'By email', 'By email', 'Read first'],
  },
]

/**
 * What Songbook costs — the one page a visitor reads while deciding whether to pay, and the
 * only page in the app that has to be readable by somebody who has never signed in and by a
 * reader who signed in months ago, without knowing which of the two is looking.
 *
 * **This page must stay statically generated.** That is not enforced by anything: it holds
 * only as long as nothing here awaits `searchParams`, calls `cookies()`, `headers()` or
 * `auth()`, and nothing here calls any of the database-touching exports of
 * `@/lib/plans/resolve` — `entitlementsOf`, `deviceCapOf`, `effectivePlanOf` — or anything
 * under `@/lib/data`. `plansEnforced` and `mockCheckoutEnabled`, both imported here, are the
 * two exceptions and not a loophole in that rule: each is a bare, synchronous
 * `process.env` read with no query behind it, so calling either at render time is exactly as
 * static-safe as reading `@/lib/plans/prices`, just resolved at *build* time instead of never
 * — which is the entire point of `NO_CHECKOUT` and `CHECKOUT_LIVE` existing at all: a flag
 * flipped in Vercel takes effect on the next build's copy of this page, not before. `@/lib/plans/types` and
 * `@/lib/plans/prices` are both pure and safe. There is no `export const dynamic` here
 * because nothing in this repository uses `force-static` — the four legal pages prerender
 * under this same root layout with no such declaration — and a comment is what a later
 * reader actually reads. The reason it matters: a price list rendered per request would be
 * a database read and a cold start for a page whose content is a constant.
 *
 * `new Date()` at module scope — `LIFETIME_OPEN`, above — is on the permitted side of that
 * list, and is spelled out here so a later reader does not have to guess: reading the clock
 * is not a dynamic API, so it does not opt the page out of prerendering. What it does instead
 * is take the build's value and keep it, which is a consequence rather than a hazard and is
 * documented where the constant is declared. Anything that needs the *reader's* clock, as
 * opposed to the build's, cannot be done here at all without giving up the paragraph above.
 *
 * Not inside the `(legal)` route group, whose layout is documented as the shell shared by
 * the four legal pages and wraps its children in `legal-content` prose at `max-w-2xl` —
 * four price columns do not fit that box, and this is not a legal document. It has its own
 * `layout.tsx` instead (`PublicHeader` at 70rem, matching this page's own width), and
 * renders its own `<main>` and its own `<Footer />`, which is the shape `/help/chordpro`
 * already uses; the Footer is also how the legal pages stay reachable from here.
 *
 * Deliberately **not** in `scripts/precache-routes.ts`, and that list's own comment is why
 * somebody will want to add it: it says the public routes that need no session belong there.
 * A precache entry's lifetime is a deploy, not a visit, and for an installed app that has
 * not been opened online that can be weeks — so the lifetime block, which names the day the
 * offer closes, could be served with confidence weeks after that day had passed.
 * A price is a fact with a date on it. Offline this page is a dead link, which is the right
 * failure and the same one `/edit` already chooses in `sw.ts`: better a page that refuses to
 * open than one that opens with last month's prices.
 *
 * The reader's own theme, like every other page now — a comparison table that reads
 * correctly in both themes anyway, drawn entirely in tokens.
 */
export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-[70rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="text-center">
        <span className="pricing-eyebrow">Pricing</span>
        <h1 className="screen-title mt-5">What Songbook costs</h1>
        <p className="mx-auto mt-4 max-w-[38rem] text-[1.03125rem] leading-[1.6] text-muted">
          {HERO_SUBTITLE}
        </p>
      </div>

      <section className="mt-8">
        <PricingPlans columns={COLUMNS}>
          {/*
            * Server-rendered, and passed through the client island so it can sit where the
            * reader meets it: under the toggle, above every column it is about. `NO_CHECKOUT`
            * itself now carries the flip on whether the limits are real — see its own comment
            * above — so this stays exactly two clauses about there being no checkout, said
            * honestly either way.
            */}
          <p className="notice notice-accent mt-5">{NO_CHECKOUT}</p>
        </PricingPlans>
      </section>

      {/*
        * The tax/currency/no-trial disclosure `LEDE` used to open the page with, demoted here
        * rather than dropped — see `BILLING_NOTE`'s own comment. Under the grid rather than
        * above it: these are terms that qualify the prices just shown, not a claim to open on.
        */}
      <p className="mx-auto mt-6 max-w-[42rem] text-center text-xs leading-[1.6] text-muted">
        {BILLING_NOTE}
      </p>

      <section className="mt-12">
        <h2 className="landing-feature-title">What each plan includes</h2>

        <div className="plan-table-scroll mt-5">
          <table className="plan-table">
            <caption className="sr-only">The four plans compared, feature by feature.</caption>

            <thead>
              <tr>
                {/* The row-header column has no heading of its own to give. */}
                <th scope="col">
                  <span className="sr-only">Feature</span>
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.name} scope="col">
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">
                    <span className="plan-row-label">{row.label}</span>
                    <span className="plan-row-note">{row.note}</span>
                  </th>

                  {row.cells.map((cell, index) => (
                    <td key={COLUMNS[index].name} className={cell === null ? 'plan-cell-none' : undefined}>
                      {cell === null ? (
                        <>
                          {/*
                            * A dash is a glyph, not a word: read aloud it is either silence or
                            * "em dash", and neither says what the cell means. The word goes to
                            * a screen reader, the glyph to the eye.
                            */}
                          <span aria-hidden>—</span>
                          <span className="sr-only">Not included</span>
                        </>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-[42rem] text-xs leading-[1.6] text-muted">{FOOTNOTE}</p>
      </section>

      {/*
        * Rendered only while the offer is open — see `LIFETIME_OPEN`. The block states its own
        * closing date, so left ungated it would spend 2027 advertising a price at a price list's
        * full volume and explaining, in the same breath, that the price is gone.
        */}
      {LIFETIME_OPEN && (
        <section className="mt-12">
          <div className="lifetime-panel">
            {/*
              * Text on the left, the price on the right — the v3.4 redesign's own layout,
              * replacing the single stacked column this block used to be. `items-end` on
              * `sm:flex-row` so the price block's own right edge lines up with its button
              * underneath it rather than with the panel's own padding.
              */}
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-[32rem]">
                <span className="lifetime-eyebrow">Pay once</span>
                <h2 className="lifetime-title">Lifetime</h2>
                <p className="lifetime-what">{LIFETIME_WHAT}</p>
              </div>

              <div className="flex-none sm:text-right">
                <p className="lifetime-original">{euro(LIFETIME.originalAmount)}</p>
                <p className="lifetime-price">{euro(LIFETIME.amount)}</p>
                <p>
                  <span className="lifetime-pill">{LIFETIME_PILL}</span>
                </p>

                {CHECKOUT_LIVE && (
                  <Link href="/checkout/lifetime" className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
                    Choose Lifetime
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/*
        * Replaces the whole of "If a plan ends" — see `TRUST_NOTE`'s own comment on what that
        * traded away. The checkmark-in-a-circle is the smaller sibling of `.hero-badge-icon`'s
        * own on /login, reused here rather than drawn again for the same reason `IconCheck`
        * already exists: one glyph for "this is settled" everywhere it appears.
        */}
      <section className="mt-8">
        <div className="card trust-note">
          <span className="trust-note-icon">
            <IconCheck size={18} />
          </span>
          <p className="text-sm leading-[1.5] text-ink">{TRUST_NOTE}</p>
        </div>
      </section>

      {/*
        * The one call to action on the page, and it is a line of text. Four symmetrical
        * columns with no button in any of them is what keeps the page honest while it cannot
        * sell; a single link at the foot is what keeps it useful to somebody who has decided.
        */}
      <p className="mt-12 text-center text-sm text-muted">
        New here?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create an account
        </Link>
        .
      </p>

      <Footer />
    </main>
  )
}
