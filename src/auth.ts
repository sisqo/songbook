import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { isAllowed } from './lib/allowlist'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return isAllowed(profile?.email, process.env.ALLOWED_EMAILS)
    },
  },
})
