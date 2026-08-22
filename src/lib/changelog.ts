/**
 * What has shipped, release by release — the data behind `/changelog`.
 *
 * **Macro releases only, never a commit log.** A reader does not want to know that a CSS rule
 * moved; they want to know when the thing they asked for arrived. So an entry here is written
 * only when there is something worth telling somebody who uses the app, which is far less often
 * than the repository changes.
 *
 * **The numbering starts fresh at 1.0 and is public.** `PLAN.md` carries its own internal
 * history — v1 through v3.3, twenty-odd entries — and it is deliberately *not* reused here.
 * Two reasons: that scale has a hole in it (plans and pricing were built as their own document,
 * `PLAN-pagamenti.md`, and were never numbered a v3.4), and half of it describes an app with a
 * single reader and no accounts, which nobody using Strumfolio today has ever seen. Publishing
 * a numbering with a gap, half of it about a product that was never on sale, would be a worse
 * record than starting one that is true from here on. `package.json`'s `0.1.0` is not that
 * number either and never has been — nothing reads it.
 *
 * Newest first, which is the order the page renders and the order `changelog.test.ts` pins.
 */

export interface Release {
  /** The public version. Bumped per macro release, not per change — see this file's header. */
  version: string
  /** ISO `YYYY-MM-DD`. Rendered as a month and a year: the day it landed is not the point. */
  date: string
  /** What the release was about, in one line. */
  title: string
  /** What changed, each in what a reader would actually notice. */
  highlights: string[]
}

export const RELEASES: Release[] = [
  {
    version: '1.0',
    date: '2026-08-22',
    title: 'The first published release',
    highlights: [
      'Read your own lyrics and chords on stage: pinch to zoom, hands-free auto-scroll, and text that stays legible at arm’s length.',
      'Transpose into the key you actually sing in, and set a capo — the chords are rewritten for the shapes you are really playing.',
      'Works with no signal. Once a song has been opened it stays readable offline, which is what a rehearsal room in a basement needs.',
      'Organise a repertoire into songbooks, and a songbook into sections, in the order you play them.',
      'Bring what you already have in, and take it back out again: ChordPro in, ChordPro out, nothing held hostage.',
      'Tap a chord to see the fingering, for guitar or for ukulele — and from Standard up, the choice follows you to your other devices.',
      'Sing Together: everyone opens a link on their own phone and reads the same song in your key, following your line.',
      'A printed booklet as a PDF, ready for the music stand: cover, index, one song a page.',
      'Sign in with Google or with an email and a password, and pick the plan that fits — starting with a free one that has no end date.',
    ],
  },
]

/**
 * `'2026-08-22'` → `'August 2026'`.
 *
 * Parsed by hand rather than through `new Date(...).toLocaleDateString()`: a bare `YYYY-MM-DD`
 * is read as UTC midnight, so any timezone behind Greenwich renders the month before for
 * anything dated the first — and a release note that says July on one reader's screen and
 * August on another's is a bug nobody would think to look for. Splitting the string cannot
 * drift, and the month names are the same nine or ten words either way.
 *
 * An unrecognisable date returns the input untouched. Nothing here is worth throwing over: a
 * malformed entry should print oddly, not take the whole page down.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function releaseMonth(date: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date)
  if (match === null) return date

  const month = MONTHS[Number(match[2]) - 1]
  if (month === undefined) return date

  return `${month} ${match[1]}`
}
