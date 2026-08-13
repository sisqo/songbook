import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { normalizeEmail } from './lib/allowlist'
import { readPasswordHash } from './lib/auth/credentials'
import { verifyAgainstNothing, verifyPassword } from './lib/auth/password'
import { recordSignIn } from './lib/auth/signIns'
import { listMemberships } from './lib/members/read'
import { roleOf } from './lib/roles'

/** Whether this address is allowed in at all, which is exactly what having a role means. */
async function admitted(email: string | null | undefined): Promise<boolean> {
  const role = roleOf(email, process.env.ALLOWED_EMAILS, await listMemberships())
  return role !== null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google,

    /**
     * Email and password, for whoever would rather not hand Google another sign-in — or
     * whose address is not a Google account at all.
     *
     * A password proves *which address you are*, and grants nothing: the same `roleOf` that
     * answers for Google answers here, and it does not know this table exists.
     *
     * Everything that can fail returns the same null. No password set, a wrong one typed,
     * or an address taken off the list this morning — the caller is told "wrong email or
     * password" and nothing more, because otherwise this form would answer the question
     * "does this person have an account here", which no login page should answer.
     * `verifyAgainstNothing` is what stops the *timing* from answering it either.
     */
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const email = typeof raw?.email === 'string' ? normalizeEmail(raw.email) : ''
        const password = typeof raw?.password === 'string' ? raw.password : ''
        if (email === '' || password === '') return null

        const stored = await readPasswordHash(email)
        if (stored === null) {
          await verifyAgainstNothing(password)
          return null
        }

        if (!(await verifyPassword(password, stored))) return null

        /*
         * Asked here as well as in `signIn`, so that "not on the list" and "wrong password"
         * are one outcome seen from outside instead of two. `signIn` remains the
         * authoritative check; this one is about what the failure looks like.
         */
        if (!(await admitted(email))) return null

        return { id: email, email }
      },
    }),
  ],
  callbacks: {
    /**
     * The gate, and the only place a new session can be created.
     *
     * Having a role at all *is* being allowed in, which is why there is no second question
     * here: `roleOf` is pure and tested, and all this does is fetch the half that lives in
     * the database. A table that could not be read arrives as null and admits nobody but
     * the owners.
     *
     * For Google the address comes from the verified profile; for a password it comes from
     * `authorize`, which has already checked the same thing. Two belts, and this is the one
     * that holds.
     *
     * The role itself is deliberately not put in the token. A session lasts ninety days;
     * a role baked into it would keep its powers for ninety days after being taken away.
     *
     * `recordSignIn` runs after admission, not before: a rejected attempt proved nothing
     * about the address asking, so it leaves no mark. It runs here rather than from a
     * `jwt`/`session` callback because those fire on every request a session is read on
     * this token's ninety days, not only when one is created — this callback is the one
     * place that happens only once per actual sign-in.
     */
    async signIn({ profile, user }) {
      const raw = profile?.email ?? user?.email
      if (raw === null || raw === undefined) return false
      if (!(await admitted(raw))) return false

      /*
       * Normalized here rather than trusted from the provider: `authorize` above already
       * normalizes before it ever reaches this callback, but Google's `profile.email`
       * never has, and `roleOf` only normalizes for its own comparison, not for whoever
       * reads its answer next. Writing the raw casing would key `sign_ins` on whichever
       * form happened to arrive first, splitting one person's history across two rows —
       * see `signIns`' own comment on why it must agree with `members`/`ALLOWED_EMAILS`.
       */
      await recordSignIn(normalizeEmail(raw))
      return true
    },
  },
})
