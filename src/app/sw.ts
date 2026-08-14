/// <reference lib="webworker" />

/**
 * Service worker.
 *
 * The one thing that can quietly destroy the offline promise: precache requests
 * are real HTTP requests, so they pass through the auth middleware. If the
 * service worker ever precaches while the session is invalid, every song URL
 * gets the login page stored under it — and the cache *looks* full, so offline
 * you would find a login screen for every song with nothing to indicate why.
 *
 * Two defences. Registration only happens on pages that are already behind the
 * gate, so a valid cookie exists at install time; and the guard below refuses to
 * store any response that was redirected or that the middleware marked as
 * anonymous, which makes a bad cache impossible rather than merely unlikely.
 */

import { PAGES_CACHE_NAME, defaultCache } from '@serwist/next/worker'
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type SerwistGlobalConfig,
  Serwist,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/** Set by the middleware on any response served to someone not signed in. */
const ANONYMOUS_HEADER = 'x-songs-anonymous'

const rejectUnauthenticated = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.redirected) return null
    if (response.headers.get(ANONYMOUS_HEADER) !== null) return null
    if (!response.ok) return null
    return response
  },
}

/**
 * Every page-navigation entry `defaultCache` runs on its own — RSC prefetches, plain RSC
 * fetches, full HTML, and the same-origin catch-all it all falls through to when neither
 * header matches (the one `/edit`'s own rule above was found sitting in, per this file's
 * top comment).
 *
 * `precacheOptions.plugins` below only guards the *install-time* precache; runtime
 * navigations landing in one of these four never passed through it (v3.0). Since every
 * page is now rendered per request and scoped to whichever account's session made the
 * request, a session that has just expired mid-visit is exactly the same failure mode
 * `precacheOptions` was written to prevent, and needs the same guard. Matchers and cache
 * names are copied verbatim from `defaultCache`'s own source so these four shadow it —
 * first match wins — without changing what anything else in `defaultCache` does.
 */
const authenticatedPageCaching = (
  [
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        request.headers.get('Next-Router-Prefetch') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.rscPrefetch,
    ],
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' && sameOrigin && !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.rsc,
    ],
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('Content-Type')?.includes('text/html') === true &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.html,
    ],
    [
      ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && !url.pathname.startsWith('/api/'),
      'others',
    ],
  ] as const
).map(([matcher, cacheName]) => ({
  matcher,
  handler: new NetworkFirst({
    cacheName,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 }), rejectUnauthenticated],
  }),
}))

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    plugins: [rejectUnauthenticated],
    /**
     * `c` used to say which songbook was open on the home page, while opening one
     * meant unfolding it in place. A songbook is a page of its own now, so nothing
     * produces the parameter any more — but `/?c=repertorio` still has to resolve to
     * the precached `/` so an old bookmark opens offline instead of missing. The two
     * defaults are restated because setting this replaces them.
     */
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^c$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  /**
   * The editor is never cached, and the rule comes first because the first match
   * wins.
   *
   * Without it the default rules keep a copy of the page, and offline that copy
   * would open an editor showing the words as they were at the last deploy, over a
   * database it cannot reach — you would type into a stale song and lose it on save.
   * A page that plainly refuses to open says the true thing instead. Measured, not
   * assumed: it was found sitting in the `others` cache.
   */
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/edit'),
      handler: new NetworkOnly(),
    },
    ...authenticatedPageCaching,
    ...defaultCache,
  ],
})

serwist.addEventListeners()
