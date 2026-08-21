import Link from 'next/link'

/**
 * The credit line at the foot of every internal page, styled after the one in
 * `easy-guitar-tuner` — same "by SisQo · commit hash" shape. The Ko-fi badge that
 * used to sit above it is gone site-wide: no design this app has shipped has ever
 * shown one, and it was never asked for.
 *
 * A plain server component: nothing here is interactive, so nothing needs to ship to
 * the client.
 */
export function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        by{' '}
        <a href="https://www.sisqo.dev" target="_blank" rel="noopener noreferrer">
          SisQo
        </a>{' '}
        &middot; <span className="font-mono">{process.env.COMMIT_HASH ?? 'dev'}</span>
      </p>

      {/*
       * The one place every legal document is reachable from, since it is the one
       * piece of chrome every screen that renders `Footer` already shares — no
       * separate placement to keep in sync with this list as pages come and go.
       */}
      <nav className="app-footer-legal" aria-label="Legal">
        <Link href="/privacy-policy">Privacy</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/terms-of-service">Terms</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/cookie-policy">Cookies</Link>
        <span aria-hidden>&middot;</span>
        <Link href="/content-copyright-notice">Copyright</Link>
      </nav>
    </footer>
  )
}
