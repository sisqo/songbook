/**
 * Who is asking, if they are still allowed to ask.
 *
 * Every write path went through its own copy of "is there a session with an email on
 * it", which was the right question while the allowlist could only change by
 * redeploying. Now that access is editable from inside the app, the question has a
 * second half — is this address *still* on the list — and the answer has to be the
 * same one the sign-in callback gives, or removing someone would lock them out of the
 * front door while leaving the writes open behind it.
 *
 * What this cannot do is end a session that already exists. The cookie is a
 * ninety-day JWT and the pages are precached, so a removed reader keeps whatever
 * their browser already holds until they sign in again. This guard is what stops
 * them changing anything shared in the meantime; `/utenti` says so in as many words.
 */

import { auth } from '@/auth'
import { mayEnter, normalizeEmail } from '@/lib/allowlist'
import { hasDatabase } from '@/lib/db/client'
import { listMemberEmails } from '@/lib/members/read'

/**
 * The signed-in address, lowercased, or null when there is nobody or they are no
 * longer admitted.
 *
 * The same `mayEnter` the sign-in callback asks, deliberately: two answers to "may this
 * person be here" is how one of them ends up wrong.
 *
 * The table is read on every call, and that is the point rather than an oversight: it is
 * what makes taking someone's access away stop their next write instead of their next
 * sign-in. The cost is one indexed lookup on a table with a handful of rows, on paths that
 * were already talking to the same database.
 */
export async function currentMember(): Promise<string | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null

  const allowed = mayEnter(email, process.env.ALLOWED_EMAILS, await listMemberEmails())
  return allowed ? normalizeEmail(email) : null
}
