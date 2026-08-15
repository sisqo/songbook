import Link from 'next/link'

/**
 * The credit line at the foot of every internal page, styled after the one in
 * `easy-guitar-tuner` — same "by SisQo · commit hash" shape, plus a Ko-fi badge that
 * one does not have yet.
 *
 * A plain server component: nothing here is interactive, so nothing needs to ship to
 * the client beyond the badge image itself.
 */
export function Footer() {
  return (
    <footer className="app-footer">
      <a
        href="https://ko-fi.com/sisqo"
        target="_blank"
        rel="noopener noreferrer"
        className="app-footer-kofi"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- badge served from ko-fi's own CDN, nothing next/image could optimize */}
        <img
          src="https://storage.ko-fi.com/cdn/kofi5.png?v=3"
          width={143}
          height={36}
          alt="Buy Me a Coffee at ko-fi.com"
        />
      </a>

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
