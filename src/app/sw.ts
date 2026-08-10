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

import { defaultCache } from '@serwist/next/worker'
import { type PrecacheEntry, type SerwistGlobalConfig, Serwist } from 'serwist'

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    plugins: [rejectUnauthenticated],
    /**
     * `c` selects a canzoniere on the song list: `/?c=repertorio` must resolve to
     * the precached `/`, or a filtered link would miss the cache and fail to open
     * offline. The two defaults are restated because setting this replaces them.
     */
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^c$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
