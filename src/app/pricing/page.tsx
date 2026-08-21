import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconBroadcast, IconChevronLeft } from '@/components/icons'
import { PricingPlans } from '@/components/PricingPlans'
import type { PlanColumn } from '@/components/PricingPlans'
import { APP_NAME } from '@/lib/brand'
import { euro, LIFETIME, PRICES, yearlyTotalOfMonthly } from '@/lib/plans/prices'
import type { PaidPlan } from '@/lib/plans/prices'
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

/** The same words in all three paid columns and in the lifetime block: a state, not a control. */
const NOT_ON_SALE = 'Not on sale yet'

/*
 * Tax-inclusive is a claim this page can make. Currency-invariant is not, and the rejected
 * wording — «the number you see is the number you pay, wherever you are» — asserted the
 * second while only the first was decided. A card issued in sterling or in francs is
 * converted by the reader's own bank, at a rate this page never sees and often with a
 * non-sterling fee on top, so for that reader the number here is demonstrably not the number
 * they pay. Naming the bank's cut costs one clause and keeps the sentence true in every
 * country the page is readable in; the alternative is a price claim that omits a charge we
 * know the reader will incur, which is the definition of a misleading one.
 */
const LEDE =
  'Every price on this page is in euro, tax included: nothing is added at checkout. If your card is ' +
  'not in euro, your bank converts at its own rate. There is no free trial. The free plan is not a ' +
  'countdown — it has no end date, and you can stay on it for as long as you like.'

/*
 * Two clauses, and it used to be three: «the prices on this page are final» is gone. Nothing
 * in this repository can make that promise — `prices.ts` says in its own header that its table
 * and Paddle's catalogue "are two things that must agree, and nothing in this repository can
 * check that they do", and every `paddleId` is still empty. It was also doing no work, since
 * the lede now says the tax is included and nothing is added at checkout, which is the only
 * thing a reader was reading "final" for.
 */
const NO_CHECKOUT =
  'The paid plans are not on sale yet: the checkout is not open, and no account is being held to the ' +
  'limits below until it opens.'

/*
 * «in the same key», and deliberately not «on the same line»: `pollBroadcast` carries the song
 * and the transposition and nothing else — no scroll offset, no line number — and the whole of
 * what happens to a follower's viewport on a song change is `window.scrollTo(0, 0)` in
 * `FollowSession`. The old clause was inherited from /login's own Sing Together copy, where it
 * has now been corrected too: a capability this page charges for must not be described by a
 * sentence the protocol cannot keep.
 */
const GUEST_LINK =
  'Following a Sing Together session is a property of the link, not of a plan. You send the link; ' +
  'whoever opens it reads the same song, in the same key, on their own phone — with no account, ' +
  'nothing installed and nothing to sign up for. That is true for every person who follows, on every ' +
  'plan on this page, and none of them changes it. What a plan decides is two other things: who may ' +
  'start a session, and how many devices may follow one at the same time.'

const LIFETIME_WHAT =
  `Premium with no renewal date. You pay once and the plan does not end: not next year, not when ` +
  `these prices change. Lifetime is stored as its own plan and given exactly Premium's limits — ` +
  `unlimited songbooks and songs, ${PLANS.lifetime.devices} other devices on a session, the booklet ` +
  `without the «Printed with Songbook» line, feature requests read first — which means it also gets ` +
  `whatever Premium becomes later.`

const LIFETIME_WHEN =
  `This one is in the catalogue until ${LIFETIME.closesOnLabel}. After that date it closes, and the ` +
  `four plans above are what remain.`

/*
 * The long form of the expiry rule, and the sentence that removes the fear of losing work.
 *
 * /login carries a short form of it — «If a paid plan lapses, nothing is deleted.», inside the
 * "Is Songbook free to use?" answer — and that is deliberate rather than a copy somebody forgot
 * to keep in step. An earlier version of this comment claimed the two were word for word
 * identical and pointed at a "What happens if I stop paying?" FAQ item on /login; no such item
 * exists, and the claim is corrected here rather than made true, because adding it would grow
 * the sign-in page every existing reader opens daily by an answer that only matters to somebody
 * who has already bought. This is the page where a reader is deciding whether to pay, so the
 * whole rule — including the read-only half, which is the part that needs the space — belongs
 * here.
 *
 * The invariant to keep if either is ever edited: /login may say less, and must never say
 * anything different. A softer *reassurance* is fine; a softer *rule* is not.
 */
const IF_A_PLAN_ENDS =
  'Nothing is ever deleted. Everything you have stays readable, playable and exportable as ChordPro, ' +
  'and an account that is over its new limits goes read-only — deletions only — until it fits again ' +
  'or pays again. What lapses is what the plan added: leading a session, the saved ukulele setting, ' +
  'the printed booklet. Never your songs.'

/*
 * What cancelling does, which is the half a renewal disclosure is incomplete without: a reader
 * told that a plan renews until they cancel has to be told what cancelling costs them, and the
 * answer — nothing that is already paid for — is reassuring enough that leaving it out would be
 * the expensive kind of silence. It also gives LIFETIME_WHAT's «no renewal date» something to
 * be a contrast with; before this sentence existed, the lifetime block was the only place on
 * the page where renewal was mentioned at all, by implication, three sections away from the
 * prices.
 */
const CANCELLING =
  'A subscription renews until you cancel it, and cancelling stops the next renewal rather than the ' +
  'plan you are already holding: it keeps running to the end of the year or the month you have paid ' +
  'for, and then becomes the free plan again. Lifetime has no renewal to stop.'

/*
 * Fourteen days, said in the two places a reader is deciding whether they can get back out: the
 * lifetime block, which carries the largest number on the page and the least reassurance, and
 * "If a plan ends". One constant rather than two sentences, for the reason `limitSentence` gives
 * in `types.ts` — two copies of one commercial promise are two things that come to disagree.
 *
 * No link, and deliberately no announcement that the refund page does not exist yet: a 404 from
 * a price list is worse than prose, and "there is no policy yet" is not a fact a buyer can act
 * on. An address a person answers is. The link replaces the address the day that page exists,
 * in the same change as the checkout.
 */
const REFUND =
  `Fourteen days to change your mind, on any plan and on Lifetime, for any reason: write to ` +
  `${CONTACT} and you get the money back.`

const FOOTNOTE =
  `Premium's ${PLANS.premium.devices} is a real technical ceiling rather than a figure of speech, ` +
  `which is why it is written as a number. Where this page says unlimited — songbooks and songs from ` +
  `Plus up — it means there is no limit in the software at all, rather than a ceiling nobody expects ` +
  `to reach.`

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
       * takes money; the page had a section headed "If a plan ends" and still never said that a
       * plan does not end on its own.
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
    action: NOT_ON_SALE,
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
     * rejects by name. The counts are in the table two sections down; what this line has to say
     * is that the plan does not run out.
     */
    audience: 'Everything needed to read and play, with no end date.',
    /* Free is not bought — it is what an account already is. */
    action: 'Included with any account',
  },
  paidColumn('Standard', 'standard', 'For one player and one other screen.'),
  paidColumn('Plus', 'plus', `Unlimited songbooks and songs, and up to ${PLANS.plus.devices} other screens.`),
  /*
   * «feature requests read first» and not «a direct line»: the table three rows down says there
   * is one shared address on every plan and that what Premium changes is the order things are
   * read in. A direct line is a channel somebody else does not have, which is not what was
   * decided and not what any code does.
   */
  paidColumn('Premium', 'premium', 'For a room full of screens, and feature requests read first.'),
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
    note:
      'A songbook is one set of songs, with its own sections and its own printed booklet. With one, ' +
      'every set shares a single list.',
    cells: [
      capCell(PLANS.free.songbooks),
      capCell(PLANS.standard.songbooks),
      capCell(PLANS.plus.songbooks),
      capCell(PLANS.premium.songbooks),
    ],
  },
  {
    label: 'Songs',
    note:
      `Counted across the whole account, not per songbook. ${PLANS.free.songs} songs is a short set; ` +
      `${PLANS.standard.songs} is most working repertoires.`,
    cells: [
      capCell(PLANS.free.songs),
      capCell(PLANS.standard.songs),
      capCell(PLANS.plus.songs),
      capCell(PLANS.premium.songs),
    ],
  },
  {
    label: 'Import and export ChordPro',
    note:
      'Your songs leave in the same format they arrived in, on every plan, including the free one. ' +
      'Nothing here holds your repertoire hostage.',
    cells: [INCLUDED, INCLUDED, INCLUDED, INCLUDED],
  },
  {
    label: 'Transpose, capo, auto-scroll, text size',
    note: 'Reading and playing are never part of a plan.',
    cells: [INCLUDED, INCLUDED, INCLUDED, INCLUDED],
  },
  {
    label: 'Offline, and synced across your own devices',
    note: 'Once saved, your repertoire opens with no signal. Every plan, including the free one.',
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
    note:
      'Ukulele shapes are drawn in the app on every plan. From Standard up the choice is saved, so it ' +
      'sticks across reloads and follows you to your other devices.',
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
    note:
      'A typeset PDF with a cover and an index, one song a page. Without it you can still export ' +
      'ChordPro and print that.',
    cells: [
      bookletCell(PLANS.free.booklet),
      bookletCell(PLANS.standard.booklet),
      bookletCell(PLANS.plus.booklet),
      bookletCell(PLANS.premium.booklet),
    ],
  },
  {
    label: 'Starting a Sing Together session',
    note:
      'Leading is the part that needs a paid plan. Following one never does, on any plan — see the ' +
      'row below and the band above.',
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].mayLead ? INCLUDED : null,
    ),
  },
  {
    label: 'Other devices following at once',
    note:
      'The device you play from is never one of them, so Standard is you and one other screen, and ' +
      'Plus is a quartet.',
    cells: [
      deviceCell(PLANS.free.devices),
      deviceCell(PLANS.standard.devices),
      deviceCell(PLANS.plus.devices),
      deviceCell(PLANS.premium.devices),
    ],
  },
  {
    label: 'Feature requests',
    note:
      `Anybody can write to ${CONTACT}, on any plan. What Premium changes is the order they are ` +
      `read in.`,
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
 * `auth()`, and nothing imports `@/lib/plans/resolve` (which reads the database and
 * `process.env.SONGBOOK_PLANS`) or anything under `@/lib/data`. `@/lib/plans/types` and
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
 * four price columns do not fit that box, and this is not a legal document. It renders its
 * own `<main>`, its own way back and its own `<Footer />`, which is the shape
 * `/help/chordpro` already uses; the Footer is also how the legal pages stay reachable from
 * here.
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
 * The reader's own theme, like the legal pages: `/pricing` is not in `LIGHT_ONLY_PATH` and
 * must not be added to it. That constant is compared by string equality inside layout.tsx's
 * inline pre-paint script, so making it a set is a three-file change with a pre-paint script
 * in it — for a comparison table that reads correctly in both themes anyway. A visitor who
 * arrives from /login's forced light theme may land here in dark, which is expected: every
 * class used here is drawn in tokens.
 */
export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-[70rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      {/*
        * Home, not /login: middleware sends a visitor with no session on to /login and a
        * signed-in reader to their own songs, so one link is right for both — the same one
        * the legal pages use, in the same shape.
        */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <IconChevronLeft size={15} />
        {APP_NAME}
      </Link>

      <h1 className="screen-title mt-6">What Songbook costs</h1>

      <p className="mt-3 max-w-[42rem] text-sm leading-[1.6] text-muted">{LEDE}</p>

      <section className="mt-8">
        <PricingPlans columns={COLUMNS}>
          {/*
            * Server-rendered, and passed through the client island so it can sit where the
            * reader meets it: under the toggle, above every column it is about. The whole of
            * this page's honesty about there being no checkout is these two clauses, and the
            * second of them — no account is held to the limits yet — is true only while
            * `SONGBOOK_PLANS` is off. It comes out the day that flips, together with the
            * matching qualifier on /login: `plansEnforced` in `plans/resolve.ts` carries a note
            * naming both, because two public pages disagreeing about whether the limits are
            * real is the one failure this pair of sentences exists to prevent.
            */}
          <p className="notice notice-accent mt-5">{NO_CHECKOUT}</p>
        </PricingPlans>
      </section>

      {/*
        * Between the prices and the table rather than at the bottom: following a session needs
        * no account and no install, which is both the best thing on this page and the fact most
        * likely to be misread as something the free plan grants. It earns the position where the
        * reader is still deciding.
        */}
      <section className="mt-12">
        <div className="feature-spotlight">
          {/*
            * The same three arcs /login draws behind its own Sing Together panel, and the same
            * `.feature-spotlight-mark` that near-erases them: decoration, not content. Copied as
            * markup rather than extracted into a shared component because it is a drawing with no
            * behaviour and no props, and a component would put a file between a reader and six
            * lines of paths.
            */}
          <svg
            className="feature-spotlight-mark"
            width="300"
            height="300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.6}
            aria-hidden="true"
          >
            <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
            <path d="M8.5 19a3.5 3.5 0 0 1 7 0" />
            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
          </svg>

          {/*
            * Not `.feature-spotlight-inner`: that class becomes two columns above 1024px, which
            * is right for /login's panel — a paragraph beside three points — and wrong here,
            * where there is one paragraph and the second column would be an empty half of an
            * accent-filled band. The paragraph is capped instead, so the line length stays
            * readable without a column boundary to hold it.
            */}
          <div className="relative">
            <span className="feature-spotlight-icon">
              <IconBroadcast size={26} />
            </span>

            <h2 className="feature-spotlight-title">Anyone with the link can follow</h2>

            <p className="feature-spotlight-text max-w-[46rem]">{GUEST_LINK}</p>
          </div>
        </div>
      </section>

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
          <div className="card p-5 sm:p-7">
            <h2 className="landing-feature-title">
              Lifetime — {euro(LIFETIME.amount)}, once
            </h2>

            <p className="mt-3 max-w-[42rem] text-sm leading-[1.6] text-muted">{LIFETIME_WHAT}</p>
            <p className="mt-2.5 max-w-[42rem] text-sm leading-[1.6] text-muted">{LIFETIME_WHEN}</p>
            {/*
              * The way out, beside the largest number on the page: a reader weighing a single
              * €149 payment is the one who most needs to know it can be undone, and this block
              * was the one place on the page with no such sentence.
              */}
            <p className="mt-2.5 max-w-[42rem] text-sm leading-[1.6] text-muted">{REFUND}</p>

            <p className="plan-action">{NOT_ON_SALE}</p>
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="landing-feature-title">If a plan ends</h2>
        {/*
          * Cancelling first, then what is kept, then the refund window: the order a reader asks
          * them in. The heading is about a plan ending, and the first thing they want to know is
          * whether ending one costs them the time they have paid for.
          */}
        <p className="mt-3 max-w-[42rem] text-sm leading-[1.6] text-muted">{CANCELLING}</p>
        <p className="mt-2.5 max-w-[42rem] text-sm leading-[1.6] text-muted">{IF_A_PLAN_ENDS}</p>
        <p className="mt-2.5 max-w-[42rem] text-sm leading-[1.6] text-muted">{REFUND}</p>
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
