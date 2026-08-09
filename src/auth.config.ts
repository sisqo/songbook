import type { NextAuthConfig } from 'next-auth'

/**
 * The part of the auth config the middleware can run.
 *
 * Kept separate from `auth.ts` because the middleware runs on the edge: this
 * file must stay free of anything Node-only. The provider list is empty here
 * and filled in `auth.ts`, which is the only place that needs it.
 */
export const authConfig = {
  providers: [],
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    /**
     * Ninety days. A session that expires while offline would lock the reader
     * out of the whole repertoire, which is exactly the moment — on stage, with
     * no network — when that must not happen.
     */
    maxAge: 90 * 24 * 60 * 60,
  },
} satisfies NextAuthConfig
