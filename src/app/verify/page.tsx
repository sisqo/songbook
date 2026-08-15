import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { ResendVerificationButton } from '@/components/ResendVerificationButton'
import { IconNote } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'
import { verifyEmail } from '@/lib/verify/actions'
import { checkPendingRegistration } from '@/lib/verify/check'

export const metadata: Metadata = { title: 'Verify your email' }

interface Props {
  searchParams: Promise<{ email?: string; token?: string }>
}

/**
 * The landing page for the link in the verification email (v3.2, PLAN.md point 5).
 *
 * Reads only, on this GET: it checks whether the token still matches and has not expired
 * (`verify/check.ts`), and shows a button rather than acting on its own. An email scanner
 * that "clicks" the link to see where it goes only ever exercises this render — the actual
 * write is `verifyEmail`, a real POST behind an explicit "Verify my email" tap that a
 * scanner never makes. Same shell as `/register`: the hero mark, `.login-card`, nothing
 * else on screen to distract from the one thing this page is for.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { email, token } = await searchParams
  const check = await checkPendingRegistration(email, token)

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <div className="w-full max-w-sm text-center">
        <span className="hero-mark">
          <span className="hero-mark-fill">
            <IconNote />
          </span>
        </span>

        <h1 className="landing-title mt-[18px] sm:mt-[22px]">{APP_NAME}</h1>
        <p className="landing-payoff mt-2 sm:mt-2.5">Verify your email.</p>
      </div>

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {check.status === 'no-database' && (
            <p className="notice notice-error" role="alert">
              No database configured: accounts cannot be verified.
            </p>
          )}

          {check.status === 'valid' && email && token && (
            <>
              <p className="mb-4 text-sm leading-[1.45] text-muted">
                Confirm <strong>{email}</strong> to finish setting up your account.
              </p>
              <form action={verifyEmail.bind(null, email, token)}>
                <button type="submit" className="btn btn-primary w-full justify-center py-3">
                  Verify my email
                </button>
              </form>
            </>
          )}

          {check.status === 'invalid' && (
            <>
              <p className="notice notice-error" role="alert">
                This link is invalid or has expired.
              </p>

              {check.canResend && email ? (
                <ResendVerificationButton email={email} />
              ) : (
                <p className="mt-4 text-center text-sm text-muted">
                  <Link href="/register" className="text-accent hover:underline">
                    Register again
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
