'use server'

/**
 * The one write `/emails` needs: a real copy of a template, sent to whoever is signed in,
 * so it can be checked in an actual inbox instead of only rendered in the browser. Re-checks
 * `isOwner` itself rather than trusting the page's own gate — same discipline every write in
 * `plans/checkout.ts` already follows toward `mockCheckoutEnabled()`.
 *
 * Always the signed-in identity (`session.user.email`), never whichever account the
 * switcher currently points at: none of the three templates belong to an account, so that
 * selector has nothing to say here.
 */

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { requestOrigin } from '@/lib/rateLimit'

import { buildEmailPreviews } from './preview'
import type { PreviewKey } from './preview'
import { sendEmail } from './send'

export type SendTestFailure = 'no-session' | 'not-owner'

export async function sendTestEmail(key: PreviewKey): Promise<{ ok: true } | { ok: false; reason: SendTestFailure }> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'not-owner' }

  const template = buildEmailPreviews(await requestOrigin())[key]
  // Prefixed so it can never be mistaken for a real one landing in the same inbox —
  // the sample link inside it opens the same "expired or invalid" state a stale real
  // one would (see `preview.ts`'s own comment), which reads as a bug without this.
  await sendEmail({ to: email, subject: `[Preview] ${template.subject}`, html: template.html, text: template.text })
  return { ok: true }
}
