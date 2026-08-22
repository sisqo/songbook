/**
 * The three emails `templates.ts` can build, rendered with placeholder data instead of a
 * real link — what `/emails` (the global-owner-only preview page) shows.
 *
 * `origin` arrives as a parameter rather than read here with `requestOrigin()`
 * (`lib/rateLimit.ts`): that keeps this module a plain, request-independent function, the
 * same reason `checkout.ts`'s `expiryFor` takes `now` instead of calling `new Date()`
 * itself. The caller — the page, or the `sendTestEmail` action — is the one place that
 * actually knows which request this is.
 */

import { passwordResetEmail, verificationEmail, welcomeEmail } from './templates'
import type { EmailTemplate } from './templates'

export type PreviewKey = 'verification' | 'welcome' | 'password-reset'

export const PREVIEW_KEYS: PreviewKey[] = ['verification', 'welcome', 'password-reset']

export const PREVIEW_LABEL: Record<PreviewKey, string> = {
  verification: 'Verify email',
  welcome: 'Welcome',
  'password-reset': 'Reset password',
}

const SAMPLE_EMAIL = 'preview@strumfolio.com'
const SAMPLE_TOKEN = 'preview-token'

/**
 * A link that looks exactly like a real one — same host, same two query params
 * (`register`/`forgotPassword`'s own `actions.ts` build theirs the same way) — but whose
 * token exists nowhere: opening it lands on the same "expired or invalid link" state a
 * stale real one would, which is expected here and not a bug to fix.
 */
function sampleUrl(origin: string, path: '/verify' | '/reset-password'): string {
  const url = new URL(path, origin)
  url.searchParams.set('email', SAMPLE_EMAIL)
  url.searchParams.set('token', SAMPLE_TOKEN)
  return url.toString()
}

export function buildEmailPreviews(origin: string): Record<PreviewKey, EmailTemplate> {
  return {
    verification: verificationEmail(sampleUrl(origin, '/verify')),
    welcome: welcomeEmail(),
    'password-reset': passwordResetEmail(sampleUrl(origin, '/reset-password')),
  }
}
