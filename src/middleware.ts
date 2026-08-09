import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'

const { auth } = NextAuth(authConfig)

/**
 * Paths that must stay reachable without a session.
 *
 * The service worker and the icons are here deliberately: if `/sw.js` needed a
 * session, a service worker update after the cookie expired would fail, and the
 * app would be stuck on an old worker with no way to recover.
 */
function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
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
  if (isPublic(request.nextUrl.pathname)) return

  if (!request.auth) {
    const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin))
    /**
     * Marks the response as belonging to nobody. The service worker refuses to
     * cache anything carrying this header, which is what stops a precache run
     * with an expired session from storing the login page under every song URL.
     */
    response.headers.set('x-songs-anonymous', '1')
    return response
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
