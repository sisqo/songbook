import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm'
import { IconNote } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'

export const metadata: Metadata = { title: 'Forgot password' }

/**
 * Requesting a password reset link (v3.2, PLAN.md point 6) — same shell as `/login` and
 * `/register`: the hero mark, `.login-card`, one form.
 */
export default function ForgotPasswordPage() {
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
        <p className="landing-payoff mt-2 sm:mt-2.5">Reset your password.</p>
      </div>

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          <ForgotPasswordForm />
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>

      <Footer />
    </main>
  )
}
