import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { ResetPasswordForm } from '@/components/ResetPasswordForm'
import { checkPasswordResetToken } from '@/lib/forgotPassword/check'

export const metadata: Metadata = { title: 'Reset password' }

interface Props {
  searchParams: Promise<{ email?: string; token?: string }>
}

/**
 * The landing page for the link in the password-reset email (v3.2, PLAN.md point 6).
 *
 * Shows the new-password form directly on this GET, with no intermediate button the way
 * `/verify` needs one: typing a password and submitting it is already the explicit
 * action an email scanner never takes on its own, so there is nothing left for a button
 * to gate that the form itself does not already gate. The check (`checkPasswordResetToken`)
 * is still read-only — it is `resetPassword`'s own recheck at submit time that actually
 * consumes the token, not this render.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { email, token } = await searchParams
  const check = await checkPasswordResetToken(email, token)

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Choose a new password." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {check === 'no-database' && (
            <p className="notice notice-error" role="alert">
              No database configured: the password cannot be saved.
            </p>
          )}

          {check === 'valid' && email && token && <ResetPasswordForm email={email} token={token} />}

          {check === 'invalid' && (
            <>
              <p className="notice notice-error" role="alert">
                This link is invalid or has expired.
              </p>
              <p className="mt-4 text-center text-sm text-muted">
                <Link href="/forgot-password" className="text-accent hover:underline">
                  Request a new link
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
