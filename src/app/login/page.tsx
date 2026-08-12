import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import { IconGoogle, IconNote } from '@/components/icons'

export const metadata: Metadata = { title: 'Accedi' }

interface Props {
  searchParams: Promise<{ error?: string; failed?: string }>
}

/**
 * The one screen anyone sees before signing in, so it carries the whole impression of the
 * app: a card on a warm wash, and now two ways in rather than one.
 *
 * Google first, because it is the way that needs no password kept anywhere. Underneath, an
 * address and a password, for whoever would rather not hand Google another sign-in — or
 * whose address is not a Google account at all.
 *
 * Both refusals are one sentence. "Email o password non corretti" covers a wrong password,
 * an address with no password, and an address that is not on the list, because telling
 * those apart is telling a stranger which addresses exist here.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { error, failed } = await searchParams

  const message =
    failed !== undefined
      ? 'Email o password non corretti.'
      : error === undefined
        ? null
        : error === 'AccessDenied'
          ? 'Questo account non è fra quelli autorizzati.'
          : 'Accesso non riuscito. Riprova.'

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10">
      <div className="login-glow" aria-hidden />

      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="text-center">
            <span className="login-mark">
              <IconNote size={26} />
            </span>

            <h1 className="screen-title mt-4">songs</h1>
            <p className="mx-auto mt-2 max-w-[15rem] text-sm text-muted">
              Testi e accordi del repertorio, con tonalità, notazione e scorrimento.
            </p>
          </div>

          {message !== null && (
            <p className="notice notice-error mt-6 text-start" role="alert">
              {message}
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

          <div className="login-or">
            <span>oppure</span>
          </div>

          <form
            className="grid gap-2.5"
            action={async (data: FormData) => {
              'use server'

              try {
                await signIn('credentials', {
                  email: String(data.get('email') ?? ''),
                  password: String(data.get('password') ?? ''),
                  redirectTo: '/',
                })
              } catch (thrown) {
                /*
                 * `signIn` reports success by throwing a redirect, so the redirect has to
                 * pass through untouched — only a real `AuthError` means the attempt failed.
                 * It is answered with a flag in the URL rather than with the error's own
                 * code, because the code distinguishes cases this page must not.
                 */
                if (thrown instanceof AuthError) redirect('/login?failed=1')
                throw thrown
              }
            }}
          >
            <label className="block">
              <span className="field-label">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="form-field"
              />
            </label>

            <label className="block">
              <span className="field-label">Password</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="form-field"
              />
            </label>

            <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3">
              Entra
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
