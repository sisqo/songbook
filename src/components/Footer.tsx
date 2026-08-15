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
        <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=3" height={36} alt="Buy Me a Coffee at ko-fi.com" />
      </a>

      <p className="app-footer-credit">
        by{' '}
        <a href="https://www.sisqo.dev" target="_blank" rel="noopener noreferrer">
          SisQo
        </a>{' '}
        &middot; <span className="font-mono">{process.env.COMMIT_HASH ?? 'dev'}</span>
      </p>
    </footer>
  )
}
