/**
 * The app's name and its payoff, in one place.
 *
 * Three surfaces need to agree on the exact string — the page title, the PWA manifest,
 * and the layout's own default description — and a rename typed three times is a
 * rename that drifts the first time only two of the three are found. The public
 * page's hero headline is close to this same idea rather than a copy of it — two
 * short beats instead of one clause — so it keeps its own wording instead of
 * borrowing this one.
 */
export const APP_NAME = 'Strumfolio'

export const APP_PAYOFF = 'Your favorite songs, ready to play'

/** Bare domain, no protocol — matches how `booklet/document.tsx` and emails print it. */
export const SITE_URL = 'strumfolio.com'
