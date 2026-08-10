import type { Metadata } from 'next'

import { signIn } from '@/auth'
import { IconGoogle, IconNote } from '@/components/icons'

export const metadata: Metadata = { title: 'Accedi' }

interface Props {
  searchParams: Promise<{ error?: string }>
}

/**
 * The one screen anyone sees before signing in, so it carries the whole
 * impression of the app: a card on a warm wash, one action, and an explanation
 * of why an account can be refused.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10">
      <div className="login-glow" aria-hidden />

      <div className="w-full max-w-sm">
        <div className="card p-7 text-center">
          <span className="login-mark">
            <IconNote size={26} />
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">songs</h1>
          <p className="mx-auto mt-2 max-w-[15rem] text-sm text-muted">
            Testi e accordi del repertorio, con tonalità, notazione e scorrimento.
          </p>

          {error !== undefined && (
            <p className="notice notice-error mt-6 text-start" role="alert">
              {error === 'AccessDenied'
                ? 'Questo account non è fra quelli autorizzati.'
                : 'Accesso non riuscito. Riprova.'}
            </p>
          )}

          <form
            className="mt-7"
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <button type="submit" className="btn w-full justify-center py-3 text-base">
              <IconGoogle />
              Entra con Google
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          L&apos;accesso è riservato agli indirizzi autorizzati.
        </p>
      </div>
    </main>
  )
}
