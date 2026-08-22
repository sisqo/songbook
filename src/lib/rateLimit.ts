/**
 * A fixed-window rate limit, backed by `rateLimitHits` rather than a service of its own
 * (v3.2, PLAN.md point 10) — one shared table for registration, resend, password
 * recovery and login, keyed by whatever the caller is throttling: an email for an
 * action tied to an address, an IP for one that is not.
 *
 * Read-then-write, not one atomic statement: there is a window between the `select` and
 * the `insert`/`update` where two requests racing on the same key could both read "room
 * left" and both be let through, one attempt over the limit. Acceptable for a deterrent
 * against abuse — the cost of a false negative is one extra email, not a broken
 * guarantee — not something a security boundary could tolerate.
 */

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db, hasDatabase } from '@/lib/db/client'
import { rateLimitHits } from '@/lib/db/schema'

/**
 * The caller's address, Vercel's way (first hop in `x-forwarded-for`), or null with no
 * proxy in front. Lives here, not in any one `'use server'` action file, because every
 * surface this rate limit protects — registration, resend, password recovery — needs the
 * same three lines, and a `'use server'` module cannot export it: every export of one
 * must be an async action, and this is a helper, not something a client should ever call.
 */
export async function requestIp(): Promise<string | null> {
  const forwardedFor = (await headers()).get('x-forwarded-for')
  return forwardedFor?.split(',')[0]?.trim() || null
}

/**
 * The origin this request actually arrived on — the same `Host`-header derivation
 * NextAuth's own `trustHost` uses (see CLAUDE.md on `AUTH_URL`), so a verification or
 * password-reset link tracks whatever domain is live instead of going stale on the next
 * domain move, which is exactly what happened when `AUTH_URL` was removed from
 * Production on 2026-08-21 and these links silently fell back to `http://localhost:3000`.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** True when the request is allowed to proceed; false once `limit` is reached within `windowMs`. */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!hasDatabase) return true

  try {
    const now = new Date()
    const rows = await db()
      .select({ windowStart: rateLimitHits.windowStart, count: rateLimitHits.count })
      .from(rateLimitHits)
      .where(eq(rateLimitHits.key, key))
      .limit(1)

    const existing = rows[0]
    const windowExpired = existing !== undefined && now.getTime() - existing.windowStart.getTime() >= windowMs

    if (existing === undefined || windowExpired) {
      await db()
        .insert(rateLimitHits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({
          target: rateLimitHits.key,
          set: { windowStart: now, count: 1 },
        })
      return true
    }

    if (existing.count < limit) {
      await db()
        .update(rateLimitHits)
        .set({ count: existing.count + 1 })
        .where(eq(rateLimitHits.key, key))
      return true
    }

    return false
  } catch (error) {
    // Fails open, like the rest of this feature without a database: a query that cannot
    // be read must not turn a deterrent into an outage for every legitimate request behind it.
    console.error('checkRateLimit failed', error)
    return true
  }
}
