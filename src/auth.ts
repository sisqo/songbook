import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { mayEnter } from './lib/allowlist'
import { listMemberEmails } from './lib/members/read'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    /**
     * The gate, and the only place a new session can be created.
     *
     * The decision itself is `mayEnter`, which is pure and tested; all this does is
     * fetch the half that lives in the database. A table that could not be read arrives
     * as null and admits nobody but the owners.
     */
    async signIn({ profile }) {
      return mayEnter(profile?.email, process.env.ALLOWED_EMAILS, await listMemberEmails())
    },
  },
})
