import Link from 'next/link'

import { SITE_URL } from '@/lib/brand'
import { COPYRIGHT_YEAR, CURRENT_VERSION } from '@/lib/changelog'

/**
 * The credit line at the foot of every internal page, styled after the one in
 * `easy-guitar-tuner` — same "by SisQo · commit hash" shape. The Ko-fi badge that
 * used to sit above it is gone site-wide: no design this app has shipped has ever
 * shown one, and it was never asked for.
 *
 * It now opens with the copyright and the released version. Three things sit on one line
 * rather than three, because they answer one question between them — *what is this, and which
 * one of it am I looking at* — and a footer that grows a row per fact ends up taller than the
 * page it is under.
 *
 * The version is a link to `/changelog`, which is the whole reason it is worth printing: a
 * number nobody can look up is decoration. It is deliberately still *also* reachable by the
 * word "Changelog" in the row below — the two are not redundant, they are two ways of
 * scanning. Somebody who wants to know what changed looks for the word; somebody who has been
 * told "fixed in 1.1" looks for the number, sees they are on 1.0, and clicks it.
 *
 * The commit hash stays, and stays last: it is for whoever is diagnosing a deployment, and it
 * is the one thing here no reader has any use for.
 *
 * `COMMIT_HASH` unset reads `dev`, which is what a local run is. Both the year and the version
 * come from `lib/changelog.ts`, derived from the newest release — see their own comments on why
 * neither is a `new Date()` nor a second hand-maintained copy.
 *
 * A plain server component: nothing here is interactive, so nothing needs to ship to
 * the client.
 */
export function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        &copy; {COPYRIGHT_YEAR} {SITE_URL} &middot;{' '}
        <Link href="/changelog">v{CURRENT_VERSION}</Link> &middot; by{' '}
        <a href="https://www.sisqo.dev" target="_blank" rel="noopener noreferrer">
          SisQo
        </a>{' '}
        &middot; <span className="font-mono">{process.env.COMMIT_HASH ?? 'dev'}</span>
      </p>

      {/*
       * The one place every legal document is reachable from, since it is the one
       * piece of chrome every screen that renders `Footer` already shares — no
       * separate placement to keep in sync with this list as pages come and go.
       *
       * `/brand` sits at the end of the same row rather than in a second one. It is not a
       * legal document, which is why the label no longer says so, but it is the same kind
       * of link: a page nobody needs while they are playing, which still has to be
       * findable from anywhere without a menu entry of its own.
       */}
      <nav className="app-footer-legal" aria-label="Legal, brand and changelog">
        <Link href="/privacy-policy">Privacy</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/terms-of-service">Terms</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/cookie-policy">Cookies</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/content-copyright-notice">Copyright</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/brand">Brand</Link>
        <span aria-hidden>&middot;</span>
        {/* Same reasoning as `/brand` beside it, and the label's own justification: a reader
            looking for "what's new" has nowhere else to look, and a release note is worth
            nothing if only the person who wrote it can find it. */}
        <Link href="/changelog">Changelog</Link>
      </nav>
    </footer>
  )
}
