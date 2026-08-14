import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { normalizeEmail } from './lib/allowlist'
import { provisionAccount } from './lib/accounts/provision'
import { readPasswordHash } from './lib/auth/credentials'
import { verifyAgainstNothing, verifyPassword } from './lib/auth/password'
import { recordSignIn } from './lib/auth/signIns'
import { db, hasDatabase } from './lib/db/client'
import { accounts } from './lib/db/schema'
import { isAdmitted } from './lib/roles'

/**
 * Whether this address already owns an account — the second way in, now that nobody can
 * be admitted merely by being invited as a collaborator elsewhere (v3.1). Fails closed,
 * same as every other read this gate depends on: a database that cannot answer must not
 * become a door that opens.
 */
async function hasAccount(email: string): Promise<boolean> {
  if (!hasDatabase) return false

  try {
    const rows = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(email)))
      .limit(1)

    return rows.length > 0
  } catch (error) {
    console.error('hasAccount failed', error)
    return false
  }
}

/**
 * Whether this address is allowed in at all — a question with no account of its own; see
 * `isAdmitted`'s own comment for why owning one, or owning every one, is what it takes now.
 */
async function admitted(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  return isAdmitted(email, process.env.ALLOWED_EMAILS, await hasAccount(email))
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
     * here: `roleOf` is pure and tested, and all this does is fetch the one fact that lives
     * in the database — whether this address already owns an account. A database that
     * cannot be read comes back false and admits nobody but the owners.
     *
     * For Google the address comes from the verified profile; for a password it comes from
     * `authorize`, which has already checked the same thing. Two belts, and this is the one
     * that holds.
     *
     * The role itself is deliberately not put in the token. A session lasts ninety days;
     * a role baked into it would keep its powers for ninety days after being taken away.
     *
     * `recordSignIn` and `provisionAccount` run after admission, not before: a rejected
     * attempt proved nothing about the address asking, so it leaves no mark and gets no
     * account. Both run here rather than from a `jwt`/`session` callback because those
     * fire on every request a session is read on this token's ninety days, not only when
     * one is created — this callback is the one place that happens only once per actual
     * sign-in. `provisionAccount` is idempotent on top of that, by checking existence
     * rather than trusting "only once" alone — see its own comment.
     */
    async signIn({ profile, user }) {
      const raw = profile?.email ?? user?.email
      if (raw === null || raw === undefined) return false
      if (!(await admitted(raw))) return false

      /*
       * Normalized here rather than trusted from the provider: `authorize` above already
       * normalizes before it ever reaches this callback, but Google's `profile.email`
       * never has, and `roleOf` only normalizes for its own comparison, not for whoever
       * reads its answer next. Writing the raw casing would key `sign_ins`/`accounts` on
       * whichever form happened to arrive first, splitting one person's history across
       * two rows — see `signIns`' own comment on why it must agree with
       * `accounts`/`ALLOWED_EMAILS`.
       */
      const email = normalizeEmail(raw)
      await recordSignIn(email)
      await provisionAccount(email)
      return true
    },
  },
})
