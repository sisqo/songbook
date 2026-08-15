import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'

const { auth } = NextAuth(authConfig)

/** Marks a response as belonging to nobody; the service worker refuses to cache it. */
const ANONYMOUS_HEADER = 'x-songs-anonymous'

/**
 * Paths that must stay reachable without a session.
 *
 * The service worker and the icons are here deliberately: if `/sw.js` needed a
 * session, a service worker update after the cookie expired would fail, and the
 * app would be stuck on an old worker with no way to recover.
 */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth') ||
    pathname === '/sw.js' ||
    pathname === '/sw.js.map' ||
    pathname.startsWith('/swe-worker-') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/apple-touch-icon.png' ||
    pathname.startsWith('/icon-')
  )
}

export default auth((request) => {
  const { pathname } = request.nextUrl

  if (isPublicAsset(pathname)) return

  /**
   * The login page — and, since v3.2, registration and the whole self-serve email loop
   * next to it — is reachable without a session but still gets marked.
   *
   * `/verify`, `/forgot-password` and `/reset-password` all have to be here for
   * the same reason `/register` is: every one of them is a link followed from an email,
   * which lands with no session at all. Without this, the guard below would redirect all
   * three straight to `/login` before their own page ever ran, and nobody could finish
   * registering or recover a password.
   *
   * Marking only the redirect would not be enough: a precache fetch follows
   * redirects by default, so what the service worker inspects is this final 200,
   * and headers from the intermediate 307 are not visible on it. Without the
   * header here, the guard would rest entirely on `response.redirected` — which
   * Serwist's own redirect-copying plugin may already have cleared — and the
   * login page could end up cached under every song URL.
   *
   * The four legal pages are here for a different reason: nobody following one of
   * them — a visitor deciding whether to sign up, a store reviewer, a data
   * protection authority — has a session to check in the first place, and unlike
   * the email-loop pages above, that stays true forever, not just until they finish
   * registering.
   */
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/verify' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/privacy-policy' ||
    pathname === '/terms-of-service' ||
    pathname === '/cookie-policy' ||
    pathname === '/content-copyright-notice'
  ) {
    if (request.auth) return

    const response = NextResponse.next()
    response.headers.set(ANONYMOUS_HEADER, '1')
    return response
  }

  /**
   * A Sing Together link: the one other page a browser with no session may reach.
   * Always marked anonymous, signed in or not — the page it shows depends on the
   * token in the URL, never on whoever happens to be looking at it, so it must never
   * be cached as if it belonged to a particular reader.
   */
  if (/^\/follow\/[^/]+$/.test(pathname)) {
    const response = NextResponse.next()
    response.headers.set(ANONYMOUS_HEADER, '1')
    return response
  }

  if (!request.auth) {
    const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin))
    response.headers.set(ANONYMOUS_HEADER, '1')
    return response
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
