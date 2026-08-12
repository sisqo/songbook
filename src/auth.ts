import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { listMemberships } from './lib/members/read'
import { roleOf } from './lib/roles'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    /**
     * The gate, and the only place a new session can be created.
     *
     * Having a role at all *is* being allowed in, which is why there is no second
     * question here: `roleOf` is pure and tested, and all this does is fetch the half
     * that lives in the database. A table that could not be read arrives as null and
     * admits nobody but the owners.
     *
     * The role itself is deliberately not put in the token. A session lasts ninety days;
     * a role baked into it would keep its powers for ninety days after being taken away.
     */
    async signIn({ profile }) {
      const role = roleOf(profile?.email, process.env.ALLOWED_EMAILS, await listMemberships())
      return role !== null
    },
  },
})
